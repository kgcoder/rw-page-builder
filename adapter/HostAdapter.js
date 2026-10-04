/*
RW Reader

Copyright (c) 2025 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

import { setFontSet } from '../reader/Fonts.js'
import g from '../reader/Globals.js'
import { getHdocJsonAndContentFromCurrentDocument, parseHtmlPageWithEmbeddedHDoc } from '../reader/parsers/EmbHDOCParser.js'
import { parseStaticContent } from "../reader/parsers/ParsingManager.js"
import { addListenersToContainer, dispatchReaderReady, loadUIAndIcons } from "../reader/readerStartUp.js"


// The page configures the reader through the <script> tag that loads the bundle:
//   <script defer src="/rw-reader/rw-reader.js" data-font-set="default"></script>
// document.currentScript is only available while that script is executing, so it
// has to be read at module evaluation time, not in a callback.
const readerScript = document.currentScript

function readConfig() {
    const config = {
        assetsUrl: null,
        fontSet: 'default',
        openInNewTabCommentsLabel: 'Open in a new tab to view comments',
    }

    if (readerScript && readerScript.src) {
        config.assetsUrl = new URL('images/', readerScript.src).href
        const data = readerScript.dataset
        if (data.fontSet) config.fontSet = data.fontSet
        if (data.commentsLabel) config.openInNewTabCommentsLabel = data.commentsLabel
    }

    // Same global the plugin uses; when present it overrides the script attributes.
    const overrides = window.vcReaderData
    if (overrides) {
        for (const key of Object.keys(config)) {
            if (overrides[key] != null) config[key] = overrides[key]
        }
    }

    return config
}


const EXTENSION_URL = 'https://chromewebstore.google.com/detail/rw-reader/hlckcdbgknflkkciojgdbhomdnegimbm'

// Explains why a connected document on another site can't be opened, and how the extension gets
// around it. Uses the reader's popup styles (.swp-comment-popup*, reader/reader.css). If several
// documents fail at once (e.g. "Download all connected documents"), they're listed in one popup.
function showCrossOriginPopup(url) {
    const existing = document.querySelector('.rw-cross-origin-popup')
    if (existing) {
        const urls = existing.querySelector('.rw-cross-origin-urls')
        const listed = Array.prototype.some.call(urls.children, item => item.textContent === url)
        if (!listed) urls.appendChild(urlItem(url))
        updateCrossOriginMessage(existing)
        return
    }

    const overlay = document.createElement('div')
    overlay.className = 'swp-comment-popup-overlay'

    const popup = document.createElement('div')
    popup.className = 'swp-comment-popup rw-cross-origin-popup'
    popup.setAttribute('role', 'dialog')
    popup.setAttribute('aria-modal', 'true')

    const close = () => {
        overlay.remove()
        document.removeEventListener('keydown', onKeyDown)
    }
    const onKeyDown = e => { if (e.key === 'Escape') close() }

    const closeBtn = document.createElement('button')
    closeBtn.className = 'swp-comment-popup-close'
    closeBtn.textContent = '✕'
    closeBtn.title = 'Close'
    closeBtn.setAttribute('aria-label', 'Close')
    closeBtn.addEventListener('click', close)

    const message = document.createElement('p')
    message.className = 'rw-cross-origin-message'

    const list = document.createElement('ul')
    list.className = 'rw-cross-origin-urls'
    list.appendChild(urlItem(url))

    const workaround = document.createElement('p')
    workaround.textContent = 'You can get around this restriction by installing the RW Reader extension and reloading this page.'

    const link = document.createElement('a')
    link.className = 'rw-cross-origin-extension-link'
    link.href = EXTENSION_URL
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = 'Get RW Reader for Chrome'

    popup.append(closeBtn, message, list, workaround, link)
    updateCrossOriginMessage(popup)
    overlay.appendChild(popup)
    overlay.addEventListener('click', e => { if (e.target === overlay) close() })
    document.addEventListener('keydown', onKeyDown)
    document.body.appendChild(overlay)
    closeBtn.focus()
}

// One document, several documents on one other site, or documents on several sites.
function updateCrossOriginMessage(popup) {
    const urls = Array.prototype.map.call(popup.querySelectorAll('.rw-cross-origin-urls li'), item => item.textContent)
    const hosts = new Set(urls.map(url => {
        try {
            return new URL(url).host
        } catch (e) {
            return url
        }
    }))
    let text
    if (urls.length === 1) text = "This document can't be loaded here because it's hosted on another site:"
    else if (hosts.size === 1) text = "These documents can't be loaded here because they're hosted on another site:"
    else text = "These documents can't be loaded here because they're hosted on other sites:"
    popup.querySelector('.rw-cross-origin-message').textContent = text
}

function urlItem(url) {
    const item = document.createElement('li')
    item.textContent = url
    return item
}


export default class HostAdapter {


    allowFontResizing = false
    allowDynamicThemeChange = false

    mainDocumentTitleSpanId = "CurrentDocumentTitleSpan-rw"
    mainDocumentInfoButtonId = "CurrentDocumentInfoButton-rw"
    currentDocumentCloseButtonId = "shouldn't-exist"

    shouldBlockCrossOriginCommentsRequests = true
    isPromotionalButtonSupported = true

    constructor(){
        this.config = readConfig()
        this.initReader()
    }


    initReader(){
        let currentLocation

        document.addEventListener('DOMContentLoaded', async () => {
            const mainContainer = document.getElementById("AllDocumentsContainer");
            const mainContainerRect = mainContainer.getBoundingClientRect();
            g.adminBarHeight = mainContainerRect.top

            currentLocation = window.location.toString()

            if (currentLocation.includes('#')) {
                currentLocation = currentLocation.split('#')[0]
            }

            const container = document.getElementById("ui-root")

            addListenersToContainer(container)


            let isEmbeddedCdoc = false
            let isEmbeddedCondoc = false
            let contentString = ''
            try {
                const embeddedCdocScript = document.querySelector('#cdoc-source')
                const source = JSON.parse(embeddedCdocScript.textContent).source;
                if(source){
                    isEmbeddedCdoc = true
                    contentString = '<html><body>' + document.body.innerHTML + '</body></html>'
                }
            } catch {
                //do nothing
            }

            try {
                const embeddedCondocScript = document.querySelector('#condoc-source')
                const source = JSON.parse(embeddedCondocScript.textContent).source;
                if(source){
                    isEmbeddedCondoc = true
                    contentString = '<html><body>' + document.body.innerHTML + '</body></html>'
                }
            } catch {
                //do nothing
            }


            if(isEmbeddedCdoc || isEmbeddedCondoc){
                const {dataObject,error} = await parseStaticContent(contentString,currentLocation)

                if(dataObject ){
                    loadUIAndIcons()
                    await setFontSet(this.config.fontSet)

                    if(isEmbeddedCdoc){
                        await g.pdm.loadCollage(dataObject)
                    }else{
                        await g.pdm.showEmptyCondoc(dataObject)
                    }
                    dispatchReaderReady(currentLocation)

                    return


                }
            }


            const {hdocDataJSON, content, title, base} = getHdocJsonAndContentFromCurrentDocument()

            const dataObject = parseHtmlPageWithEmbeddedHDoc(currentLocation, content, hdocDataJSON, {title, base})

            if(dataObject ){
                loadUIAndIcons()
                await setFontSet(this.config.fontSet)
            }
            await g.pdm.loadDocument(dataObject)
            dispatchReaderReady(currentLocation)

        });

    }


    getAssetsUrl(){
       return this.config.assetsUrl
    }

    // Only called for cross-origin URLs (NetworkManager fetches same-host URLs itself).
    // A static site has no proxy, so these requests aren't supported yet.
    async fetchWebPage(url, options) {
        showCrossOriginPopup(url)
        return {text: '', error: new Error('Cross-origin requests are not supported: ' + url)}
    }

    executeAfterOptionalDelay(func,delay = 500){
        setTimeout(() => {
            //testing if the extension has replaced the UI.
            const titleSpan = document.getElementById(this.mainDocumentTitleSpanId)
            if(titleSpan){
                func()
            }
        },delay)
    }

    // No per-visitor settings yet — theme and font set are chosen by the page author
    // (theme stylesheet + class on #ui-root, data-font-set on the script tag).
    // If that changes, implement these with window.localStorage.
    getSetting(key) {
        return Promise.resolve(undefined)
    }

    saveSetting(key, value) {
    }


    reloadPage(){}


    getCurrentThemeName() {
        const rootEl = document.getElementById('ui-root')
        if (!rootEl) return null

        for (const className of rootEl.classList) {
            if (className.startsWith('theme-')) return className.slice('theme-'.length)
        }

        return null
    }


    //UI additions ---------------


    getOpenCommentsInNewTabLabel(){
        return this.config.openInNewTabCommentsLabel
    }



}
