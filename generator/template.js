/*
RW Page Builder

Copyright (c) 2026 Karen Grigorian
Code licensed under the MIT License.

This software implements document types defined by the Reader's Web project.

Reader's Web document types are licensed under CC BY-ND 4.0 and are maintained externally.

For the official list of document types and specifications, see:
https://github.com/kgcoder/readers-web-specs
*/

// The page skeleton. The DOM is the plugin's templates/reader-template.php, with the -rw ids
// (see CLAUDE.md). If the reader starts relying on a new element, add it here and to examples/.

export function pageHtml(p) {
    return `<!DOCTYPE html>
<html lang="${p.lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${p.pageTitle}</title>

    <!-- Reader's Web reader UI, loaded from the uploaded rw-reader/ folder. -->
    <link rel="stylesheet" href="${p.assetsUrl}rw-reader.css">
    <link rel="stylesheet" href="${p.assetsUrl}themes/${p.theme}.css">
    <script defer src="${p.assetsUrl}rw-reader.js" data-font-set="${p.fontSet}"${p.scriptExtraAttrs}></script>
</head>

<body>

<div id="ui-root" class="theme-${p.theme}">
    <div id="AllDocumentsContainer">
        <div id="OneDocumentContainer">

            <div id="CurrentDocumentTopBar">
                <div id="CurrentDocumentTopBarRow">

                    <div id="CurrentDocumentInfoButtonWrapper" class="DocumentTopBarButtonWrapper">
                        <div title="Page info" id="CurrentDocumentInfoButton-rw" class="DocumentTopBarButton" href="#">
                            <span id="CurrentDocumentInfoButtonCountDiv" class="CurrentDocumentTopButtonCountDiv"></span>
                        </div>
                    </div>

                    <div title="Download all connected documents" id="CurrentDocumentDownloadAllDocsButton" class="DocumentTopBarButtonWrapper"></div>
                    <div title="Toggle full screen" id="CurrentDocumentFullScreenButton" class="DocumentTopBarButtonWrapper"></div>
                    <div title="Export connections" id="CurrentDocumentExportButton" class="DocumentTopBarButtonWrapper"></div>
                    <div title="Veiw source" id="CurrentDocumentSourceCodeButton" class="DocumentTopBarButtonWrapper"></div>
                    <div title="Center collage" id="CurrentDocumentCenterCollageButton" class="DocumentTopBarButtonWrapper"></div>
                    <div title="Learn about Reader's Web" id="PromotionButton" class="DocumentTopBarButtonWrapper"></div>

                    <div class="spacer10px"></div>

                    <div class="TitleContainer">
                        <span id="CurrentDocumentOptionalTitleSpan" style="display: none;"></span>
                        <a id="CurrentDocumentTitleLink" href="#"><span id="CurrentDocumentTitleSpan-rw" class="DocumentTitleSpan"></span></a>
                    </div>

                    <div id="CurrentDocumentCopyButton" class="DocumentTopBarButtonWrapper" title="This document is a copy of another document."></div>

                    <div id="CurrentDocumentEmbeddingSymbol" class="DocumentTopBarButtonWrapper" title="This document embeds another document. Click on the title to view the embedded document separately."></div>

                    <div id="mainDocSpinner"></div>
                </div>
            </div>

            <div id="CurrentDocumentMainRow" class="DocumentMainRow">

                <div id="CurrentDocument" class="DocumentColumn">
                    <div id="CurrentDocumentTopPanel" class="DocumentTopPanel"${p.top.panelAttr}>
                        <a id="CurrentDocumentTopPanelLogoLink" class="TopPanelLogoLink" href="${p.top.href}">
                            <img id="CurrentDocumentTopPanelLogo" src="${p.top.logoSrc}" width="150px" height="50px"${p.top.logoAttr}/>
                            <span id="CurrentDocumentTopPanelTitle" class="TopPanelTitle"${p.top.titleAttr}>${p.top.title}</span>
                        </a>
                        <div class="spacer"></div>
                        <div id="CurrentDocumentTopPanelOptionsRow" class="DocumentTopPanelOptionsRow">${p.top.links}</div>
                        <div id="LeftSandwichButton" class="SandwichButton">
                            <div class="LeftSandwichLine"></div>
                            <div class="LeftSandwichLine SandwichMiddleLine"></div>
                            <div class="LeftSandwichLine"></div>
                        </div>
                    </div>

                    <div id="CurrentDocumentInnerRow">

                        <div id="CurrentDocumentBody">
                            <div id="CurrentDocumentHeader" class="HeaderDiv"><h1>${p.h1}</h1></div>
                            <div id="CurrentDocumentMainDiv" class="PresentationDiv${p.mainDivClass}">
                                ${p.mainContent}
                            </div>
                        </div>

                        <div id="CurrentDocumentSidebar" class="SideBar"${p.sidebar ? '' : ' style="display:none"'}>${p.sidebar}</div>

                    </div>

                    <div id="CurrentDocumentBelowContentComments" class="BelowContentComments" style="display:none"></div>

                    <div id="CurrentDocumentBottomBar" class="BottomBar"></div>

                    <div id="CurrentDocumentPostNavBar" class="PostNavBar"${p.postNav ? ' style="display:flex"' : ''}>${p.postNav}</div>

                    <div id="CurrentDocumentBottomPanel" class="DocumentBottomPanel"${p.bottom.panelAttr}>
                        <div id="CurrentDocumentBottomPanelRow" class="DocumentBottomPanelRow">${p.bottom.sections}</div>
                        <div id="CurrentDocumentBottomPanelBottomMessage" class="DocumentBottomPanelBottomMessage">${p.bottom.message}</div>
                    </div>
                    <div id="CurrentDocumentMainCollageDiv">
                        <canvas id="CurrentDocumentMainCollageCanvas" class="OneCollageCanvas"></canvas>
                    </div>
                    <div id="CurrentDocumentDropDownMenu" class="DocumentDropDownMenu"></div>
                </div>

                <div id="CurrentDocumentInfoContainer">
                    <div id="CurrentDocumentInfo"></div>
                </div>

                <div id="CurrentDocumentExportContainer"></div>

            </div>

        </div>

        <div id="middle-canvas-topDiv">
            <svg id="svgArrow" width="28" height="12" viewBox="0 0 28 12" fill="none" xmlns="http://www.w3.org/2000/svg"></svg>
            <a title="List of floating links" id="LinksOpenButton"></a>
        </div>

        <div id="middle-space-div"></div>

        <div id="AllRightDocumentsContainer">
            <div id="RightDocumentsTabsContainer"></div>
            <div id="RightDocumentsTopBar">
                <div title="Veiw source" id="RightDocumentSourceCodeButton" class="DocumentTopBarButtonWrapper"></div>
                <div title="Center collage" id="RightDocumentCenterCollageButton" class="DocumentTopBarButtonWrapper"></div>

                <div class="spacer10px"></div>

                <div class="TitleContainer">
                    <span id="RightDocumentOptionalTitleSpan" style="display: none;"></span>
                    <a id="RightDocumentTitleLink"><span id="RightDocumentTitleSpan" class="DocumentTitleSpan"></span></a>
                </div>

                <div id="RightDocumentCopyButton" class="DocumentTopBarButtonWrapper" title="This document is a copy of another document."></div>

            </div>
            <div id="RightDocumentCollectionContainer"></div>
            <div id="RightDocumentExportContainer"></div>
        </div>

        <canvas id="flinks-canvas"></canvas>
    </div>

    <div id="LinksListContainerDiv">
        <div id="LinksListTopRow">
            <div id="LinksListTopRowLeftSortButtonContainer"></div>
            <div id="LinksListTopRowMiddleSpacer"></div>
            <div id="LinksListTopRowRightSortButtonContainer"></div>
            <div id="LinksListTopRowEndSpacer"></div>
        </div>
        <div id="FlinksScrollDiv" class="scroll-container"></div>
        <span id="LinksListModificationMessage">Floating links were modified</span>
        <div id="LinksListBottomRow">
            <button id="LinksListCloseButton" class="CancelButton">Close</button>
            <div class="LinksListBottomRowMiddleSpacer"></div>
            <button id="LinksListOriginalLinksButton" class="CancelButton">Show original flinks</button>
            <div id="LinksListOriginalLinksSpacer" class="LinksListBottomRowMiddleSpacer"></div>
            <button id="LinksListFixButton" class="ActionButton">Fix all</button>
        </div>
    </div>

    <div id="spinner" class="spinner"></div>
    <div id="CurrentUrl"></div>
    <div id="multiple-links-popup"></div>
</div>

${p.dataScript}</body>
</html>
`
}
