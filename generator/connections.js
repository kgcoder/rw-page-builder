/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// Connections as XML, in the format the RW Reader extension exports them and CDOC/CONDOC sources
// store them:
//   <connections>
//   <doc url="…" title="…">
//   one flink per line
//   </doc>
//   </connections>
import { escapeXml } from './escape.js'

export function isAbsoluteUrl(url) {
    if (!/^https?:\/\//i.test(url)) return false
    try {
        new URL(url)
        return true
    } catch (e) {
        return false
    }
}

// '' when there are no connections.
export function connectionsToXml(connections) {
    if (!connections || !connections.length) return ''
    const docs = connections.map(con => {
        const titleAttr = con.title ? ` title="${escapeXml(con.title)}"` : ''
        const flinks = (con.flinks || []).map(f => f + '\n').join('')
        return `<doc url="${escapeXml(con.url)}"${titleAttr}>\n${flinks}</doc>\n`
    }).join('')
    return `<connections>\n${docs}</connections>`
}

// The connections of a <connections> element. Children other than <doc> are skipped.
export function connectionsFromElement(el) {
    return Array.prototype.filter.call(el.children, c => c.tagName === 'doc').map(docEl => ({
        url: docEl.getAttribute('url') || '',
        title: docEl.getAttribute('title') || '',
        flinks: docEl.textContent.split('\n').map(s => s.trim()).filter(Boolean),
    }))
}

// Reads pasted connections XML. Empty text means no connections.
// Returns { connections, errors }; connections is only meaningful when errors is empty.
export function parseConnectionsXml(text, DOMParserImpl) {
    if (!text.trim()) return { connections: [], errors: [] }

    const doc = new DOMParserImpl().parseFromString(text.trim(), 'text/xml')
    const root = doc.documentElement
    if (!root || doc.getElementsByTagName('parsererror').length) {
        return { connections: [], errors: ['Connections: the XML is not well-formed.'] }
    }
    if (root.tagName !== 'connections') {
        return { connections: [], errors: ['Connections: the root element must be <connections>, not <' + root.tagName + '>.'] }
    }

    const errors = []
    for (const child of root.children) {
        if (child.tagName !== 'doc') errors.push('Connections: unexpected <' + child.tagName + '> element; only <doc> is allowed.')
    }

    const connections = connectionsFromElement(root)
    const seen = {}
    connections.forEach((con, i) => {
        const name = 'Connection ' + (i + 1) + (con.url ? ' (' + con.url + ')' : '')
        if (!isAbsoluteUrl(con.url)) errors.push(name + ': the url must be an absolute http(s) URL.')
        else if (seen[con.url]) errors.push(name + ': this URL is already connected above.')
        seen[con.url] = true
        if (!con.flinks.length) errors.push(name + ' has no flinks.')
        con.flinks.forEach(flink => {
            const sides = flink.split('_')
            if (sides.length !== 2 || !sides[0] || !sides[1]) errors.push(name + ': "' + flink + '" is not a flink.')
        })
    })

    return { connections, errors }
}
