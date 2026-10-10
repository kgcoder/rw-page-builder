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
import { isDirectUrl, parseOrigins, proxyRequestUrl } from '../adapter/proxy.js'

const target = 'https://other.example/doc.html?a=1&b=2'
const source = 'https://my.example/page.html'

test('adds target_url and source_url to a proxy URL without placeholders', () => {
    assert.equal(proxyRequestUrl('https://p.example/fn', target, source),
        'https://p.example/fn?target_url=' + encodeURIComponent(target) + '&source_url=' + encodeURIComponent(source))
    assert.equal(proxyRequestUrl('https://p.example/fn?key=k', target, source),
        'https://p.example/fn?key=k&target_url=' + encodeURIComponent(target) + '&source_url=' + encodeURIComponent(source))
    assert.equal(proxyRequestUrl('https://p.example/fn?', target, ''),
        'https://p.example/fn?target_url=' + encodeURIComponent(target) + '&source_url=')
    assert.equal(proxyRequestUrl('https://p.example/fn#x', target, source).indexOf('#'), -1)
    assert.equal(proxyRequestUrl('https://p.example/fn', target, source, true),
        'https://p.example/fn?target_url=' + encodeURIComponent(target) + '&source_url=' + encodeURIComponent(source) + '&is_for_condoc=1')
})

test('replaces {url} and {source} placeholders', () => {
    assert.equal(proxyRequestUrl('https://p.example/?u={url}&from={source}', target, source),
        'https://p.example/?u=' + encodeURIComponent(target) + '&from=' + encodeURIComponent(source))
    assert.equal(proxyRequestUrl('https://p.example/raw?{url}', target, undefined),
        'https://p.example/raw?' + encodeURIComponent(target))
    assert.equal(proxyRequestUrl('https://p.example/?u={url}&c={condoc}', target, source, true),
        'https://p.example/?u=' + encodeURIComponent(target) + '&c=1')
    assert.equal(proxyRequestUrl('https://p.example/?c={condoc}', target, source, false), 'https://p.example/?c=0')
})

test('parses direct origins', () => {
    assert.deepEqual(parseOrigins('https://a.example/fn  https://b.example:8443, http://a.example https://a.example/x'),
        ['https://a.example', 'https://b.example:8443', 'http://a.example'])
    assert.deepEqual(parseOrigins('not-a-url javascript:alert(1) ftp://x.example'), [])
    assert.deepEqual(parseOrigins(''), [])
    assert.deepEqual(parseOrigins(undefined), [])
})

test('matches URLs on a direct origin', () => {
    const origins = parseOrigins('https://bridge.example')
    assert.ok(isDirectUrl('https://bridge.example/functions/v1/rw-comments?page=1', origins))
    assert.ok(!isDirectUrl('https://bridge.example.evil.net/x', origins))
    assert.ok(!isDirectUrl('http://bridge.example/x', origins))
    assert.ok(!isDirectUrl('nonsense', origins))
})
