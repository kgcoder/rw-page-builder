/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Keeps an HDOC's own flinks pointing at the right text when its content is edited.
//
// A text end (i:…;l:…;h:…;e:…) stores the start index and length of the linked text in the document's
// text, plus a hash and the boundary letters of that text. When the text moves, the end is searched for
// by hash, exactly as the reader's "Fix all" does (reader/textAnchors.js), and its index is updated.
// In this page's own connections the page is always the left side of a flink, so only the left end is
// checked; the right end belongs to the connected document and is never touched.
import FLTextEnd from '../reader/models/FLTextEnd.js'
import { getIndicesForLinkInText, getTextFromDiv, isTextEndIntact, removeTitleFromContent, sanitizeHtml } from '../reader/textAnchors.js'

// The text the reader computes offsets in. Same steps as parseHtmlPageWithEmbeddedHDoc
// (reader/parsers/EmbHDOCParser.js): sanitize, remove the title, then the content is set as the
// presentation div's innerHTML and its text nodes are joined.
// inertDoc: a document that doesn't load or run anything (document.implementation.createHTMLDocument).
export function hdocText(model, inertDoc) {
    const removal = model.extra && typeof model.extra['removal-selectors'] === 'string'
        ? model.extra['removal-selectors'].split(',').map(s => s.trim())
        : []
    let html = sanitizeHtml(model.contentHtml, removal)
    const title = new DOMParser().parseFromString('<!doctype html><body>' + model.header.h1, 'text/html').body.textContent
    html = removeTitleFromContent(html, title)
    const div = inertDoc.createElement('div')
    div.innerHTML = html
    return getTextFromDiv(div)
}

// The first left end of a flink, if it's a text end, with the parts of the string around it.
function parseLeftTextEnd(flink) {
    const sides = flink.split('_')
    if (sides.length !== 2) return null
    const leftEnds = sides[0].split('^')
    const match = leftEnds[0].match(/^(([pt])\|)?(.*)$/)
    if (match[2] === 'p') return null
    const end = FLTextEnd.fromExportString(match[3])
    if (!end) return null
    return {
        end,
        rebuild: () => (match[1] || '') + end.getExportString() + leftEnds.slice(1).map(e => '^' + e).join('') + '_' + sides[1],
    }
}

// status: 'ok' (still points at its text), 'moved' (found again; flink is the updated string),
// 'broken' (the text was changed, removed or is no longer unique), or 'none' (not a text end).
// text: the linked text, when it was found.
export function anchorFlink(flink, text) {
    const parsed = parseLeftTextEnd(flink)
    if (!parsed) return { status: 'none', flink }
    const end = parsed.end
    if (isTextEndIntact(text, end)) {
        return { status: 'ok', flink, text: text.substr(end.index, end.length) }
    }
    const found = getIndicesForLinkInText(text, end.index, end.hash, end.hIndex, end.hLength, end.leftHLetter, end.rightHLetter)
    if (!found) return { status: 'broken', flink }
    end.index = found.newStartIndex
    end.hIndex = found.newStartHIndex
    return { status: 'moved', flink: parsed.rebuild(), text: text.substr(end.index, end.length) }
}

// Checks every flink of an HDOC model against its current content and updates the ones that moved.
// Returns one array of anchorFlink() results per connection.
export function reanchorFlinks(model, inertDoc) {
    if (model.type !== 'hdoc') return model.connections.map(() => [])
    const text = hdocText(model, inertDoc)
    return model.connections.map(con => {
        const results = con.flinks.map(flink => anchorFlink(flink, text))
        con.flinks = results.map(r => r.flink)
        return results
    })
}
