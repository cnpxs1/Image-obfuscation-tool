function blobMayHaveTransparency(n){return n==="image/png"||n==="image/webp"||n==="image/gif"}let opaqueBackgroundColor="#ffffff",imageQuality=1,colorPickerInstance=null,colorPickerResizeObserver=null;function handleColorChange(n){updateColorInputs(n),updateColorPreview(n.hexString),opaqueBackgroundColor=n.hexString}function createColorPicker(n){const e=new iro.ColorPicker("#color-picker-box",n);e.on("color:change",handleColorChange);const r=e.color;return updateColorInputs(r),updateColorPreview(r.hexString),e}function disposeColorPicker(){colorPickerInstance&&(colorPickerInstance.off("color:change",handleColorChange),colorPickerInstance=null)}function disconnectColorPicker(){colorPickerResizeObserver&&(colorPickerResizeObserver.disconnect(),colorPickerResizeObserver=null)}function initColorPicker(){if(useIroJs){if(typeof window.iro>"u"||typeof iro.ColorPicker!="function"){logWarn(t("log.category.color"),t("log.msg.iroNotLoaded"));return}try{colorPickerResizeObserver&&(colorPickerResizeObserver.disconnect(),colorPickerResizeObserver=null),disposeColorPicker();const n={width:200,borderWidth:1,borderColor:"#ddd",containerStyle:"border-radius: 0;"},e=[{component:iro.ui.Box},{component:iro.ui.Slider,options:{sliderType:"hue"}}];colorPickerInstance=createColorPicker({...n,layoutDirection:"horizontal",layout:e,color:opaqueBackgroundColor}),logLog(t("log.msg.colorPickerInitSuccess"));let r=!1;const l=document.getElementById("color-picker-box")?.parentElement;l&&(colorPickerResizeObserver=new ResizeObserver(()=>{const i=l.clientHeight>250;if(i===r)return;r=i;const s=colorPickerInstance.color.hsv;disposeColorPicker(),document.getElementById("color-picker-box").innerHTML="",colorPickerInstance=createColorPicker({...n,layoutDirection:i?"vertical":"horizontal",layout:e,color:s})}),colorPickerResizeObserver.observe(l))}catch(n){logError(t("log.category.color"),t("log.msg.colorPickerInitFailed",{msg:n.message||n}))}}}function updateColorInputs(n){const e=document.getElementById("hex-input"),r=document.getElementById("rgb-r-input"),l=document.getElementById("rgb-g-input"),i=document.getElementById("rgb-b-input"),s=document.activeElement;let c,h,o,a;if(n)c=n.hexString,h=n.rgb.r,o=n.rgb.g,a=n.rgb.b;else if(colorPickerInstance&&colorPickerInstance.color)c=colorPickerInstance.color.hexString,h=colorPickerInstance.color.rgb.r,o=colorPickerInstance.color.rgb.g,a=colorPickerInstance.color.rgb.b;else{c=opaqueBackgroundColor||"#FFFFFF";const f=/^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(c);f&&(c="#"+f[1]+f[1]+f[2]+f[2]+f[3]+f[3]);const g=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c);g&&(h=parseInt(g[1],16),o=parseInt(g[2],16),a=parseInt(g[3],16))}c!==void 0&&e&&s!==e&&(e.value=c),h!==void 0&&r&&s!==r&&(r.value=h),o!==void 0&&l&&s!==l&&(l.value=o),a!==void 0&&i&&s!==i&&(i.value=a)}function updateColorPreview(n){const e=document.getElementById("color-preview");e&&(e.style.backgroundColor=n)}function updateColorFromHex(n){/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(n)&&(colorPickerInstance&&colorPickerInstance.color.set(n),opaqueBackgroundColor=n,updateColorPreview(n))}function updateColorFromRgb(){const n=document.getElementById("rgb-r-input"),e=document.getElementById("rgb-g-input"),r=document.getElementById("rgb-b-input");if(!n||!e||!r)return;const l=parseInt(n.value)||0,i=parseInt(e.value)||0,s=parseInt(r.value)||0;if(l>=0&&l<=255&&i>=0&&i<=255&&s>=0&&s<=255){const c="#"+[l,i,s].map(h=>h.toString(16).padStart(2,"0")).join("");colorPickerInstance&&colorPickerInstance.color.set({r:l,g:i,b:s}),opaqueBackgroundColor=c,updateColorPreview(c)}}function showLicenseInfo(){const n=window.open("","_blank");if(!n){alert(t("alert.popupBlocked"));return}const e=n.document;e.title=t("license.pageTitle");const r=e.createElement("meta");r.name="viewport",r.content="width=device-width, initial-scale=1.0",e.head.appendChild(r);const l=e.createElement("style");l.textContent=`
            /* \u9875\u9762\u57FA\u7840\u6837\u5F0F\uFF1A\u91CD\u7F6E\u8FB9\u8DDD\uFF0C\u8BBE\u7F6E\u5B57\u4F53\u548C\u80CC\u666F */
            body {
                margin: 0;
                padding: 20px;
                font-family: Arial, sans-serif;
                background: white;
            }
            /* \u5185\u5BB9\u5BB9\u5668\uFF1A\u9650\u5236\u6700\u5927\u5BBD\u5EA6\u5E76\u5C45\u4E2D\u663E\u793A */
            .container {
                max-width: 900px;
                margin: 0 auto;
                padding: 20px 0;
            }
            /* \u4E3B\u6807\u9898\u6837\u5F0F\uFF1A\u6DF1\u7070\u8272\u5C45\u4E2D\u663E\u793A */
            .main-title {
                color: #333;
                text-align: center;
                margin-bottom: 30px;
                font-size: 2em;
            }
            /* \u526F\u6807\u9898\u6837\u5F0F\uFF1A\u84DD\u8272\u5E26\u4E0B\u5212\u7EBF\u5206\u9694 */
            .section-title {
                color: #0091ff;
                margin: 30px 0 15px 0;
                border-bottom: 2px solid #0091ff;
                padding-bottom: 5px;
            }
            /* \u94FE\u63A5\u6837\u5F0F\uFF1A\u84DD\u8272\u5E26\u4E0B\u5212\u7EBF */
            a {
                color: #0091ff;
                text-decoration: underline;
            }
            /* \u63CF\u8FF0\u6587\u672C\u6837\u5F0F\uFF1A\u7070\u8272\u659C\u4F53 */
            .description {
                color: #666;
                font-style: italic;
                margin-bottom: 15px;
            }
            /* \u8BB8\u53EF\u8BC1\u5185\u5BB9\u6837\u5F0F\uFF1A\u7B49\u5BBD\u5B57\u4F53\uFF0C\u54CD\u5E94\u5F0F\u5B57\u53F7\uFF0C\u6A2A\u5411\u6EDA\u52A8 */
            .license-content {
                white-space: pre;
                overflow-x: auto;
                container-type: inline-size;
                font-size: clamp(0.01rem, calc(100cqw / 70), 1.1rem);
                font-family: 'Courier New', monospace;
                background: #f8f8f8;
                padding: 25px;
                border-radius: 4px;
                border-left: 4px solid #0091ff;
                margin-bottom: 30px;
            }
            /* \u5B8C\u6574\u8BB8\u53EF\u8BC1\u94FE\u63A5\u6837\u5F0F */
            .license-link {
                margin: 15px 0;
            }
            .license-link a {
                color: #666;
                font-size: 0.9em;
            }
            /* \u957F\u8BB8\u53EF\u8BC1\u53EF\u5C55\u5F00\u5BB9\u5668 */
            #long-license {
                min-height: 100px;
                padding-bottom: 10px;
            }
            /* \u957F\u8BB8\u53EF\u8BC1\u5B8C\u6574\u6587\u672C\uFF08\u9ED8\u8BA4\u9690\u85CF\uFF09 */
            #long-license-full {
                display: none;
                overflow-x: auto;
                white-space: pre;
            }
            /* \u8BB8\u53EF\u8BC1\u5C55\u5F00/\u6536\u8D77\u6309\u94AE */
            .license-toggle-btn {
                display: block;
                background: transparent;
                color: #666;
                border: none;
                padding: 15px 0 0;
                cursor: pointer;
                font-size: 1rem;
            }
            /* \u5B8C\u6574\u8BB8\u53EF\u8BC1\u6587\u672C */
            .license-full-text {
                white-space: pre;
                margin: 0;
                font-family: 'Courier New', monospace;
            }
            /* ===== \u79FB\u52A8\u7AEF\u9002\u914D\uFF08\u2264768px\uFF09 ===== */
            @media (max-width: 768px) {
                body {
                    padding: 12px;
                }
                .container {
                    padding: 10px 0;
                }
                .main-title {
                    font-size: 1.4em;
                    margin-bottom: 20px;
                }
                .section-title {
                    font-size: 1.1em;
                    margin: 20px 0 10px 0;
                }
                .description {
                    font-size: 0.85em;
                }
                .license-content {
                    padding: 12px;
                    font-size: clamp(0.6rem, 3.5vw, 0.85rem);
                    white-space: pre-wrap;
                    word-break: break-all;
                }
                #long-license-full {
                    white-space: pre-wrap;
                }
                .license-toggle-btn {
                    padding: 12px 0 0;
                    font-size: 0.9rem;
                    min-height: 44px;
                }
                .license-full-text {
                    white-space: pre-wrap;
                    font-size: 0.75rem;
                }
                .license-link a {
                    font-size: 0.8em;
                }
            }
        `,e.head.appendChild(l);function i(I,u){const p=e.createElement("h2");p.className="section-title";const d=e.createElement("a");return d.href=u,d.target="_blank",d.textContent=I,p.appendChild(d),p}function s(I){const u=e.createElement("p");return u.className="description",u.textContent=I,u}function c(I){const u=e.createElement("div");return u.className="license-content",u.textContent=I,u}function h(I,u){const p=e.createElement("p");p.className="license-link";const d=e.createElement("a");return d.href=I,d.target="_blank",d.textContent=u||t("license.viewFull"),p.appendChild(d),p}function o(I,u){const p=e.createElement("div");p.id="long-license",p.className="license-content";const d=e.createElement("div");d.id="long-license-summary",d.textContent=I,p.appendChild(d);const m=e.createElement("div");m.id="long-license-full",p.appendChild(m);const E=e.createElement("button");E.id="toggle-long-license",E.className="license-toggle-btn",E.textContent=t("common.expand"),p.appendChild(E);let N=!1;return E.addEventListener("click",async function(){if(N)d.style.display="block",m.style.display="none",E.textContent=t("common.expand"),N=!1;else{if(!m.textContent.trim())try{const T=await fetch(u);if(T.ok){const S=await T.text(),C=e.createElement("pre");C.className="license-full-text",C.textContent=S,m.appendChild(C)}else logError(t("log.category.license"),t("log.msg.licenseLoadFailedHttp",{status:T.status})),m.textContent=t("license.loadFailed"),m.style.color="red"}catch(T){logError(t("log.category.license"),t("log.msg.licenseLoadFailed",{msg:T.message||T})),m.textContent=t("license.loadFailed"),m.style.color="red"}d.style.display="none",m.style.display="block",E.textContent=t("common.collapse"),N=!0}}),p}const a=e.createElement("div");a.className="container";const f=e.createElement("h1");f.className="main-title",f.textContent=t("license.title"),a.appendChild(f);const g=e.createElement("div");g.appendChild(i("Image-Obfuscation-Tool","https://github.com/cnpxs1/Image-obfuscation-tool")),g.appendChild(s(t("license.toolDesc"))),g.appendChild(c(`MIT License

Copyright \xA9 2026-present cnpxs1

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`)),a.appendChild(g);const O=e.createElement("div");O.appendChild(i("Viewer.js","https://github.com/fengyuanchen/viewerjs")),O.appendChild(s(t("license.viewerDesc"))),O.appendChild(c(`The MIT License (MIT)

Copyright 2015-present Chen Fengyuan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.`)),a.appendChild(O);const R=e.createElement("div");R.appendChild(i("fflate","https://github.com/101arrowz/fflate")),R.appendChild(s(t("license.fflateDesc"))),R.appendChild(c(`MIT License

Copyright (c) 2023 Arjun Barrett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`)),a.appendChild(R);const b=e.createElement("div");b.appendChild(i("iro.js","https://github.com/jaames/iro.js")),b.appendChild(s(t("license.iroDesc"))),b.appendChild(h("https://www.mozilla.org/en-US/MPL/2.0/",t("license.fullMpl"))),b.appendChild(o(`Mozilla Public License Version 2.0
==================================

...

Exhibit A - Source Code Form License Notice
-------------------------------------------

  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at http://mozilla.org/MPL/2.0/.

If it is not possible or desirable to put the notice in a particular
file, then You may include the notice in a location (such as a LICENSE
file in a relevant directory) where a recipient would be likely to look
for such a notice.

You may add additional accurate notices of copyright ownership.

Exhibit B - "Incompatible With Secondary Licenses" Notice
---------------------------------------------------------

  This Source Code Form is "Incompatible With Secondary Licenses", as
  defined by the Mozilla Public License, v. 2.0.`,"./assets/irojs/LICENSE")),a.appendChild(b),e.body.appendChild(a)}function parseColor(n){if(!n||typeof n!="string")return null;const e=n.trim();if(!e)return null;const r=o=>Math.max(0,Math.min(255,o)),l=o=>o.endsWith("%")?Math.round(parseFloat(o)*2.55):parseInt(o,10);let i,s,c;const h=e.match(/^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);if(h){let o=h[1];o.length===3&&(o=o[0]+o[0]+o[1]+o[1]+o[2]+o[2]),i=parseInt(o.substring(0,2),16),s=parseInt(o.substring(2,4),16),c=parseInt(o.substring(4,6),16)}else{const o=[/^rgba?\(\s*(\d+%?)\s*[, ]\s*(\d+%?)\s*[, ]\s*(\d+%?)\s*(?:[, ]\s*[\d.]+%?\s*)?\)$/i,/^(\d+%?)\s*,\s*(\d+%?)\s*,\s*(\d+%?)$/,/^(\d+%?)\s+(\d+%?)\s+(\d+%?)$/];let a=null;for(const f of o)if(a=e.match(f),a)break;a&&(i=l(a[1]),s=l(a[2]),c=l(a[3]))}return i!==void 0?{r:r(i),g:r(s),b:r(c)}:null}
