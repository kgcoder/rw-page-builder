/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Problems shown above the form. Errors block saving (the page wouldn't work); warnings don't.

// Mirrors the forbidden tags in sanitizeHtml (reader/helpers.js). The tool can't import that module
// without bundling the whole reader, so keep this list in sync by hand.
const REMOVED_BY_READER = ['script', 'object', 'embed', 'link', 'style', 'meta', 'form', 'base', 'head',
    'webview', 'button', 'input', 'textarea', 'select', 'option', 'optgroup', 'label', 'fieldset', 'legend', 'datalist']

export function isAbsoluteUrl(url) {
    if (!/^https?:\/\//i.test(url)) return false
    try {
        new URL(url)
        return true
    } catch (e) {
        return false
    }
}

// fieldErrors: problems the form tracks itself (e.g. panels JSON that doesn't parse), by label.
export function validate(model, fieldErrors) {
    const errors = []
    const warnings = []

    if (!model.header.h1.trim()) errors.push('Title is required.')
    if (!model.site.assetsUrl.trim()) errors.push('Reader assets URL is required.')

    if (model.type === 'hdoc') {
        if (!model.contentHtml.trim()) warnings.push('The content is empty.')
        const removed = removedByReader(model.contentHtml)
        if (removed.length) warnings.push('The reader removes these from the content: ' + removed.join(', ') + '.')
    } else if (model.type === 'cdoc') {
        if (!/<svg[\s>]/.test(model.svg)) errors.push('The collage needs an <svg> element.')
    } else if (model.type === 'condoc') {
        if (!isAbsoluteUrl(model.mainUrl)) errors.push('Main document URL must be an absolute http(s) URL.')
    }

    model.connections.forEach((con, i) => {
        const name = 'Connection ' + (i + 1)
        if (!isAbsoluteUrl(con.url)) errors.push(name + ': the URL must be an absolute http(s) URL.')
        if (!con.flinks.length) warnings.push(name + ' has no flinks.')
    })

    for (const key of Object.keys(fieldErrors || {})) {
        if (fieldErrors[key]) errors.push(key + ': ' + fieldErrors[key])
    }

    return { errors, warnings }
}

function removedByReader(html) {
    if (!html) return []
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const found = REMOVED_BY_READER.filter(tag => doc.body.querySelector(tag)).map(tag => '<' + tag + '>')
    let hasStyle = false
    let hasHandlers = false
    for (const el of doc.body.querySelectorAll('*')) {
        for (const attr of el.attributes) {
            if (attr.name === 'style') hasStyle = true
            if (attr.name.indexOf('on') === 0 || attr.value.trim().toLowerCase().indexOf('javascript:') === 0) hasHandlers = true
        }
    }
    if (hasStyle) found.push('style attributes')
    if (hasHandlers) found.push('event handlers and javascript: links')
    return found
}
