/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// The visual CDOC editor: a frame with images and texts that are moved and resized with the mouse
// and snap to each other and to the frame. createCollageEditor(onSvg) → { element, load(svg), getSvg() };
// onSvg(svg) is called after every edit (once per drag, on release).
//
// The stage draws items the way the reader does: everything through the reader's SVG sanitizer, and
// images on top of the rest (the reader draws them over the rasterized SVG).
import DOMPurify from '../../reader/dompurify/purify.es.mjs'
import { h } from '../dom.js'
import { backgroundXml, createCollage, DEFAULT_HEIGHT, DEFAULT_WIDTH, generatedXml, newImage, newText, parseCollage,
    SANITIZE_CONFIG, serializeCollage } from './collage.js'
import { renderInspector } from './inspector.js'
import { findGuides, snapMove, snapResize } from './snap.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const SNAP_PX = 6 // snapping distance, in screen pixels
const HANDLE_PX = 8
const PAD = 24 // the pasteboard around the frame; matches .cdoc-canvas padding
const HISTORY_LIMIT = 100
const COALESCE_MS = 1500
const CORNERS = ['nw', 'ne', 'sw', 'se']

let clipCounter = 0

function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag)
    if (attrs) for (const key of Object.keys(attrs)) el.setAttribute(key, attrs[key])
    return el
}

// markup (one or more SVG elements) through the reader's sanitizer, appended to parent.
function appendSanitized(parent, markup) {
    const wrapped = '<svg xmlns="' + SVG_NS + '" xmlns:xlink="' + XLINK_NS + '">' + markup + '</svg>'
    // As a string, parsed by this document: DOMPurify builds DOM results in its own inert XML document,
    // and an <image> taken from there (moved or imported) may never load.
    const holder = document.createElementNS(SVG_NS, 'g')
    holder.innerHTML = DOMPurify.sanitize(wrapped, SANITIZE_CONFIG)
    const root = holder.firstElementChild
    if (!root) return
    while (root.firstChild) parent.appendChild(root.firstChild)
}

const isImage = item => item.kind === 'image'
const isEditable = item => item.kind === 'image' || item.kind === 'text'

export function createCollageEditor(onSvg) {
    let collage = null
    let current = '' // the SVG as loaded or last emitted
    let selected = -1
    let zoom = 1
    let fitMode = true
    let undoStack = []
    let redoStack = []
    let lastKey = null
    let lastTime = 0
    let groups = [] // item index → its <g> on the stage
    let drag = null

    // ---- DOM

    const clipId = 'cdoc-clip-' + (++clipCounter)
    const clipRect = svgEl('rect', { x: 0, y: 0 })
    const clipPath = svgEl('clipPath', { id: clipId })
    clipPath.appendChild(clipRect)
    const defs = svgEl('defs')
    defs.appendChild(clipPath)
    // Like the reader, nothing outside the frame is visible.
    const contentG = svgEl('g', { class: 'cdoc-content', 'clip-path': 'url(#' + clipId + ')' })
    const overlayG = svgEl('g', { class: 'cdoc-overlay' })
    const svg = svgEl('svg', { class: 'cdoc-svg' })
    svg.appendChild(defs)
    svg.appendChild(contentG)
    svg.appendChild(overlayG)
    const canvas = h('div', { class: 'cdoc-canvas' })
    canvas.appendChild(svg)
    const stage = h('div', { class: 'cdoc-stage', tabindex: '0', 'aria-label': 'Collage' }, canvas)

    const button = (label, title, onClick) => h('button', { type: 'button', class: 'small', title, onClick }, label)
    const buttons = {
        image: button('Add image…', 'Add an image by URL', addImage),
        text: button('Add text', 'Add a text', addText),
        forward: button('Forward', 'Bring forward (images always stay above texts)', () => reorder(1)),
        backward: button('Back', 'Send backward', () => reorder(-1)),
        remove: button('Delete', 'Delete (Delete key)', removeSelected),
        undo: button('Undo', 'Undo (⌘Z)', undo),
        redo: button('Redo', 'Redo (⇧⌘Z)', redo),
        frame: button('Frame', 'Frame size and background', () => select(-1)),
    }
    const zoomLabel = h('span', { class: 'cdoc-zoom' })
    const toolbar = h('div', { class: 'cdoc-toolbar' },
        buttons.image, buttons.text,
        h('span', { class: 'toolbar-separator' }),
        buttons.forward, buttons.backward, buttons.remove,
        h('span', { class: 'toolbar-separator' }),
        buttons.undo, buttons.redo,
        h('span', { class: 'toolbar-separator' }),
        buttons.frame,
        h('span', { class: 'cdoc-toolbar-spacer' }),
        button('−', 'Zoom out', () => setZoom(zoom / 1.25)),
        zoomLabel,
        button('+', 'Zoom in', () => setZoom(zoom * 1.25)),
        button('Fit', 'Fit the frame in the view', () => { fitMode = true; fit() }),
        button('100%', 'Actual size', () => setZoom(1)))

    const inspector = h('div', { class: 'cdoc-inspector' })
    const body = h('div', { class: 'cdoc-body' }, stage, inspector)
    const message = h('div', { class: 'notice cdoc-message', hidden: true })
    const element = h('div', { class: 'cdoc-editor' }, toolbar, message, body)

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => { if (fitMode && !drag) fit() }).observe(stage)
    }


    // ---- loading and emitting

    function load(svgString) {
        if (collage && svgString === current) return
        current = svgString
        undoStack = []
        redoStack = []
        selected = -1
        drag = null
        collage = svgString.trim() ? parseCollage(svgString, DOMParser) : createCollage(DEFAULT_WIDTH, DEFAULT_HEIGHT)
        message.hidden = !!collage
        body.hidden = !collage
        toolbar.hidden = !collage
        if (!collage) {
            message.replaceChildren(
                h('span', null, "This SVG can't be edited visually: it needs an <svg> element with a numeric width and height."),
                h('button', {
                    type: 'button', class: 'small',
                    onClick: () => {
                        if (!confirm('Replace the SVG with an empty ' + DEFAULT_WIDTH + '×' + DEFAULT_HEIGHT + ' frame?')) return
                        current = ''
                        load('')
                        commit()
                    },
                }, 'Start with an empty frame'))
            return
        }
        fitMode = true
        renderAll()
        fit()
    }

    function commit() {
        current = serializeCollage(collage)
        updateButtons()
        onSvg(current)
    }

    // Saves the state for undo. Edits with the same key in quick succession (typing, nudging) are one step.
    function checkpoint(key) {
        const now = Date.now()
        if (key && key === lastKey && now - lastTime < COALESCE_MS) {
            lastTime = now
            return
        }
        lastKey = key || null
        lastTime = now
        undoStack.push(snapshot())
        if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
        redoStack = []
    }

    function snapshot() {
        return JSON.stringify({ collage, selected })
    }

    function restore(state) {
        const parsed = JSON.parse(state)
        collage = parsed.collage
        selected = parsed.selected
        lastKey = null
        renderAll()
        commit()
    }

    function undo() {
        if (!undoStack.length) return
        redoStack.push(snapshot())
        restore(undoStack.pop())
    }

    function redo() {
        if (!redoStack.length) return
        undoStack.push(snapshot())
        restore(redoStack.pop())
    }


    // ---- rendering

    function renderAll() {
        applyZoom()
        renderContent()
        renderOverlay()
        refreshInspector()
        updateButtons()
    }

    function applyZoom() {
        const { width, height } = collage
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height)
        svg.setAttribute('width', String(width * zoom))
        svg.setAttribute('height', String(height * zoom))
        clipRect.setAttribute('width', String(width))
        clipRect.setAttribute('height', String(height))
        zoomLabel.textContent = Math.round(zoom * 100) + '%'
    }

    function setZoom(value) {
        fitMode = false
        zoom = Math.min(8, Math.max(0.05, value))
        applyZoom()
        renderOverlay()
    }

    function fit() {
        if (!collage) return
        const availableWidth = stage.clientWidth - 2 * PAD
        const availableHeight = stage.clientHeight - 2 * PAD
        if (availableWidth <= 0 || availableHeight <= 0) return // hidden
        zoom = Math.max(0.05, Math.min(1, availableWidth / collage.width, availableHeight / collage.height))
        applyZoom()
        renderOverlay()
    }

    // Drawing order: background, texts and other shapes, then images.
    function order() {
        const indices = collage.items.map((item, i) => i)
        return indices.filter(i => !isImage(collage.items[i])).concat(indices.filter(i => isImage(collage.items[i])))
    }

    function renderContent() {
        while (contentG.firstChild) contentG.removeChild(contentG.firstChild)
        if (collage.background) appendSanitized(contentG, backgroundXml(collage))
        groups = collage.items.map((item, i) => {
            const g = svgEl('g', { class: 'cdoc-item cdoc-' + item.kind, 'data-index': i })
            appendSanitized(g, item.kind === 'raw' ? item.source : generatedXml(item, true))
            return g
        })
        order().forEach(i => contentG.appendChild(groups[i]))
    }

    function renderItem(i) {
        const g = groups[i]
        while (g.firstChild) g.removeChild(g.firstChild)
        appendSanitized(g, generatedXml(collage.items[i], true))
    }

    function renderOverlay(guides) {
        while (overlayG.firstChild) overlayG.removeChild(overlayG.firstChild)
        if (!collage) return
        const px = 1 / zoom
        const { width, height } = collage
        overlayG.appendChild(svgEl('rect', { class: 'cdoc-frame-outline', x: 0, y: 0, width, height }))

        const handle = (x, y, attrs) => svgEl('rect', Object.assign({
            x: x - HANDLE_PX * px / 2, y: y - HANDLE_PX * px / 2, width: HANDLE_PX * px, height: HANDLE_PX * px,
        }, attrs))
        overlayG.appendChild(handle(width, height / 2, { class: 'cdoc-frame-handle', 'data-frame-handle': 'e' }))
        overlayG.appendChild(handle(width / 2, height, { class: 'cdoc-frame-handle', 'data-frame-handle': 's' }))
        overlayG.appendChild(handle(width, height, { class: 'cdoc-frame-handle', 'data-frame-handle': 'se' }))

        if (selected >= 0) {
            const b = boxOf(selected)
            overlayG.appendChild(svgEl('rect', { class: 'cdoc-selection', x: b.x, y: b.y, width: b.w, height: b.h }))
            for (const corner of CORNERS) {
                const x = corner.indexOf('w') !== -1 ? b.x : b.x + b.w
                const y = corner.indexOf('n') !== -1 ? b.y : b.y + b.h
                overlayG.appendChild(handle(x, y, { class: 'cdoc-handle cdoc-handle-' + corner, 'data-handle': corner }))
            }
        }

        for (const g of guides || []) {
            overlayG.appendChild(svgEl('line', { class: 'cdoc-guide', x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 }))
        }

        if (drag && drag.kind === 'frame') {
            const label = svgEl('text', { class: 'cdoc-size-label', x: width + 6 * px, y: height + 16 * px, 'font-size': 11 * px })
            label.textContent = width + ' × ' + height
            overlayG.appendChild(label)
        }
    }

    function refreshInspector() {
        if (!collage) return
        renderInspector(inspector, {
            collage,
            index: selected,
            locked: collage.items.filter(item => !isEditable(item)).length,
            edit,
            editFrame,
            setAnchor,
        })
    }

    function updateButtons() {
        const item = selected >= 0 ? collage.items[selected] : null
        buttons.remove.disabled = !item
        buttons.forward.disabled = !item || neighbour(1) === -1
        buttons.backward.disabled = !item || neighbour(-1) === -1
        buttons.undo.disabled = !undoStack.length
        buttons.redo.disabled = !redoStack.length
        buttons.frame.setAttribute('aria-pressed', String(!item))
    }


    // ---- geometry

    function boxOf(i) {
        const item = collage.items[i]
        if (isImage(item)) return { x: item.x, y: item.y, w: item.width, h: item.height }
        try {
            const b = groups[i].getBBox()
            return { x: b.x, y: b.y, w: b.width, h: b.height }
        } catch (e) {
            return { x: 0, y: 0, w: 0, h: 0 } // not rendered
        }
    }

    // The frame and every other item that has a size.
    function targetsFor(index) {
        const targets = [{ x: 0, y: 0, w: collage.width, h: collage.height }]
        collage.items.forEach((item, i) => {
            if (i === index) return
            const b = boxOf(i)
            if (b.w > 0 || b.h > 0) targets.push(b)
        })
        return targets
    }

    function toCollage(e) {
        const r = svg.getBoundingClientRect()
        return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }
    }

    // The editable item under the point: the selected one if it's there, otherwise the topmost.
    function hitTest(p) {
        const inside = i => {
            const b = boxOf(i)
            return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
        }
        if (selected >= 0 && inside(selected)) return selected
        const candidates = order().filter(i => isEditable(collage.items[i])).reverse()
        for (const i of candidates) if (inside(i)) return i
        return -1
    }


    // ---- editing

    function select(index) {
        selected = index
        renderOverlay()
        refreshInspector()
        updateButtons()
    }

    // For the inspector: fn() changes the selected item. key groups quick edits into one undo step.
    function edit(key, fn) {
        checkpoint(key)
        fn()
        const item = collage.items[selected]
        item.source = null
        renderItem(selected)
        renderOverlay()
        commit()
    }

    // fn() changes the frame (size, background).
    function editFrame(key, fn) {
        checkpoint(key)
        fn()
        applyZoom()
        renderContent()
        renderOverlay()
        commit()
    }

    // text-anchor, keeping the text's box where it is: x moves to the box's left edge, center or right edge.
    function setAnchor(anchor) {
        const item = collage.items[selected]
        if (!item || item.kind !== 'text' || item.anchor === anchor) return
        checkpoint()
        const b = boxOf(selected)
        const at = { start: b.x, middle: b.x + b.w / 2, end: b.x + b.w }
        item.x = Math.round(item.x + at[anchor] - at[item.anchor])
        item.anchor = anchor
        item.source = null
        renderItem(selected)
        renderOverlay()
        refreshInspector()
        commit()
    }

    function insert(item) {
        checkpoint()
        collage.items.push(item)
        selected = collage.items.length - 1
        renderContent()
        return selected
    }

    function addImage() {
        const answer = prompt('Image URL:')
        const href = answer && answer.trim()
        if (!href) return
        const place = (w, h) => {
            const scale = Math.min(1, collage.width / w, collage.height / h)
            const width = Math.max(1, Math.round(w * scale))
            const height = Math.max(1, Math.round(h * scale))
            insert(newImage(href, Math.round((collage.width - width) / 2), Math.round((collage.height - height) / 2), width, height))
            renderOverlay()
            refreshInspector()
            commit()
        }
        const probe = new Image()
        probe.onload = () => place(probe.naturalWidth || 100, probe.naturalHeight || 100)
        probe.onerror = () => place(100, 100) // the inspector says it didn't load
        probe.src = href
    }

    function addText() {
        const i = insert(newText('Text', Math.round(collage.width / 2), Math.round(collage.height / 2)))
        const item = collage.items[i]
        // Centered in the frame.
        const b = boxOf(i)
        if (b.w > 0) {
            item.x = Math.round(item.x + collage.width / 2 - (b.x + b.w / 2))
            item.y = Math.round(item.y + collage.height / 2 - (b.y + b.h / 2))
            renderItem(i)
        }
        renderOverlay()
        refreshInspector()
        commit()
        focusTextInput()
    }

    function focusTextInput() {
        const input = inspector.querySelector('.cdoc-text-input')
        if (input) {
            input.focus()
            input.select()
        }
    }

    function removeSelected() {
        if (selected < 0) return
        checkpoint()
        collage.items.splice(selected, 1)
        selected = -1
        renderAll()
        commit()
    }

    // The next item in the same layer (images, or everything else) in direction dir, or -1.
    function neighbour(dir) {
        const layer = isImage(collage.items[selected])
        for (let i = selected + dir; i >= 0 && i < collage.items.length; i += dir) {
            if (isImage(collage.items[i]) === layer) return i
        }
        return -1
    }

    function reorder(dir) {
        if (selected < 0) return
        const j = neighbour(dir)
        if (j === -1) return
        checkpoint()
        const items = collage.items
        const tmp = items[selected]
        items[selected] = items[j]
        items[j] = tmp
        selected = j
        renderContent()
        renderOverlay()
        commit()
    }

    function nudge(dx, dy) {
        const item = collage.items[selected]
        checkpoint('nudge')
        item.x = Math.round(item.x + dx)
        item.y = Math.round(item.y + dy)
        item.source = null
        renderItem(selected)
        renderOverlay(findGuides(boxOf(selected), targetsFor(selected)))
        refreshInspector()
        commit()
    }


    // ---- pointer

    stage.addEventListener('pointerdown', e => {
        if (e.button !== 0 || !collage) return
        stage.focus({ preventScroll: true })
        const p = toCollage(e)
        const target = e.target
        const corner = target.getAttribute && target.getAttribute('data-handle')
        const frameHandle = target.getAttribute && target.getAttribute('data-frame-handle')

        if (corner && selected >= 0) {
            const item = collage.items[selected]
            drag = { kind: 'resize', index: selected, corner, box0: boxOf(selected), item0: Object.assign({}, item), targets: targetsFor(selected) }
        } else if (frameHandle) {
            drag = { kind: 'frame', handle: frameHandle }
        } else {
            const index = hitTest(p)
            if (index !== selected) select(index)
            if (index === -1) return
            drag = { kind: 'move', index, start: p, box0: boxOf(index), item0: Object.assign({}, collage.items[index]), targets: targetsFor(index) }
        }
        drag.moved = false
        stage.setPointerCapture(e.pointerId)
        e.preventDefault()
    })

    stage.addEventListener('pointermove', e => {
        if (!collage) return
        const p = toCollage(e)
        if (!drag) {
            stage.style.cursor = hitTest(p) !== -1 ? 'move' : ''
            return
        }
        if (drag.kind === 'move') dragMove(p, e)
        else if (drag.kind === 'resize') dragResize(p, e)
        else dragFrame(p)
    })

    function finishDrag() {
        if (!drag) return
        const moved = drag.moved
        drag = null
        renderOverlay()
        if (moved) {
            refreshInspector()
            commit()
        }
    }

    stage.addEventListener('pointerup', finishDrag)
    stage.addEventListener('pointercancel', finishDrag)

    function startChange() {
        if (drag.moved) return
        checkpoint()
        drag.moved = true
    }

    function dragMove(p, e) {
        let dx = p.x - drag.start.x
        let dy = p.y - drag.start.y
        if (!drag.moved && Math.max(Math.abs(dx), Math.abs(dy)) * zoom < 2) return
        startChange()
        const b = drag.box0
        if (!e.altKey) {
            const s = snapMove({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }, drag.targets, SNAP_PX / zoom)
            dx += s.dx
            dy += s.dy
        }
        const item = collage.items[drag.index]
        item.x = Math.round(drag.item0.x + dx)
        item.y = Math.round(drag.item0.y + dy)
        item.source = null
        renderItem(drag.index)
        renderOverlay(findGuides(boxOf(drag.index), drag.targets))
    }

    function dragResize(p, e) {
        const b = drag.box0
        if (b.w <= 0 || b.h <= 0) return
        startChange()
        const item = collage.items[drag.index]
        const item0 = drag.item0
        // Texts always keep their proportions (the font size scales); images unless Shift is held.
        const keepAspect = item.kind === 'text' || !e.shiftKey
        const r = snapResize(b, drag.corner, p, e.altKey ? [] : drag.targets, SNAP_PX / zoom, keepAspect, 1)
        if (isImage(item)) {
            item.x = Math.round(r.x)
            item.y = Math.round(r.y)
            item.width = Math.max(1, Math.round(r.w))
            item.height = Math.max(1, Math.round(r.h))
        } else {
            item.fontSize = Math.max(1, Math.round(item0.fontSize * r.w / b.w))
            // The box scales around the anchor point (x, baseline); keep the fixed corner in place.
            const k = item.fontSize / item0.fontSize
            const fx = drag.corner.indexOf('w') !== -1 ? b.x + b.w : b.x
            const fy = drag.corner.indexOf('n') !== -1 ? b.y + b.h : b.y
            item.x = Math.round(fx - k * (fx - item0.x))
            item.y = Math.round(fy - k * (fy - item0.y))
        }
        item.source = null
        renderItem(drag.index)
        renderOverlay(findGuides(boxOf(drag.index), drag.targets))
    }

    function dragFrame(p) {
        startChange()
        if (drag.handle.indexOf('e') !== -1) collage.width = Math.max(1, Math.round(p.x))
        if (drag.handle.indexOf('s') !== -1) collage.height = Math.max(1, Math.round(p.y))
        applyZoom()
        renderContent()
        renderOverlay()
    }

    stage.addEventListener('dblclick', e => {
        if (!collage) return
        const index = hitTest(toCollage(e))
        if (index !== -1 && collage.items[index].kind === 'text') {
            if (index !== selected) select(index)
            focusTextInput()
        }
    })


    // ---- keyboard

    element.addEventListener('keydown', e => {
        if (!collage || drag) return
        const tag = e.target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return
        const key = e.key.toLowerCase()
        const mod = e.metaKey || e.ctrlKey
        const item = selected >= 0 ? collage.items[selected] : null
        let handled = true
        if (mod && key === 'z') {
            if (e.shiftKey) redo()
            else undo()
        } else if (mod && key === 'y') {
            redo()
        } else if (mod && e.shiftKey && item && item.kind === 'text' && (key === 'l' || key === 'e' || key === 'r')) {
            setAnchor({ l: 'start', e: 'middle', r: 'end' }[key])
        } else if (!mod && item && key.indexOf('arrow') === 0) {
            const step = e.shiftKey ? 10 : 1
            nudge(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0,
                key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0)
        } else if (!mod && item && (key === 'delete' || key === 'backspace')) {
            removeSelected()
        } else if (key === 'escape' && item) {
            select(-1)
        } else {
            handled = false
        }
        if (handled) e.preventDefault()
    })

    return {
        element,
        load,
        getSvg: () => current,
    }
}
