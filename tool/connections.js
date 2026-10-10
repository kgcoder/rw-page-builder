/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// The connections: the XML the RW Reader extension exports, pasted into one textarea. While it's
// valid it is the model's connections; while it isn't, the model keeps the last valid ones and the
// problems are shown under it (and block saving, see connectionsErrors()).
import { connectionsToXml, parseConnectionsXml } from '../generator/connections.js'
import { h, setChildren } from './dom.js'
import { changed } from './state.js'

const PLACEHOLDER = '<connections>\n<doc url="https://example.com/page.html" title="Page title">\n'
    + 'i:244;l:50;h:c70e7b;e:bGU=_p|x:200;y:260;r:8\n</doc>\n</connections>'

// What showFlinkStatuses() needs to update the section without rebuilding the form.
let view = null
// The problems in the XML being edited.
let pendingErrors = []
// The text each flink pointed at the last time it was found, by flink string, so a flink that breaks
// can still show what it was linked to.
const knownText = new Map()

export function connectionsErrors() {
    return pendingErrors
}

export function renderConnections(model) {
    pendingErrors = []
    const errorList = h('ul', { class: 'connections-errors' })
    const textarea = h('textarea', {
        rows: 8, class: 'code', spellcheck: 'false', placeholder: PLACEHOLDER,
        value: connectionsToXml(model.connections),
        onInput: e => {
            const result = parseConnectionsXml(e.target.value, DOMParser)
            pendingErrors = result.errors
            if (!result.errors.length) model.connections = result.connections
            setChildren(errorList, result.errors.map(err => h('li', null, err)))
            changed()
        },
    })
    const statuses = h('div', { class: 'connections-statuses' })
    view = { model, textarea, statuses }
    return h('div', { class: 'connections' }, textarea, errorList, statuses)
}

// results: per connection, the anchorFlink() results from generator/flinks.js (empty for CDOC/CONDOC,
// whose own side isn't text).
export function showFlinkStatuses(results) {
    if (!view) return
    const connections = view.model.connections
    // Re-anchored flinks have new strings; don't overwrite what the user is typing or an XML with problems.
    const moved = results.some(conResults => conResults.some(r => r.status === 'moved'))
    if (moved && !pendingErrors.length && document.activeElement !== view.textarea) {
        view.textarea.value = connectionsToXml(connections)
    }
    setChildren(view.statuses, connections.map((con, i) => {
        const rows = (results[i] || []).filter(r => r.status !== 'none').map(statusRow)
        if (!rows.length) return null
        return h('div', { class: 'connection-status' },
            h('div', { class: 'connection-status-title' }, con.title || con.url),
            h('ul', { class: 'flink-statuses' }, rows))
    }))
}

function statusRow(result) {
    if (result.text != null) knownText.set(result.flink, result.text)
    const text = result.text != null ? result.text : knownText.get(result.flink)
    const quote = text != null ? '“' + shorten(text) + '”' : ''
    if (result.status === 'ok') return h('li', { class: 'flink-ok', title: 'Points at its text' }, '✓ ', quote)
    if (result.status === 'moved') return h('li', { class: 'flink-moved', title: 'The text moved; the flink was updated' }, '↻ Updated: ', quote)
    return h('li', { class: 'flink-broken' },
        '✗ Not found' + (quote ? ': ' : ''), quote,
        h('span', { class: 'hint' }, ' The linked text was changed, removed, or now appears more than once. The flink is kept as it is.'))
}

function shorten(text) {
    const oneLine = text.replace(/\s+/g, ' ').trim()
    return oneLine.length > 80 ? oneLine.slice(0, 77) + '…' : oneLine
}
