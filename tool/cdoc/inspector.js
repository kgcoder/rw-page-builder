/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// The collage editor's property panel: the selected image or text, or the frame when nothing is selected.
// ctx: { collage, index, locked, edit(key, fn), editFrame(key, fn), setAnchor(anchor) }. edit() and
// editFrame() apply fn(), redraw and emit; the panel isn't rebuilt, so typing keeps the focus.
import { h, setChildren } from '../dom.js'
import { field } from '../fields.js'

const FONTS = ['sans-serif', 'serif', 'monospace']
const ALIGNMENTS = [['start', 'Left', '⌘⇧L'], ['middle', 'Center', '⌘⇧E'], ['end', 'Right', '⌘⇧R']]

export function renderInspector(container, ctx) {
    const item = ctx.index >= 0 ? ctx.collage.items[ctx.index] : null
    if (!item) setChildren(container, framePanel(ctx))
    else if (item.kind === 'image') setChildren(container, imagePanel(item, ctx))
    else setChildren(container, textPanel(item, ctx))
}

function framePanel(ctx) {
    const collage = ctx.collage
    const background = colorControl(() => collage.background, value => ctx.editFrame('background', () => { collage.background = value }),
        { transparent: true, fallback: '#ffffff' })
    return [
        h('h3', null, 'Frame'),
        h('div', { class: 'row' },
            field('Width', numberInput(() => collage.width, v => ctx.editFrame('width', () => { collage.width = v }), 1)),
            field('Height', numberInput(() => collage.height, v => ctx.editFrame('height', () => { collage.height = v }), 1))),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Background'), background),
        ctx.locked ? h('p', { class: 'hint' }, plural(ctx.locked, 'shape') + ' from the SVG source '
            + (ctx.locked === 1 ? 'is' : 'are') + ' kept as written and can only be edited in the SVG source.') : null,
        h('p', { class: 'hint' }, 'Drag the handles on the right and bottom edges to resize the frame. In the reader, images are drawn above texts and shapes.'),
    ]
}

function imagePanel(item, ctx) {
    const edit = (key, fn) => ctx.edit(key, fn)
    const warning = h('p', { class: 'field-error', hidden: true }, "This image doesn't load. Check the URL.")
    let natural = null
    const naturalButton = h('button', {
        type: 'button', class: 'small', disabled: true, title: "The image's own size",
        onClick: () => {
            if (!natural) return
            edit(null, () => {
                item.width = natural.width
                item.height = natural.height
            })
            refreshNumbers()
        },
    }, 'Original size')
    const check = href => {
        natural = null
        naturalButton.disabled = true
        warning.hidden = true
        const probe = new Image()
        probe.onload = () => {
            if (href !== item.href) return
            natural = { width: probe.naturalWidth, height: probe.naturalHeight }
            naturalButton.disabled = !natural.width || !natural.height
        }
        probe.onerror = () => { if (href === item.href) warning.hidden = false }
        probe.src = href
    }
    check(item.href)

    const numbers = [
        ['X', 'x', -Infinity], ['Y', 'y', -Infinity], ['Width', 'width', 1], ['Height', 'height', 1],
    ].map(([label, key, min]) => ({
        key,
        input: numberInput(() => item[key], v => edit('image-' + key, () => { item[key] = v }), min),
        label,
    }))
    function refreshNumbers() {
        numbers.forEach(n => { n.input.value = String(item[n.key]) })
    }

    return [
        h('h3', null, 'Image'),
        field('URL', h('input', {
            type: 'url', value: item.href, spellcheck: 'false',
            onInput: e => {
                const value = e.target.value.trim()
                if (value) edit('image-href', () => { item.href = value })
            },
            onChange: () => check(item.href),
        })),
        warning,
        h('div', { class: 'row cdoc-numbers' }, numbers.map(n => field(n.label, n.input))),
        h('div', { class: 'inline-buttons' }, naturalButton),
        h('p', { class: 'hint' }, 'Drag a corner to resize; hold Shift to change the proportions, Alt to turn snapping off. Arrow keys move it by 1 (Shift: 10).'),
    ]
}

function textPanel(item, ctx) {
    const edit = (key, fn) => ctx.edit(key, fn)
    const fonts = FONTS.indexOf(item.fontFamily) !== -1 || !item.fontFamily ? FONTS : FONTS.concat([item.fontFamily])
    const weightIsBold = item.fontWeight === 'bold' || item.fontWeight === 'bolder' || parseInt(item.fontWeight, 10) >= 600

    return [
        h('h3', null, 'Text'),
        field('Text', h('textarea', {
            class: 'cdoc-text-input', rows: String(Math.max(2, Math.min(8, item.lines.length))), value: item.lines.join('\n'),
            onInput: e => edit('text-lines', () => { item.lines = e.target.value.split('\n') }),
        }), 'Each line of the box is a line of the text.'),
        h('div', { class: 'field' },
            h('span', { class: 'field-label' }, 'Alignment'),
            h('div', { class: 'cdoc-segmented', role: 'group', 'aria-label': 'Alignment' }, ALIGNMENTS.map(([anchor, label, keys]) =>
                h('button', {
                    type: 'button', class: 'small', title: label + ' (' + keys + ')',
                    'aria-pressed': String(item.anchor === anchor),
                    onClick: () => ctx.setAnchor(anchor),
                }, label)))),
        h('div', { class: 'row' },
            field('Size', numberInput(() => item.fontSize, v => edit('text-size', () => { item.fontSize = v }), 1)),
            field('Font', h('select', {
                value: item.fontFamily || 'sans-serif',
                onChange: e => edit(null, () => { item.fontFamily = e.target.value }),
            }, fonts.map(f => h('option', { value: f }, f))))),
        h('div', { class: 'inline-buttons' },
            checkbox('Bold', weightIsBold, on => edit(null, () => { item.fontWeight = on ? 'bold' : '' })),
            checkbox('Italic', item.fontStyle === 'italic', on => edit(null, () => { item.fontStyle = on ? 'italic' : '' }))),
        h('div', { class: 'field' },
            h('span', { class: 'field-label' }, 'Color'),
            colorControl(() => item.fill, value => edit('text-fill', () => { item.fill = value }), { fallback: '#000000' })),
        h('div', { class: 'row cdoc-numbers' },
            field('X', numberInput(() => item.x, v => edit('text-x', () => { item.x = v }), -Infinity)),
            field('Y (baseline)', numberInput(() => item.y, v => edit('text-y', () => { item.y = v }), -Infinity))),
        h('p', { class: 'hint' }, 'Drag a corner to change the size. Double-click a text to edit it. Fonts other than sans-serif, serif and monospace may look different in the reader.'),
    ]
}


// ---- controls

// Whole numbers only; anything else (or below min) is ignored until it's valid.
function numberInput(get, set, min) {
    return h('input', {
        type: 'number', step: '1', min: min > -Infinity ? String(min) : null, value: String(get()),
        onInput: e => {
            const value = e.target.value.trim()
            if (!/^-?\d+$/.test(value)) return
            const v = parseInt(value, 10)
            if (v >= min) set(v)
        },
    })
}

function checkbox(label, checked, onChange) {
    return h('label', { class: 'checkbox' },
        h('input', { type: 'checkbox', checked, onChange: e => onChange(e.target.checked) }),
        label)
}

// A color picker plus a text field for any CSS color. With opts.transparent, a "Transparent" checkbox
// sets the value to ''.
function colorControl(get, set, opts) {
    const value = get()
    const picker = h('input', { type: 'color', value: toHex(value) || opts.fallback })
    const text = h('input', { type: 'text', class: 'cdoc-color-text', value, placeholder: opts.transparent ? 'transparent' : '', spellcheck: 'false' })
    const transparent = opts.transparent
        ? h('input', { type: 'checkbox', checked: !value })
        : null

    picker.addEventListener('input', () => {
        text.value = picker.value
        if (transparent) transparent.checked = false
        set(picker.value)
    })
    text.addEventListener('input', () => {
        const v = text.value.trim()
        const hex = toHex(v)
        if (hex) picker.value = hex
        if (transparent) transparent.checked = !v
        if (v || transparent) set(v)
    })
    if (transparent) {
        transparent.addEventListener('change', () => {
            const v = transparent.checked ? '' : picker.value
            text.value = v
            set(v)
        })
    }

    return h('div', { class: 'cdoc-color' },
        transparent ? h('label', { class: 'checkbox' }, transparent, 'Transparent') : null,
        picker, text)
}

function toHex(color) {
    const c = String(color || '').trim()
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase()
    const short = c.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
    return short ? ('#' + short[1] + short[1] + short[2] + short[2] + short[3] + short[3]).toLowerCase() : null
}

function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's')
}
