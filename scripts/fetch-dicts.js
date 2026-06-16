const fs = require("fs");
const path = require("path");
const https = require("https");

const BASE = "https://raw.githubusercontent.com/RaylaValdez/jp-kanji/refs/heads/main";
const FILES = [
    { name: "kanji.json", url: BASE + "/kanji.json" },
    { name: "kana.json", url: BASE + "/kana.json" },
];

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, res => {
            if (res.statusCode !== 200) {
                file.close();
                fs.unlinkSync(dest);
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            res.pipe(file);
            file.on("finish", () => { file.close(); resolve(); });
        }).on("error", err => {
            file.close();
            fs.unlinkSync(dest, () => {});
            reject(err);
        });
    });
}

(async () => {
    const root = path.resolve(__dirname, "..");
    let anyFailed = false;
    for (const f of FILES) {
        const dest = path.join(root, f.name);
        if (fs.existsSync(dest)) {
            console.log(`[fetch-dicts] ${f.name} already exists, skipping`);
            continue;
        }
        console.log(`[fetch-dicts] Downloading ${f.name}...`);
        try {
            await download(f.url, dest);
            console.log(`[fetch-dicts] ${f.name} saved`);
        } catch (err) {
            console.error(`[fetch-dicts] Failed to download ${f.name}: ${err.message}`);
            anyFailed = true;
        }
    }
    if (anyFailed) {
        console.warn("[fetch-dicts] Some dictionaries could not be downloaded. The app will fall back to fetching from GitHub at runtime.");
    }
})();
