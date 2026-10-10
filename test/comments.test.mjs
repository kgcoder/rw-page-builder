/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isoDate, pageParams, rwComment, rwPage, withFragment } from '../proxy/supabase/functions/_shared/comments/rw.js'
import { isShortname, listPostsUrl, loadDisqusThread, MAX_REQUESTS, postsToRw } from '../proxy/supabase/functions/_shared/comments/disqus.js'

test('builds RW comments in the shape the reader reads', () => {
    assert.deepEqual(rwComment({ id: 'a', parent: null, authorName: 'Ann', avatarUrl: 'https://x/a.png', date: 'd', html: '<p>Hi</p>', replyUrl: 'https://f/#c' }), {
        id: 'a', parent: 0, author_name: 'Ann', date: 'd', content: { rendered: '<p>Hi</p>' },
        author_avatar_urls: { 48: 'https://x/a.png' }, 'reply-url': 'https://f/#c',
    })
    const plain = rwComment({ id: 1, parent: 'a', date: 'd' })
    assert.equal(plain.parent, 'a')
    assert.deepEqual(plain.content, { rendered: '' })
    assert.ok(!('author_avatar_urls' in plain) && !('reply-url' in plain))
})

test('converts dates to ISO in UTC', () => {
    assert.equal(isoDate('2024-01-02T03:04:05'), '2024-01-02T03:04:05.000Z')
    assert.equal(isoDate('2024-01-02T03:04:05+02:00'), '2024-01-02T01:04:05.000Z')
    assert.equal(isoDate(1704164645), '2024-01-02T03:04:05.000Z')
    assert.equal(isoDate('nonsense'), '1970-01-01T00:00:00.000Z')
})

test('reads page and per_page within limits', () => {
    assert.deepEqual(pageParams(new URLSearchParams('page=3&per_page=10')), { page: 3, perPage: 10 })
    assert.deepEqual(pageParams(new URLSearchParams('page=0&per_page=1000')), { page: 1, perPage: 100 })
    assert.deepEqual(pageParams(new URLSearchParams('')), { page: 1, perPage: 25 })
})

test('pages a thread oldest first', () => {
    const all = ['2024-01-03', '2024-01-01', '2024-01-02'].map((date, i) => rwComment({ id: i, date }))
    const first = rwPage(all, 1, 2)
    assert.deepEqual(first.comments.map(c => c.date), ['2024-01-01', '2024-01-02'])
    assert.equal(first.total, 3)
    assert.equal(first.per_page, 2)
    assert.deepEqual(rwPage(all, 2, 2).comments.map(c => c.date), ['2024-01-03'])
    assert.deepEqual(rwPage(all, 3, 2).comments, [])
})

test('replaces the fragment of a URL', () => {
    assert.equal(withFragment('https://s/f.html?a=1', 'comment-5'), 'https://s/f.html?a=1#comment-5')
    assert.equal(withFragment('https://s/f.html#x', 'comment-5'), 'https://s/f.html#comment-5')
})

// ---- Disqus

function post(id, parent, extra) {
    return Object.assign({
        id: String(id), parent, createdAt: '2024-01-0' + id + 'T10:00:00', message: '<p>Post ' + id + '</p>',
        isDeleted: false, isApproved: true, isSpam: false,
        author: { name: 'User ' + id, avatar: { permalink: 'https://a/' + id, small: { cache: 'https://c/small' + id } } },
    }, extra)
}

test('checks Disqus short names', () => {
    assert.ok(isShortname('my-blog2'))
    assert.ok(!isShortname('evil.example/x'))
    assert.ok(!isShortname(''))
    assert.ok(!isShortname(undefined))
})

test('builds the listPosts URL', () => {
    const byIdent = new URL(listPostsUrl('KEY', 'blog', { ident: 'post/1' }, ''))
    assert.equal(byIdent.origin + byIdent.pathname, 'https://disqus.com/api/3.0/threads/listPosts.json')
    assert.equal(byIdent.searchParams.get('thread:ident'), 'post/1')
    assert.equal(byIdent.searchParams.get('order'), 'asc')
    assert.equal(byIdent.searchParams.get('cursor'), null)
    const byLink = new URL(listPostsUrl('KEY', 'blog', { link: 'https://s/p.html' }, '1:0:0'))
    assert.equal(byLink.searchParams.get('thread:link'), 'https://s/p.html')
    assert.equal(byLink.searchParams.get('cursor'), '1:0:0')
})

test('converts Disqus posts', () => {
    const comments = postsToRw([post(1, null), post(2, 1)], 'https://s/rw-reader/comments/disqus.html?shortname=blog#top')
    assert.deepEqual(comments[0], {
        id: '1', parent: 0, author_name: 'User 1', date: '2024-01-01T10:00:00.000Z', content: { rendered: '<p>Post 1</p>' },
        author_avatar_urls: { 48: 'https://c/small1' },
        'reply-url': 'https://s/rw-reader/comments/disqus.html?shortname=blog#comment-1',
    })
    assert.equal(comments[1].parent, '1')
    assert.ok(!('reply-url' in postsToRw([post(1, null)], '')[0]))
})

test('drops deleted Disqus posts unless they have replies, and unapproved ones', () => {
    const comments = postsToRw([
        post(1, null, { isDeleted: true }),
        post(2, 1),
        post(3, null, { isDeleted: true }),
        post(4, null, { isApproved: false }),
        post(5, null, { isSpam: true }),
    ], 'https://s/form.html')
    assert.deepEqual(comments.map(c => c.id), ['1', '2'])
    assert.equal(comments[0].author_name, '')
    assert.ok(!comments[0].content.rendered.includes('Post 1'))
    assert.ok(!('reply-url' in comments[0]))
})

test('loads every page of a Disqus thread', async () => {
    const requested = []
    const pages = {
        '': { code: 0, response: [post(1, null)], cursor: { hasNext: true, next: '1:1:0' } },
        '1:1:0': { code: 0, response: [post(2, 1)], cursor: { hasNext: false, next: '1:2:0' } },
    }
    const fetchJson = async url => {
        const cursor = new URL(url).searchParams.get('cursor') || ''
        requested.push(cursor)
        return { status: 200, json: pages[cursor] }
    }
    const comments = await loadDisqusThread({ apiKey: 'K', forum: 'blog', thread: { ident: 'p' }, formUrl: '' }, fetchJson)
    assert.deepEqual(requested, ['', '1:1:0'])
    assert.deepEqual(comments.map(c => c.id), ['1', '2'])
})

test('stops after MAX_REQUESTS pages', async () => {
    let count = 0
    const fetchJson = async () => {
        count++
        return { status: 200, json: { code: 0, response: [post(1, null)], cursor: { hasNext: true, next: 'n' + count } } }
    }
    const comments = await loadDisqusThread({ apiKey: 'K', forum: 'blog', thread: { ident: 'p' } }, fetchJson)
    assert.equal(count, MAX_REQUESTS)
    assert.equal(comments.length, MAX_REQUESTS)
})

test('a Disqus thread that does not exist yet has no comments', async () => {
    const fetchJson = async () => ({ status: 400, json: { code: 2, response: "Invalid argument, 'thread': Unable to find thread 'ident:p'" } })
    assert.deepEqual(await loadDisqusThread({ apiKey: 'K', forum: 'blog', thread: { ident: 'p' } }, fetchJson), [])
})

test('Disqus errors become a 502', async () => {
    const fetchJson = async () => ({ status: 403, json: { code: 5, response: 'Invalid API key' } })
    await assert.rejects(loadDisqusThread({ apiKey: 'K', forum: 'blog', thread: { ident: 'p' } }, fetchJson),
        e => e.status === 502 && /Invalid API key/.test(e.message))
})

// ---- Hyvor Talk

import { commentsToRw, isPageIdentifier, isWebsiteId, loadHyvorThread, pagesUrl } from '../proxy/supabase/functions/_shared/comments/hyvor.js'

function hyvorComment(id, parentIds, extra) {
    return Object.assign({
        id, parent_ids: parentIds, depth: parentIds.length, created_at: 1704067200 + id, body_html: '<p>C' + id + '</p>',
        user: { name: 'U' + id, picture_url: 'https://p/' + id },
    }, extra)
}

test('checks Hyvor Talk website IDs and page identifiers', () => {
    assert.ok(isWebsiteId('123'))
    assert.ok(!isWebsiteId('12a'))
    assert.ok(isPageIdentifier('posts/first'))
    assert.ok(!isPageIdentifier("x' or 1=1"))
    assert.ok(!isPageIdentifier(''))
    assert.equal(new URL(pagesUrl('K', '1', 'posts/first')).searchParams.get('filter'), "identifier='posts/first'")
})

test('converts Hyvor Talk comments', () => {
    const comments = commentsToRw([hyvorComment(1, []), hyvorComment(2, [1]), hyvorComment(3, [1, 2])], 'https://s/hyvor.html?website-id=1')
    assert.deepEqual(comments[0], {
        id: '1', parent: 0, author_name: 'U1', date: '2024-01-01T00:00:01.000Z', content: { rendered: '<p>C1</p>' },
        author_avatar_urls: { 48: 'https://p/1' }, 'reply-url': 'https://s/hyvor.html?website-id=1',
    })
    assert.deepEqual(comments.map(c => c.parent), [0, '1', '2'])
    // parent_ids in the other order: the parent is still the ancestor a level up.
    assert.equal(commentsToRw([hyvorComment(1, []), hyvorComment(2, [1]), hyvorComment(3, [2, 1])], '')[2].parent, '2')
})

test('loads a Hyvor Talk page and every page of its comments', async () => {
    const requested = []
    const fetchJson = async url => {
        const u = new URL(url)
        requested.push(u.pathname.split('/').pop() + ':' + (u.searchParams.get('offset') || ''))
        if (u.pathname.endsWith('/pages')) return { status: 200, json: [{ id: 77 }] }
        assert.equal(u.searchParams.get('filter'), 'page_id=77')
        const offset = Number(u.searchParams.get('offset'))
        const batch = offset === 0 ? Array.from({ length: 50 }, (_, i) => hyvorComment(i + 1, [])) : [hyvorComment(51, [1])]
        return { status: 200, json: batch }
    }
    const comments = await loadHyvorThread({ apiKey: 'K', websiteId: '1', ident: 'p' }, fetchJson)
    assert.deepEqual(requested, ['pages:', 'comments:0', 'comments:50'])
    assert.equal(comments.length, 51)
    assert.equal(comments[50].parent, '1')
})

test('a Hyvor Talk page that does not exist yet has no comments', async () => {
    const fetchJson = async () => ({ status: 200, json: [] })
    assert.deepEqual(await loadHyvorThread({ apiKey: 'K', websiteId: '1', ident: 'p' }, fetchJson), [])
})

test('Hyvor Talk errors become a 502', async () => {
    const fetchJson = async () => ({ status: 401, json: { error: 'Invalid API key' } })
    await assert.rejects(loadHyvorThread({ apiKey: 'K', websiteId: '1', ident: 'p' }, fetchJson), e => e.status === 502)
})

// ---- the tool's comments service settings

import { addOrigin, defaultFormPageUrl, hasOrigin, originOf, readService, serviceUrls } from '../tool/commentsService.js'

const disqusSettings = {
    provider: 'disqus',
    bridgeUrl: 'https://abc.supabase.co/functions/v1/rw-comments',
    account: 'my-blog',
    ident: 'posts/first',
    formPageUrl: 'https://site.example/rw-reader/comments/disqus.html',
    title: 'First & best',
}

const hyvorSettings = {
    provider: 'hyvor',
    bridgeUrl: 'https://abc.supabase.co/functions/v1/rw-comments',
    account: '1234',
    ident: 'posts/first',
    formPageUrl: 'https://site.example/rw-reader/comments/hyvor.html',
    title: '',
}

test('builds the Disqus comments URLs and reads them back', () => {
    const urls = serviceUrls(disqusSettings)
    const url = new URL(urls.url)
    assert.equal(url.origin + url.pathname, disqusSettings.bridgeUrl)
    assert.equal(url.searchParams.get('provider'), 'disqus')
    assert.equal(url.searchParams.get('forum'), 'my-blog')
    assert.equal(url.searchParams.get('ident'), 'posts/first')
    assert.equal(url.searchParams.get('form'), urls.leaveCommentUrl)
    const form = new URL(urls.leaveCommentUrl)
    assert.equal(form.searchParams.get('shortname'), 'my-blog')
    assert.equal(form.searchParams.get('title'), 'First & best')
    assert.equal(form.searchParams.get('bridge'), disqusSettings.bridgeUrl)
    assert.deepEqual(readService(urls.url), disqusSettings)
})

test('builds the Hyvor Talk comments URLs and reads them back', () => {
    const urls = serviceUrls(Object.assign({}, hyvorSettings, { title: 'ignored' }))
    const url = new URL(urls.url)
    assert.equal(url.searchParams.get('provider'), 'hyvor')
    assert.equal(url.searchParams.get('website'), '1234')
    assert.equal(url.searchParams.get('ident'), 'posts/first')
    const form = new URL(urls.leaveCommentUrl)
    assert.equal(form.searchParams.get('website-id'), '1234')
    assert.equal(form.searchParams.get('page-id'), 'posts/first')
    assert.equal(form.searchParams.get('title'), null)
    assert.deepEqual(readService(urls.url), hyvorSettings)
})

test('keeps other query parameters of the bridge URL', () => {
    const urls = serviceUrls(Object.assign({}, disqusSettings, { bridgeUrl: 'https://b.example/fn?key=1&provider=x' }))
    assert.equal(new URL(urls.url).searchParams.get('key'), '1')
    assert.equal(new URL(urls.leaveCommentUrl).searchParams.get('bridge'), 'https://b.example/fn?key=1')
    assert.equal(readService(urls.url).bridgeUrl, 'https://b.example/fn?key=1')
})

test('needs every service setting', () => {
    const without = change => serviceUrls(Object.assign({}, disqusSettings, change))
    assert.equal(without({ account: 'Bad Name' }), null)
    assert.equal(without({ provider: 'hyvor', account: 'abc' }), null)
    assert.equal(without({ provider: 'other' }), null)
    assert.equal(without({ ident: ' ' }), null)
    assert.equal(without({ ident: "it's" }), null)
    assert.equal(without({ bridgeUrl: '/relative' }), null)
    assert.equal(without({ formPageUrl: '' }), null)
    assert.equal(readService('https://site.example/comments.json'), null)
    assert.equal(readService('https://b.example/fn?provider=toString'), null)
    assert.equal(readService('not a url'), null)
})

test('finds the default form page next to the reader assets', () => {
    assert.equal(defaultFormPageUrl('disqus', '/rw-reader/', 'https://site.example/rw-tool/index.html'), 'https://site.example/rw-reader/comments/disqus.html')
    assert.equal(defaultFormPageUrl('hyvor', '../rw-reader', 'https://site.example/rw-tool/index.html'), 'https://site.example/rw-reader/comments/hyvor.html')
    assert.equal(defaultFormPageUrl('disqus', 'https://cdn.example/rw/', 'file:///x/index.html'), 'https://cdn.example/rw/comments/disqus.html')
    assert.equal(defaultFormPageUrl('disqus', '/rw-reader/', 'file:///x/index.html'), '')
    assert.equal(defaultFormPageUrl('custom', '/rw-reader/', 'https://site.example/'), '')
})

test('adds an origin to the direct origins once', () => {
    assert.equal(originOf('https://a.example/fn?x=1'), 'https://a.example')
    assert.equal(originOf('nope'), '')
    assert.ok(hasOrigin('https://b.example https://a.example/x', 'https://a.example'))
    assert.equal(addOrigin('https://b.example', 'https://a.example'), 'https://b.example https://a.example')
    assert.equal(addOrigin(' https://a.example ', 'https://a.example'), 'https://a.example')
    assert.equal(addOrigin('', 'https://a.example'), 'https://a.example')
})
