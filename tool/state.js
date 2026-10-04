/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/


// The document being edited. The form changes the model in place and calls changed();
// opening or creating a document replaces it with setModel().
import { createModel } from '../generator/model.js'

let model = createModel('hdoc')
let fileName = ''
let dirty = false
const listeners = []

export function getModel() {
    return model
}

export function getFileName() {
    return fileName
}

export function isDirty() {
    return dirty
}

export function setModel(newModel, newFileName) {
    model = newModel
    fileName = newFileName || ''
    dirty = false
    emit('replace')
}

// Called after every edit. structural = true when the form has to be rebuilt (e.g. the type changed).
export function changed(structural) {
    dirty = true
    emit(structural ? 'replace' : 'edit')
}

// The model changed without an edit in the form (e.g. flinks re-anchored after opening a page).
export function markDirty() {
    dirty = true
}

export function markSaved(newFileName) {
    if (newFileName) fileName = newFileName
    dirty = false
    emit('saved')
}

// fn(kind): kind is 'replace' (rebuild the form), 'edit' or 'saved'.
export function onChange(fn) {
    listeners.push(fn)
}

function emit(kind) {
    listeners.forEach(fn => fn(kind))
}
