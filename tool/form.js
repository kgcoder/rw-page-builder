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
import { createBlockEditor } from './blocks/editor.js'
import { markdownToHtml } from './blocks/markdown.js'
import { emptySvg } from './cdoc/collage.js'
import { createCollageEditor } from './cdoc/editor.js'
import { renderConnections } from './connections.js'
import { h } from './dom.js'
import { FONT_SETS, THEMES, field, headCodeField, select as selectControl, textInput as textControl } from './fields.js'
import { renderPanelsEditor } from './panelsEditor.js'
import { applySiteToModel, getSite } from './siteSettings.js'
import { changed, getModel } from './state.js'

const TYPES = [
    { id: 'hdoc', label: 'HDOC', hint: 'Hypertext document' },
    { id: 'cdoc', label: 'CDOC', hint: 'Collage document' },
    { id: 'condoc', label: 'CONDOC', hint: "Connections document" },
]

// "" writes no <republishing-policy> at all. A value from an opened page that isn't listed is kept
// (select() adds it as an extra option).
const REPUBLISHING_POLICIES = [
    { id: '', label: 'allow implicitly (default)' },
    { id: 'do-not-republish', label: 'do-not-republish' },
    { id: 'allow', label: 'allow' },
]

// actions.openSiteSettings(): shows the site settings view.
export function renderForm(form, actions) {
    const model = getModel()
    const isHdoc = model.type === 'hdoc'

    const sections = [
        documentSection(model),
        contentSection(model),
        h('fieldset', { class: 'section' },
            h('legend', null, 'Connections'),
            h('p', { class: 'hint' }, 'Flinks are created in the RW Reader extension. Paste them here, one per line.'),
            renderConnections(model)),
        isHdoc ? postNavSection(model) : null,
        appearanceSection(model, actions),
        isHdoc ? commentsSection(model) : null,
    ]

    form.replaceChildren(...sections.filter(Boolean))
}

// Controls bound to the document: every edit calls changed().
function textInput(get, set, props) {
    return textControl(get, set, () => changed(), props)
}

function select(options, get, set) {
    return selectControl(options, get, set, () => changed())
}


// ---- sections

function documentSection(model) {
    const typeRadios = h('div', { class: 'type-switch', role: 'radiogroup' }, TYPES.map(t =>
        h('label', { class: 'type-option' },
            h('input', {
                type: 'radio', name: 'doc-type', value: t.id, checked: model.type === t.id,
                onChange: () => {
                    model.type = t.id
                    // A new collage starts with the default frame; an opened page keeps its SVG.
                    if (t.id === 'cdoc' && !model.svg.trim()) model.svg = emptySvg()
                    changed(true)
                },
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
            isHdoc ? field('Republishing policy', select(REPUBLISHING_POLICIES, () => model.republishingPolicy, v => { model.republishingPolicy = v })) : null))
}

function contentSection(model) {
    if (model.type === 'hdoc') return hdocContentSection(model)
    if (model.type === 'cdoc') return cdocContentSection(model)
    return h('fieldset', { class: 'section' },
        h('legend', null, 'Main document'),
        field('URL', textInput(() => model.mainUrl, v => { model.mainUrl = v.trim() }, { type: 'url', placeholder: 'https://example.com/article.html' }),
            'The page shown on the left. Pages on other sites need a proxy (not supported yet).'),
        field('Description', textInput(() => model.description, v => { model.description = v }, { rows: 3 })))
}

// Two views of model.contentHtml. The block editor rewrites the HTML only when a block is edited,
// so switching tabs without editing never changes it.
function hdocContentSection(model) {
    const editor = createBlockEditor(value => { model.contentHtml = value; changed() })
    const htmlInput = textInput(() => model.contentHtml, v => { model.contentHtml = v }, { rows: 22, class: 'code', spellcheck: 'false' })
    editor.load(model.contentHtml)
    const markdownButton = h('button', {
        type: 'button', class: 'small tabs-action',
        onClick: () => openMarkdownDialog(md => {
            const result = markdownToHtml(md)
            const titleSet = result.title !== model.header.h1
            model.header.h1 = result.title
            model.contentHtml = result.html
            editor.load(model.contentHtml)
            htmlInput.value = model.contentHtml
            changed(titleSet) // structural when the title changed, so the form shows it
        }, !!(model.contentHtml.trim() || model.header.h1.trim())),
    }, 'Load from Markdown…')
    return h('fieldset', { class: 'section' },
        h('legend', null, 'Content'),
        contentTabs('rw-page-builder.content-tab', markdownButton, [
            {
                id: 'blocks', label: 'Blocks',
                pane: [editor.element,
                    h('p', { class: 'hint' }, 'Select text to format it or add a link (⌘K). Enter starts a new paragraph, Shift+Enter adds a line break.')],
                onShow: () => { if (editor.getHtml() !== model.contentHtml) editor.load(model.contentHtml) },
            },
            {
                id: 'html', label: 'HTML',
                pane: [htmlInput,
                    h('p', { class: 'hint' }, 'The body of the document, without the title. Scripts, styles and form elements are removed by the reader.')],
                onShow: () => { htmlInput.value = model.contentHtml },
            },
        ]))
}

// Two views of model.svg, like the HDOC content: the visual editor writes the SVG only when something is edited.
function cdocContentSection(model) {
    const editor = createCollageEditor(value => { model.svg = value; changed() })
    const svgInput = textInput(() => model.svg, v => { model.svg = v }, { rows: 18, class: 'code', spellcheck: 'false' })
    editor.load(model.svg)
    return h('fieldset', { class: 'section' },
        h('legend', null, 'Collage'),
        contentTabs('rw-page-builder.collage-tab', null, [
            {
                id: 'visual', label: 'Visual',
                pane: [editor.element,
                    h('p', { class: 'hint' }, 'Drag to move, drag a corner to resize. Items snap to each other and to the frame (hold Alt to turn it off). ',
                        h('a', { href: 'cdoc.html', target: '_blank' }, 'The same editor on its own page'), ' makes just the SVG, to copy.')],
                onShow: () => { if (editor.getSvg() !== model.svg) editor.load(model.svg) },
            },
            {
                id: 'svg', label: 'SVG',
                pane: [svgInput,
                    h('p', { class: 'hint' }, 'An <svg> element with width and height. Connections attach to x/y points on it.')],
                onShow: () => { svgInput.value = model.svg },
            },
        ]))
}

// Markdown to replace the HDOC content with, pasted or opened from a file. onLoad(markdown) is called
// once it's confirmed.
function openMarkdownDialog(onLoad, hasContent) {
    const input = h('textarea', { class: 'code', rows: 18, spellcheck: 'false', placeholder: '# Title\n\nSome *text*…' })
    const fileInput = h('input', {
        type: 'file', accept: '.md,.markdown,.txt,text/markdown,text/plain', hidden: true,
        onChange: () => {
            const file = fileInput.files[0]
            if (file) file.text().then(text => { input.value = text })
        },
    })
    const dialog = h('dialog', { class: 'paste-dialog' },
        h('h2', null, 'Load from Markdown'),
        h('p', { class: 'hint' }, 'Replaces the content. Headings, lists, quotes, code, links, images and tables are converted; ',
            'HTML (e.g. a video embed) is kept as is, and a YouTube link on its own line becomes a video. ',
            'The title comes from a "# Title" on the first line (none: the title is cleared).'),
        input,
        fileInput,
        h('div', { class: 'dialog-buttons' },
            h('button', { type: 'button', class: 'dialog-left', onClick: () => fileInput.click() }, 'Open file…'),
            h('button', { type: 'button', onClick: () => dialog.close() }, 'Cancel'),
            h('button', {
                type: 'button', class: 'primary',
                onClick: () => {
                    if (!input.value.trim()) return
                    if (hasContent && !confirm('Replace the current title and content?')) return
                    dialog.close()
                    onLoad(input.value)
                },
            }, 'Load')))
    dialog.addEventListener('close', () => dialog.remove())
    document.body.appendChild(dialog)
    dialog.showModal()
    input.focus()
}

// Tabs over panes: [{id, label, pane, onShow}], with an optional extra element at the end of the tab bar.
// The last tab shown is remembered under storageKey.
function contentTabs(storageKey, extra, tabs) {
    const buttons = {}
    const panes = {}
    const bar = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(t => {
        buttons[t.id] = h('button', { type: 'button', role: 'tab', class: 'tab', onClick: () => show(t.id) }, t.label)
        return buttons[t.id]
    }), extra)
    tabs.forEach(t => { panes[t.id] = h('div', { class: 'tab-pane' }, t.pane) })

    function show(id) {
        tabs.forEach(t => {
            if (t.id === id) t.onShow()
            panes[t.id].hidden = t.id !== id
            buttons[t.id].setAttribute('aria-selected', String(t.id === id))
        })
        try {
            localStorage.setItem(storageKey, id)
        } catch (e) {
            // Only a convenience.
        }
    }

    let initial = tabs[0].id
    try {
        const stored = localStorage.getItem(storageKey)
        if (tabs.some(t => t.id === stored)) initial = stored
    } catch (e) {
        // Storage may be unavailable.
    }
    show(initial)
    return [bar].concat(tabs.map(t => panes[t.id]))
}

function postNavSection(model) {
    const link = (key, label) => {
        const get = sub => {
            const postNav = model.panels['post-nav']
            return postNav && postNav[key] ? postNav[key][sub] || '' : ''
        }
        const set = (sub, value) => {
            const postNav = model.panels['post-nav'] || {}
            const target = postNav[key] || {}
            if (value) target[sub] = value
            else delete target[sub]
            if (Object.keys(target).length) postNav[key] = target
            else delete postNav[key]
            if (Object.keys(postNav).length) model.panels['post-nav'] = postNav
            else delete model.panels['post-nav']
        }
        return h('div', { class: 'row' },
            field(label + ' title', textInput(() => get('title'), v => set('title', v))),
            field(label + ' URL', textInput(() => get('href'), v => set('href', v.trim()), { type: 'url' })))
    }
    return h('fieldset', { class: 'section' },
        h('legend', null, 'Previous / next'),
        h('p', { class: 'hint' }, 'Links to the previous and next documents, shown below this one.'),
        link('prev', 'Previous'),
        link('next', 'Next'))
}

// Theme, assets and panels: either the site settings or this page's own.
function appearanceSection(model, actions) {
    const site = model.site
    const legend = h('legend', null, 'Appearance and panels')

    if (model.useSite) {
        const siteSettings = getSite()
        const panels = ['top', 'sidebar', 'bottom'].filter(key => siteSettings.panels[key])
        const summary = 'Theme ' + site.theme + ', font set ' + site.fontSet + ', reader at ' + site.assetsUrl
            + (model.type === 'hdoc' ? '; panels: ' + (panels.length ? panels.join(', ') : 'none') : '')
            + (site.headCode && site.headCode.trim() ? '; code added to <head>' : '') + '.'
        return h('fieldset', { class: 'section' }, legend,
            h('p', null, 'Uses the site settings. ', h('span', { class: 'hint' }, summary)),
            h('div', { class: 'inline-buttons' },
                h('button', { type: 'button', class: 'small', onClick: actions.openSiteSettings }, 'Edit site settings'),
                h('button', {
                    type: 'button', class: 'small', title: 'Give this page its own theme, assets URL and panels',
                    onClick: () => { model.useSite = false; changed(true) },
                }, 'Customize for this page')))
    }

    return h('fieldset', { class: 'section' }, legend,
        h('div', { class: 'notice' },
            h('span', null, 'This page has its own settings, different from the site settings.'),
            h('button', {
                type: 'button', class: 'small',
                onClick: () => {
                    applySiteToModel(model)
                    model.useSite = true
                    changed(true)
                },
            }, 'Use site settings')),
        field('Reader assets URL', textInput(() => site.assetsUrl, v => { site.assetsUrl = v.trim() }, { placeholder: '/rw-reader/' }),
            'Where the rw-reader/ folder is on your site.'),
        h('div', { class: 'row' },
            field('Theme', select(THEMES, () => site.theme, v => { site.theme = v })),
            field('Font set', select(FONT_SETS, () => site.fontSet, v => { site.fontSet = v }))),
        field('Comments label', textInput(() => site.commentsLabel, v => { site.commentsLabel = v }, { placeholder: 'Open in a new tab to view comments' })),
        headCodeField(() => site.headCode || '', v => { site.headCode = v }, () => changed()),
        model.type === 'hdoc' ? h('div', null,
            h('span', { class: 'field-label' }, 'Panels'),
            renderPanelsEditor(model.panels, () => changed())) : null)
}

const COMMENT_FIELDS = [
    ['url', 'Comments URL', 'The comments of this document (a WordPress REST API comments URL).'],
    ['title', 'Title', ''],
    ['empty', 'Message when there are no comments', ''],
    ['leave-comment-url', 'Leave a comment URL', 'Where readers write a comment.'],
    ['leave-comment-label', '"Leave a comment" label', ''],
    ['reply-label', '"Reply" label', ''],
    ['load-more-label', '"Load more" label', ''],
]

function commentsSection(model) {
    const get = key => model.panels.comments ? model.panels.comments[key] || '' : ''
    const set = (key, value) => {
        const comments = model.panels.comments || {}
        if (value) comments[key] = value
        else delete comments[key]
        if (Object.keys(comments).length) model.panels.comments = comments
        else delete model.panels.comments
    }
    return h('details', { class: 'section details', open: !!model.panels.comments },
        h('summary', null, 'Comments'),
        h('p', { class: 'hint' }, 'Shown below the document when it has a comments URL.'),
        COMMENT_FIELDS.map(([key, label, hint]) => field(label,
            textInput(() => get(key), v => set(key, key.indexOf('url') !== -1 ? v.trim() : v), key.indexOf('url') !== -1 ? { type: 'url' } : null),
            hint || null)))
}
