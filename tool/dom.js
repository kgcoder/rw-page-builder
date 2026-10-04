/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// A tiny element builder: h('input', {type: 'text', onInput: fn}, ...children).
export function h(tag, props) {
    const el = document.createElement(tag)
    let value
    if (props) {
        for (const key of Object.keys(props)) {
            const v = props[key]
            if (v == null || v === false) continue
            if (key === 'value') {
                value = v // set after the children, so <select> already has its options
            } else if (key.indexOf('on') === 0) {
                el.addEventListener(key.slice(2).toLowerCase(), v)
            } else if (key === 'class') {
                el.className = v
            } else {
                el.setAttribute(key, v === true ? '' : v)
            }
        }
    }
    for (let i = 2; i < arguments.length; i++) appendChild(el, arguments[i])
    if (value !== undefined) el.value = value
    return el
}

function appendChild(el, child) {
    if (child == null || child === false) return
    if (Array.isArray(child)) {
        child.forEach(c => appendChild(el, c))
    } else {
        el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
    }
}

export function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild)
}

// Replaces el's children. Like h(), it skips null/false and flattens arrays (replaceChildren() would
// turn null into the text "null").
export function setChildren(el) {
    clear(el)
    for (let i = 1; i < arguments.length; i++) appendChild(el, arguments[i])
}
