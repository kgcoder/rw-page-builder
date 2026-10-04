/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// The connections list: one card per connected document.
import { h } from './dom.js'
import { changed } from './state.js'

// Per card: what showFlinkStatuses() needs to update it without rebuilding the form.
let cards = []
// The text each flink pointed at the last time it was found, by flink string, so a flink that breaks
// can still show what it was linked to.
const knownText = new Map()

export function renderConnections(model) {
    const list = h('div', { class: 'connections' })

    // render() comes before changed(), so the new cards exist when the statuses for them arrive.
    function render() {
        cards = []
        list.replaceChildren(...model.connections.map((con, i) => card(con, i)).concat([
            h('button', {
                type: 'button',
                onClick: () => {
                    model.connections.push({ url: '', title: '', flinks: [] })
                    render()
                    changed()
                    const inputs = list.querySelectorAll('.connection input')
                    if (inputs.length) inputs[inputs.length - 2].focus()
                },
            }, 'Add connection'),
        ]))
    }

    function card(con, index) {
        const count = h('span', { class: 'hint' }, flinkCount(con))
        const statuses = h('ul', { class: 'flink-statuses' })
        const textarea = h('textarea', {
            rows: Math.min(8, Math.max(2, con.flinks.length + 1)), class: 'code', spellcheck: 'false',
            value: con.flinks.join('\n'),
            onInput: e => {
                con.flinks = e.target.value.split('\n').map(s => s.trim()).filter(Boolean)
                count.textContent = flinkCount(con)
                changed()
            },
        })
        cards.push({ con, textarea, statuses })
        return h('div', { class: 'connection' },
            h('div', { class: 'connection-head' },
                h('span', { class: 'connection-number' }, String(index + 1)),
                h('button', {
                    type: 'button', class: 'small danger', title: 'Remove this connection',
                    onClick: () => {
                        model.connections.splice(index, 1)
                        render()
                        changed()
                    },
                }, 'Remove')),
            h('label', { class: 'field' },
                h('span', { class: 'field-label' }, 'URL'),
                h('input', { type: 'url', value: con.url, placeholder: 'https://…', onInput: e => { con.url = e.target.value.trim(); changed() } })),
            h('label', { class: 'field' },
                h('span', { class: 'field-label' }, 'Title'),
                h('input', { type: 'text', value: con.title, onInput: e => { con.title = e.target.value; changed() } })),
            h('label', { class: 'field' },
                h('span', { class: 'field-label' }, 'Flinks'),
                textarea,
                count),
            statuses)
    }

    render()
    return list
}

// results: per connection, the anchorFlink() results from generator/flinks.js (empty for CDOC/CONDOC,
// whose own side isn't text).
export function showFlinkStatuses(results) {
    cards.forEach((card, i) => {
        const conResults = results[i] || []
        // Re-anchored flinks have new strings; don't overwrite what the user is typing.
        const value = card.con.flinks.join('\n')
        if (card.textarea.value !== value && document.activeElement !== card.textarea) card.textarea.value = value
        card.statuses.replaceChildren(...conResults.filter(r => r.status !== 'none').map(statusRow))
    })
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

function flinkCount(con) {
    return con.flinks.length === 1 ? '1 flink' : con.flinks.length + ' flinks'
}
