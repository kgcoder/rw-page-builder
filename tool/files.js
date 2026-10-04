/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Opening existing pages and saving the generated one.
import { generate } from '../generator/generate.js'
import { parse } from '../generator/parse.js'
import { getFileName, getModel, markSaved, setModel } from './state.js'

// Throws with a readable message if the page isn't a Reader's Web document.
export function openHtml(html, fileName) {
    setModel(parse(html, DOMParser), fileName)
}

export function openFile(file) {
    return file.text().then(text => openHtml(text, file.name))
}

// Works for pages on this site, or on sites that allow cross-origin requests.
export function openUrl(url) {
    return fetch(url, { cache: 'no-store' })
        .then(response => {
            if (!response.ok) throw new Error('HTTP ' + response.status)
            return response.text()
        })
        .then(text => {
            const path = new URL(url, location.href).pathname
            const name = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || 'index.html'
            openHtml(text, name)
        })
}

export function saveFile() {
    const model = getModel()
    const name = getFileName() || slug(model.pageTitle || model.header.h1) + '.html'
    const blob = new Blob([generate(model)], { type: 'text/html' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    markSaved(name)
    return name
}

export function copyHtml() {
    return navigator.clipboard.writeText(generate(getModel()))
}

function slug(text) {
    const s = String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
    return s.slice(0, 80) || 'document'
}
