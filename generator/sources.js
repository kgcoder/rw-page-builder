/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// CDOC and CONDOC XML sources, in the layout used by examples/cdoc.html and examples/condoc.html.
import { escapeXml } from './escape.js'

function connectionsXml(connections) {
    if (!connections || !connections.length) return ''
    const docs = connections.map(con => {
        const titleAttr = con.title ? ` title="${escapeXml(con.title)}"` : ''
        const flinks = (con.flinks || []).map(f => f + '\n').join('')
        return `<doc url="${escapeXml(con.url)}"${titleAttr}>\n${flinks}</doc>\n`
    }).join('')
    return `<connections>\n${docs}</connections>\n\n`
}

function extraXml(sourceExtra) {
    return (sourceExtra || []).map(x => x + '\n\n').join('')
}

export function buildCdocSource(model) {
    return `<cdoc>\n\n<metadata>\n<title>${escapeXml(model.header.h1)}</title>\n</metadata>\n\n`
        + `${model.svg.trim()}\n\n`
        + extraXml(model.sourceExtra)
        + connectionsXml(model.connections)
        + `</cdoc>`
}

export function buildCondocSource(model) {
    const description = model.description ? `<description>${escapeXml(model.description)}</description>\n\n` : ''
    return `<condoc>\n\n<title>${escapeXml(model.header.h1)}</title>\n\n`
        + description
        + `<main>${escapeXml(model.mainUrl)}</main>\n\n`
        + extraXml(model.sourceExtra)
        + connectionsXml(model.connections)
        + `</condoc>`
}


const KNOWN_CDOC_ELEMENTS = ['metadata', 'svg', 'connections']
const KNOWN_CONDOC_ELEMENTS = ['title', 'description', 'main', 'connections']

// Fills model fields from a CDOC or CONDOC source. Unknown top-level elements are kept as raw XML.
export function readSource(model, source, DOMParserImpl) {
    const doc = new DOMParserImpl().parseFromString(source, 'text/xml')
    const root = doc.documentElement
    if (!root || (root.tagName !== 'cdoc' && root.tagName !== 'condoc')) {
        throw new Error('The embedded source is not a CDOC or CONDOC')
    }

    const childText = (parent, tag) => {
        const el = Array.prototype.find.call(parent.children, c => c.tagName === tag)
        return el ? el.textContent.trim() : ''
    }

    let known
    if (root.tagName === 'cdoc') {
        known = KNOWN_CDOC_ELEMENTS
        const metadata = Array.prototype.find.call(root.children, c => c.tagName === 'metadata')
        model.header.h1 = metadata ? childText(metadata, 'title') : ''
        // The SVG is kept as written, not re-serialized.
        const start = source.indexOf('<svg')
        const end = source.lastIndexOf('</svg>')
        model.svg = start !== -1 && end !== -1 ? source.slice(start, end + '</svg>'.length) : ''
    } else {
        known = KNOWN_CONDOC_ELEMENTS
        model.header.h1 = childText(root, 'title')
        model.description = childText(root, 'description')
        model.mainUrl = childText(root, 'main')
    }

    model.connections = []
    const connectionsEl = Array.prototype.find.call(root.children, c => c.tagName === 'connections')
    if (connectionsEl) {
        for (const docEl of Array.prototype.filter.call(connectionsEl.children, c => c.tagName === 'doc')) {
            model.connections.push({
                url: docEl.getAttribute('url') || '',
                title: docEl.getAttribute('title') || '',
                flinks: docEl.textContent.split('\n').map(s => s.trim()).filter(Boolean),
            })
        }
    }

    model.sourceExtra = []
    for (const child of root.children) {
        if (known.indexOf(child.tagName) !== -1) continue
        const raw = sliceElement(source, child.tagName)
        if (raw) model.sourceExtra.push(raw)
    }
}

// The raw text of the first <tag>…</tag> (or <tag/>) in source.
function sliceElement(source, tag) {
    const re = new RegExp('<' + tag + '(\\s[^>]*)?(/>|>[\\s\\S]*?</' + tag + '>)')
    const match = source.match(re)
    return match ? match[0] : ''
}
