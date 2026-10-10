/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// The page builder: a form that generates static Reader's Web pages (see README.md).
import { reanchorFlinks } from '../generator/flinks.js'
import { createModel } from '../generator/model.js'
import { connectionsErrors, showFlinkStatuses } from './connections.js'
import { copyHtml, openFile, openUrl, saveFile } from './files.js'
import { renderForm } from './form.js'
import { initPreview, schedulePreview, showPreview } from './preview.js'
import { renderSiteForm } from './siteForm.js'
import { applySiteToModel, getServerSite, getSite, initSite, onSiteChange } from './siteSettings.js'
import { changed, getFileName, getModel, isDirty, markDirty, onChange, setModel } from './state.js'
import { validate } from './validate.js'
import { h, setChildren } from './dom.js'

const $ = id => document.getElementById(id)

document.addEventListener('DOMContentLoaded', () => {
    const form = $('doc-form')
    const autoRefresh = $('auto-refresh')
    let problems = { errors: [], warnings: [] }
    let notice = '' // shown with the problems until another document is opened

    // For computing the document's text: a document that doesn't load images or run anything.
    const inertDoc = document.implementation.createHTMLDocument('')
    const siteView = $('site-view')
    const siteButton = $('site-button')
    let renderedSite = null
    let renderedServerSite = null

    let formIsStale = false // the site settings changed while the document form was hidden

    function showSiteView(show) {
        if (!show && formIsStale) {
            formIsStale = false
            renderForm(form, actions)
            showFlinkStatuses(reanchorFlinks(getModel(), inertDoc))
        }
        siteView.hidden = !show
        form.hidden = show
        $('messages').hidden = show // they're about the document
        siteButton.textContent = show ? 'Back to document' : 'Site settings'
        siteButton.setAttribute('aria-pressed', String(show))
        if (show) renderSite()
    }

    function renderSite() {
        renderedSite = getSite()
        renderedServerSite = getServerSite()
        renderSiteForm(siteView, status, actions.closeSiteSettings)
    }

    const actions = { openSiteSettings: () => showSiteView(true), closeSiteSettings: () => showSiteView(false) }
    showDocumentView = () => showSiteView(false)

    initPreview($('preview-holder'))

    function update(kind) {
        // Before the form is built, so it shows the updated flinks.
        const flinkResults = reanchorFlinks(getModel(), inertDoc)
        const moved = countStatus(flinkResults, 'moved')
        if (kind === 'replace') {
            renderForm(form, actions)
            notice = ''
            if (moved) {
                // The page was saved before its content changed; its flinks are fixed now.
                markDirty()
                notice = 'Updated ' + plural(moved, 'flink') + ' whose text had moved in this page. Save to keep the change.'
            }
        }
        showFlinkStatuses(flinkResults)
        problems = validate(getModel(), flinkResults, connectionsErrors())
        renderMessages(problems, notice)
        $('save-button').disabled = $('copy-button').disabled = problems.errors.length > 0
        const name = getFileName()
        document.title = (isDirty() ? '• ' : '') + (name ? name + ' — ' : '') + 'RW Page Builder'
        if (kind === 'replace') showPreview(getModel(), problems)
        else if (kind === 'edit' && autoRefresh.checked) schedulePreview(getModel(), problems)
    }
    onChange(update)

    $('refresh-button').addEventListener('click', () => showPreview(getModel(), problems))

    $('new-button').addEventListener('click', () => {
        if (!confirmDiscard()) return
        setModel(newDocument())
        showSiteView(false)
        status('New document')
    })

    siteButton.addEventListener('click', () => showSiteView(siteView.hidden))

    // Site settings changed (edited, imported, or loaded from rw-site.json).
    onSiteChange(() => {
        const model = getModel()
        if (model.useSite) {
            applySiteToModel(model)
            // An ordinary edit (debounced preview); the hidden form is rebuilt when it's shown again.
            if (form.hidden) formIsStale = true
            changed(!form.hidden)
        }
        // Rebuilt only when the settings were replaced, not while they're being typed into.
        if (!siteView.hidden && (getSite() !== renderedSite || getServerSite() !== renderedServerSite)) renderSite()
    })

    const fileInput = $('file-input')
    $('open-file-button').addEventListener('click', () => {
        if (confirmDiscard()) fileInput.click()
    })
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0]
        fileInput.value = ''
        if (file) report(openFile(file), file.name)
    })


    $('open-url-button').addEventListener('click', () => {
        if (!confirmDiscard()) return
        const url = prompt('URL of the page to open:')
        if (url && url.trim()) report(openUrl(url.trim()), url.trim())
    })

    $('save-button').addEventListener('click', () => {
        const name = saveFile()
        status('Saved ' + name)
    })

    $('copy-button').addEventListener('click', () => {
        copyHtml().then(() => status('HTML copied'), err => status('Copy failed: ' + err.message, true))
    })

    setUpDropping()

    window.addEventListener('beforeunload', e => {
        if (isDirty()) {
            e.preventDefault()
            e.returnValue = ''
        }
    })

    // initSite() reads this browser's settings right away (so the first document uses them), then
    // looks for rw-site.json in the background.
    initSite()
    setModel(newDocument())
})

// A new HDOC that uses the site settings.
function newDocument() {
    const model = createModel('hdoc')
    model.lang = getSite().lang
    applySiteToModel(model)
    model.useSite = true
    return model
}

// Set up on DOMContentLoaded: shows the document view after a page was opened.
let showDocumentView = () => {}

function report(promise, name) {
    promise.then(() => {
        showDocumentView()
        status('Opened ' + name)
    }, err => status("Couldn't open " + name + ': ' + err.message, true))
}

function countStatus(flinkResults, status) {
    return flinkResults.reduce((sum, results) => sum + results.filter(r => r.status === status).length, 0)
}

function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's')
}

function confirmDiscard() {
    return !isDirty() || confirm('Discard the unsaved changes?')
}

function renderMessages(problems, notice) {
    const list = $('messages')
    setChildren(list,
        problems.errors.map(text => h('li', { class: 'error' }, text)),
        problems.warnings.map(text => h('li', { class: 'warning' }, text)),
        notice ? h('li', { class: 'info' }, notice) : null)
}

let statusTimer = null
function status(text, isError) {
    const el = $('status')
    el.textContent = text
    el.classList.toggle('error', !!isError)
    clearTimeout(statusTimer)
    statusTimer = setTimeout(() => { el.textContent = '' }, isError ? 8000 : 3000)
}

// Dropping an .html file anywhere opens it.
function setUpDropping() {
    const overlay = $('drop-overlay')
    let depth = 0
    const hasFiles = e => e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1

    window.addEventListener('dragenter', e => {
        if (!hasFiles(e)) return
        depth++
        overlay.classList.add('visible')
    })
    window.addEventListener('dragleave', e => {
        if (!hasFiles(e)) return
        depth = Math.max(0, depth - 1)
        if (!depth) overlay.classList.remove('visible')
    })
    window.addEventListener('dragover', e => {
        if (hasFiles(e)) e.preventDefault()
    })
    window.addEventListener('drop', e => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth = 0
        overlay.classList.remove('visible')
        const file = e.dataTransfer.files[0]
        if (file && confirmDiscard()) report(openFile(file), file.name)
    })
}
