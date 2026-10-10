/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// The release version, shared by the build (banner, VERSION file, folder name), the generator and the tool.
// Keep it equal to "version" in package.json (test/generator.test.mjs checks).
//
// The major version is the page format: it changes only when pages have to be regenerated to work
// with the new reader. Minor and patch releases are drop-in: site owners replace the reader folder.
// Each major has its own folder (rw-reader-1/, rw-reader-2/, ...), so pages of an older format keep
// working with the old folder until they're regenerated.

export const VERSION = '1.0.0'

export const PAGE_FORMAT = Number(VERSION.split('.')[0])

export const READER_FOLDER = 'rw-reader-' + PAGE_FORMAT
