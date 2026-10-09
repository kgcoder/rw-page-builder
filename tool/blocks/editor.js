/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// The block editor for HDOC content. It's a view of an HTML string: load(html) splits it into blocks,
// and every edit writes the whole HTML back through onHtml.
import { h } from '../dom.js'
import { blocksToHtml, blockToHtml, escapeText, htmlToBlocks, isTextBlock, newBlock, youtubeEmbedUrl, youtubeId } from './convert.js'
import { caretAtEnd, caretAtStart, cleanEditedHtml, extractAfterCaret, installFormattingToolbar, parseInert, placeCaret, richEditable, textLength } from './inline.js'

const TYPE_OPTIONS = [
    ['paragraph', 'Paragraph'],
    ['h2', 'Heading 2'],
    ['h3', 'Heading 3'],
    ['h4', 'Heading 4'],
    ['ul', 'Bulleted list'],
    ['ol', 'Numbered list'],
    ['quote', 'Quote'],
    ['image', 'Image'],
    ['video', 'YouTube video'],
    ['code', 'Code'],
    ['separator', 'Separator'],
    ['html', 'HTML'],
]

const ADD_BUTTONS = [
    ['paragraph', 'Paragraph'],
    ['h2', 'Heading'],
    ['ul', 'List'],
    ['quote', 'Quote'],
    ['image', 'Image'],
    ['video', 'Video'],
    ['code', 'Code'],
    ['separator', 'Separator'],
    ['html', 'HTML'],
]

export function createBlockEditor(onHtml) {
    installFormattingToolbar()

    let blocks = []
    let html = ''
    const list = h('div', { class: 'blocks' })
    const addBar = h('div', { class: 'block-add' },
        h('span', { class: 'hint' }, 'Add:'),
        ADD_BUTTONS.map(([key, label]) => h('button', {
            type: 'button', class: 'small',
            onClick: () => insert(blocks.length, blockForKey(key), 'start'),
        }, label)))

    function load(newHtml) {
        html = newHtml
        blocks = htmlToBlocks(newHtml, DOMParser)
        if (!blocks.length) blocks = [newBlock('paragraph')]
        render()
    }

    function commit() {
        html = blocksToHtml(blocks)
        onHtml(html)
    }

    function edited(block) {
        block.dirty = true
        block.source = null
        commit()
    }


    // ---- structure

    function insert(index, block, where) {
        blocks.splice(index, 0, block)
        commit()
        render({ index, where: where || 'start' })
    }

    function remove(index, focusWhere) {
        blocks.splice(index, 1)
        if (!blocks.length) blocks.push(newBlock('paragraph'))
        commit()
        const target = Math.max(0, index - 1)
        render(focusWhere === false ? null : { index: target, where: 'end' })
    }

    function move(index, delta) {
        const target = index + delta
        if (target < 0 || target >= blocks.length) return
        const block = blocks.splice(index, 1)[0]
        blocks.splice(target, 0, block)
        commit()
        render()
        const row = list.children[target]
        if (row) row.querySelector('.block-controls button[data-move="' + (delta < 0 ? 'up' : 'down') + '"]').focus()
    }

    function changeType(index, key) {
        let block = blocks[index]
        if (block.type === 'html' && key !== 'html') {
            const parsed = htmlToBlocks(block.html, DOMParser)
            if (parsed.length > 1) {
                // Several elements: show each as its own block instead.
                parsed[0].lead = block.lead
                blocks.splice(index, 1, ...parsed)
                commit()
                render({ index, where: 'start' })
                return
            }
            block = parsed.length && parsed[0].type !== 'html'
                ? parsed[0]
                : newBlock('paragraph', { html: escapeText(plainText(block.html)) })
        }
        const converted = convertBlock(block, key)
        converted.lead = blocks[index].lead
        blocks[index] = converted
        commit()
        render({ index, where: 'end' })
    }


    // ---- rendering

    function render(focus) {
        list.replaceChildren(...blocks.map((block, index) => row(block, index)))
        if (focus) focusBlock(focus.index, focus.where)
    }

    function focusBlock(index, where) {
        const row = list.children[index]
        if (!row) return
        const target = row.querySelector('.focus-target')
        if (!target) return
        if (target.classList.contains('rich')) placeCaret(target, where)
        else target.focus()
    }

    function row(block, index) {
        const key = typeKey(block)
        const options = TYPE_OPTIONS.some(o => o[0] === key) ? TYPE_OPTIONS : TYPE_OPTIONS.concat([[key, 'Heading ' + block.level]])
        const controls = h('div', { class: 'block-controls' },
            h('select', {
                class: 'block-type', title: 'Block type', 'aria-label': 'Block type', value: key,
                onChange: e => changeType(index, e.target.value),
            }, options.map(o => h('option', { value: o[0] }, o[1]))),
            controlButton('↑', 'Move up', () => move(index, -1), index === 0, 'up'),
            controlButton('↓', 'Move down', () => move(index, 1), index === blocks.length - 1, 'down'),
            controlButton('+', 'Add a paragraph below', () => insert(index + 1, newBlock('paragraph'), 'start')),
            controlButton('✕', 'Delete block', () => remove(index)))
        return h('div', { class: 'block block-' + block.type }, controls, body(block, index))
    }

    function controlButton(label, title, onClick, disabled, moveDir) {
        return h('button', { type: 'button', class: 'icon', title, 'aria-label': title, disabled: !!disabled, 'data-move': moveDir, onClick }, label)
    }

    function body(block, index) {
        switch (block.type) {
            case 'paragraph':
            case 'heading':
            case 'quote': {
                const className = 'focus-target text-' + block.type + (block.type === 'heading' ? ' level-' + block.level : '')
                const placeholder = block.type === 'paragraph' ? 'Write text…' : block.type === 'heading' ? 'Heading' : 'Quote'
                const el = richEditable('div', block.html, value => { block.html = value; edited(block) }, { className, placeholder })
                el.addEventListener('keydown', e => textKeys(e, index, el))
                return el
            }
            case 'list':
                return listBody(block, index)
            case 'image':
                return imageBody(block)
            case 'video':
                return videoBody(block)
            case 'code':
                return autoTextarea(block.text, value => { block.text = value; edited(block) }, 'Code')
            case 'separator':
                return h('hr', { class: 'separator' })
            default: {
                const el = autoTextarea(block.html, value => { block.html = value; edited(block) }, 'HTML')
                return h('div', { class: 'html-block' }, el,
                    h('span', { class: 'hint' }, "HTML that can't be shown as blocks. Edited as code."))
            }
        }
    }

    function listBody(block, index) {
        const tag = block.ordered ? 'ol' : 'ul'
        const itemsHtml = block.items.map(item => '<li>' + (item || '<br>') + '</li>').join('')  // made safe by richEditable
        const el = richEditable(tag, itemsHtml, () => {
            const lis = Array.prototype.filter.call(el.children, c => c.tagName === 'LI')
            block.items = lis.length ? lis.map(li => cleanEditedHtml(li.innerHTML)) : [cleanEditedHtml(el.innerHTML)]
            edited(block)
        }, { className: 'focus-target list' })
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                // Enter in an empty last item leaves the list.
                const li = currentListItem(el)
                if (li && li === el.lastElementChild && !li.textContent.trim() && !li.querySelector('img')) {
                    e.preventDefault()
                    li.remove()
                    el.dispatchEvent(new Event('input'))
                    insert(index + 1, newBlock('paragraph'), 'start')
                }
            } else {
                arrowKeys(e, index, el)
            }
        })
        return el
    }

    function imageBody(block) {
        const preview = h('img', { class: 'image-preview', alt: '', src: block.src || null })
        const caption = richEditable('div', block.caption, value => { block.caption = value; edited(block) },
            { className: 'caption', placeholder: 'Caption (optional)' })
        caption.addEventListener('keydown', e => {
            if (e.key === 'Enter') e.preventDefault()
        })
        return h('div', { class: 'image-block' },
            preview,
            h('div', { class: 'image-fields' },
                h('input', {
                    type: 'url', class: 'focus-target', placeholder: 'Image URL', value: block.src,
                    onInput: e => {
                        block.src = e.target.value.trim()
                        if (block.src) preview.setAttribute('src', block.src)
                        else preview.removeAttribute('src')
                        edited(block)
                    },
                }),
                h('input', { type: 'text', placeholder: 'Alternative text', value: block.alt, onInput: e => { block.alt = e.target.value; edited(block) } }),
                block.figure ? caption : null))
    }

    function videoBody(block) {
        const preview = h('img', { class: 'video-preview', alt: '' })
        const hint = h('span', { class: 'hint' })
        const show = (src, typed) => {
            const id = youtubeId(src)
            if (id) preview.setAttribute('src', 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg')
            else preview.removeAttribute('src')
            hint.textContent = typed && !src ? 'Not a YouTube link.' : 'A YouTube link: youtube.com/watch?v=…, youtu.be/…, a Shorts link, or an embed URL.'
            hint.classList.toggle('error', !!(typed && !src))
        }
        show(block.src, false)
        return h('div', { class: 'video-block' },
            preview,
            h('div', { class: 'image-fields' },
                h('input', {
                    type: 'url', class: 'focus-target', placeholder: 'YouTube link', value: block.src,
                    onInput: e => {
                        const typed = e.target.value.trim()
                        const src = youtubeEmbedUrl(typed)
                        show(src, !!typed)
                        if (src && src !== block.src) {
                            block.src = src
                            edited(block)
                        }
                    },
                }),
                hint))
    }

    function autoTextarea(value, onValue, placeholder) {
        const el = h('textarea', { class: 'code focus-target', spellcheck: 'false', placeholder, value })
        const fit = () => { el.rows = Math.max(2, el.value.split('\n').length) }
        fit()
        el.addEventListener('input', () => { fit(); onValue(el.value) })
        return el
    }


    // ---- keyboard

    function textKeys(e, index, el) {
        const block = blocks[index]
        if (e.isComposing) return
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault()
            document.execCommand('insertLineBreak')
        } else if (e.key === 'Enter') {
            // Split at the caret; the rest becomes a new paragraph.
            e.preventDefault()
            const after = extractAfterCaret(el)
            block.html = cleanEditedHtml(el.innerHTML)
            block.dirty = true
            block.source = null
            insert(index + 1, newBlock('paragraph', { html: after }), 'start')
        } else if (e.key === 'Backspace' && caretAtStart(el)) {
            const prev = blocks[index - 1]
            if (prev && isTextBlock(prev)) {
                // Merge into the previous text block.
                e.preventDefault()
                const prevEl = list.children[index - 1].querySelector('.focus-target')
                const offset = textLength(prevEl)
                prev.html = cleanEditedHtml(prev.html + block.html)
                prev.dirty = true
                prev.source = null
                blocks.splice(index, 1)
                commit()
                render({ index: index - 1, where: offset })
            } else if (!el.textContent.trim() && !el.querySelector('img') && blocks.length > 1) {
                e.preventDefault()
                remove(index)
            }
        } else {
            arrowKeys(e, index, el)
        }
    }

    // Up at the very start / down at the very end moves to the neighbouring block.
    function arrowKeys(e, index, el) {
        if (e.key === 'ArrowUp' && index > 0 && caretAtStart(el)) {
            e.preventDefault()
            focusBlock(index - 1, 'end')
        } else if (e.key === 'ArrowDown' && index < blocks.length - 1 && caretAtEnd(el)) {
            e.preventDefault()
            focusBlock(index + 1, 'start')
        }
    }

    return {
        element: h('div', { class: 'block-editor' }, list, addBar),
        load,
        getHtml: () => html,
    }
}


// ---- block conversions

function typeKey(block) {
    if (block.type === 'heading') return 'h' + block.level
    if (block.type === 'list') return block.ordered ? 'ol' : 'ul'
    return block.type
}

function blockForKey(key) {
    if (/^h\d$/.test(key)) return newBlock('heading', { level: Number(key[1]) })
    if (key === 'ul' || key === 'ol') return newBlock('list', { ordered: key === 'ol' })
    return newBlock(key)
}

// The block's content as inline HTML, for turning it into another type.
function inlineHtml(block) {
    switch (block.type) {
        case 'paragraph':
        case 'heading':
        case 'quote':
            return block.html
        case 'list':
            return block.items.join('<br>')
        case 'image':
            return block.caption
        case 'code':
            return escapeText(block.text).replace(/\n/g, '<br>')
        default:
            return ''
    }
}

function convertBlock(block, key) {
    const inline = inlineHtml(block)
    let converted
    if (key === 'paragraph') converted = newBlock('paragraph', { html: inline })
    else if (/^h\d$/.test(key)) converted = newBlock('heading', { level: Number(key[1]), html: inline })
    else if (key === 'ul' || key === 'ol') {
        const items = block.type === 'list' ? block.items : inline.split(/<br\s*\/?>/i)
        converted = newBlock('list', { ordered: key === 'ol', items })
    } else if (key === 'quote') converted = newBlock('quote', { html: inline, innerP: block.type === 'quote' && block.innerP })
    else if (key === 'image') converted = newBlock('image', { caption: inline })
    else if (key === 'code') converted = newBlock('code', { text: plainText(inline.replace(/<br\s*\/?>/gi, '\n')) })
    else if (key === 'separator') converted = newBlock('separator')
    else if (key === 'video') converted = newBlock('video')
    else converted = newBlock('html', { html: blockToHtml(block) })

    // A heading stays a heading (or a list a list): keep its attributes, e.g. an id used as an anchor.
    if (converted.type === block.type && block.attrs) converted.attrs = block.attrs
    return converted
}

function plainText(html) {
    return parseInert(html).textContent
}

function currentListItem(listEl) {
    const selection = window.getSelection()
    if (!selection.rangeCount) return null
    let node = selection.getRangeAt(0).startContainer
    while (node && node !== listEl) {
        if (node.nodeType === 1 && node.tagName === 'LI' && node.parentNode === listEl) return node
        node = node.parentNode
    }
    return null
}
