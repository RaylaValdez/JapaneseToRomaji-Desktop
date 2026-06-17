/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Japanese to Romaji — injected into Discord via CDP
(function () {
    if (window.__jpRomajiLoaded) return;
    window.__jpRomajiLoaded = true;

    // ===== SETTINGS =====
    const defaults = {
        annotateKanji: true,
        annotateKana: true,
        showTooltip: true,
        annotateUsernames: true,
        readingPreference: "kun",
        rubyFontSize: 75,
        tooltipFontSize: 85,
    };

    const settings = { ...defaults };

    window.__jpRomajiUpdateSettings = function (s) {
        const changed = JSON.stringify(settings) !== JSON.stringify({ ...settings, ...s });
        Object.assign(settings, s);
        if (changed) scheduleScan();
    };

    // ===== KANA LOGIC =====
    let kanaMap = {};
    let kanaReady = false;
    const kanaCallbacks = [];

    function onKanaReady(cb) {
        if (kanaReady) { cb(); return; }
        kanaCallbacks.push(cb);
    }

    async function loadKanaMap(url) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("HTTP " + res.status);
            kanaMap = await res.json();
            kanaReady = true;
            kanaCallbacks.splice(0).forEach(function (cb) { cb(); });
        } catch (e) {
            console.error("[JpRomaji Inject] Failed to load kana map:", e);
            setTimeout(function () { loadKanaMap(url); }, 30000);
        }
    }

    function toRomaji(text) {
        if (!kanaReady) return text;
        var result = "", i = 0;
        while (i < text.length) {
            var two = text.slice(i, i + 2);
            if (two in kanaMap) { result += kanaMap[two]; i += 2; continue; }
            var one = text[i];
            if (one in kanaMap) { result += kanaMap[one]; i += 1; continue; }
            if (one === "\u3063" || one === "\u30c3") {
                var next = text[i + 1];
                if (next && next in kanaMap) result += kanaMap[next][0];
                else result += "t";
                i += 1; continue;
            }
            result += one; i += 1;
        }
        return result;
    }

    // ===== KANJI LOGIC =====
    let kanjiDict = {};
    let dictReady = false;
    const dictCallbacks = [];
    var readingCache = new Map();

    function onReady(cb) {
        if (dictReady) { cb(); return; }
        dictCallbacks.push(cb);
    }

    async function loadDict(url) {
        try {
            var res = await fetch(url);
            if (!res.ok) throw new Error("HTTP " + res.status);
            kanjiDict = await res.json();
            dictReady = true;
            dictCallbacks.splice(0).forEach(function (cb) { cb(); });
        } catch (e) {
            console.error("[JpRomaji Inject] Failed to load kanji dict:", e);
            setTimeout(function () { loadDict(url); }, 30000);
        }
    }

    const nameOverrides = {
        "天道 剣": "Tendou Tsurugi",
    };

    function lookupNameOverride(text, pos) {
        var remaining = text.slice(pos);
        for (var key in nameOverrides) {
            if (nameOverrides.hasOwnProperty(key) && remaining.startsWith(key)) {
                return { name: key, reading: nameOverrides[key] };
            }
        }
        return null;
    }

    function stripOkurigana(reading) {
        var dot = reading.lastIndexOf(".");
        return dot >= 0 ? reading.slice(0, dot) : reading;
    }

    function lookupKanji(char) {
        var entry = kanjiDict[char];
        if (!entry) return undefined;
        return { on: entry.o || [], kun: entry.k || [], meanings: entry.m || [] };
    }

    function getKanjiReading(char, preference, okurigana) {
        if (!dictReady) return "";
        if (!preference) preference = "kun";
        var key = char + preference + (okurigana || "");
        var cached = readingCache.get(key);
        if (cached !== undefined) return cached;
        var raw = kanjiDict[char];
        if (!raw) { readingCache.set(key, ""); return ""; }
        var info = { o: raw.o || [], k: raw.k || [], m: raw.m || [] };
        if (preference === "on") {
            if (info.o.length > 0) { var r = toRomaji(info.o[0]); readingCache.set(key, r); return r; }
            if (info.k.length > 0) { var stem = stripOkurigana(info.k[0]); var r = toRomaji(stem); readingCache.set(key, r); return r; }
        } else {
            if (info.k.length > 0) {
                if (okurigana) {
                    for (var ri = 0; ri < info.k.length; ri++) {
                        var rv = info.k[ri];
                        var dot = rv.lastIndexOf(".");
                        if (dot >= 0 && rv.slice(dot + 1) === okurigana) {
                            var stem = rv.slice(0, dot);
                            var reading = toRomaji(stem);
                            readingCache.set(key, reading);
                            return reading;
                        }
                    }
                }
                var stem = stripOkurigana(info.k[0]);
                var r = toRomaji(stem);
                readingCache.set(key, r);
                return r;
            }
            if (info.o.length > 0) { var r = toRomaji(info.o[0]); readingCache.set(key, r); return r; }
        }
        readingCache.set(key, "");
        return "";
    }

    // ===== ROMAJI LOGIC =====
    var japaneseRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
    var kanaRegex = /[\u3040-\u30ff]/;
    var hiraganaRegex = /[\u3040-\u309f]/;
    var smallKanaRegex = /[\u3041\u3043\u3045\u3047\u3049\u3083\u3085\u3087\u308e\u30a1\u30a3\u30a5\u30a7\u30a9\u30e3\u30e5\u30e7\u30ee]/;

    var forceOnKanji = new Set(["\u50d5"]);

    var wordOverrides = {
        "\u3053\u3093\u306b\u3061\u306f": "konnichiwa",
        "\u3053\u3093\u3070\u3093\u306f": "konbanwa",
        "\u3042\u308a\u304c\u3068\u3046": "arigatou",
        "\u304a\u306f\u3088\u3046": "ohayou",
        "\u304a\u3084\u3059\u307f": "oyasumi",
        "\u3044\u305f\u3060\u304d\u307e\u3059": "itadakimasu",
        "\u304a\u9858\u3044\u3057\u307e\u3059": "onegaishimasu",
        "\u3059\u307f\u307e\u305b\u3093": "sumimasen",
    };
    var charOverrides = { "\u3092": "o" };

    function containsJapanese(text) { return japaneseRegex.test(text); }

    function isSmallKana(char) { return smallKanaRegex.test(char); }

    function escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function getCharReading(char, nextChar, isLast) {
        if (charOverrides[char]) return charOverrides[char];
        if (char === "\u306f" && (isLast || !kanaRegex.test(nextChar))) return "wa";
        if (char === "\u3078" && (isLast || !kanaRegex.test(nextChar))) return "e";
        if (char === "\u3063" || char === "\u30c3") {
            if (!nextChar || !kanaRegex.test(nextChar)) return "\u3063";
            var nr = toRomaji(nextChar);
            return nr ? nr[0] : "\u3063";
        }
        var r = toRomaji(char);
        return r || char;
    }

    function renderRubyText(text) {
        if (wordOverrides[text]) {
            if (!settings.annotateKana && !settings.annotateKanji) return escapeHtml(text);
            return "<ruby>" + text + "<rt>" + wordOverrides[text] + "</rt></ruby>";
        }
        var result = "", i = 0;
        while (i < text.length) {
            var char = text[i];
            if (japaneseRegex.test(char)) {
                var nameMatch = lookupNameOverride(text, i);
                if (nameMatch) {
                    if (!settings.annotateKana && !settings.annotateKanji) {
                        result += escapeHtml(nameMatch.name);
                    } else {
                        result += "<ruby>" + escapeHtml(nameMatch.name) + "<rt>" + nameMatch.reading + "</rt></ruby>";
                    }
                    i += nameMatch.name.length;
                    continue;
                }

                var jpStart = i;
                while (i < text.length && japaneseRegex.test(text[i])) {
                    if (i + 1 < text.length && isSmallKana(text[i + 1])) i += 2;
                    else i += 1;
                }
                var jpBlock = text.slice(jpStart, i);
                var isLast = i >= text.length || !japaneseRegex.test(text[i]);
                if (wordOverrides[jpBlock]) {
                    if (!settings.annotateKana && !settings.annotateKanji) {
                        result += escapeHtml(jpBlock);
                    } else {
                        result += "<ruby>" + jpBlock + "<rt>" + wordOverrides[jpBlock] + "</rt></ruby>";
                    }
                    continue;
                }
                for (var j = 0; j < jpBlock.length; j++) {
                    var c = jpBlock[j];
                    var next = j + 1 < jpBlock.length ? jpBlock[j + 1] : "";
                    var isLastInBlock = j === jpBlock.length - 1 && isLast;
                    if (j + 1 < jpBlock.length && isSmallKana(jpBlock[j + 1])) {
                        var digraph = c + jpBlock[j + 1];
                        if (settings.annotateKana) {
                            var reading = toRomaji(digraph);
                            result += reading && reading !== digraph
                                ? "<ruby>" + digraph + "<rt>" + reading + "</rt></ruby>"
                                : escapeHtml(digraph);
                        } else {
                            result += escapeHtml(digraph);
                        }
                        j++;
                    } else if (kanaRegex.test(c)) {
                        if (settings.annotateKana) {
                            var reading = getCharReading(c, next, isLastInBlock);
                            result += reading !== c
                                ? "<ruby>" + c + "<rt>" + reading + "</rt></ruby>"
                                : escapeHtml(c);
                        } else {
                            result += escapeHtml(c);
                        }
                    } else {
                        if (settings.annotateKanji) {
                            var okurigana = "";
                            var k = j + 1;
                            while (k < jpBlock.length && hiraganaRegex.test(jpBlock[k])) {
                                okurigana += jpBlock[k];
                                k++;
                            }
                            var nextIsKana = !!okurigana;
                            var nextNext = okurigana ? okurigana[0] : (jpBlock[j + 1] || "");
                            var nextIsKanji = nextNext && japaneseRegex.test(nextNext) && !kanaRegex.test(nextNext);
                            var pref = nextIsKana ? "kun" : nextIsKanji ? "on" : settings.readingPreference;
                            if (c === "\u6b73" && /[0-9]/.test(text.slice(jpStart + j - 1, jpStart + j) || "")) pref = "on";
                            if (forceOnKanji.has(c)) pref = "on";
                            var reading = getKanjiReading(c, pref, okurigana || undefined);
                            if (reading) {
                                result += "<ruby data-kanji=\"" + c + "\">" + c + "<rt>" + reading + "</rt></ruby>";
                            } else {
                                result += escapeHtml(c);
                            }
                        } else {
                            result += escapeHtml(c);
                        }
                    }
                }
            } else {
                var end = i;
                while (end < text.length && !japaneseRegex.test(text[end])) end++;
                result += escapeHtml(text.slice(i, end));
                i = end;
            }
        }
        return result;
    }

    // ===== CSS =====
    function injectStyles() {
        if (document.getElementById("jp-romaji-styles")) return;
        var style = document.createElement("style");
        style.id = "jp-romaji-styles";
        style.textContent = [
            "[data-jp-ruby] ruby, .jp-kanji-tooltip ruby { display: inline-flex; flex-direction: column; align-items: center; vertical-align: top; line-height: 1.3; }",
            "[data-jp-ruby] rt { font-size: var(--jp-ruby-font-size, 0.75em); line-height: 1.1; opacity: 0.65; display: block; text-align: center; letter-spacing: 0; }",
            ".jp-kanji-tooltip rt { opacity: 1; font-size: inherit; line-height: 1.1; display: block; text-align: center; letter-spacing: 0; }",
            "[data-jp-ruby] [data-kanji] { cursor: help; }",
            ".jp-kanji-tooltip { background: var(--background-floating, #111214); border: 1px solid var(--background-accent, #2b2d31); border-radius: 8px; padding: 10px 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); line-height: 1.5; min-width: 140px; color: var(--text-normal, #dbdee1); }",
            ".jp-kanji-tooltip-char { font-size: 1.8em; margin-bottom: 4px; text-align: center; }",
            ".jp-kanji-link { color: inherit; text-decoration: none; }",
            ".jp-kanji-link:hover { text-decoration: underline; }",
            ".jp-kanji-tooltip-row { display: flex; gap: 6px; }",
            ".jp-kanji-tooltip-label { opacity: 0.5; min-width: 1.5em; }",
        ].join("\n");
        document.head.appendChild(style);
    }

    // ===== TOOLTIP =====
    var tooltipEl = null;
    var hideTimeout = null;

    function scheduleHide() {
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(function () {
            hideTooltip();
            hideTimeout = null;
        }, 500);
    }

    function cancelHide() {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
    }

    function showTooltip(state) {
        if (!tooltipEl || !document.body.contains(tooltipEl)) {
            tooltipEl = document.createElement("div");
            tooltipEl.className = "jp-kanji-tooltip";
            tooltipEl.addEventListener("mouseenter", cancelHide);
            tooltipEl.addEventListener("mouseleave", scheduleHide);
            document.body.appendChild(tooltipEl);
        }
        var { info } = state;
        var jishoUrl = "https://jisho.org/search/" + encodeURIComponent(state.kanji) + "%20%23kanji";
        var html = "<div class=\"jp-kanji-tooltip-char\"><a href=\"" + jishoUrl + "\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"jp-kanji-link\">" + escapeHtml(state.kanji) + "</a></div>";
        if (info.kun.length > 0) {
            html += "<div class=\"jp-kanji-tooltip-row\"><span class=\"jp-kanji-tooltip-label\">\u8a13</span><span>";
            html += info.kun.map(function (r) {
                var stem = stripOkurigana(r);
                var romaji = toRomaji(stem);
                return "<ruby>" + stem + "<rt>" + romaji + "</rt></ruby>";
            }).join("\u3001");
            html += "</span></div>";
        }
        if (info.on.length > 0) {
            html += "<div class=\"jp-kanji-tooltip-row\"><span class=\"jp-kanji-tooltip-label\">\u97f3</span><span>";
            html += info.on.map(function (r) {
                var romaji = toRomaji(r);
                return "<ruby>" + r + "<rt>" + romaji + "</rt></ruby>";
            }).join("\u3001");
            html += "</span></div>";
        }
        html += "<div class=\"jp-kanji-tooltip-row\" style=\"opacity:0.7\"><span>" + info.meanings.join(", ") + "</span></div>";

        tooltipEl.style.cssText = [
            "position: fixed",
            "left: " + state.x + "px",
            "top: " + state.y + "px",
            "transform: translateY(-100%)",
            "z-index: 10000",
            "pointer-events: auto",
            "font-size: " + (settings.tooltipFontSize / 100) + "em",
        ].join("; ");
        tooltipEl.innerHTML = html;
        cancelHide();
    }

    function hideTooltip() {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
        if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    }

    // ===== DOM SCANNER =====
    var scanTimer = null;
    var processedElements = new WeakSet();

    function scheduleScan() {
        if (scanTimer) clearTimeout(scanTimer);
        scanTimer = setTimeout(scanDOM, 400);
    }

    function isInTextArea(el) {
        return !!el.closest('[class*="channelTextArea"], [class*="slateContainer"], [class*="slateTextArea"]');
    }

    function isInSidebar(el) {
        return !!el.closest('[class*="membersWrap"], [class*="membersGroup"], [class*="sidebar"]');
    }

    function isInMessage(el) {
        return !!el.closest('[class*="message"]');
    }

    function scanDOM() {
        scanTimer = null;
        var appMount = document.getElementById("app-mount");
        if (!appMount) return;

        if (!settings.annotateKanji && !settings.annotateKana) return;

        var rubyFontSize = (settings.rubyFontSize / 100) + "em";
        appMount.style.setProperty("--jp-ruby-font-size", rubyFontSize);

        var messageParts = appMount.querySelectorAll('[class*="messageContent"]');
        messageParts.forEach(function (el) {
            if (processedElements.has(el)) return;
            if (isInTextArea(el)) return;
            processElement(el);
        });

        if (settings.annotateUsernames) {
            var usernameEls = appMount.querySelectorAll('[class*="username"]');
            usernameEls.forEach(function (el) {
                if (processedElements.has(el)) return;
                if (isInTextArea(el)) return;
                if (isInSidebar(el)) return;
                if (!containsJapanese(el.textContent || "")) return;
                processElement(el);
            });
        }
    }

    function processElement(container) {
        var existing = container.querySelectorAll("[data-jp-ruby]");
        for (var si = 0; si < existing.length; si++) {
            var span = existing[si];
            var original = span.getAttribute("data-original-text") || span.textContent || "";
            var text = document.createTextNode(original);
            span.parentNode.replaceChild(text, span);
        }

        var textNodes = [];
        var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                if (node.parentElement && node.parentElement.closest("[data-jp-ruby]"))
                    return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        var node;
        while ((node = walker.nextNode())) {
            if (containsJapanese(node.textContent || "")) {
                textNodes.push(node);
            }
        }

        textNodes.forEach(function (textNode) {
            var parent = textNode.parentElement;
            if (!parent || parent.closest("[data-jp-ruby]")) return;

            var html = renderRubyText(textNode.textContent || "");
            if (html === escapeHtml(textNode.textContent || "")) return;

            var span = document.createElement("span");
            span.setAttribute("data-jp-ruby", "");
            span.setAttribute("data-original-text", textNode.textContent || "");
            span.innerHTML = html;
            textNode.parentNode.replaceChild(span, textNode);
        });

        processedElements.add(container);
    }

    // ===== OBSERVER =====
    function startObserver() {
        var target = document.getElementById("app-mount") || document.body;
        var observer = new MutationObserver(function (mutations) {
            var needsRescan = false;
            for (var m = 0; m < mutations.length; m++) {
                var mut = mutations[m];
                if (mut.type === "childList") {
                    needsRescan = true;
                    break;
                }
                if (mut.type === "characterData") {
                    var node = mut.target;
                    if (node.nodeType === 3 && node.parentElement) {
                        if (isInTextArea(node.parentElement)) continue;
                        if (isInSidebar(node.parentElement)) continue;
                        var container = node.parentElement.closest(
                            '[class*="messageContent"], [class*="username"]'
                        );
                        if (container) {
                            processedElements.delete(container);
                            needsRescan = true;
                        }
                    }
                }
            }
            if (needsRescan) scheduleScan();
        });
        observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        scheduleScan();

        setInterval(scheduleScan, 3000);
    }

    // ===== TOOLTIP EVENT DELEGATION =====
    document.addEventListener("mouseover", function (e) {
        if (!settings.showTooltip) return;
        var target = e.target.closest("[data-kanji]");
        if (!target) return;
        var char = target.getAttribute("data-kanji");
        if (!char) return;
        var info = lookupKanji(char);
        if (info) {
            cancelHide();
            showTooltip({
                x: Math.min(e.clientX, window.innerWidth - 160),
                y: Math.max(40, e.clientY),
                kanji: char,
                info: info,
            });
        }
    });

    document.addEventListener("mouseout", function (e) {
        if (!settings.showTooltip) return;
        var target = e.target && e.target.closest ? e.target.closest("[data-kanji]") : null;
        if (!target) return;
        var related = e.relatedTarget;
        if (related && related.closest && related.closest("[data-kanji]")) return;
        scheduleHide();
    });

    // ===== STARTUP =====
    function waitForAppMount() {
        if (document.getElementById("app-mount")) {
            injectStyles();

            if (window.__jpRomajiEmbedded) {
                kanjiDict = window.__jpRomajiEmbedded.kanji;
                kanaMap = window.__jpRomajiEmbedded.kana;
                dictReady = true;
                kanaReady = true;
                dictCallbacks.splice(0).forEach(function (cb) { cb(); });
                kanaCallbacks.splice(0).forEach(function (cb) { cb(); });
            } else {
                loadDict("https://raw.githubusercontent.com/RaylaValdez/jp-kanji/refs/heads/main/kanji.json");
                loadKanaMap("https://raw.githubusercontent.com/RaylaValdez/jp-kanji/refs/heads/main/kana.json");
            }

            var bothReady = function () {
                processedElements = new WeakSet();
                scheduleScan();
            };
            var ready = function () {
                if (kanaReady && dictReady) bothReady();
            };
            onReady(ready);
            onKanaReady(ready);

            setTimeout(function () {
                if (!dictReady || !kanaReady) {
                    processedElements = new WeakSet();
                    scheduleScan();
                }
            }, 10000);

            startObserver();
        } else {
            setTimeout(waitForAppMount, 500);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", waitForAppMount);
    } else {
        waitForAppMount();
    }
})();
