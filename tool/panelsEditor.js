/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Editor for the site-wide panels of an HDOC: top, sidebar and bottom (the shapes of hdoc-data
// "panels", see reader/parsers/EmbHDOCParser.js). It changes the given panels object in place and
// leaves keys it doesn't edit (post-nav, comments, unknown ones) alone.
import { h, setChildren } from './dom.js'
import { field, iconButton, select, textInput } from './fields.js'

export const SITE_PANEL_KEYS = ['top', 'sidebar', 'bottom']

export function renderPanelsEditor(panels, notify) {
    const root = h('div', { class: 'panels-editor' })
    // A panel switched off keeps its content until the editor is rebuilt, so switching it back on
    // restores it.
    const switchedOff = {}

    function render() {
        setChildren(root,
            panelBox('top', 'Top panel', 'Site name or logo, and links, above the document.', topPanel),
            panelBox('sidebar', 'Sidebar', 'Link groups and a search box next to the document.', sidebar),
            panelBox('bottom', 'Bottom panel', 'Sections of links and a message below the document.', bottomPanel))
    }

    // For changes that add or remove controls.
    function structural() {
        notify()
        render()
    }

    function panelBox(key, title, hint, body) {
        const on = !!panels[key]
        return h('div', { class: 'panel-box' },
            h('label', { class: 'checkbox panel-toggle' },
                h('input', {
                    type: 'checkbox', checked: on,
                    onChange: e => {
                        if (e.target.checked) {
                            panels[key] = switchedOff[key] || emptyPanel(key)
                        } else {
                            switchedOff[key] = panels[key]
                            delete panels[key]
                        }
                        structural()
                    },
                }),
                ' ' + title),
            on ? body(panels[key]) : h('p', { class: 'hint' }, hint))
    }

    function topPanel(top) {
        const text = (key, sub, label, props) => field(label, textInput(
            () => (top[key] && top[key][sub]) || '',
            v => setSub(top, key, sub, sub === 'text' ? v : v.trim()),
            notify, props))
        return h('div', { class: 'panel-body' },
            h('div', { class: 'row' },
                text('site-name', 'text', 'Site name'),
                text('site-name', 'href', 'Site link', { type: 'url', placeholder: 'https://example.com/' })),
            h('div', { class: 'row' },
                text('logo', 'src', 'Logo image URL', { type: 'url', placeholder: 'Optional; shown instead of the name' }),
                text('logo', 'href', 'Logo link', { type: 'url' })),
            h('span', { class: 'field-label' }, 'Links'),
            linkList(top, 'links'))
    }

    function sidebar(panel) {
        if (!Array.isArray(panel.items)) panel.items = []
        return h('div', { class: 'panel-body' },
            field('Side', select([{ id: 'right', label: 'Right' }, { id: 'left', label: 'Left' }],
                () => panel.side || 'right', v => { panel.side = v }, notify)),
            itemCards(panel.items, item => {
                if (item.type === 'links') {
                    return [
                        field('Group title', textInput(() => item.title || '', v => setOptional(item, 'title', v), notify)),
                        linkList(item, 'items'),
                    ]
                }
                if (item.type === 'search') {
                    return [
                        field('Search URL', textInput(() => item.action || '', v => { item.action = v.trim() }, notify,
                            { type: 'url', placeholder: 'https://example.com/?s=%s' }), '%s is replaced by the search terms.'),
                        field('Placeholder', textInput(() => item.placeholder || '', v => setOptional(item, 'placeholder', v), notify)),
                    ]
                }
                return [h('p', { class: 'hint' }, (item.type === 'recent-comments' ? 'Recent comments' : 'An item of type "' + item.type + '"')
                    + ' from the opened page. Kept as it is.')]
            }, item => item.type === 'links' ? 'Link group' : item.type === 'search' ? 'Search box' : 'Other'),
            h('div', { class: 'inline-buttons' },
                h('button', { type: 'button', class: 'small', onClick: () => { panel.items.push({ type: 'links', title: '', items: [] }); structural() } }, 'Add link group'),
                h('button', { type: 'button', class: 'small', onClick: () => { panel.items.push({ type: 'search', action: '' }); structural() } }, 'Add search box')))
    }

    function bottomPanel(bottom) {
        if (!Array.isArray(bottom.sections)) bottom.sections = []
        return h('div', { class: 'panel-body' },
            itemCards(bottom.sections, section => [
                field('Section title', textInput(() => section.title || '', v => setOptional(section, 'title', v), notify)),
                linkList(section, 'links'),
            ], () => 'Section'),
            h('div', { class: 'inline-buttons' },
                h('button', { type: 'button', class: 'small', onClick: () => { bottom.sections.push({ title: '', links: [] }); structural() } }, 'Add section')),
            field('Message', textInput(() => bottom['bottom-message'] || '', v => setOptional(bottom, 'bottom-message', v), notify,
                { placeholder: '© 2026 Example' })))
    }

    // Cards for an array of items, each with move up/down and remove.
    function itemCards(items, body, title) {
        return h('div', { class: 'item-cards' }, items.map((item, i) =>
            h('div', { class: 'item-card' },
                h('div', { class: 'item-card-head' },
                    h('span', { class: 'item-card-title' }, title(item)),
                    iconButton('↑', 'Move up', () => { move(items, i, -1); structural() }, i === 0),
                    iconButton('↓', 'Move down', () => { move(items, i, 1); structural() }, i === items.length - 1),
                    iconButton('✕', 'Remove', () => { items.splice(i, 1); structural() })),
                body(item))))
    }

    // owner[key] is an array of {text, href}. Other properties of a link (target, rel) are kept.
    function linkList(owner, key) {
        const links = owner[key] || []
        return h('div', { class: 'link-list' },
            links.map((link, i) => h('div', { class: 'link-row' },
                h('input', { type: 'text', placeholder: 'Text', 'aria-label': 'Link text', value: link.text || '', onInput: e => { link.text = e.target.value; notify() } }),
                h('input', { type: 'url', placeholder: 'https://…', 'aria-label': 'Link URL', value: link.href || '', onInput: e => { link.href = e.target.value.trim(); notify() } }),
                iconButton('↑', 'Move up', () => { move(links, i, -1); structural() }, i === 0),
                iconButton('↓', 'Move down', () => { move(links, i, 1); structural() }, i === links.length - 1),
                iconButton('✕', 'Remove link', () => {
                    links.splice(i, 1)
                    if (!links.length) delete owner[key]
                    structural()
                }))),
            h('button', {
                type: 'button', class: 'small',
                onClick: () => {
                    owner[key] = links
                    links.push({ text: '', href: '' })
                    structural()
                },
            }, 'Add link'))
    }

    render()
    return root
}

function emptyPanel(key) {
    if (key === 'sidebar') return { side: 'right', items: [] }
    if (key === 'bottom') return { sections: [] }
    return {}
}

// obj[key][sub] = value, creating obj[key] as needed and removing it when it becomes empty.
function setSub(obj, key, sub, value) {
    if (value) {
        if (!obj[key]) obj[key] = {}
        obj[key][sub] = value
    } else if (obj[key]) {
        delete obj[key][sub]
        if (!Object.keys(obj[key]).length) delete obj[key]
    }
}

function setOptional(obj, key, value) {
    if (value) obj[key] = value
    else delete obj[key]
}

function move(items, index, delta) {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    items.splice(target, 0, items.splice(index, 1)[0])
}
