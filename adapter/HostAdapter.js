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


            const {hdocDataJSON, content} = getHdocJsonAndContentFromCurrentDocument()

            const dataObject = parseHtmlPageWithEmbeddedHDoc(currentLocation, content, hdocDataJSON)

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
        alert("This document can't be loaded here because it's hosted on another site:\n\n" + url)
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
