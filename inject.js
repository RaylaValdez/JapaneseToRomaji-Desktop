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
    var kanjiRegex = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

    var particles = new Set(["\u306f", "\u304c", "\u3092", "\u306b", "\u3067", "\u3078", "\u306e", "\u3082", "\u3068", "\u3084", "\u304b", "\u306d", "\u3088", "\u306a", "\u305e", "\u305c", "\u308f", "\u3055"]);

    var forceOnKanji = new Set(["\u50d5", "\u56f3", "\u6c17", "\u672c"]);

    var suffixKanji = new Set(["\u541b", "\u69d8", "\u6bbf", "\u6c0f"]);

    var compoundReadings = {
        "\u9811\u5f35": "\u3070",
        "\u624b\u4f1d": "\u3064\u3060",
        "\u53cb\u9054": "\u3060\u3061",
    };

    var charOverrides = { "\u3092": "o" };

    // Compound word map (~150+ entries)
    var compoundsMap = {
        "\u4eca\u65e5": "kyou",
        "\u6628\u65e5": "kinou",
        "\u660e\u65e5": "ashita",
        "\u4e00\u6628\u65e5": "ototoi",
        "\u660e\u5f8c\u65e5": "asatte",
        "\u5927\u4eba": "otona",
        "\u53cb\u9054": "tomodachi",
        "\u604b\u4eba": "koibito",
        "\u5f7c\u6c0f": "kareshi",
        "\u5f7c\u5973": "kanojo",
        "\u4e00\u4eba": "hitori",
        "\u4e8c\u4eba": "futari",
        "\u81ea\u5206": "jibun",
        "\u4e00\u5fdc": "ichio",
        "\u6ca2\u5c71": "takusan",
        "\u6ca2\u5c71\u306e": "takusanno",
        "\u4eca\u5e74": "kotoshi",
        "\u53bb\u5e74": "kyonen",
        "\u6765\u5e74": "rainen",
        "\u6765\u9031": "raishuu",
        "\u5148\u9031": "senshuu",
        "\u4eca\u9031": "konshuu",
        "\u60c5\u5831": "jouhou",
        "\u96fb\u8a71": "denwa",
        "\u4f4f\u6240": "juusho",
        "\u540d\u524d": "namae",
        "\u8a95\u751f\u65e5": "tanjoubi",
        "\u5b66\u6821": "gakkou",
        "\u5148\u751f": "sensei",
        "\u5b66\u751f": "gakusei",
        "\u52c9\u5f37": "benkyou",
        "\u52c9\u5f37\u3057\u3066": "benkyoushite",
        "\u5bb6\u65cf": "kazoku",
        "\u5144\u5f1f": "kyoudai",
        "\u4f1a\u793e": "kaisha",
        "\u4ed5\u4e8b": "shigoto",
        "\u8da3\u5473": "shumi",
        "\u7406\u7531": "riyuu",
        "\u65b9\u6cd5": "houhou",
        "\u5929\u6c17": "tenki",
        "\u6c17\u6301\u3061": "kimochi",
        "\u6c17\u5206": "kibun",
        "\u6c17\u6e29": "kion",
        "\u6642\u9593": "jikan",
        "\u7d04\u675f": "yakusoku",
        "\u7d04\u675f\u3057\u3066": "yakusokushite",
        "\u8fd4\u4e8b": "henji",
        "\u8fd4\u4e8b\u3057\u3066": "henjishite",
        "\u9023\u7d61": "renraku",
        "\u9023\u7d61\u3057\u3066": "renrakushite",
        "\u5927\u4e08\u592b": "daijoubu",
        "\u5927\u5909": "taihen",
        "\u5927\u5207": "taisetsu",
        "\u5927\u597d\u304d": "daisuki",
        "\u5927\u5acc\u3044": "daikirai",
        "\u4e00\u756a": "ichiban",
        "\u4e00\u7dd2": "issho",
        "\u8272\u3005": "iroiro",
        "\u5931\u793c": "shitsurei",
        "\u5931\u793c\u3057\u307e\u3059": "shitsureishimasu",
        "\u672c\u5f53": "hontou",
        "\u672c\u5f53\u306b": "hontouni",
        "\u6bce\u65e5": "mainichi",
        "\u6bce\u9031": "maishuu",
        "\u4e00\u3064": "hitotsu",
        "\u4e8c\u3064": "futatsu",
        "\u4e09\u3064": "mittsu",
        "\u56db\u3064": "yottsu",
        "\u4e94\u3064": "itsutsu",
        "\u516d\u3064": "muttsu",
        "\u4e03\u3064": "nanatsu",
        "\u516b\u3064": "yattsu",
        "\u4e5d\u3064": "kokonotsu",
        "\u5341": "juu",
        "\u4f55\u4eba": "nannin",
        "\u5e7e\u3064": "ikutsu",
        "\u5e7e\u65e5": "ikunichi",
        "\u4f55\u6642": "nanji",
        "\u4f55\u6545": "naze",
        "\u4f55\u66dc\u65e5": "nanyoubi",
        "\u4f55\u65b9": "donata",
        "\u4f55\u51e6": "doko",
        "\u4f55\u308c": "dore",
        "\u4f55\u306e": "dono",
        "\u4f55\u304b": "nanika",
        "\u4f55\u3082": "nanimo",
        "\u8ab0\u304b": "dareka",
        "\u8ab0\u3082": "daremo",
        "\u5e7e\u4f55": "kura",
        "\u99c5\u524d": "ekimae",
        "\u75c5\u9662": "byouin",
        "\u56f3\u66f8\u9928": "toshokan",
        "\u535a\u7269\u9928": "hakubutsukan",
        "\u7f8e\u8853\u9928": "bijutsukan",
        "\u6559\u5ba4": "kyoushitsu",
        "\u4f53\u80b2\u9928": "taiikukan",
        "\u9280\u884c": "ginkou",
        "\u90f5\u4fbf\u5c40": "yuubinkyoku",
        "\u4ea4\u756a": "kouban",
        "\u795e\u793e": "jinja",
        "\u6559\u4f1a": "kyoukai",
        "\u5e97\u54e1": "tenin",
        "\u793e\u54e1": "shain",
        "\u4f1a\u793e\u54e1": "kaishain",
        "\u8b66\u5bdf": "keisatsu",
        "\u5e02\u5f79\u6240": "shiyakusho",
        "\u304a\u9858\u3044": "onegai",
        "\u304a\u9858\u3044\u3057\u307e\u3059": "onegaishimasu",
        "\u304a\u9858\u3044\u81f4\u3057\u307e\u3059": "onegaitashimasu",
        "\u9811\u5f35\u308b": "ganbaru",
        "\u9811\u5f35\u3063\u3066": "ganbatte",
        "\u9811\u5f35\u308c": "ganbare",
        "\u9811\u5f35\u308d\u3046": "ganbarou",
        "\u9811\u5f35\u308a\u307e\u3059": "ganbarimasu",
        "\u9811\u5f35\u3089\u306a\u3044": "ganbaranai",
        "\u624b\u4f1d\u3046": "tetsudau",
        "\u624b\u4f1d\u3063\u3066": "tetsudatte",
        "\u624b\u4f1d\u3044": "tetsudai",
        "\u624b\u4f1d\u3044\u307e\u3059": "tetsudaimasu",
        "\u8a71\u3057\u5408\u3046": "hanashiau",
        "\u8a71\u3057\u5408\u3063\u3066": "hanashiatte",
        "\u6301\u3061\u5e30\u308b": "mochikaeru",
        "\u6301\u3061\u5e30\u3063\u3066": "mochikaette",
        "\u5f15\u3063\u8d8a\u3059": "hikkosu",
        "\u5f15\u3063\u8d8a\u3057\u3066": "hikkoshite",
        "\u5f15\u3063\u8d8a\u3057": "hikkoshi",
        "\u7e70\u308a\u8fd4\u3059": "kurikaesu",
        "\u7e70\u308a\u8fd4\u3057\u3066": "kurikaeshite",
        "\u7acb\u3061\u4e0a\u304c\u308b": "tachiagaru",
        "\u98db\u3073\u51fa\u3059": "tobidasu",
        "\u98db\u3073\u51fa\u3057\u3066": "tobidashite",
        "\u601d\u3044\u51fa\u3059": "omoidasu",
        "\u601d\u3044\u51fa\u3057\u3066": "omoidashite",
        "\u898b\u3064\u3051\u308b": "mitsukeru",
        "\u898b\u3064\u3051\u3066": "mitsukete",
        "\u898b\u3064\u304b\u308b": "mitsukaru",
        "\u8fd1\u3065\u304f": "chikazuku",
        "\u8fd1\u3065\u3044\u3066": "chikazuite",
        "\u4f5c\u308a\u51fa\u3059": "tsukuridasu",
        "\u66f8\u304d\u8fbc\u3080": "kakikomu",
        "\u66f8\u304d\u8fbc\u3093\u3067": "kakikonde",
        "\u843d\u3061\u7740\u304f": "ochitsuku",
        "\u843d\u3061\u7740\u3044\u3066": "ochitsuite",
    };

    function lookupCompound(text, pos) {
        var best = null;
        var candidate = "";
        for (var ci = pos; ci < text.length; ci++) {
            candidate += text[ci];
            var reading = compoundsMap[candidate];
            if (reading) best = { match: candidate, reading: reading };
        }
        return best;
    }

    function containsJapanese(text) { return japaneseRegex.test(text); }

    function isSmallKana(char) { return smallKanaRegex.test(char); }

    function escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function renderCompoundHtml(matchText, reading) {
        var inner = "";
        for (var ci = 0; ci < matchText.length; ci++) {
            var ch = matchText[ci];
            if (kanjiRegex.test(ch)) {
                inner += "<ruby data-kanji=\"" + ch + "\">" + ch + "</ruby>";
            } else {
                inner += escapeHtml(ch);
            }
        }
        return "<span style=\"display:inline-flex;flex-direction:column;align-items:center;vertical-align:top;line-height:1.3\">" +
            "<span>" + inner + "</span>" +
            "<span style=\"font-size:var(--jp-ruby-font-size,0.75em);line-height:1.1;opacity:0.65;display:block;text-align:center;letter-spacing:0\">" + reading + "</span></span>";
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
        var result = "", i = 0;
        while (i < text.length) {
            var char = text[i];
            if (japaneseRegex.test(char)) {
                var nameMatch = lookupNameOverride(text, i);
                if (nameMatch) {
                    if (!settings.annotateKana && !settings.annotateKanji) {
                        result += escapeHtml(nameMatch.name);
                    } else {
                        result += renderCompoundHtml(nameMatch.name, nameMatch.reading);
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
                                ? "<ruby>" + c + "<rt>" + reading + "</rt></ruby> "
                                : escapeHtml(c);
                        } else {
                            result += escapeHtml(c);
                        }
                    } else {
                        if (settings.annotateKanji) {
                            // 1. Check for compound word starting at this position
                            var compound = lookupCompound(jpBlock, j);
                            if (compound) {
                                // Try to split compound reading per-character by matching all possible readings
                                var perCharReadings = [];
                                var remaining = compound.reading;
                                var canSplit = true;
                                for (var ci = 0; ci < compound.match.length; ci++) {
                                    var cch = compound.match[ci];
                                    var candidates = [];
                                    if (kanjiRegex.test(cch)) {
                                        if (ci > 0) {
                                            var pairKana = compoundReadings[compound.match[ci - 1] + cch];
                                            if (pairKana) candidates.push(toRomaji(pairKana));
                                        }
                                        var dictEntry = lookupKanji(cch);
                                        if (dictEntry) {
                                            for (var oi = 0; oi < dictEntry.on.length; oi++) candidates.push(toRomaji(dictEntry.on[oi]));
                                            for (var ki = 0; ki < dictEntry.kun.length; ki++) {
                                                var kd = dictEntry.kun[ki];
                                                var dot = kd.lastIndexOf(".");
                                                var stem = dot >= 0 ? kd.slice(0, dot) : kd;
                                                candidates.push(toRomaji(stem));
                                            }
                                        }
                                    } else {
                                        candidates.push(toRomaji(cch));
                                    }
                                    var matched = "";
                                    for (var ci2 = 0; ci2 < candidates.length; ci2++) {
                                        if (candidates[ci2] && remaining.startsWith(candidates[ci2])) {
                                            matched = candidates[ci2];
                                            break;
                                        }
                                    }
                                    if (!matched) { canSplit = false; break; }
                                    perCharReadings.push(matched);
                                    remaining = remaining.slice(matched.length);
                                }
                                if (canSplit && remaining === "") {
                                    for (var ci = 0; ci < compound.match.length; ci++) {
                                        var cch = compound.match[ci];
                                        var cr = perCharReadings[ci];
                                        if (kanjiRegex.test(cch)) {
                                            result += "<ruby data-kanji=\"" + cch + "\">" + cch + "<rt>" + cr + "</rt></ruby> ";
                                        } else if (kanaRegex.test(cch) && settings.annotateKana) {
                                            result += "<ruby>" + cch + "<rt>" + cr + "</rt></ruby> ";
                                        } else {
                                            result += escapeHtml(cch);
                                        }
                                    }
                                } else {
                                    result += renderCompoundHtml(compound.match, compound.reading);
                                }
                                j += compound.match.length - 1;
                                continue;
                            }

                            // 2. Collect okurigana (consecutive hiragana after this kanji)
                            var okurigana = "";
                            var k = j + 1;
                            while (k < jpBlock.length && hiraganaRegex.test(jpBlock[k])) {
                                okurigana += jpBlock[k];
                                k++;
                            }

                            // 3. If the collected hiragana are entirely grammatical particles, it's not okurigana
                            if (okurigana && okurigana.split("").every(function (ch) { return particles.has(ch); })) {
                                okurigana = "";
                            }

                            // 4. Determine reading preference
                            var nextIsKana = !!okurigana;
                            var nextNext = okurigana ? okurigana[0] : (jpBlock[j + 1] || "");
                            var nextIsKanji = nextNext && japaneseRegex.test(nextNext) && !kanaRegex.test(nextNext);
                            var pref = nextIsKana ? "kun" : nextIsKanji ? "on" : settings.readingPreference;
                            if (c === "\u6b73" && /[0-9]/.test(text.slice(jpStart + j - 1, jpStart + j) || "")) pref = "on";
                            if (forceOnKanji.has(c)) pref = "on";

                            // 5. Compute reading via compound override → suffix → dictionary
                            var reading = null;
                            if (j > 0) {
                                var compoundKana = compoundReadings[jpBlock[j - 1] + c];
                                if (compoundKana) reading = toRomaji(compoundKana);
                            }
                            if (!reading && suffixKanji.has(c) && j > 0 && !okurigana && j === jpBlock.length - 1) {
                                reading = getKanjiReading(c, "on");
                            }
                            if (!reading) reading = getKanjiReading(c, pref, okurigana || undefined);

                            if (reading) {
                                result += "<ruby data-kanji=\"" + c + "\">" + c + "<rt>" + reading + "</rt></ruby> ";
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
        char = char[0] || "";
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
