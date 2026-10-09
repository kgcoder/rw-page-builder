/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// HTML <-> blocks conversion used by the block editor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { parse } from '../generator/parse.js'
import { blocksToHtml, htmlToBlocks, newBlock, youtubeEmbedUrl } from '../tool/blocks/convert.js'

const { DOMParser } = new JSDOM('').window

const toBlocks = html => htmlToBlocks(html, DOMParser)
const types = blocks => blocks.map(b => b.type + (b.level || '')).join(' ')
const markEdited = blocks => blocks.forEach(b => { b.dirty = true; b.source = null })

const MIXED = '<p>One <b>two</b></p><h2 id="x">Head</h2>\n<ul><li>a</li><li>b <a href="#">c</a></li></ul>'
    + '<blockquote><p>Q</p></blockquote><pre><code class="js">x &lt; 1</code></pre><hr>'
    + '<figure><img src="b.png" alt="" width="10"><figcaption>Cap</figcaption></figure>'

test('maps known elements to blocks', () => {
    assert.equal(types(toBlocks(MIXED)), 'paragraph heading2 list quote code separator image')
})

test('untouched blocks keep their exact markup', () => {
    const example = parse(readFileSync(new URL('../examples/hdoc.html', import.meta.url), 'utf8'), DOMParser).contentHtml
    for (const html of [MIXED, example]) assert.equal(blocksToHtml(toBlocks(html)), html)
})

test('edited blocks are rebuilt with the same markup', () => {
    const blocks = toBlocks(MIXED)
    markEdited(blocks)
    assert.equal(blocksToHtml(blocks), MIXED)
})

test("keeps what it can't edit as HTML blocks", () => {
    const html = '<div class="z"><p>nested</p></div><!-- c --><ul><li>a<ul><li>b</li></ul></li></ul><h2><div>x</div></h2>'
    const blocks = toBlocks(html)
    assert.equal(types(blocks), 'html html html html')
    markEdited(blocks)
    assert.equal(blocksToHtml(blocks), html)
})

test('loose inline content becomes a paragraph, a lone image an image', () => {
    const blocks = toBlocks('Loose <em>text</em>\n<p>p</p>\n<img src="a.png" alt="A">')
    assert.equal(types(blocks), 'paragraph paragraph image')
    markEdited(blocks)
    // A top-level <img> stays without a <figure>.
    assert.equal(blocksToHtml(blocks), '<p>Loose <em>text</em></p>\n<p>p</p>\n<img src="a.png" alt="A">')
})

test('new blocks: empty ones are skipped, text is escaped', () => {
    const blocks = [
        newBlock('paragraph', { html: 'Hi' }),
        newBlock('paragraph'),
        newBlock('code', { text: 'a < b && c' }),
        newBlock('list', { ordered: true, items: ['x', '', 'y'] }),
        newBlock('image', { src: 'p.png', alt: 'A "q"', caption: 'Cap' }),
    ]
    assert.equal(blocksToHtml(blocks),
        '<p>Hi</p>\n<pre><code>a &lt; b &amp;&amp; c</code></pre>\n<ol><li>x</li><li>y</li></ol>\n'
        + '<figure><img src="p.png" alt="A &quot;q&quot;"><figcaption>Cap</figcaption></figure>')
})

const VIDEO = '<iframe width="560" height="315" src="https://www.youtube.com/embed/xwwNvoXX484" frameborder="0" allowfullscreen></iframe>'

test('a YouTube iframe is a video block, other iframes stay HTML', () => {
    const html = VIDEO.replace('allowfullscreen', 'allowfullscreen=""') + '\n<iframe src="https://example.com/x"></iframe>'
    const blocks = toBlocks(html)
    assert.equal(types(blocks), 'video html')
    assert.equal(blocks[0].src, 'https://www.youtube.com/embed/xwwNvoXX484')
    assert.equal(blocksToHtml(blocks), html)
})

test('an edited video block keeps its other attributes', () => {
    const blocks = toBlocks('<iframe title="T" src="https://www.youtube.com/embed/xwwNvoXX484" allowfullscreen=""></iframe>')
    markEdited(blocks)
    blocks[0].src = 'https://www.youtube.com/embed/aaaaaaaaaaa'
    assert.equal(blocksToHtml(blocks), '<iframe title="T" src="https://www.youtube.com/embed/aaaaaaaaaaa" allowfullscreen></iframe>')
})

test('a new video block writes the standard embed', () => {
    assert.equal(blocksToHtml([newBlock('video'), newBlock('video', { src: 'https://www.youtube.com/embed/xwwNvoXX484' })]), VIDEO)
})

test('YouTube links become embed URLs', () => {
    const embed = 'https://www.youtube.com/embed/xwwNvoXX484'
    for (const link of ['https://www.youtube.com/watch?v=xwwNvoXX484', 'youtube.com/watch?feature=share&v=xwwNvoXX484',
        'https://m.youtube.com/watch?v=xwwNvoXX484', 'https://youtu.be/xwwNvoXX484', 'https://www.youtube.com/shorts/xwwNvoXX484',
        'https://www.youtube.com/live/xwwNvoXX484', embed, 'xwwNvoXX484']) {
        assert.equal(youtubeEmbedUrl(link), embed, link)
    }
    assert.equal(youtubeEmbedUrl('https://youtu.be/xwwNvoXX484?t=90'), embed + '?start=90')
    assert.equal(youtubeEmbedUrl('https://www.youtube.com/watch?v=xwwNvoXX484&t=1m5s'), embed + '?start=65')
    assert.equal(youtubeEmbedUrl('https://www.youtube-nocookie.com/embed/xwwNvoXX484'), 'https://www.youtube-nocookie.com/embed/xwwNvoXX484')
    for (const bad of ['', 'https://example.com/watch?v=xwwNvoXX484', 'https://www.youtube.com/watch?v=short', 'not a link']) {
        assert.equal(youtubeEmbedUrl(bad), null, bad)
    }
})
