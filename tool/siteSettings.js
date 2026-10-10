/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Site settings: what's the same on every page of a site (reader assets URL, theme, font set, comments
// label, default language, code added to <head>, and the top, sidebar and bottom panels). They're kept in this browser's
// localStorage, can be exported and imported as rw-site.json, and are loaded from an rw-site.json next
// to the tool when it runs on the site.
//
// A document either uses the site settings (model.useSite: they're copied into it whenever they change)
// or keeps its own (an opened page whose settings differ, or one the user customized).
import { SITE_PANEL_KEYS } from './panelsEditor.js'

const STORAGE_KEY = 'rw-page-builder.site'
export const SITE_FILE_NAME = 'rw-site.json'

let site = defaultSite()
// rw-site.json from the server when it differs from this browser's settings (offered, not applied).
let serverSite = null
const listeners = []

function defaultSite() {
    return { assetsUrl: '/rw-reader/', theme: 'light', fontSet: 'default', commentsLabel: '', proxyUrl: '', lang: 'en', headCode: '', panels: {} }
}

export function getSite() {
    return site
}

export function getServerSite() {
    return serverSite
}

// fn(): called after the site settings change (edited, imported or loaded).
export function onSiteChange(fn) {
    listeners.push(fn)
}

// After an edit in the site settings form (which changes getSite() in place).
export function siteEdited() {
    save()
    listeners.forEach(fn => fn())
}

function replaceSite(newSite) {
    site = newSite
    siteEdited()
}

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(site))
    } catch (e) {
        // Storage can be unavailable (private mode, blocked); the settings then last for this visit.
    }
}

// Loads the settings saved in this browser (synchronously), then looks for rw-site.json next to the
// tool; the returned promise settles when that's done.
export function initSite() {
    let stored = null
    try {
        const text = localStorage.getItem(STORAGE_KEY)
        if (text) stored = normalizeSite(JSON.parse(text))
    } catch (e) {
        stored = null
    }
    if (stored) site = stored

    return fetch(new URL(SITE_FILE_NAME, location.href).href, { cache: 'no-store' })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
            if (!data) return
            const fromServer = normalizeSite(data)
            if (!stored) replaceSite(fromServer)
            else if (stableStringify(fromServer) !== stableStringify(site)) {
                serverSite = fromServer
                listeners.forEach(fn => fn())
            }
        })
        .catch(() => {
            // No rw-site.json (or not served over http): this browser's settings are used.
        })
}

export function useServerSite() {
    if (!serverSite) return
    const fromServer = serverSite
    serverSite = null
    replaceSite(fromServer)
}

// The contents of rw-site.json.
export function siteJson() {
    return JSON.stringify(Object.assign({ version: 1 }, site), null, 2) + '\n'
}

export function copySiteJson() {
    return navigator.clipboard.writeText(siteJson())
}

export function exportSite() {
    const blob = new Blob([siteJson()], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = SITE_FILE_NAME
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

export function importSite(file) {
    return file.text().then(text => {
        let data
        try {
            data = JSON.parse(text)
        } catch (e) {
            throw new Error('Not a JSON file')
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Not site settings')
        serverSite = null
        replaceSite(normalizeSite(data))
    })
}

// Takes the known fields from parsed JSON, with defaults for missing or wrong ones.
function normalizeSite(data) {
    const result = defaultSite()
    for (const key of ['assetsUrl', 'theme', 'fontSet', 'commentsLabel', 'proxyUrl', 'lang', 'headCode']) {
        if (typeof data[key] === 'string') result[key] = data[key]
    }
    if (data.panels && typeof data.panels === 'object' && !Array.isArray(data.panels)) {
        for (const key of SITE_PANEL_KEYS) {
            if (data.panels[key] && typeof data.panels[key] === 'object') result.panels[key] = data.panels[key]
        }
    }
    return result
}


// ---- documents and site settings

// Copies the site settings into a document (panels only for HDOC; post-nav and comments are per page).
export function applySiteToModel(model) {
    const copy = JSON.parse(JSON.stringify(site))
    model.site = { assetsUrl: copy.assetsUrl, theme: copy.theme, fontSet: copy.fontSet, commentsLabel: copy.commentsLabel, proxyUrl: copy.proxyUrl, headCode: copy.headCode }
    for (const key of SITE_PANEL_KEYS) {
        if (copy.panels[key]) model.panels[key] = copy.panels[key]
        else delete model.panels[key]
    }
}

// Whether a document's settings are the same as the site's.
export function modelMatchesSite(model) {
    const ownSite = model.site
    const same = ['theme', 'fontSet'].every(key => ownSite[key] === site[key])
        && withSlash(ownSite.assetsUrl) === withSlash(site.assetsUrl)
        && (ownSite.commentsLabel || '') === (site.commentsLabel || '')
        && (ownSite.proxyUrl || '') === (site.proxyUrl || '')
        && (ownSite.headCode || '').trim() === (site.headCode || '').trim()
    if (!same) return false
    if (model.type !== 'hdoc') return true
    return SITE_PANEL_KEYS.every(key => stableStringify(model.panels[key]) === stableStringify(site.panels[key]))
}

function withSlash(url) {
    return url && !url.endsWith('/') ? url + '/' : url
}

// JSON with sorted object keys, for comparing.
function stableStringify(value) {
    if (value === undefined) return 'undefined'
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
    }
    return JSON.stringify(value)
}
