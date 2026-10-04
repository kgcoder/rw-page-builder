/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// Text and attribute values in the generated HTML. Apostrophes are left alone (attributes use double quotes).
export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

// Same as the reader's escapeXml (reader/helpers.js), for CDOC/CONDOC sources.
export function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

// JSON inside <script type="application/json">: "</" would end the script element early,
// and "<!--" can switch the parser into an escaped state.
export function escapeJsonForScript(json) {
    return json.replace(/<\//g, '<\\/').replace(/<!--/g, '\\u003c!--')
}
