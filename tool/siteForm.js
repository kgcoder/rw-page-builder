/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// The site settings view (toolbar: "Site settings").
import { h, setChildren } from './dom.js'
import { FONT_SETS, THEMES, field, headCodeField, proxyUrlField, select, textInput } from './fields.js'
import { renderPanelsEditor } from './panelsEditor.js'
import { SITE_FILE_NAME, copySiteJson, exportSite, getServerSite, getSite, importSite, siteEdited, useServerSite } from './siteSettings.js'

// onStatus(text, isError): reports the result of an import in the toolbar.
// onClose(): goes back to the document.
export function renderSiteForm(container, onStatus, onClose) {
    const site = getSite()
    const notify = siteEdited

    const fileInput = h('input', {
        type: 'file', accept: '.json,application/json', hidden: true,
        onChange: () => {
            const file = fileInput.files[0]
            fileInput.value = ''
            if (!file) return
            importSite(file).then(
                () => onStatus('Imported ' + file.name),
                err => onStatus("Couldn't import " + file.name + ': ' + err.message, true))
        },
    })

    const serverSite = getServerSite()
    const serverNotice = serverSite ? h('div', { class: 'notice' },
        h('span', null, 'The ' + SITE_FILE_NAME + ' on this site differs from the settings saved in this browser.'),
        h('button', { type: 'button', class: 'small', onClick: useServerSite }, 'Use ' + SITE_FILE_NAME)) : null

    setChildren(container,
        h('div', { class: 'view-head' },
            h('div', { class: 'view-title' },
                h('h2', null, 'Site settings'),
                h('button', { type: 'button', class: 'small', onClick: onClose }, '← Back to document')),
            h('p', { class: 'hint' }, 'Used by new documents, and by every document that uses the site settings. '
                + 'Saved in this browser. To load them automatically on your site, copy or export them and save them as '
                + SITE_FILE_NAME + ' in the rw-tool/ folder there.'),
            h('div', { class: 'inline-buttons' },
                h('button', {
                    type: 'button', class: 'small',
                    title: 'Paste it into a new ' + SITE_FILE_NAME + ' file in the rw-tool/ folder on your site',
                    onClick: () => copySiteJson().then(
                        () => onStatus('Copied the contents of ' + SITE_FILE_NAME),
                        err => onStatus('Copy failed: ' + err.message, true)),
                }, 'Copy ' + SITE_FILE_NAME),
                h('button', { type: 'button', class: 'small', onClick: exportSite }, 'Export ' + SITE_FILE_NAME),
                h('button', { type: 'button', class: 'small', onClick: () => fileInput.click() }, 'Import…'),
                fileInput)),
        serverNotice,
        h('fieldset', { class: 'section' },
            h('legend', null, 'Reader'),
            field('Reader assets URL', textInput(() => site.assetsUrl, v => { site.assetsUrl = v.trim() }, notify, { placeholder: '/rw-reader/' }),
                'Where the rw-reader/ folder is on your site.'),
            h('div', { class: 'row' },
                field('Theme', select(THEMES, () => site.theme, v => { site.theme = v }, notify)),
                field('Font set', select(FONT_SETS, () => site.fontSet, v => { site.fontSet = v }, notify))),
            h('div', { class: 'row' },
                field('Language of new documents', textInput(() => site.lang, v => { site.lang = v.trim() }, notify, { placeholder: 'en' })),
                field('Comments label', textInput(() => site.commentsLabel, v => { site.commentsLabel = v }, notify,
                    { placeholder: 'Open in a new tab to view comments' }))),
            proxyUrlField(() => site.proxyUrl, v => { site.proxyUrl = v }, notify)),
        h('fieldset', { class: 'section' },
            h('legend', null, 'Page code'),
            headCodeField(() => site.headCode, v => { site.headCode = v }, notify)),
        h('fieldset', { class: 'section' },
            h('legend', null, 'Panels'),
            h('p', { class: 'hint' }, 'Shown around HDOC documents.'),
            renderPanelsEditor(site.panels, notify)))
}
