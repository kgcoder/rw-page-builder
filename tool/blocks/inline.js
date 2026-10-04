/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Inline editing inside text blocks: contenteditable elements, the formatting toolbar, paste
// cleaning and caret helpers.
import { escapeText } from './convert.js'

// ---- editable elements

// A contenteditable element. onHtml receives the cleaned-up HTML after every edit.
export function richEditable(tag, html, onHtml, props) {
    const el = document.createElement(tag)
    el.className = 'rich' + (props && props.className ? ' ' + props.className : '')
    el.contentEditable = 'true'
    el.spellcheck = true
    if (props && props.placeholder) el.dataset.placeholder = props.placeholder
    el.innerHTML = safeHtml(html)
    el.addEventListener('input', () => onHtml(cleanEditedHtml(el.innerHTML)))
    el.addEventListener('paste', e => {
        e.preventDefault()
        const data = e.clipboardData
        const pastedHtml = data.getData('text/html')
        const text = data.getData('text/plain')
        const insert = pastedHtml ? cleanPastedHtml(pastedHtml) : escapeText(text).replace(/\r?\n/g, '<br>')
        if (insert) document.execCommand('insertHTML', false, insert)
    })
    el.addEventListener('keydown', e => {
        const mod = e.metaKey || e.ctrlKey
        if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
            e.preventDefault()
            editLink()
        }
    })
    return el
}

// What the browser leaves behind while editing: <b>/<i>, style attributes, empty spans, <div>s
// from line breaks, <font>, and trailing <br>s.
export function cleanEditedHtml(html) {
    const holder = parseInert(html)
    const elements = Array.prototype.slice.call(holder.querySelectorAll('*')).reverse()
    for (const el of elements) {
        el.removeAttribute('style')
        const tag = el.tagName.toLowerCase()
        if (tag === 'b') rename(el, 'strong')
        else if (tag === 'i') rename(el, 'em')
        else if (tag === 'font' || (tag === 'span' && !el.attributes.length)) unwrap(el)
        else if (tag === 'div' || tag === 'p') {
            if (el.previousSibling) el.parentNode.insertBefore(el.ownerDocument.createElement('br'), el)
            unwrap(el)
        }
    }
    while (holder.lastChild && holder.lastChild.nodeName === 'BR') holder.removeChild(holder.lastChild)
    return holder.innerHTML
}

// Parses HTML without running anything (no image loads, no event handlers), unlike innerHTML on an
// element of this page. Returns the <body> that holds it.
export function parseInert(html) {
    return new DOMParser().parseFromString('<!DOCTYPE html><body>' + html, 'text/html').body
}

// Content from an opened page is shown in this page's own DOM, so it must not be able to run script
// here: event handler attributes and javascript: URLs are dropped. (The reader removes them too.)
export function safeHtml(html) {
    const body = parseInert(html)
    for (const el of body.querySelectorAll('*')) {
        for (const attr of Array.prototype.slice.call(el.attributes)) {
            if (/^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name)
        }
    }
    for (const el of body.querySelectorAll('script, iframe, object, embed')) el.remove()
    return body.innerHTML
}

const PASTE_KEEP = { strong: 'strong', b: 'strong', em: 'em', i: 'em', code: 'code', a: 'a', sub: 'sub', sup: 'sup',
    s: 's', u: 'u', mark: 'mark', kbd: 'kbd', q: 'q', small: 'small', abbr: 'abbr', cite: 'cite', del: 'del', ins: 'ins' }
const PASTE_DROP = ['script', 'style', 'meta', 'link', 'title', 'head', 'template', 'noscript', 'iframe', 'object', 'svg']
const PASTE_BLOCKS = ['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'tr', 'section',
    'article', 'header', 'footer', 'figure', 'figcaption', 'dt', 'dd', 'ul', 'ol', 'table']

// Pasted HTML becomes inline HTML: formatting and links are kept, block boundaries become <br>,
// everything else (classes, styles, scripts, layout) is dropped.
export function cleanPastedHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const out = clean(doc.body)
    return out.replace(/(<br>\s*){3,}/g, '<br><br>').replace(/^(\s|<br>)+|(\s|<br>)+$/g, '')
}

function clean(node) {
    let html = ''
    for (const child of node.childNodes) {
        if (child.nodeType === 3) {
            html += escapeText(child.data.replace(/\s+/g, ' '))
            continue
        }
        if (child.nodeType !== 1) continue
        const tag = child.tagName.toLowerCase()
        if (PASTE_DROP.indexOf(tag) !== -1) continue
        if (tag === 'br') {
            html += '<br>'
            continue
        }
        if (tag === 'img') {
            const src = child.getAttribute('src')
            if (src && !/^\s*(data|javascript):/i.test(src)) html += `<img src="${escapeAttr(src)}" alt="${escapeAttr(child.getAttribute('alt') || '')}">`
            continue
        }
        const inner = clean(child)
        const keep = PASTE_KEEP[tag]
        if (keep === 'a') {
            const href = child.getAttribute('href')
            html += href && !/^\s*javascript:/i.test(href) ? `<a href="${escapeAttr(href)}">${inner}</a>` : inner
        } else if (keep) {
            html += inner.trim() ? `<${keep}>${inner}</${keep}>` : inner
        } else if (PASTE_BLOCKS.indexOf(tag) !== -1) {
            html += inner + '<br>'
        } else {
            html += inner
        }
    }
    return html
}

function escapeAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function rename(el, tag) {
    const replacement = el.ownerDocument.createElement(tag)
    for (const attr of Array.prototype.slice.call(el.attributes)) replacement.setAttribute(attr.name, attr.value)
    while (el.firstChild) replacement.appendChild(el.firstChild)
    el.parentNode.replaceChild(replacement, el)
    return replacement
}

function unwrap(el) {
    const parent = el.parentNode
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
}


// ---- formatting toolbar

let toolbar = null

// One floating toolbar for all text blocks, shown over a non-empty selection.
export function installFormattingToolbar() {
    if (toolbar) return
    toolbar = document.createElement('div')
    toolbar.className = 'format-toolbar'
    const buttons = [
        ['B', 'Bold (⌘B)', () => document.execCommand('bold'), 'bold'],
        ['I', 'Italic (⌘I)', () => document.execCommand('italic'), 'italic'],
        ['</>', 'Code', toggleCode, 'code'],
        ['Link', 'Link (⌘K)', editLink, ''],
        ['Unlink', 'Remove link', () => document.execCommand('unlink'), ''],
    ]
    for (const [label, title, action, className] of buttons) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = label
        button.title = title
        if (className) button.classList.add(className)
        // mousedown would move the focus out of the editable and lose the selection.
        button.addEventListener('mousedown', e => e.preventDefault())
        button.addEventListener('click', () => {
            action()
            positionToolbar()
        })
        toolbar.appendChild(button)
    }
    document.body.appendChild(toolbar)
    document.addEventListener('selectionchange', positionToolbar)
    window.addEventListener('resize', positionToolbar)
    document.addEventListener('scroll', positionToolbar, true)
}

function positionToolbar() {
    const editable = currentEditable()
    const selection = window.getSelection()
    if (!editable || selection.isCollapsed) {
        toolbar.classList.remove('visible')
        return
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    toolbar.classList.add('visible')
    const top = rect.top - toolbar.offsetHeight - 6
    toolbar.style.top = Math.max(4, top < 4 ? rect.bottom + 6 : top) + 'px'
    toolbar.style.left = Math.max(4, Math.min(window.innerWidth - toolbar.offsetWidth - 4, rect.left)) + 'px'
}

function currentEditable() {
    const selection = window.getSelection()
    if (!selection.rangeCount) return null
    const node = selection.getRangeAt(0).commonAncestorContainer
    const el = node.nodeType === 1 ? node : node.parentElement
    return el ? el.closest('.rich') : null
}

function toggleCode() {
    const editable = currentEditable()
    if (!editable) return
    const selection = window.getSelection()
    const range = selection.getRangeAt(0)
    const startEl = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
    const existing = startEl.closest('code')
    if (existing && editable.contains(existing)) {
        unwrap(existing)
    } else {
        const code = document.createElement('code')
        code.appendChild(range.extractContents())
        range.insertNode(code)
        selection.selectAllChildren(code)
    }
    editable.dispatchEvent(new Event('input', { bubbles: true }))
}

function editLink() {
    const editable = currentEditable()
    if (!editable) return
    const selection = window.getSelection()
    const node = selection.anchorNode
    const el = node && (node.nodeType === 1 ? node : node.parentElement)
    const existing = el ? el.closest('a') : null
    const url = prompt('Link URL:', existing ? existing.getAttribute('href') : 'https://')
    if (url === null) return
    if (!url.trim()) {
        document.execCommand('unlink')
    } else if (selection.isCollapsed && existing) {
        existing.setAttribute('href', url.trim())
        editable.dispatchEvent(new Event('input', { bubbles: true }))
    } else if (!selection.isCollapsed) {
        document.execCommand('createLink', false, url.trim())
    }
}


// ---- caret

export function caretAtStart(el) {
    const range = caretRange(el)
    if (!range) return false
    const before = document.createRange()
    before.selectNodeContents(el)
    before.setEnd(range.startContainer, range.startOffset)
    return !hasContent(before)
}

export function caretAtEnd(el) {
    const range = caretRange(el)
    if (!range) return false
    const after = document.createRange()
    after.selectNodeContents(el)
    after.setStart(range.endContainer, range.endOffset)
    return !hasContent(after)
}

function hasContent(range) {
    if (range.toString().length) return true
    const fragment = range.cloneContents()
    return !!fragment.querySelector && !!fragment.querySelector('img')
}

function caretRange(el) {
    const selection = window.getSelection()
    if (!selection.rangeCount || !selection.isCollapsed) return null
    const range = selection.getRangeAt(0)
    return el.contains(range.startContainer) ? range : null
}

// Moves the content after the caret out of el and returns it as HTML.
export function extractAfterCaret(el) {
    const range = caretRange(el)
    if (!range) return ''
    const after = document.createRange()
    after.selectNodeContents(el)
    after.setStart(range.startContainer, range.startOffset)
    const holder = document.createElement('div')
    holder.appendChild(after.extractContents())
    return cleanEditedHtml(holder.innerHTML)
}

// Puts the caret at a text offset in el ('start', 'end' or a number of characters).
export function placeCaret(el, where) {
    el.focus()
    const selection = window.getSelection()
    const range = document.createRange()
    if (where === 'start' || where === 'end' || typeof where !== 'number') {
        range.selectNodeContents(el)
        range.collapse(where === 'start')
    } else {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        let left = where
        let node
        let placed = false
        while ((node = walker.nextNode())) {
            if (left <= node.data.length) {
                range.setStart(node, left)
                placed = true
                break
            }
            left -= node.data.length
        }
        if (!placed) range.selectNodeContents(el)
        range.collapse(placed)
    }
    selection.removeAllRanges()
    selection.addRange(range)
}

export function textLength(el) {
    return el.textContent.length
}
