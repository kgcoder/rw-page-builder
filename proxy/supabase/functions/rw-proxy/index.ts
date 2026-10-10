/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// Proxy for Reader's Web pages on static sites (Supabase Edge Function, Deno).
// The reader asks it for documents and comments hosted on other sites:
//
//   GET <function url>?target_url=<absolute url>&source_url=<current page url>[&is_for_condoc=1]
//
// is_for_condoc=1: the target is a CONDOC's main page (usually a page on a third-party site).
// The upstream body is passed back as is, with its status and Content-Type.
// Same parameter names as the WordPress plugin's /sw-proxy/ endpoint.

// Only these URLs can be fetched. Each entry allows its origin and every path under
// its path ("https://example.com/" allows the whole site, "https://example.com/docs/"
// only that folder). Redirects are checked against the same list.
// Connected documents and comments:
const ALLOWED_URLS: string[] = [
  'https://readersweb.org/static/napoleon/napoleon-maps.cdoc',
]

// Main pages of CONDOCs (requests with is_for_condoc=1), e.g. 'https://en.wikipedia.org/wiki/'.
const ALLOWED_CONDOC_URLS: string[] = [
  'https://en.wikipedia.org/w/index.php?title=Napoleon&amp;oldid=1325456045#pr=c/.mw-body-content/r/.navbox,.sidebar,.mw-editsection',
]

// Pages that may call this proxy (CORS). '*' allows any page.
const ALLOWED_ORIGINS: string[] = ['*']

const MAX_REDIRECTS = 5
const MAX_BODY_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 10000

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  let allowOrigin = ''
  if (ALLOWED_ORIGINS.includes('*')) allowOrigin = '*'
  else if (ALLOWED_ORIGINS.includes(origin)) allowOrigin = origin
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Expose-Headers': 'X-RW-Final-Url',
    'Vary': 'Origin',
  }
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin
  return headers
}

function errorResponse(req: Request, status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// The URL without its #fragment (never sent to the server, so it's dropped before any comparison).
function parseHttpUrl(value: string | null): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    url.hash = ''
    return url
  } catch {
    return null
  }
}

// Compares parsed URLs, not strings, so "https://example.com.evil.net/" doesn't
// match "https://example.com/".
function isAllowed(url: URL, allowedUrls: string[]): boolean {
  return allowedUrls.some((entry) => {
    const allowed = parseHttpUrl(entry)
    if (!allowed || allowed.origin !== url.origin) return false
    const prefix = allowed.pathname.endsWith('/') ? allowed.pathname : allowed.pathname + '/'
    return url.pathname === allowed.pathname || url.pathname.startsWith(prefix)
  })
}

async function readLimited(body: ReadableStream<Uint8Array>): Promise<Uint8Array | null> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }
  if (req.method !== 'GET') return errorResponse(req, 405, 'Method not allowed')

  const params = new URL(req.url).searchParams
  let target = parseHttpUrl(params.get('target_url'))
  if (!target) return errorResponse(req, 400, 'target_url must be an absolute http(s) URL')

  // The page that made the request. Accepted for compatibility with the plugin's
  // endpoint but not used yet: ALLOWED_URLS decides what can be fetched.
  const _sourceUrl = params.get('source_url')

  const isForCondoc = params.get('is_for_condoc') === '1'
  const allowedUrls = isForCondoc ? ALLOWED_CONDOC_URLS : ALLOWED_URLS
  if (!isAllowed(target, allowedUrls)) return errorResponse(req, 403, 'target_url is not allowed')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let upstream: Response | null = null
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      upstream = await fetch(target, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // JSON too: comments on other sites are JSON.
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8',
          'User-Agent': 'RW-Proxy/1.0',
        },
      })
      if (upstream.status < 300 || upstream.status >= 400) break

      const location = upstream.headers.get('Location')
      await upstream.body?.cancel()
      if (!location) return errorResponse(req, 502, 'Redirect without a Location header')
      const next = parseHttpUrl(new URL(location, target).href)
      if (!next || !isAllowed(next, allowedUrls)) return errorResponse(req, 403, 'Redirect target is not allowed')
      target = next
      upstream = null
    }
    if (!upstream) return errorResponse(req, 502, 'Too many redirects')

    const body = upstream.body ? await readLimited(upstream.body) : new Uint8Array()
    if (!body) return errorResponse(req, 502, 'Response is too large')

    // Documents are cached for a few minutes. JSON (comments) isn't: the reader reloads the comments
    // after a visitor posts one, and the browser mustn't answer that from its cache. The upstream's
    // own Cache-Control wins.
    const contentType = upstream.headers.get('Content-Type') || 'text/plain; charset=utf-8'
    const cacheControl = upstream.headers.get('Cache-Control')
      || (/json/i.test(contentType) ? 'no-cache' : 'public, max-age=300')

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...corsHeaders(req),
        'Content-Type': contentType,
        'X-RW-Final-Url': target.href,
        'Cache-Control': cacheControl,
      },
    })
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === 'AbortError'
    return errorResponse(req, timedOut ? 504 : 502, timedOut ? 'Upstream timed out' : 'Upstream request failed')
  } finally {
    clearTimeout(timer)
  }
})
