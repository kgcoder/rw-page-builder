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

export function renderConnections(model) {
    const list = h('div', { class: 'connections' })

    function render() {
        list.replaceChildren(...model.connections.map((con, i) => card(con, i)).concat([
            h('button', {
                type: 'button',
                onClick: () => {
                    model.connections.push({ url: '', title: '', flinks: [] })
                    changed()
                    render()
                    const inputs = list.querySelectorAll('.connection input')
                    if (inputs.length) inputs[inputs.length - 2].focus()
                },
            }, 'Add connection'),
        ]))
    }

    function card(con, index) {
        const count = h('span', { class: 'hint' }, flinkCount(con))
        return h('div', { class: 'connection' },
            h('div', { class: 'connection-head' },
                h('span', { class: 'connection-number' }, String(index + 1)),
                h('button', {
                    type: 'button', class: 'small danger', title: 'Remove this connection',
                    onClick: () => {
                        model.connections.splice(index, 1)
                        changed()
                        render()
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
                h('textarea', {
                    rows: Math.min(8, Math.max(2, con.flinks.length + 1)), class: 'code', spellcheck: 'false',
                    value: con.flinks.join('\n'),
                    onInput: e => {
                        con.flinks = e.target.value.split('\n').map(s => s.trim()).filter(Boolean)
                        count.textContent = flinkCount(con)
                        changed()
                    },
                }),
                count))
    }

    render()
    return list
}

function flinkCount(con) {
    return con.flinks.length === 1 ? '1 flink' : con.flinks.length + ' flinks'
}
