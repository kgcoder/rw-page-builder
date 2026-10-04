/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// Round-trips the example pages: parse(example) -> generate -> the same page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DOMParser } from 'linkedom'
import { parse } from '../generator/parse.js'
import { generate } from '../generator/generate.js'
import { createModel } from '../generator/model.js'

const example = name => readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8')

// HTML comments are not part of the model.
const withoutComments = html => html.replace(/<!--[\s\S]*?-->/g, '')

for (const name of ['hdoc.html', 'cdoc.html', 'condoc.html']) {
    test(`round-trips examples/${name}`, () => {
        const html = example(name)
        const model = parse(html, DOMParser)
        assert.equal(withoutComments(generate(model)), withoutComments(html))
    })

    test(`parse(generate(model)) is stable for examples/${name}`, () => {
        const model = parse(example(name), DOMParser)
        assert.deepEqual(parse(generate(model), DOMParser), model)
    })
}

test('reads the fields of the HDOC example', () => {
    const model = parse(example('hdoc.html'), DOMParser)
    assert.equal(model.type, 'hdoc')
    assert.equal(model.header.author, 'Example Author')
    assert.equal(model.site.assetsUrl, '../dist/rw-reader/')
    assert.equal(model.site.theme, 'light')
    assert.equal(model.connections.length, 2)
    assert.ok(model.contentHtml.startsWith('<p>This page is an Embedded HDOC'))
})

test('reads the fields of the CONDOC example', () => {
    const model = parse(example('condoc.html'), DOMParser)
    assert.equal(model.type, 'condoc')
    assert.equal(model.mainUrl, 'http://localhost:8000/examples/hdoc.html')
    assert.deepEqual(model.connections[0].flinks, ['i:384;l:33;h:8bff02;e:dGQ=_p|x:400;y:110;r:8'])
})

test('keeps unknown hdoc-data keys and CDOC elements', () => {
    const hdoc = createModel('hdoc')
    hdoc.header.h1 = 'T'
    hdoc.extra = { 'removal-selectors': '.ad' }
    assert.deepEqual(parse(generate(hdoc), DOMParser).extra, { 'removal-selectors': '.ad' })

    const cdoc = createModel('cdoc')
    cdoc.header.h1 = 'C'
    cdoc.svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'
    cdoc.sourceExtra = ['<copy-info url="https://example.com/a.cdoc"/>']
    const reparsed = parse(generate(cdoc), DOMParser)
    assert.deepEqual(reparsed.sourceExtra, cdoc.sourceExtra)
    assert.equal(reparsed.svg, cdoc.svg)
})

test('escapes </script> inside the embedded data', () => {
    const model = createModel('hdoc')
    model.header.h1 = 'Has </script> in it'
    const html = generate(model)
    assert.equal(html.match(/<\/script>/g).length, 2) // the reader script tag and hdoc-data
    assert.equal(parse(html, DOMParser).header.h1, 'Has </script> in it')
})
