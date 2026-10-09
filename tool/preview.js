/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Live preview: the generated page, written into preview.html in an iframe and run by the real reader.
import { generate } from '../generator/generate.js'
import { clear, h } from './dom.js'

let holder
let current = null // the visible iframe
let pending = null // an iframe that is still loading
let timer = null

export function initPreview(holderEl) {
    holder = holderEl
}

// Debounced, so typing doesn't reload the reader on every key.
export function schedulePreview(model, problems) {
    clearTimeout(timer)
    timer = setTimeout(() => showPreview(model, problems), 700)
}

export function showPreview(model, problems) {
    clearTimeout(timer)
    if (problems.errors.length) {
        showMessage('Fix the errors to see the preview.')
        return
    }

    // The preview always uses the reader next to this tool (dist/rw-reader/), whatever URL the page
    // will use on the site. The site's head code (analytics etc.) isn't run here.
    const previewModel = Object.assign({}, model, {
        site: Object.assign({}, model.site, { assetsUrl: new URL('../rw-reader/', location.href).href, headCode: '' }),
    })
    const html = generate(previewModel)

    // A fresh iframe each time: document.open() keeps the old window and its globals, and the reader
    // isn't meant to start twice in one window. The old preview stays visible until the new one loads.
    if (pending) pending.remove()
    const frame = h('iframe', { class: 'preview-frame loading', title: 'Preview', src: 'preview.html' })
    pending = frame
    frame.addEventListener('load', () => {
        const doc = frame.contentDocument
        doc.open()
        doc.write(html)
        // Browsers don't reliably fire "load" again after document.close(), so the new preview is shown
        // when the reader says it's ready (reader/readerStartUp.js dispatchReaderReady), or after a
        // timeout if the reader fails before that. The listener is added after document.open(),
        // which erases the document's earlier listeners.
        doc.addEventListener('swpReaderReady', () => reveal(frame), { once: true })
        setTimeout(() => reveal(frame), 3000)
        doc.close()
    }, { once: true })
    holder.appendChild(frame)
}

function reveal(frame) {
    if (pending !== frame) return
    pending = null
    if (current) current.remove()
    const message = holder.querySelector('.preview-message')
    if (message) message.remove()
    frame.classList.remove('loading')
    current = frame
}

function showMessage(text) {
    if (pending) pending.remove()
    pending = null
    if (current) current.remove()
    current = null
    clear(holder)
    holder.appendChild(h('p', { class: 'preview-message' }, text))
}
