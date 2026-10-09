/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// parse(html) -> model. The inverse of generate(); also reads pages written by hand in the same format.
// DOMParserImpl is passed in so this works in Node (jsdom) as well as in the browser.
import { HEAD_CODE_END, HEAD_CODE_START } from './generate.js'
import { createModel } from './model.js'
import { readSource } from './sources.js'

const KNOWN_HDOC_KEYS = ['lang', 'forced', 'header', 'republishing-policy', 'panels', 'connections']

export function parse(html, DOMParserImpl) {
    const Parser = DOMParserImpl || DOMParser
    const doc = new Parser().parseFromString(html, 'text/html')

    const cdocScript = doc.getElementById('cdoc-source')
    const condocScript = doc.getElementById('condoc-source')
    const hdocScript = doc.getElementById('hdoc-data')

    let model
    if (cdocScript || condocScript) {
        const script = cdocScript || condocScript
        model = createModel(cdocScript ? 'cdoc' : 'condoc')
        let source
        try {
            source = JSON.parse(script.textContent).source
        } catch (e) {
            throw new Error('The embedded document source is not valid JSON')
        }
        readSource(model, source, Parser)
    } else if (hdocScript) {
        model = createModel('hdoc')
        readHdoc(model, doc, hdocScript)
    } else {
        throw new Error("This page doesn't contain a Reader's Web document (no hdoc-data, cdoc-source or condoc-source)")
    }

    const htmlEl = doc.documentElement
    if (model.type !== 'hdoc' || !model.lang) model.lang = htmlEl.getAttribute('lang') || ''
    const titleEl = doc.querySelector('title')
    model.pageTitle = titleEl ? titleEl.textContent : ''

    readSiteSettings(model.site, doc)
    model.site.headCode = readHeadCode(html)
    return model
}

function readHdoc(model, doc, script) {
    let data
    try {
        data = JSON.parse(script.textContent)
    } catch (e) {
        throw new Error('hdoc-data is not valid JSON')
    }

    const header = data.header || {}
    model.lang = data.lang || ''
    model.header = { h1: header.h1 || '', author: header.author || '', date: header.date || '' }
    model.republishingPolicy = data['republishing-policy'] || ''
    model.panels = data.panels || {}
    model.connections = (data.connections || []).map(con => ({
        url: con.url || '',
        title: con.title || '',
        flinks: Array.isArray(con.flinks) ? con.flinks.slice() : [],
    }))

    model.extra = {}
    for (const key of Object.keys(data)) {
        if (KNOWN_HDOC_KEYS.indexOf(key) === -1) model.extra[key] = data[key]
    }

    const contentEl = doc.querySelector('.hdoc-content')
    model.contentHtml = contentEl ? contentEl.innerHTML.trim() : ''
}

// Read from the HTML text rather than the DOM, so the code comes back exactly as it was written.
function readHeadCode(html) {
    const start = html.indexOf(HEAD_CODE_START)
    if (start === -1) return ''
    const end = html.indexOf(HEAD_CODE_END, start)
    if (end === -1) return ''
    return html.slice(start + HEAD_CODE_START.length, end).trim()
}

function readSiteSettings(site, doc) {
    const scripts = doc.querySelectorAll('script[src]')
    for (const script of scripts) {
        const src = script.getAttribute('src')
        if (!/(^|\/)rw-reader\.js$/.test(src)) continue
        site.assetsUrl = src.slice(0, src.length - 'rw-reader.js'.length)
        site.fontSet = script.getAttribute('data-font-set') || 'default'
        site.commentsLabel = script.getAttribute('data-comments-label') || ''
        break
    }

    const root = doc.getElementById('ui-root')
    const classes = root ? (root.getAttribute('class') || '').split(/\s+/) : []
    const themeClass = classes.find(c => c.indexOf('theme-') === 0)
    if (themeClass) site.theme = themeClass.slice('theme-'.length)
}
