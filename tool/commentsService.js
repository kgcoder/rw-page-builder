/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// Comments from a commenting service, through the comments bridge
// (proxy/supabase/functions/rw-comments/). The page only stores the resulting URLs (the comments URL
// points at the bridge, "Leave a comment" at the service's form page in rw-reader/comments/), so
// the tool reads the service settings back from them.
//
// settings: {provider, bridgeUrl, account, ident, formPageUrl, title}. account is the Disqus short
// name or the Hyvor Talk website ID; ident identifies the page's thread on the service.

export const PROVIDERS = {
    disqus: {
        formPath: 'comments/disqus.html',
        accountRe: /^[a-z0-9-]+$/,
        // bridge query parameter → setting, form page query parameter → setting. The form page gets
        // the bridge URL too, to refresh the bridge's cache when a comment is posted.
        bridge: { forum: 'account', ident: 'ident' },
        form: { shortname: 'account', ident: 'ident', title: 'title', bridge: 'bridgeUrl' },
    },
    hyvor: {
        formPath: 'comments/hyvor.html',
        accountRe: /^\d+$/,
        bridge: { website: 'account', ident: 'ident' },
        form: { 'website-id': 'account', 'page-id': 'ident', bridge: 'bridgeUrl' },
    },
}

// Every parameter the bridge reads; they're replaced, any others in the bridge URL are kept.
const BRIDGE_PARAMS = ['provider', 'forum', 'website', 'ident', 'link', 'form', 'per_page', 'page', 'order', 'refresh']

function parseHttpUrl(value) {
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
    } catch (e) {
        return null
    }
}

export function isValidAccount(provider, account) {
    return !!PROVIDERS[provider] && PROVIDERS[provider].accountRe.test(account || '')
}

// Returns {url, leaveCommentUrl}, or null while a setting is missing or invalid.
export function serviceUrls(settings) {
    const provider = PROVIDERS[settings.provider]
    const bridge = parseHttpUrl(settings.bridgeUrl)
    const form = parseHttpUrl(settings.formPageUrl)
    const values = Object.assign({}, settings, { ident: (settings.ident || '').trim() })
    // Hyvor's API filters take the identifier in quotes.
    if (!provider || !bridge || !form || !values.ident || /['\\]/.test(values.ident)
        || !isValidAccount(settings.provider, settings.account)) return null

    bridge.hash = ''
    BRIDGE_PARAMS.forEach(name => bridge.searchParams.delete(name))
    values.bridgeUrl = bridge.href

    form.search = ''
    form.hash = ''
    Object.keys(provider.form).forEach(name => {
        const value = values[provider.form[name]]
        if (value) form.searchParams.set(name, value)
    })

    bridge.searchParams.set('provider', settings.provider)
    Object.keys(provider.bridge).forEach(name => bridge.searchParams.set(name, values[provider.bridge[name]]))
    bridge.searchParams.set('form', form.href)
    return { url: bridge.href, leaveCommentUrl: form.href }
}

// The settings of a comments URL made by serviceUrls(), or null for any other URL.
export function readService(url) {
    const bridge = parseHttpUrl(url)
    const name = bridge && bridge.searchParams.get('provider')
    const provider = name && Object.prototype.hasOwnProperty.call(PROVIDERS, name) ? PROVIDERS[name] : null
    if (!provider) return null

    const settings = { provider: name, bridgeUrl: '', account: '', ident: '', formPageUrl: '', title: '' }
    Object.keys(provider.bridge).forEach(param => { settings[provider.bridge[param]] = bridge.searchParams.get(param) || '' })
    const form = parseHttpUrl(bridge.searchParams.get('form') || '')
    if (form) {
        if (provider.form.title) settings.title = form.searchParams.get('title') || ''
        form.search = ''
        form.hash = ''
        settings.formPageUrl = form.href
    }
    BRIDGE_PARAMS.forEach(param => bridge.searchParams.delete(param))
    settings.bridgeUrl = bridge.href
    return settings
}

// Where the service's form page is, from the reader assets URL (absolute, or relative to the tool's
// page when the tool runs on the site). '' when that can't be known (e.g. the tool runs from a file).
export function defaultFormPageUrl(provider, assetsUrl, toolUrl) {
    if (!PROVIDERS[provider]) return ''
    const assets = assetsUrl && !assetsUrl.endsWith('/') ? assetsUrl + '/' : (assetsUrl || '')
    try {
        const url = new URL(assets + PROVIDERS[provider].formPath, toolUrl)
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
    } catch (e) {
        return ''
    }
}

// The origin of an http(s) URL, or ''.
export function originOf(url) {
    const parsed = parseHttpUrl(url)
    return parsed ? parsed.origin : ''
}

// Whether a list of origins (data-direct-origins) contains origin.
export function hasOrigin(directOrigins, origin) {
    return String(directOrigins || '').split(/[\s,]+/).some(entry => originOf(entry) === origin)
}

export function addOrigin(directOrigins, origin) {
    const current = String(directOrigins || '').trim()
    if (!origin || hasOrigin(current, origin)) return current
    return current ? current + ' ' + origin : origin
}
