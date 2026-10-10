/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// Disqus → Reader's Web comments. Disqus' API has no CORS and needs an API key, so a server (the
// comments bridge) calls it: threads/listPosts with the forum's short name and the thread's
// identifier (the embed's page.identifier) or URL (page.url).
// https://disqus.com/api/docs/threads/listPosts/
import { isoDate, rwComment, withFragment } from './rw.js'

const API = 'https://disqus.com/api/3.0/'
const LIMIT = 100
// Requests per thread at most (LIMIT comments each); longer threads are cut off.
export const MAX_REQUESTS = 10

const SHORTNAME_RE = /^[a-z0-9-]+$/

export function isShortname(value) {
    return typeof value === 'string' && SHORTNAME_RE.test(value)
}

// thread: {ident} or {link}
export function listPostsUrl(apiKey, forum, thread, cursor) {
    const params = new URLSearchParams()
    params.set('api_key', apiKey)
    params.set('forum', forum)
    if (thread.ident) params.set('thread:ident', thread.ident)
    else params.set('thread:link', thread.link)
    params.set('limit', String(LIMIT))
    params.set('order', 'asc')
    if (cursor) params.set('cursor', cursor)
    return API + 'threads/listPosts.json?' + params.toString()
}

// Disqus answers code 2 ("Invalid argument") when the thread doesn't exist yet: Disqus creates it
// the first time the embed loads on the page.
function isMissingThread(json) {
    return !!json && json.code === 2 && /thread/i.test(String(json.response))
}

function avatarUrl(author) {
    const avatar = author && author.avatar
    if (!avatar) return ''
    const small = avatar.small || {}
    return small.cache || small.permalink || avatar.cache || avatar.permalink || ''
}

// Deleted comments are left out, unless other comments reply to them: then they stay, without
// their text, so the replies keep their place in the thread.
export function postsToRw(posts, formUrl) {
    const repliedTo = new Set()
    posts.forEach(post => { if (post.parent != null) repliedTo.add(String(post.parent)) })
    const comments = []
    posts.forEach(post => {
        const deleted = !!post.isDeleted
        if (deleted && !repliedTo.has(String(post.id))) return
        if (post.isApproved === false || post.isSpam) return
        comments.push(rwComment({
            id: String(post.id),
            parent: post.parent == null ? 0 : String(post.parent),
            authorName: deleted ? '' : (post.author && post.author.name) || '',
            avatarUrl: deleted ? '' : avatarUrl(post.author),
            date: isoDate(post.createdAt),
            html: deleted ? '<p><em>This comment was deleted.</em></p>' : post.message,
            // The form page opens the Disqus embed scrolled to this comment, where Reply is.
            replyUrl: formUrl && !deleted ? withFragment(formUrl, 'comment-' + post.id) : '',
        }))
    })
    return comments
}

// Every comment of a thread, as RW comments. fetchJson(url) resolves to {status, json}.
// Throws an Error with .status on an upstream error.
export async function loadDisqusThread(options, fetchJson) {
    const { apiKey, forum, thread, formUrl } = options
    const posts = []
    let cursor = ''
    for (let i = 0; i < MAX_REQUESTS; i++) {
        const { status, json } = await fetchJson(listPostsUrl(apiKey, forum, thread, cursor))
        if (isMissingThread(json)) return []
        if (status !== 200 || !json || json.code !== 0 || !Array.isArray(json.response)) {
            const error = new Error('Disqus responded with ' + status + (json && json.response ? ': ' + json.response : ''))
            error.status = 502
            throw error
        }
        posts.push(...json.response)
        const next = json.cursor
        if (!next || !next.hasNext || !next.next) break
        cursor = next.next
    }
    return postsToRw(posts, formUrl)
}
