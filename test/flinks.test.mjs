/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Flink re-anchoring against the example HDOC, whose flinks were made by the reader.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

// The reader's sanitizer (DOMPurify) needs a window, and its helpers parse HTML fragments with the
// global DOMParser, which needs a spec-compliant parser.
const { window } = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>')
const { DOMParser } = window
const document = window.document.implementation.createHTMLDocument('')
globalThis.window = window
globalThis.DOMParser = DOMParser

const { parse } = await import('../generator/parse.js')
const { hdocText, reanchorFlinks } = await import('../generator/flinks.js')

const example = () => parse(readFileSync(new URL('../examples/hdoc.html', import.meta.url), 'utf8'), DOMParser)
const statuses = results => results.map(r => r.map(x => x.status))

test("the example's flinks match its text", () => {
    const model = example()
    const results = reanchorFlinks(model, document)
    assert.deepEqual(statuses(results), [['ok', 'ok'], ['ok']])
    assert.equal(results[0][0].text, 'links this sentence to a circle on a small collage')
})

test('flinks follow their text when content is inserted before it', () => {
    const model = example()
    const before = model.connections.map(c => c.flinks.slice())
    const inserted = 'A new first paragraph. '
    model.contentHtml = '<p>' + inserted + '</p>' + model.contentHtml
    const results = reanchorFlinks(model, document)
    assert.deepEqual(statuses(results), [['moved', 'moved'], ['moved']])
    // Only the index of this page's end changes; the connected document's end stays as it was.
    const [oldIndex] = before[0][0].match(/^i:(\d+)/).slice(1)
    assert.equal(model.connections[0].flinks[0], before[0][0].replace('i:' + oldIndex, 'i:' + (Number(oldIndex) + inserted.length)))
    assert.equal(model.connections[0].flinks[0].split('_')[1], before[0][0].split('_')[1])
    // After the update they check as ok again.
    assert.deepEqual(statuses(reanchorFlinks(model, document)), [['ok', 'ok'], ['ok']])
})

test('a flink whose text was edited is reported as broken and kept unchanged', () => {
    const model = example()
    const original = model.connections[0].flinks[1]
    model.contentHtml = model.contentHtml.replace('to a square on', 'to a box on') // inside the linked text
    const results = reanchorFlinks(model, document)
    assert.equal(results[0][1].status, 'broken')
    assert.equal(model.connections[0].flinks[1], original)
})

test('the text excludes what the reader removes', () => {
    const model = example()
    model.contentHtml = '<h1>Example HDOC</h1><script>var x = 1</script><p>Text</p>'
    assert.equal(hdocText(model, document), 'Text')
})
