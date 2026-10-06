/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// A CDOC's <svg> as a collage the editor can change: a frame (width × height), an optional background,
// and the top-level elements as items. Images and plain texts are editable; anything else is a raw
// item, kept exactly as written. Untouched items keep their source and are written back from it, so
// editing one item never rewrites the others.
//
// Items: { kind: 'image', x, y, width, height, href, extra, source }
//        { kind: 'text', x, y, lines, fontSize, fontFamily, fontWeight, fontStyle, fill, anchor, lineHeight, extra, source }
//        { kind: 'raw', source }
// extra: [[name, value]] attributes the editor doesn't edit, written back as they were.
// An edited item has source = null and is written from its fields.
import { escapeXml } from '../../generator/escape.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

export const DEFAULT_WIDTH = 400
export const DEFAULT_HEIGHT = 300
export const DEFAULT_LINE_HEIGHT = '1.2em'

// The reader's sanitizeCdocSvg (reader/helpers.js) config. The editor shows the SVG through it, so
// what you see is what the reader draws. Keep in sync.
export const SANITIZE_CONFIG = {
    NAMESPACE: SVG_NS,
    ALLOWED_TAGS: ['svg', 'g', 'path', 'circle', 'rect', 'ellipse', 'line',
        'polyline', 'polygon', 'text', 'tspan', 'title', 'desc', 'a', 'image'],
    ALLOWED_ATTR: ['xmlns', 'xmlns:xlink', 'width', 'height', 'viewbox',
        'preserveaspectratio', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy',
        'r', 'rx', 'ry', 'd', 'points', 'fill', 'stroke', 'stroke-width',
        'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity',
        'fill-opacity', 'stroke-opacity', 'transform', 'font-size',
        'font-family', 'font-weight', 'font-style', 'text-anchor', 'dx', 'dy',
        'id', 'class', 'href', 'xlink:href', 'target', 'vector-effect'],
}

export function createCollage(width, height) {
    return {
        width: width || DEFAULT_WIDTH,
        height: height || DEFAULT_HEIGHT,
        background: '',
        extraAttrs: [],
        items: [],
    }
}

export function emptySvg(width, height) {
    return serializeCollage(createCollage(width, height))
}

export function newImage(href, x, y, width, height) {
    return { kind: 'image', x, y, width, height, href, extra: [], source: null }
}

export function newText(text, x, y) {
    return {
        kind: 'text', x, y, lines: [text], fontSize: 20, fontFamily: 'sans-serif', fontWeight: '', fontStyle: '',
        fill: '#333333', anchor: 'start', lineHeight: DEFAULT_LINE_HEIGHT, extra: [], source: null,
    }
}


// ---- parsing

// Returns null if svgString has no <svg> element with a numeric width and height (the reader needs both).
export function parseCollage(svgString, DOMParserImpl) {
    const split = splitSvg(String(svgString || ''))
    if (!split) return null

    const svgEl = parseFragment(split.openTag.replace(/\/?>$/, '>') + '</svg>', DOMParserImpl, true)
    if (!svgEl) return null
    const width = parseFloat(svgEl.getAttribute('width'))
    const height = parseFloat(svgEl.getAttribute('height'))
    if (isNaN(width) || isNaN(height)) return null

    const collage = createCollage(width, height)
    collage.extraAttrs = attributes(svgEl).filter(([name]) => ['xmlns', 'width', 'height'].indexOf(name) === -1)

    split.children.forEach((source, i) => {
        const el = source.charAt(0) === '<' && source.charAt(1) !== '!' ? parseFragment(source, DOMParserImpl) : null
        if (i === 0 && el && readBackground(el, width, height, collage)) return
        collage.items.push((el && (readImage(el) || readText(el))) || { kind: 'raw', source })
        const item = collage.items[collage.items.length - 1]
        if (item.kind !== 'raw') item.source = source
    })
    return collage
}

// The <svg> start tag and the source of each top-level child (elements, comments, stray text),
// sliced from the string as written.
export function splitSvg(s) {
    const start = s.indexOf('<svg')
    if (start === -1) return null
    const openEnd = tagEnd(s, start)
    if (openEnd === -1) return null
    const openTag = s.slice(start, openEnd)
    const children = []
    if (/\/>$/.test(openTag)) return { openTag, children }

    let i = openEnd
    let depth = 0
    let childStart = -1
    while (i < s.length) {
        const lt = s.indexOf('<', i)
        if (lt === -1) return null
        if (depth === 0) {
            const text = s.slice(i, lt).trim()
            if (text) children.push(text)
        }
        let end
        if (s.startsWith('<!--', lt)) {
            end = endOf(s, '-->', lt)
            if (depth === 0 && end !== -1) children.push(s.slice(lt, end))
        } else if (s.startsWith('<![CDATA[', lt)) {
            end = endOf(s, ']]>', lt)
        } else if (s.startsWith('<?', lt)) {
            end = endOf(s, '?>', lt)
        } else {
            end = tagEnd(s, lt)
            if (end === -1) return null
            const tag = s.slice(lt, end)
            if (tag.charAt(1) === '/') {
                if (depth === 0) return { openTag, children } // </svg>
                depth--
                if (depth === 0) {
                    children.push(s.slice(childStart, end))
                    childStart = -1
                }
            } else if (/\/>$/.test(tag)) {
                if (depth === 0) children.push(tag)
            } else {
                if (depth === 0) childStart = lt
                depth++
            }
        }
        if (end === -1) return null
        i = end
    }
    return null
}

// The index just after the '>' of the tag starting at i, skipping quoted attribute values.
function tagEnd(s, i) {
    let quote = null
    for (let j = i + 1; j < s.length; j++) {
        const c = s.charAt(j)
        if (quote) {
            if (c === quote) quote = null
        } else if (c === '"' || c === "'") {
            quote = c
        } else if (c === '>') {
            return j + 1
        }
    }
    return -1
}

function endOf(s, marker, from) {
    const index = s.indexOf(marker, from)
    return index === -1 ? -1 : index + marker.length
}

// One element, parsed on its own. A child is wrapped in an <svg> that declares the usual namespaces.
function parseFragment(source, DOMParserImpl, isRoot) {
    const xml = isRoot ? source : '<svg xmlns="' + SVG_NS + '" xmlns:xlink="' + XLINK_NS + '">' + source + '</svg>'
    const doc = new DOMParserImpl().parseFromString(xml, 'image/svg+xml')
    if (!doc.documentElement || doc.getElementsByTagName('parsererror').length) return null
    return isRoot ? doc.documentElement : doc.documentElement.firstElementChild
}

function attributes(el) {
    return Array.prototype.map.call(el.attributes, a => [a.name, a.value])
}

const NUMBER = /^\s*-?(\d+\.?\d*|\.\d+)(px)?\s*$/

function num(value) {
    return value != null && NUMBER.test(value) ? parseFloat(value) : NaN
}

// A leading <rect> that fills the frame and only has a fill.
function readBackground(el, width, height, collage) {
    if (el.tagName !== 'rect') return false
    const allowed = ['x', 'y', 'width', 'height', 'fill']
    if (attributes(el).some(([name]) => allowed.indexOf(name) === -1)) return false
    const x = el.hasAttribute('x') ? num(el.getAttribute('x')) : 0
    const y = el.hasAttribute('y') ? num(el.getAttribute('y')) : 0
    const fill = el.getAttribute('fill')
    if (x !== 0 || y !== 0 || !fill || fill === 'none') return false
    if (num(el.getAttribute('width')) !== width || num(el.getAttribute('height')) !== height) return false
    collage.background = fill
    return true
}

const IMAGE_ATTRS = ['x', 'y', 'width', 'height', 'href', 'xlink:href']

// The reader only draws an <image> with a numeric x, y, width and height (see reader/parsers/CDOCParser.js).
function readImage(el) {
    if (el.tagName !== 'image' || el.firstElementChild) return null
    const x = num(el.getAttribute('x'))
    const y = num(el.getAttribute('y'))
    const width = num(el.getAttribute('width'))
    const height = num(el.getAttribute('height'))
    const href = el.getAttribute('href') || el.getAttribute('xlink:href')
    if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height) || !href) return null
    return {
        kind: 'image', x, y, width, height, href,
        extra: attributes(el).filter(([name]) => IMAGE_ATTRS.indexOf(name) === -1),
    }
}

const TEXT_ATTRS = ['x', 'y', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor', 'fill']
const ANCHORS = ['start', 'middle', 'end']
const NBSP = ' '

// Plain text, or <tspan x="…" dy="…"> lines. Anything else (nested markup, positioned tspans) is raw.
function readText(el) {
    if (el.tagName !== 'text') return null
    const x = el.hasAttribute('x') ? num(el.getAttribute('x')) : 0
    const y = el.hasAttribute('y') ? num(el.getAttribute('y')) : 0
    const fontSize = el.hasAttribute('font-size') ? num(el.getAttribute('font-size')) : 16
    const anchor = el.getAttribute('text-anchor') || 'start'
    if (isNaN(x) || isNaN(y) || isNaN(fontSize) || ANCHORS.indexOf(anchor) === -1) return null

    const tspans = Array.prototype.filter.call(el.childNodes, n => n.nodeType === 1)
    let lines
    let lineHeight = DEFAULT_LINE_HEIGHT
    if (!tspans.length) {
        lines = [collapse(el.textContent)]
    } else {
        const ok = Array.prototype.every.call(el.childNodes, n =>
            (n.nodeType === 3 && !n.nodeValue.trim()) || (n.nodeType === 1 && isLine(n)))
        if (!ok) return null
        lines = tspans.map(t => collapse(t.textContent))
        if (tspans.length > 1) lineHeight = tspans[1].getAttribute('dy')
    }
    return {
        kind: 'text', x, y, lines, fontSize,
        fontFamily: el.getAttribute('font-family') || '',
        fontWeight: el.getAttribute('font-weight') || '',
        fontStyle: el.getAttribute('font-style') || '',
        fill: el.getAttribute('fill') || '',
        anchor, lineHeight,
        extra: attributes(el).filter(([name]) => TEXT_ATTRS.indexOf(name) === -1),
    }

    // A line written by this editor: the text's x, dy 0 for the first line and the line height after.
    function isLine(t) {
        if (t.tagName !== 'tspan' || t.firstElementChild) return false
        if (attributes(t).some(([name]) => name !== 'x' && name !== 'dy')) return false
        if (num(t.getAttribute('x')) !== x) return false
        const first = t === tspans[0]
        const dy = t.getAttribute('dy')
        return first ? !dy || num(dy) === 0 : !!dy && dy === tspans[1].getAttribute('dy')
    }
}

function collapse(text) {
    const s = text.replace(/[ \t\r\n]+/g, ' ').trim()
    return s === NBSP ? '' : s
}


// ---- writing

export function serializeCollage(collage) {
    const { width, height } = collage
    const attrs = [['xmlns', SVG_NS], ['width', n(width)], ['height', n(height)]]
        .concat(collage.extraAttrs.map(([name, value]) =>
            // A viewBox that matched the frame follows it.
            [name, name === 'viewBox' && /^\s*0[\s,]+0[\s,]/.test(value) ? '0 0 ' + n(width) + ' ' + n(height) : value]))
    const lines = []
    if (collage.background) lines.push(backgroundXml(collage))
    collage.items.forEach(item => lines.push(itemXml(item)))
    return '<svg' + attrString(attrs) + '>\n' + lines.map(l => '  ' + l + '\n').join('') + '</svg>'
}

export function backgroundXml(collage) {
    return '<rect' + attrString([['x', '0'], ['y', '0'], ['width', n(collage.width)], ['height', n(collage.height)],
        ['fill', collage.background]]) + '/>'
}

// The item's source if it's untouched, otherwise the element generated from its fields.
export function itemXml(item) {
    if (item.source != null) return item.source
    return generatedXml(item)
}

// forStage: the editor's own drawing. The reader ignores preserveAspectRatio and stretches every image
// to its box, so the stage does the same; the SVG itself doesn't need the attribute.
export function generatedXml(item, forStage) {
    if (item.kind === 'image') {
        const attrs = [['x', n(item.x)], ['y', n(item.y)], ['width', n(item.width)], ['height', n(item.height)], ['href', item.href]]
        // Before item.extra: the HTML parser the sanitizer uses keeps the first of two equal attributes.
        if (forStage) attrs.push(['preserveAspectRatio', 'none'])
        return '<image' + attrString(attrs.concat(item.extra)) + '/>'
    }
    if (item.kind === 'text') {
        const attrs = [['x', n(item.x)], ['y', n(item.y)], ['font-size', n(item.fontSize)]]
        if (item.fontFamily) attrs.push(['font-family', item.fontFamily])
        if (item.fontWeight) attrs.push(['font-weight', item.fontWeight])
        if (item.fontStyle) attrs.push(['font-style', item.fontStyle])
        if (item.anchor && item.anchor !== 'start') attrs.push(['text-anchor', item.anchor])
        if (item.fill) attrs.push(['fill', item.fill])
        const lines = item.lines.length ? item.lines : ['']
        const body = lines.length === 1
            ? escapeXml(lines[0])
            // Every line repeats x, so each one is aligned on its own by text-anchor. An empty line
            // gets a no-break space: a <tspan> without characters wouldn't move to a new line.
            : lines.map((line, i) => '<tspan' + attrString([['x', n(item.x)], ['dy', i ? item.lineHeight || DEFAULT_LINE_HEIGHT : '0']])
                + '>' + escapeXml(line || NBSP) + '</tspan>').join('')
        return '<text' + attrString(attrs.concat(item.extra)) + '>' + body + '</text>'
    }
    return item.source
}

function attrString(attrs) {
    return attrs.map(([name, value]) => ' ' + name + '="' + escapeXml(value) + '"').join('')
}

// Whole numbers: the editor snaps everything to integers.
function n(value) {
    return String(Math.round(value))
}
