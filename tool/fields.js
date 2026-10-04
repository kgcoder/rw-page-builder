/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Form controls shared by the document form, the site settings and the panels editor. Each control
// reads its value with get(), and on input calls set(value) and then notify().
import { h } from './dom.js'

/* global RW_THEMES, RW_FONT_SETS */
export const THEMES = RW_THEMES.map(t => ({ id: t, label: t }))
export const FONT_SETS = RW_FONT_SETS

export function field(label, control, hint) {
    return h('label', { class: 'field' },
        h('span', { class: 'field-label' }, label),
        control,
        hint ? h('span', { class: 'hint' }, hint) : null)
}

// An <input>, or a <textarea> when props.rows is given.
export function textInput(get, set, notify, props) {
    const tag = props && props.rows ? 'textarea' : 'input'
    return h(tag, Object.assign({
        type: tag === 'input' ? 'text' : null,
        value: get(),
        onInput: e => { set(e.target.value); notify() },
    }, props))
}

// options: [{id, label}]. A current value that isn't in the list (e.g. from a page made with another
// reader version) is kept as an extra option.
export function select(options, get, set, notify) {
    const current = get()
    const all = !current || options.some(o => o.id === current)
        ? options
        : options.concat([{ id: current, label: current + ' (unknown)' }])
    return h('select', {
        value: current,
        onChange: e => { set(e.target.value); notify() },
    }, all.map(o => h('option', { value: o.id }, o.label)))
}

export function iconButton(label, title, onClick, disabled) {
    return h('button', { type: 'button', class: 'icon', title, 'aria-label': title, disabled: !!disabled, onClick }, label)
}
