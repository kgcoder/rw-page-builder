/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// Copies text to the clipboard. navigator.clipboard exists only in secure contexts (https or localhost),
// so on a plain-http server (a LAN address, a .local name) this falls back to execCommand('copy').
export function copyText(text) {
    if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text)
    }
    return new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.top = '0'
        textarea.style.left = '0'
        textarea.style.opacity = '0'
        const active = document.activeElement
        document.body.appendChild(textarea)
        textarea.select()
        let ok = false
        try {
            ok = document.execCommand('copy')
        } catch (e) {
            ok = false
        }
        textarea.remove()
        if (active && active.focus) active.focus()
        if (ok) resolve()
        else reject(new Error('the browser blocked clipboard access on this page (use https or localhost)'))
    })
}
