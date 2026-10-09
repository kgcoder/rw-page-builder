/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Markdown -> HTML used by "Load from Markdown".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { htmlToBlocks } from '../tool/blocks/convert.js'
import { markdownToHtml } from '../tool/blocks/markdown.js'

const { DOMParser } = new JSDOM('').window

const md = text => markdownToHtml(text).html
const types = html => htmlToBlocks(html, DOMParser).map(b => b.type + (b.level || '')).join(' ')

test('a leading # heading is the title; the rest keep their levels', () => {
    const result = markdownToHtml('# The *Title*\n\nText\n\n## Part\n\n### Sub')
    assert.equal(result.title, 'The Title')
    assert.equal(result.html, '<p>Text</p>\n<h2>Part</h2>\n<h3>Sub</h3>')
})

test('headings move down a level when the body uses #', () => {
    assert.equal(md('Intro\n\n# One\n\n## Two'), '<p>Intro</p>\n<h2>One</h2>\n<h3>Two</h3>')
    assert.equal(md('Intro\n\nSetext\n======\n\nOther\n---'), '<p>Intro</p>\n<h2>Setext</h2>\n<h3>Other</h3>')
})

test('inline formatting', () => {
    assert.equal(md('**b** __b__ *e* _e_ ~~d~~ `a < b` snake_case_name 2 * 3 * 4'),
        '<p><strong>b</strong> <strong>b</strong> <em>e</em> <em>e</em> <del>d</del> <code>a &lt; b</code> snake_case_name 2 * 3 * 4</p>')
    assert.equal(md('a & b &amp; &copy; <sup>2</sup> \\*not em\\*'), '<p>a &amp; b &amp; &copy; <sup>2</sup> *not em*</p>')
    assert.equal(md('line one  \nline two\\\nthree'), '<p>line one<br>\nline two<br>\nthree</p>')
})

test('links and images', () => {
    assert.equal(md('[a *b*](https://e.com/x_y "T") <https://e.com> www.e.com/a_b.'),
        '<p><a href="https://e.com/x_y" title="T">a <em>b</em></a> <a href="https://e.com">https://e.com</a> <a href="http://www.e.com/a_b">www.e.com/a_b</a>.</p>')
    assert.equal(md('See [the docs][d] and [d].\n\n[d]: https://d.example "Docs"'),
        '<p>See <a href="https://d.example" title="Docs">the docs</a> and <a href="https://d.example" title="Docs">d</a>.</p>')
    assert.equal(md('Inline ![i](a.png) image'), '<p>Inline <img src="a.png" alt="i"> image</p>')
    assert.equal(md('![Alt](p.png)'), '<figure><img src="p.png" alt="Alt"></figure>')
})

test('lists, nested and loose', () => {
    assert.equal(md('- a\n- b\n  - c\n  - d\n- e'), '<ul><li>a</li><li>b<ul><li>c</li><li>d</li></ul></li><li>e</li></ul>')
    assert.equal(md('3. a\n\n4. b\n\n   more'), '<ol start="3"><li>a</li><li>b<br><br>more</li></ol>')
    assert.equal(md('- a\n\n1. b'), '<ul><li>a</li></ul>\n<ol><li>b</li></ol>')
})

test('quotes, code, rules and tables', () => {
    assert.equal(md('> a\n> **b**'), '<blockquote><p>a\n<strong>b</strong></p></blockquote>')
    assert.equal(md('```js\nif (a < b) {\n\n}\n```'), '<pre><code class="language-js">if (a &lt; b) {\n\n}</code></pre>')
    assert.equal(md('    indented\n    code'), '<pre><code>indented\ncode</code></pre>')
    assert.equal(md('***'), '<hr>')
    assert.equal(md('| A | B |\n|:--|--:|\n| 1 | `x\\|y` |'),
        '<table>\n<thead>\n<tr><th style="text-align: left">A</th><th style="text-align: right">B</th></tr>\n</thead>\n'
        + '<tbody>\n<tr><td style="text-align: left">1</td><td style="text-align: right"><code>x|y</code></td></tr>\n</tbody>\n</table>')
})

test('HTML blocks pass through, YouTube links become embeds', () => {
    const iframe = '<iframe width="560" height="315" src="https://www.youtube.com/embed/xwwNvoXX484" frameborder="0" allowfullscreen></iframe>'
    assert.equal(md('Text\n\n' + iframe + '\n\nMore'), '<p>Text</p>\n' + iframe + '\n<p>More</p>')
    assert.equal(md('<div class="x">\n*kept*\n</div>'), '<div class="x">\n*kept*\n</div>')
    assert.equal(md('https://youtu.be/xwwNvoXX484'), iframe)
    assert.equal(md('Watch https://youtu.be/xwwNvoXX484'),
        '<p>Watch <a href="https://youtu.be/xwwNvoXX484">https://youtu.be/xwwNvoXX484</a></p>')
})

test('front matter is dropped', () => {
    assert.equal(md('---\ntitle: x\n---\nText'), '<p>Text</p>')
})

test('the output opens as editable blocks', () => {
    const html = md('Para\n\n## Head\n\n- a\n  - b\n\n> q\n\n```\nc\n```\n\n---\n\n![i](p.png)\n\nhttps://youtu.be/xwwNvoXX484')
    assert.equal(types(html), 'paragraph heading2 html quote code separator image video')
    assert.equal(types(md('- a\n- b *c*')), 'list')
})
