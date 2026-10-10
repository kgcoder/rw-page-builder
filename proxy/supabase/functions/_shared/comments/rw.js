/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// Reader's Web comments JSON, as the reader reads it (getComments in reader/PopupDocumentManager.js)
// and as the RW Publisher plugin writes it: {comments, total, page, per_page}, each comment with
// id, parent (0 at the top level), author_name, author_avatar_urls["48"], date, content.rendered
// and an optional reply-url. Plain JS so `npm test` can run it; the bridge (Deno) imports it too.

export const DEFAULT_PER_PAGE = 25
export const MAX_PER_PAGE = 100

// fields: {id, parent, authorName, avatarUrl, date, html, replyUrl}
export function rwComment(fields) {
    const comment = {
        id: fields.id,
        parent: fields.parent == null || fields.parent === '' ? 0 : fields.parent,
        author_name: fields.authorName || '',
        date: fields.date,
        content: { rendered: fields.html || '' },
    }
    if (fields.avatarUrl) comment.author_avatar_urls = { 48: fields.avatarUrl }
    if (fields.replyUrl) comment['reply-url'] = fields.replyUrl
    return comment
}

// An ISO 8601 date in UTC. Accepts unix seconds, Date, and ISO strings; strings without a time zone
// (Disqus' createdAt) are taken as UTC. The reader sorts comments by comparing these strings.
export function isoDate(value) {
    let date
    if (typeof value === 'number') date = new Date(value * 1000)
    else if (value instanceof Date) date = value
    else if (typeof value === 'string') {
        const hasZone = /(Z|[+-]\d\d:?\d\d)$/i.test(value)
        date = new Date(hasZone || value.indexOf('T') === -1 ? value : value + 'Z')
    }
    if (!date || isNaN(date.getTime())) return '1970-01-01T00:00:00.000Z'
    return date.toISOString()
}

// The page and per_page query parameters, within limits.
export function pageParams(params) {
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1)
    let perPage = parseInt(params.get('per_page') || '', 10) || DEFAULT_PER_PAGE
    perPage = Math.min(MAX_PER_PAGE, Math.max(1, perPage))
    return { page, perPage }
}

// One page of a whole thread, oldest first (the reader asks for order=asc). A parent always comes
// before its replies, so every reply's parent is on its page or an earlier one.
export function rwPage(allComments, page, perPage) {
    const sorted = allComments.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    const start = (page - 1) * perPage
    return {
        comments: sorted.slice(start, start + perPage),
        total: sorted.length,
        page,
        per_page: perPage,
    }
}

// The URL with "#comment-<id>" (or another fragment) replacing its fragment.
export function withFragment(url, fragment) {
    const hashIndex = url.indexOf('#')
    return (hashIndex === -1 ? url : url.slice(0, hashIndex)) + '#' + fragment
}
