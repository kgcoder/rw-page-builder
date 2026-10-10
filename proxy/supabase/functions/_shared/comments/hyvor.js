/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// Hyvor Talk → Reader's Web comments, through its Data API (https://hyvor.com/talk/docs/api-data),
// called by the comments bridge with the website's API key. The comments filter takes Hyvor's own
// page ID, so the page is looked up by its identifier (the embed's page-id) first.
import { isoDate, rwComment } from './rw.js'

const API = 'https://talk.hyvor.com/api/data/v1/'
const LIMIT = 50
// Comment requests per page at most (LIMIT comments each); longer threads are cut off.
export const MAX_REQUESTS = 10

export function isWebsiteId(value) {
    return typeof value === 'string' && /^\d+$/.test(value)
}

// The identifier goes into a quoted filter, so quotes and backslashes aren't allowed in it.
export function isPageIdentifier(value) {
    return typeof value === 'string' && value !== '' && !/['\\]/.test(value)
}

export function pagesUrl(apiKey, websiteId, identifier) {
    const params = new URLSearchParams()
    params.set('website_id', websiteId)
    params.set('api_key', apiKey)
    params.set('filter', "identifier='" + identifier + "'")
    params.set('limit', '1')
    return API + 'pages?' + params.toString()
}

export function commentsUrl(apiKey, websiteId, pageId, offset) {
    const params = new URLSearchParams()
    params.set('website_id', websiteId)
    params.set('api_key', apiKey)
    params.set('filter', 'page_id=' + pageId)
    params.set('sort', 'created_at ASC')
    params.set('limit', String(LIMIT))
    params.set('offset', String(offset))
    return API + 'comments?' + params.toString()
}

// parent_ids lists a comment's ancestors; its parent is the one a level up (depth - 1).
function parentId(comment, byId) {
    const ids = Array.isArray(comment.parent_ids) ? comment.parent_ids : []
    if (!ids.length) return 0
    const direct = ids.find(id => byId.has(String(id)) && byId.get(String(id)).depth === comment.depth - 1)
    return String(direct != null ? direct : ids[ids.length - 1])
}

export function commentsToRw(comments, formUrl) {
    const byId = new Map(comments.map(c => [String(c.id), c]))
    return comments.map(c => rwComment({
        id: String(c.id),
        parent: parentId(c, byId),
        authorName: (c.user && c.user.name) || '',
        avatarUrl: (c.user && c.user.picture_url) || '',
        date: isoDate(c.created_at),
        html: c.body_html,
        // The form page shows the whole thread, where Reply is.
        replyUrl: formUrl || '',
    }))
}

function upstreamError(status) {
    const error = new Error('Hyvor Talk responded with ' + status)
    error.status = 502
    return error
}

// Every comment of a page, as RW comments. fetchJson(url) resolves to {status, json}.
// Throws an Error with .status on an upstream error.
export async function loadHyvorThread(options, fetchJson) {
    const { apiKey, websiteId, ident, formUrl } = options
    const pages = await fetchJson(pagesUrl(apiKey, websiteId, ident))
    if (pages.status !== 200 || !Array.isArray(pages.json)) throw upstreamError(pages.status)
    // No comments yet: Hyvor creates the page the first time the embed loads on it.
    if (!pages.json.length) return []

    const pageId = pages.json[0] && pages.json[0].id
    if (typeof pageId !== 'number') throw upstreamError(pages.status)
    const comments = []
    for (let i = 0; i < MAX_REQUESTS; i++) {
        const { status, json } = await fetchJson(commentsUrl(apiKey, websiteId, pageId, comments.length))
        if (status !== 200 || !Array.isArray(json)) throw upstreamError(status)
        comments.push(...json)
        if (json.length < LIMIT) break
    }
    return commentsToRw(comments, formUrl)
}
