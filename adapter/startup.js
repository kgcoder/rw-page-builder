/*
RW Reader

Copyright (c) 2025 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

import g from '../reader/Globals.js'
import HostAdapter from './HostAdapter.js'
import '../reader/readerStartUp.js'

// Safe as a plain top-level assignment: nothing in reader/ reads g.hostAdapter until
// the DOMContentLoaded handler in readerStartUp.js runs, which happens only after this
// whole module graph (including readerStartUp.js's own imports) has finished loading.
g.hostAdapter = new HostAdapter()
