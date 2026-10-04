/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// The form. It's rebuilt from the model when a document is opened or its type changes;
// typing only updates the model.
import { renderConnections } from './connections.js'
import { h } from './dom.js'
import { changed, getModel } from './state.js'

/* global RW_THEMES, RW_FONT_SETS */
const THEMES = RW_THEMES
const FONT_SETS = RW_FONT_SETS

const TYPES = [
    { id: 'hdoc', label: 'HDOC', hint: 'A text document' },
    { id: 'cdoc', label: 'CDOC', hint: 'A collage (SVG)' },
    { id: 'condoc', label: 'CONDOC', hint: "Connections for another page" },
]

// Errors in fields whose text can't be stored in the model yet (invalid JSON), by field label.
const fieldErrors = {}

export function getFieldErrors() {
    return fieldErrors
}

export function renderForm(form) {
    const model = getModel()
    for (const key of Object.keys(fieldErrors)) delete fieldErrors[key]

    const sections = [
        documentSection(model),
        contentSection(model),
        h('fieldset', { class: 'section' },
            h('legend', null, 'Connections'),
            h('p', { class: 'hint' }, 'Flinks are created in the RW Reader extension. Paste them here, one per line.'),
            renderConnections(model)),
        siteSection(model),
        model.type === 'hdoc' ? panelsSection(model) : null,
    ]

    form.replaceChildren(...sections.filter(Boolean))
}


// ---- fields

function field(label, control, hint) {
    return h('label', { class: 'field' },
        h('span', { class: 'field-label' }, label),
        control,
        hint ? h('span', { class: 'hint' }, hint) : null)
}

// An <input> or <textarea> bound to a model property through get/set.
function textInput(get, set, props) {
    const tag = props && props.rows ? 'textarea' : 'input'
    return h(tag, Object.assign({
        type: tag === 'input' ? 'text' : null,
        value: get(),
        onInput: e => { set(e.target.value); changed() },
    }, props))
}

function select(options, get, set, onAfter) {
    return h('select', {
        value: get(),
        onChange: e => { set(e.target.value); changed(); if (onAfter) onAfter() },
    }, options.map(o => h('option', { value: o.id }, o.label)))
}


// ---- sections

function documentSection(model) {
    const typeRadios = h('div', { class: 'type-switch', role: 'radiogroup' }, TYPES.map(t =>
        h('label', { class: 'type-option' },
            h('input', {
                type: 'radio', name: 'doc-type', value: t.id, checked: model.type === t.id,
                onChange: () => { model.type = t.id; changed(true) },
            }),
            h('span', { class: 'type-label' }, t.label),
            h('span', { class: 'type-hint' }, t.hint))))

    const isHdoc = model.type === 'hdoc'
    const dateInput = textInput(() => model.header.date, v => { model.header.date = v }, { placeholder: 'October 3, 2026' })
    const todayButton = h('button', {
        type: 'button', class: 'small',
        onClick: () => {
            dateInput.value = new Date().toLocaleDateString(model.lang || undefined, { year: 'numeric', month: 'long', day: 'numeric' })
            model.header.date = dateInput.value
            changed()
        },
    }, 'Today')

    return h('fieldset', { class: 'section' },
        h('legend', null, 'Document'),
        typeRadios,
        field('Title', textInput(() => model.header.h1, v => { model.header.h1 = v }, { required: true })),
        field('Page title', textInput(() => model.pageTitle, v => { model.pageTitle = v }, { placeholder: 'Same as the title' }),
            'The browser tab title (<title>).'),
        isHdoc ? h('div', { class: 'row' },
            field('Author', textInput(() => model.header.author, v => { model.header.author = v })),
            h('div', { class: 'field' },
                h('span', { class: 'field-label' }, 'Date'),
                h('div', { class: 'inline' }, dateInput, todayButton))) : null,
        h('div', { class: 'row' },
            field('Language', textInput(() => model.lang, v => { model.lang = v.trim() }, { placeholder: 'en', class: 'short' })),
            isHdoc ? field('Republishing policy', textInput(() => model.republishingPolicy, v => { model.republishingPolicy = v })) : null))
}

function contentSection(model) {
    if (model.type === 'hdoc') {
        return h('fieldset', { class: 'section' },
            h('legend', null, 'Content'),
            field('HTML', textInput(() => model.contentHtml, v => { model.contentHtml = v }, { rows: 18, class: 'code', spellcheck: 'false' }),
                'The body of the document, without the title. Scripts, styles and form elements are removed by the reader.'))
    }
    if (model.type === 'cdoc') {
        return h('fieldset', { class: 'section' },
            h('legend', null, 'Collage'),
            field('SVG', textInput(() => model.svg, v => { model.svg = v }, { rows: 18, class: 'code', spellcheck: 'false' }),
                'An <svg> element with width and height. Connections attach to x/y points on it.'))
    }
    return h('fieldset', { class: 'section' },
        h('legend', null, 'Main document'),
        field('URL', textInput(() => model.mainUrl, v => { model.mainUrl = v.trim() }, { type: 'url', placeholder: 'https://example.com/article.html' }),
            'The page shown on the left. Pages on other sites need a proxy (not supported yet).'),
        field('Description', textInput(() => model.description, v => { model.description = v }, { rows: 3 })))
}

function siteSection(model) {
    const site = model.site
    return h('fieldset', { class: 'section' },
        h('legend', null, 'Site'),
        field('Reader assets URL', textInput(() => site.assetsUrl, v => { site.assetsUrl = v.trim() }, { placeholder: '/rw-reader/' }),
            'Where the rw-reader/ folder is on your site.'),
        h('div', { class: 'row' },
            field('Theme', select(withCurrent(THEMES.map(t => ({ id: t, label: t })), site.theme), () => site.theme, v => { site.theme = v })),
            field('Font set', select(withCurrent(FONT_SETS, site.fontSet), () => site.fontSet, v => { site.fontSet = v }))),
        field('Comments label', textInput(() => site.commentsLabel, v => { site.commentsLabel = v }, { placeholder: 'Open in a new tab to view comments' })))
}

// Keeps a value from an opened page in the select even if this reader version doesn't know it.
function withCurrent(options, current) {
    if (!current || options.some(o => o.id === current)) return options
    return options.concat([{ id: current, label: current + ' (unknown)' }])
}

function panelsSection(model) {
    const label = 'Panels JSON'
    const error = h('span', { class: 'field-error' })
    const textarea = h('textarea', {
        rows: 14, class: 'code', spellcheck: 'false',
        value: Object.keys(model.panels).length ? JSON.stringify(model.panels, null, 2) : '',
        onInput: e => {
            const text = e.target.value.trim()
            try {
                const value = text ? JSON.parse(text) : {}
                if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Must be a JSON object')
                model.panels = value
                fieldErrors[label] = ''
            } catch (err) {
                fieldErrors[label] = err.message
            }
            error.textContent = fieldErrors[label]
            changed()
        },
    })
    return h('details', { class: 'section details' },
        h('summary', null, 'Panels'),
        h('p', { class: 'hint' }, 'The "panels" object of hdoc-data: top, post-nav, sidebar, comments, bottom.'),
        h('label', { class: 'field' }, textarea, error))
}
