/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// The CDOC editor's SVG <-> collage conversion and its snapping.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { parse } from '../generator/parse.js'
import { emptySvg, generatedXml, newImage, newText, parseCollage, serializeCollage } from '../tool/cdoc/collage.js'
import { findGuides, snapMove, snapResize } from '../tool/cdoc/snap.js'

const { DOMParser } = new JSDOM('').window

const toCollage = svg => parseCollage(svg, DOMParser)
const exampleSvg = parse(readFileSync(new URL('../examples/cdoc.html', import.meta.url), 'utf8'), DOMParser).svg

test('the example SVG round-trips unchanged', () => {
    const collage = toCollage(exampleSvg)
    assert.equal(collage.width, 800)
    assert.equal(collage.height, 500)
    assert.equal(collage.background, '#f4f1ea')
    assert.deepEqual(collage.items.map(i => i.kind), ['raw', 'text', 'raw', 'text', 'raw', 'text'])
    assert.equal(serializeCollage(collage), exampleSvg)
})

test('an edited item is regenerated, its neighbours keep their source', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">\n'
        + '  <circle cx="1" cy="1" r="1" fill="red"   />\n'
        + '  <text x="2" y="3" fill="#000" id="t">Hi</text>\n'
        + '  <image x="0" y="0" width="5" height="4" xlink:href="a.png" xmlns:xlink="http://www.w3.org/1999/xlink"/>\n'
        + '</svg>'
    const collage = toCollage(svg)
    assert.deepEqual(collage.items.map(i => i.kind), ['raw', 'text', 'image'])
    assert.equal(serializeCollage(collage), svg)

    collage.items[1].x = 7.4
    collage.items[1].source = null
    const image = collage.items[2]
    image.width = 6
    image.source = null
    const out = serializeCollage(collage).split('\n')
    assert.equal(out[1], '  <circle cx="1" cy="1" r="1" fill="red"   />')
    assert.equal(out[2], '  <text x="7" y="3" font-size="16" fill="#000" id="t">Hi</text>')
    assert.equal(out[3], '  <image x="0" y="0" width="6" height="4" href="a.png" xmlns:xlink="http://www.w3.org/1999/xlink"/>')
})

test('multi-line texts and text-anchor', () => {
    const collage = toCollage(emptySvg())
    const text = newText('a', 50, 60)
    text.lines = ['One', '', 'Three & <4>']
    collage.items.push(text)
    let out = serializeCollage(collage)
    assert.match(out, /<text x="50" y="60" font-size="20" font-family="sans-serif" fill="#333333">/)
    assert.match(out, /<tspan x="50" dy="0">One<\/tspan><tspan x="50" dy="1.2em"> <\/tspan><tspan x="50" dy="1.2em">Three &amp; &lt;4&gt;<\/tspan>/)

    // Read back as an editable text.
    const back = toCollage(out).items[0]
    assert.equal(back.kind, 'text')
    assert.deepEqual(back.lines, ['One', '', 'Three & <4>'])
    assert.equal(back.anchor, 'start')

    // middle and end are written; every line repeats x.
    text.anchor = 'middle'
    out = serializeCollage(collage)
    assert.match(out, / text-anchor="middle"/)
    assert.equal(out.match(/<tspan x="50"/g).length, 3)
    assert.equal(toCollage(out).items[0].anchor, 'middle')
    text.anchor = 'end'
    assert.equal(toCollage(serializeCollage(collage)).items[0].anchor, 'end')
})

test("texts and images it can't edit stay raw", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">'
        + '<text x="1" y="1"><tspan font-weight="bold">b</tspan></text>'
        + '<text x="1em" y="1">em</text>'
        + '<image x="0" y="0" width="5" href="a.png"/>'
        + '<!-- note --><g><rect width="1" height="1"/></g></svg>'
    const collage = toCollage(svg)
    assert.deepEqual(collage.items.map(i => i.kind), ['raw', 'raw', 'raw', 'raw', 'raw'])
    assert.equal(collage.items[3].source, '<!-- note -->')
    assert.equal(collage.items[4].source, '<g><rect width="1" height="1"/></g>')
})

test('background: a leading full-frame rect; transparent writes none', () => {
    const collage = toCollage(emptySvg(400, 300))
    assert.equal(collage.background, '')
    assert.equal(serializeCollage(collage), '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">\n</svg>')

    collage.background = '#ff0000'
    collage.width = 500
    const out = serializeCollage(collage)
    assert.match(out, /^ {2}<rect x="0" y="0" width="500" height="300" fill="#ff0000"\/>$/m)
    const back = toCollage(out)
    assert.equal(back.background, '#ff0000')
    assert.equal(back.items.length, 0)

    back.background = ''
    assert.doesNotMatch(serializeCollage(back), /<rect/)

    // Not the background: smaller than the frame, or not first.
    assert.equal(toCollage('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="5" height="10" fill="red"/></svg>').background, '')
    assert.equal(toCollage('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle r="1"/><rect width="10" height="10" fill="red"/></svg>').background, '')
})

test('frame size: whole numbers, viewBox follows', () => {
    const collage = toCollage('<svg xmlns="http://www.w3.org/2000/svg" width="10.6" height="20" viewBox="0 0 10.6 20"></svg>')
    assert.equal(collage.width, 10.6)
    collage.width = 30
    assert.equal(serializeCollage(collage), '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20" viewBox="0 0 30 20">\n</svg>')
    assert.equal(toCollage('<svg width="a" height="1"></svg>'), null)
    assert.equal(toCollage('nothing'), null)
})

test('images: preserveAspectRatio only on the stage, or when the source had it', () => {
    const collage = toCollage(emptySvg())
    collage.items.push(newImage('https://example.com/a "b".png', 1, 2, 3, 4))
    assert.match(serializeCollage(collage), /<image x="1" y="2" width="3" height="4" href="https:\/\/example.com\/a &quot;b&quot;.png"\/>/)
    assert.match(generatedXml(collage.items[0], true), / preserveAspectRatio="none"\/>$/)

    const kept = toCollage('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image x="0" y="0" width="5" height="5" href="a.png" preserveAspectRatio="xMinYMin"/></svg>').items[0]
    kept.source = null
    assert.equal(generatedXml(kept), '<image x="0" y="0" width="5" height="5" href="a.png" preserveAspectRatio="xMinYMin"/>')
})


// ---- snapping

const frame = { x: 0, y: 0, w: 400, h: 300 }

test('snapMove: edges and centers, within the threshold', () => {
    const other = { x: 100, y: 100, w: 50, h: 50 }
    // Left edge 3 away from the other's left edge.
    assert.deepEqual(snapMove({ x: 103, y: 220, w: 30, h: 20 }, [other], 5), { dx: -3, dy: 0 })
    // Center to the frame's center.
    assert.deepEqual(snapMove({ x: 188, y: 138, w: 20, h: 20 }, [frame], 5), { dx: 2, dy: 2 })
    // Too far.
    assert.deepEqual(snapMove({ x: 112, y: 220, w: 6, h: 20 }, [other], 5), { dx: 0, dy: 0 })
    // The nearest line wins.
    assert.deepEqual(snapMove({ x: 148, y: 220, w: 20, h: 20 }, [other, { x: 149, y: 0, w: 1, h: 1 }], 5), { dx: 1, dy: 0 })
})

test('snapResize: corners, aspect ratio, minimum size', () => {
    const box = { x: 10, y: 10, w: 100, h: 50 }
    // se to a target edge.
    assert.deepEqual(snapResize(box, 'se', { x: 198, y: 100 }, [{ x: 200, y: 0, w: 10, h: 10 }], 5, false), { x: 10, y: 10, w: 190, h: 90 })
    // nw keeps the opposite corner.
    assert.deepEqual(snapResize(box, 'nw', { x: 0, y: 0 }, [], 5, false), { x: 0, y: 0, w: 110, h: 60 })
    // Aspect: the axis that moved further wins.
    assert.deepEqual(snapResize(box, 'se', { x: 210, y: 70 }, [], 5, true), { x: 10, y: 10, w: 200, h: 100 })
    // Aspect: a snapped axis wins.
    assert.deepEqual(snapResize(box, 'se', { x: 208, y: 300 }, [{ x: 210, y: 0, w: 0, h: 0 }], 5, true), { x: 10, y: 10, w: 200, h: 100 })
    // Never smaller than the minimum, never flipped.
    assert.deepEqual(snapResize(box, 'se', { x: -50, y: -50 }, [], 5, false, 1), { x: 10, y: 10, w: 1, h: 1 })
})

test('findGuides: lines across all the boxes that share them', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 }
    const b = { x: 0, y: 50, w: 30, h: 10 }
    const guides = findGuides(a, [b])
    assert.deepEqual(guides, [{ x1: 0, x2: 0, y1: 0, y2: 60 }])
    assert.deepEqual(findGuides({ x: 195, y: 5, w: 10, h: 10 }, [frame]), [{ x1: 200, x2: 200, y1: 0, y2: 300 }])
})
