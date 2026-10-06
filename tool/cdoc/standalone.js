/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// cdoc.html: the collage editor on its own. It makes the <svg> of a CDOC, to copy into a CDOC's source.
// The work in progress is kept in this browser, so a reload doesn't lose it.
import { emptySvg, parseCollage } from './collage.js'
import { createCollageEditor } from './editor.js'

const DRAFT_KEY = 'rw-page-builder.cdoc-draft'
const $ = id => document.getElementById(id)

document.addEventListener('DOMContentLoaded', () => {
    const editor = createCollageEditor(saveDraft)
    $('editor-holder').appendChild(editor.element)
    editor.load(readDraft() || emptySvg())

    $('new-button').addEventListener('click', () => {
        if (hasContent(editor.getSvg()) && !confirm('Discard the current collage?')) return
        const svg = emptySvg()
        editor.load(svg)
        saveDraft(svg)
        status('New collage')
    })

    const dialog = $('paste-dialog')
    const input = $('paste-input')
    $('paste-button').addEventListener('click', () => {
        input.value = ''
        dialog.showModal()
    })
    dialog.addEventListener('close', () => {
        if (dialog.returnValue !== 'load') return
        const svg = input.value.trim()
        if (!parseCollage(svg, DOMParser)) {
            status('Not an <svg> element with a numeric width and height', true)
            return
        }
        editor.load(svg)
        saveDraft(svg)
        status('SVG loaded')
    })

    $('copy-button').addEventListener('click', () => {
        navigator.clipboard.writeText(editor.getSvg())
            .then(() => status('SVG copied'), err => status('Copy failed: ' + err.message, true))
    })
})

function readDraft() {
    try {
        return localStorage.getItem(DRAFT_KEY)
    } catch (e) {
        return null // storage may be unavailable
    }
}

function saveDraft(svg) {
    try {
        localStorage.setItem(DRAFT_KEY, svg)
    } catch (e) {
        // Only a convenience.
    }
}

function hasContent(svg) {
    const collage = parseCollage(svg, DOMParser)
    return !!collage && (collage.items.length > 0 || !!collage.background)
}

let statusTimer = null
function status(text, isError) {
    const el = $('status')
    el.textContent = text
    el.classList.toggle('error', !!isError)
    clearTimeout(statusTimer)
    statusTimer = setTimeout(() => { el.textContent = '' }, isError ? 8000 : 3000)
}
