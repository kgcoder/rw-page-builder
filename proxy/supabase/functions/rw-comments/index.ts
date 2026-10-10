/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// Comments bridge for Reader's Web pages on static sites (Supabase Edge Function, Deno).
// Loads a page's comments from a commenting service and returns them as Reader's Web comments JSON,
// so the page's comments URL points here and works in every reader (this site's static reader,
// the RW Reader extension, the WordPress plugin):
//
//   GET <function url>?provider=disqus&forum=<short name>&ident=<thread identifier>
//       [&link=<page URL, instead of ident>][&form=<comment form page URL>][&per_page=25]
//       &page=<n>&order=asc                           (page and order are added by the reader)
//   GET <function url>?provider=hyvor&website=<website ID>&ident=<page identifier>[&form=…][&per_page=25]&page=<n>…
//
// form: the page that shows the service's comment form (rw-reader/comments/disqus.html or
// hyvor.html); each comment then gets a reply-url to it. refresh=1 drops the cached thread first:
// the form page asks for it after a visitor posts a comment, just before the reader reloads them. Pages call this function directly: list its
// origin in data-direct-origins ("Direct origins" in the page builder).
//
// Secrets (only for the services you use):
//   DISQUS_API_KEY: the public key of a Disqus API application
//   HYVOR_API_KEY: a Hyvor Talk Data API key (Console → Settings → API)
//   npx supabase secrets set DISQUS_API_KEY=… --project-ref <project id>
import { isShortname, loadDisqusThread } from '../_shared/comments/disqus.js'
import { isPageIdentifier, isWebsiteId, loadHyvorThread } from '../_shared/comments/hyvor.js'
import { pageParams, rwPage } from '../_shared/comments/rw.js'

// Disqus forums (short names) and Hyvor Talk website IDs this bridge serves.
const ALLOWED_FORUMS: string[] = []
const ALLOWED_HYVOR_WEBSITES: string[] = []

// Pages that may call this bridge (CORS). '*' allows any page.
const ALLOWED_ORIGINS: string[] = ['*']

// Threads are cached in memory for this long (per function instance), which keeps a busy page
// under the services' rate limits (Disqus: 1000 requests an hour per API key).
const CACHE_MS = 60 * 1000
const TIMEOUT_MS = 10000

type Thread = { time: number, comments: unknown[] }
const cache = new Map<string, Thread>()

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  let allowOrigin = ''
  if (ALLOWED_ORIGINS.includes('*')) allowOrigin = '*'
  else if (ALLOWED_ORIGINS.includes(origin)) allowOrigin = origin
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Vary': 'Origin',
  }
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin
  return headers
}

function jsonResponse(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      // The reader reloads the comments after a visitor posts one; the browser mustn't answer that
      // from its cache.
      'Cache-Control': 'no-cache',
    },
  })
}

function httpUrl(value: string | null): string {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

async function fetchJson(url: string): Promise<{ status: number, json: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } })
    let json = null
    try {
      json = await response.json()
    } catch {
      json = null
    }
    return { status: response.status, json }
  } finally {
    clearTimeout(timer)
  }
}

// The cache key of a thread (and its form page). With refresh=1, the thread's cached copies are
// dropped first, whatever their form page.
function cacheKey(params: URLSearchParams, thread: string[], formUrl: string): string {
  const prefix = thread.join('\n') + '\n'
  if (params.get('refresh') === '1') {
    for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key)
  }
  return prefix + formUrl
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

// Every comment of the thread, as RW comments.
async function disqusThread(params: URLSearchParams): Promise<unknown[]> {
  const forum = params.get('forum') || ''
  const ident = params.get('ident') || ''
  const link = httpUrl(params.get('link'))
  if (!isShortname(forum)) throw httpError(400, 'forum must be a Disqus short name')
  if (!ident && !link) throw httpError(400, 'ident or link is required')
  if (!ALLOWED_FORUMS.includes(forum)) throw httpError(403, 'forum is not allowed')
  const apiKey = Deno.env.get('DISQUS_API_KEY')
  if (!apiKey) throw httpError(500, 'DISQUS_API_KEY is not set')

  const formUrl = httpUrl(params.get('form'))
  const key = cacheKey(params, ['disqus', forum, ident, link], formUrl)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.comments

  const comments = await loadDisqusThread({ apiKey, forum, thread: ident ? { ident } : { link }, formUrl }, fetchJson)
  cache.set(key, { time: Date.now(), comments })
  return comments
}

async function hyvorThread(params: URLSearchParams): Promise<unknown[]> {
  const websiteId = params.get('website') || ''
  const ident = params.get('ident') || ''
  if (!isWebsiteId(websiteId)) throw httpError(400, 'website must be a Hyvor Talk website ID')
  if (!isPageIdentifier(ident)) throw httpError(400, 'ident must be a page identifier without quotes')
  if (!ALLOWED_HYVOR_WEBSITES.includes(websiteId)) throw httpError(403, 'website is not allowed')
  const apiKey = Deno.env.get('HYVOR_API_KEY')
  if (!apiKey) throw httpError(500, 'HYVOR_API_KEY is not set')

  const formUrl = httpUrl(params.get('form'))
  const key = cacheKey(params, ['hyvor', websiteId, ident], formUrl)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.comments

  const comments = await loadHyvorThread({ apiKey, websiteId, ident, formUrl }, fetchJson)
  cache.set(key, { time: Date.now(), comments })
  return comments
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }
  if (req.method !== 'GET') return jsonResponse(req, 405, { error: 'Method not allowed' })

  const params = new URL(req.url).searchParams
  const provider = params.get('provider')
  try {
    let comments: unknown[]
    if (provider === 'disqus') comments = await disqusThread(params)
    else if (provider === 'hyvor') comments = await hyvorThread(params)
    else throw httpError(400, 'Unknown provider')

    const { page, perPage } = pageParams(params)
    return jsonResponse(req, 200, rwPage(comments, page, perPage))
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === 'AbortError'
    const status = timedOut ? 504 : (e as { status?: number }).status || 502
    return jsonResponse(req, status, { error: timedOut ? 'Upstream timed out' : String((e as Error).message) })
  }
})
