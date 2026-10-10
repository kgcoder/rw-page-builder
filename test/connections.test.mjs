/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// The connections XML pasted into the tool (the format the RW Reader extension exports).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { connectionsToXml, parseConnectionsXml } from '../generator/connections.js'

const { DOMParser } = new JSDOM('').window
const parse = text => parseConnectionsXml(text, DOMParser)

const EXPORTED = `<connections>
<doc url="http://localhost:8000/examples/cdoc.html" title="Example CDOC">
i:244;l:50;h:c70e7b;e:bGU=_p|x:200;y:260;r:8
i:314;l:51;h:985c98;e:bGU=_p|x:560;y:260;r:8
</doc>
<doc url="https://example.com/" title="Example Domain">
i:531;l:32;h:5fcb71;e:cGU=_i:0;l:14;h:162b81;e:RW4=
</doc>
</connections>`

test('reads the exported XML and writes it back unchanged', () => {
    const result = parse(EXPORTED + '\n')
    assert.deepEqual(result.errors, [])
    assert.deepEqual(result.connections, [
        {
            url: 'http://localhost:8000/examples/cdoc.html',
            title: 'Example CDOC',
            flinks: ['i:244;l:50;h:c70e7b;e:bGU=_p|x:200;y:260;r:8', 'i:314;l:51;h:985c98;e:bGU=_p|x:560;y:260;r:8'],
        },
        { url: 'https://example.com/', title: 'Example Domain', flinks: ['i:531;l:32;h:5fcb71;e:cGU=_i:0;l:14;h:162b81;e:RW4='] },
    ])
    assert.equal(connectionsToXml(result.connections), EXPORTED)
})

test('empty text means no connections', () => {
    assert.deepEqual(parse('  \n'), { connections: [], errors: [] })
    assert.equal(connectionsToXml([]), '')
})

test('escapes titles and URLs', () => {
    const connections = [{ url: 'https://example.com/?a=1&b=2', title: 'Tom & "Jerry"', flinks: ['a_b'] }]
    assert.deepEqual(parse(connectionsToXml(connections)).connections, connections)
})

const errorsOf = text => parse(text).errors

test('reports malformed XML and a wrong root', () => {
    assert.match(errorsOf('<connections><doc url="https://a.com/">a_b</connections>')[0], /not well-formed/)
    assert.match(errorsOf('<links><doc url="https://a.com/">a_b</doc></links>')[0], /root element must be <connections>/)
    assert.match(errorsOf('<connections><link/></connections>')[0], /unexpected <link>/)
})

test('reports bad URLs, missing and malformed flinks, and duplicates', () => {
    assert.match(errorsOf('<connections><doc url="/page.html">a_b</doc></connections>')[0], /absolute http\(s\) URL/)
    assert.match(errorsOf('<connections><doc>a_b</doc></connections>')[0], /absolute http\(s\) URL/)
    assert.match(errorsOf('<connections><doc url="https://a.com/"></doc></connections>')[0], /has no flinks/)
    assert.match(errorsOf('<connections><doc url="https://a.com/">\nab\n_b\n</doc></connections>')[0], /"ab" is not a flink/)
    assert.match(errorsOf('<connections><doc url="https://a.com/">a_b</doc><doc url="https://a.com/">c_d</doc></connections>')[0],
        /Connection 2 \(https:\/\/a\.com\/\): this URL is already connected/)
})
