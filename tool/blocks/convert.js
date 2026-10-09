/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// HTML <-> blocks for the block editor. Pure (DOMParser is passed in), so it runs in Node tests too.
//
// Every block parsed from HTML keeps its original markup in `source`. Until the block is edited
// (dirty), blocksToHtml() writes that source back unchanged, so opening a document and editing one
// paragraph doesn't reformat the rest. `lead` is the whitespace that came before the block.
//
// Block shapes (attrs = the block element's attributes, as [name, value] pairs):
//   paragraph  {html, attrs}                heading {level, html, attrs}
//   quote      {html, innerP, attrs}        list    {ordered, items: [html], attrs}
//   image      {src, alt, imgAttrs, caption, figure, attrs}
//   code       {text, wrapCode, codeAttrs, attrs}
//   video      {src, attrs}                 (a YouTube <iframe>; attrs are the iframe's, src included)
//   separator  {attrs}                      html    {html}   (anything else, kept as is)

const INLINE_TAGS = ['a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'img',
    'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr']

const TEXT_TYPES = ['paragraph', 'heading', 'quote']

export function isTextBlock(block) {
    return TEXT_TYPES.indexOf(block.type) !== -1
}

export function newBlock(type, props) {
    const block = Object.assign({ type, attrs: [], lead: '\n', dirty: true, source: null }, props)
    if (type === 'paragraph' || type === 'heading' || type === 'quote') block.html = block.html || ''
    if (type === 'heading') block.level = block.level || 2
    if (type === 'list') block.items = block.items || ['']
    if (type === 'image') Object.assign(block, { src: '', alt: '', imgAttrs: [], caption: '', figure: true }, props)
    if (type === 'code') Object.assign(block, { text: '', wrapCode: true, codeAttrs: [] }, props)
    if (type === 'video') {
        Object.assign(block, { src: '', attrs: [['width', '560'], ['height', '315'], ['src', ''], ['frameborder', '0'], ['allowfullscreen', '']] }, props)
    }
    if (type === 'html') block.html = block.html || ''
    return block
}


// ---- HTML -> blocks

export function htmlToBlocks(html, DOMParserImpl) {
    const doc = new DOMParserImpl().parseFromString('<!DOCTYPE html><html><head></head><body>' + html + '</body></html>', 'text/html')
    const blocks = []
    let lead = ''
    let run = [] // loose top-level inline nodes, collected into one paragraph

    const flushRun = () => {
        if (!run.length) return
        // Whitespace at the end of the run belongs before the next block.
        let trailing = ''
        while (run.length && isWhitespaceText(run[run.length - 1])) trailing = run.pop().data + trailing
        const elements = run.filter(n => n.nodeType === 1)
        const source = run.map(n => nodeHtml(doc, n)).join('')
        const block = elements.length === 1 && run.length === 1 && elements[0].tagName.toLowerCase() === 'img'
            ? imageFromImg(elements[0], null)
            : { type: 'paragraph', html: source.trim(), attrs: [] }
        block.source = source
        block.lead = lead
        block.dirty = false
        blocks.push(block)
        lead = trailing
        run = []
    }

    for (const node of Array.prototype.slice.call(doc.body.childNodes)) {
        if (node.nodeType === 3) {
            if (isWhitespaceText(node) && !run.length) lead += node.data
            else run.push(node)
            continue
        }
        if (node.nodeType === 1 && INLINE_TAGS.indexOf(node.tagName.toLowerCase()) !== -1) {
            run.push(node)
            continue
        }
        flushRun()
        const block = node.nodeType === 1 ? elementToBlock(node) : { type: 'html', html: nodeHtml(doc, node) }
        block.source = nodeHtml(doc, node)
        if (block.type === 'html') block.html = block.source
        block.lead = lead
        block.dirty = false
        blocks.push(block)
        lead = ''
    }
    flushRun()
    return blocks
}

function elementToBlock(el) {
    const tag = el.tagName.toLowerCase()
    const attrs = attributes(el)

    if (tag === 'p' && isInlineOnly(el)) return { type: 'paragraph', html: el.innerHTML, attrs }
    if (/^h[2-6]$/.test(tag) && isInlineOnly(el)) return { type: 'heading', level: Number(tag[1]), html: el.innerHTML, attrs }

    if (tag === 'blockquote') {
        if (isInlineOnly(el)) return { type: 'quote', html: el.innerHTML, innerP: false, attrs }
        const only = onlyChildElement(el)
        if (only && only.tagName.toLowerCase() === 'p' && !only.attributes.length && isInlineOnly(only)) {
            return { type: 'quote', html: only.innerHTML, innerP: true, attrs }
        }
    }

    if (tag === 'ul' || tag === 'ol') {
        const items = []
        let ok = true
        for (const child of el.childNodes) {
            if (isWhitespaceText(child)) continue
            if (child.nodeType !== 1 || child.tagName.toLowerCase() !== 'li' || child.attributes.length || !isInlineOnly(child)) {
                ok = false
                break
            }
            items.push(child.innerHTML)
        }
        if (ok && items.length) return { type: 'list', ordered: tag === 'ol', items, attrs }
    }

    if (tag === 'figure') {
        const children = Array.prototype.filter.call(el.childNodes, n => !isWhitespaceText(n))
        const img = children[0]
        const caption = children[1]
        const imgOk = img && img.nodeType === 1 && img.tagName.toLowerCase() === 'img'
        const captionOk = !caption || (caption.nodeType === 1 && caption.tagName.toLowerCase() === 'figcaption'
            && !caption.attributes.length && isInlineOnly(caption))
        if (imgOk && captionOk && children.length <= 2) {
            const block = imageFromImg(img, caption ? caption.innerHTML : '')
            block.attrs = attrs
            return block
        }
    }

    if (tag === 'pre') {
        const children = Array.prototype.slice.call(el.childNodes)
        if (children.every(n => n.nodeType === 3)) {
            return { type: 'code', text: el.textContent, wrapCode: false, codeAttrs: [], attrs }
        }
        const code = children.length === 1 ? children[0] : null
        if (code && code.nodeType === 1 && code.tagName.toLowerCase() === 'code'
            && Array.prototype.every.call(code.childNodes, n => n.nodeType === 3)) {
            return { type: 'code', text: code.textContent, wrapCode: true, codeAttrs: attributes(code), attrs }
        }
    }

    if (tag === 'hr') return { type: 'separator', attrs }

    if (tag === 'iframe' && !el.childNodes.length && isYoutubeEmbed(el.getAttribute('src'))) {
        return { type: 'video', src: el.getAttribute('src'), attrs }
    }

    return { type: 'html', html: '' }
}

function imageFromImg(img, caption) {
    return {
        type: 'image',
        src: img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
        imgAttrs: attributes(img).filter(a => a[0] !== 'src' && a[0] !== 'alt'),
        caption: caption || '',
        figure: caption !== null,
        attrs: [],
    }
}

function isInlineOnly(el) {
    for (const node of el.childNodes) {
        if (node.nodeType === 3) continue
        if (node.nodeType !== 1) return false
        if (INLINE_TAGS.indexOf(node.tagName.toLowerCase()) === -1) return false
        if (!isInlineOnly(node)) return false
    }
    return true
}

function onlyChildElement(el) {
    let found = null
    for (const node of el.childNodes) {
        if (isWhitespaceText(node)) continue
        if (node.nodeType !== 1 || found) return null
        found = node
    }
    return found
}

function isWhitespaceText(node) {
    return node.nodeType === 3 && !/\S/.test(node.data)
}

function attributes(el) {
    return Array.prototype.map.call(el.attributes, a => [a.name, a.value])
}

// Serializes any node (element, text, comment) as HTML.
function nodeHtml(doc, node) {
    if (node.nodeType === 1) return node.outerHTML
    const holder = doc.createElement('div')
    holder.appendChild(node.cloneNode(true))
    return holder.innerHTML
}


// ---- blocks -> HTML

export function blocksToHtml(blocks) {
    let html = ''
    let first = true
    for (const block of blocks) {
        const blockHtml = blockToHtml(block)
        if (!blockHtml) continue
        if (!first) html += block.lead != null ? block.lead : '\n'
        html += blockHtml
        first = false
    }
    return html
}

export function blockToHtml(b) {
    if (!b.dirty && b.source != null) return b.source
    const a = attrsHtml(b.attrs)
    switch (b.type) {
        case 'paragraph':
            return isEmptyInline(b.html) ? '' : `<p${a}>${b.html}</p>`
        case 'heading':
            return isEmptyInline(b.html) ? '' : `<h${b.level}${a}>${b.html}</h${b.level}>`
        case 'quote':
            if (isEmptyInline(b.html)) return ''
            return b.innerP ? `<blockquote${a}><p>${b.html}</p></blockquote>` : `<blockquote${a}>${b.html}</blockquote>`
        case 'list': {
            const items = b.items.filter(i => !isEmptyInline(i))
            if (!items.length) return ''
            const tag = b.ordered ? 'ol' : 'ul'
            return `<${tag}${a}>${items.map(i => `<li>${i}</li>`).join('')}</${tag}>`
        }
        case 'image': {
            if (!b.src) return ''
            const img = `<img src="${escapeAttr(b.src)}" alt="${escapeAttr(b.alt)}"${attrsHtml(b.imgAttrs)}>`
            if (!b.figure) return img
            const caption = isEmptyInline(b.caption) ? '' : `<figcaption>${b.caption}</figcaption>`
            return `<figure${a}>${img}${caption}</figure>`
        }
        case 'code': {
            if (!b.text) return ''
            const text = escapeText(b.text)
            return b.wrapCode ? `<pre${a}><code${attrsHtml(b.codeAttrs)}>${text}</code></pre>` : `<pre${a}>${text}</pre>`
        }
        case 'separator':
            return `<hr${a}>`
        case 'video': {
            if (!b.src) return ''
            const attrs = b.attrs.some(x => x[0] === 'src') ? b.attrs : b.attrs.concat([['src', '']])
            const iframeAttrs = attrs.map(x => {
                const value = x[0] === 'src' ? b.src : x[1]
                return value === '' ? ' ' + x[0] : ` ${x[0]}="${escapeAttr(value)}"`
            }).join('')
            return `<iframe${iframeAttrs}></iframe>`
        }
        default:
            return b.html.trim()
    }
}

function isEmptyInline(html) {
    return !html || !html.replace(/<br\s*\/?>|&nbsp;|\s/gi, '')
}

function attrsHtml(attrs) {
    return (attrs || []).map(a => ` ${a[0]}="${escapeAttr(a[1])}"`).join('')
}

export function escapeText(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;')
}

function escapeAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/ /g, '&nbsp;')
}


// ---- YouTube links

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

function isYoutubeEmbed(src) {
    return /^(https?:)?\/\/(www\.)?youtube(-nocookie)?\.com\/embed\/[A-Za-z0-9_-]{11}([?#]|$)/.test(src || '')
}

// Any YouTube link (watch?v=, youtu.be/, shorts/, live/, embed/, or a bare video id) as an embed URL,
// with its start time (t= or start=) kept. null when it isn't one.
export function youtubeEmbedUrl(link) {
    const text = String(link || '').trim()
    if (YOUTUBE_ID.test(text)) return 'https://www.youtube.com/embed/' + text
    let url
    try {
        url = new URL(/^\/\//.test(text) ? 'https:' + text : /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text)
    } catch (e) {
        return null
    }
    const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '')
    const path = url.pathname.split('/').filter(Boolean)
    let id = null
    let nocookie = false
    if (host === 'youtu.be') id = path[0]
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        nocookie = host === 'youtube-nocookie.com'
        if (path[0] === 'watch') id = url.searchParams.get('v')
        else if (['embed', 'shorts', 'live', 'v'].indexOf(path[0]) !== -1) id = path[1]
    }
    if (!id || !YOUTUBE_ID.test(id)) return null
    const start = seconds(url.searchParams.get('start') || url.searchParams.get('t') || (url.hash.match(/^#t=(.+)$/) || [])[1])
    return 'https://www.youtube' + (nocookie ? '-nocookie' : '') + '.com/embed/' + id + (start ? '?start=' + start : '')
}

// The video id of a YouTube embed URL, e.g. for its thumbnail.
export function youtubeId(embedUrl) {
    const match = /\/embed\/([A-Za-z0-9_-]{11})/.exec(embedUrl || '')
    return match ? match[1] : null
}

// "90", "90s", "1m30s", "1h2m3s" -> seconds.
function seconds(value) {
    if (!value) return 0
    if (/^\d+$/.test(value)) return Number(value)
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
    if (!match) return 0
    return (Number(match[1]) || 0) * 3600 + (Number(match[2]) || 0) * 60 + (Number(match[3]) || 0)
}
