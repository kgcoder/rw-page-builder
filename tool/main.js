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
import { showFlinkStatuses } from './connections.js'
import { copyHtml, openFile, openUrl, saveFile } from './files.js'
import { getFieldErrors, renderForm } from './form.js'
import { initPreview, schedulePreview, showPreview } from './preview.js'
import { getFileName, getModel, isDirty, markDirty, onChange, setModel } from './state.js'
import { validate } from './validate.js'
import { h } from './dom.js'

const $ = id => document.getElementById(id)

document.addEventListener('DOMContentLoaded', () => {
    const form = $('doc-form')
    const autoRefresh = $('auto-refresh')
    let problems = { errors: [], warnings: [] }
    let notice = '' // shown with the problems until another document is opened

    initPreview($('preview-holder'))
    // For computing the document's text: a document that doesn't load images or run anything.
    const inertDoc = document.implementation.createHTMLDocument('')

    function update(kind) {
        // Before the form is built, so it shows the updated flinks.
        const flinkResults = reanchorFlinks(getModel(), inertDoc)
        const moved = countStatus(flinkResults, 'moved')
        if (kind === 'replace') {
            renderForm(form)
            notice = ''
            if (moved) {
                // The page was saved before its content changed; its flinks are fixed now.
                markDirty()
                notice = 'Updated ' + plural(moved, 'flink') + ' whose text had moved in this page. Save to keep the change.'
            }
        }
        showFlinkStatuses(flinkResults)
        problems = validate(getModel(), getFieldErrors(), flinkResults)
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
        const model = createModel('hdoc')
        model.site = Object.assign({}, getModel().site)
        setModel(model)
        status('New document')
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

    update('replace')
})

function report(promise, name) {
    promise.then(() => status('Opened ' + name), err => status("Couldn't open " + name + ': ' + err.message, true))
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
    list.replaceChildren(
        ...problems.errors.map(text => h('li', { class: 'error' }, text)),
        ...problems.warnings.map(text => h('li', { class: 'warning' }, text)),
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
