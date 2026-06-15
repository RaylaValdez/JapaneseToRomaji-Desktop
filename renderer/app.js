const DEFAULTS = {
    discordPath: "",
    debugPort: 9222,
    dictUrl: "https://raw.githubusercontent.com/RaylaValdez/jp-kanji/refs/heads/main/kanji.json",
    kanaUrl: "https://raw.githubusercontent.com/RaylaValdez/jp-kanji/refs/heads/main/kana.json",
    annotateKanji: true,
    annotateKana: true,
    showTooltip: true,
    annotateUsernames: true,
    readingPreference: "kun",
    rubyFontSize: 75,
    tooltipFontSize: 85,
};

function loadSettings() {
    try {
        const raw = localStorage.getItem("jp-romaji-injector-settings");
        return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
        return { ...DEFAULTS };
    }
}

function saveSettings() {
    const s = {};
    for (const k of Object.keys(DEFAULTS)) s[k] = settings[k];
    localStorage.setItem("jp-romaji-injector-settings", JSON.stringify(s));
    return s;
}

const settings = loadSettings();

const { ipcRenderer } = require("electron");

// --- DOM refs ---
const statusEl = document.getElementById("status");
const connectStatusEl = document.getElementById("connect-status");

// --- send settings to main process ---
function pushSettings() {
    ipcRenderer.send("settings-updated", saveSettings());
}

// --- restore UI from settings ---
function restoreUI() {
    for (const [key, value] of Object.entries(settings)) {
        const el = document.getElementById(`setting-${key}`);
        if (!el) continue;
        if (el.type === "checkbox") el.checked = value;
        else if (el.type === "range") {
            el.value = value;
            const label = document.getElementById(`label-${key}`);
            if (label) label.textContent = `${value}%`;
        } else el.value = value;
    }
}

function setupUI() {
    for (const key of Object.keys(DEFAULTS)) {
        const el = document.getElementById(`setting-${key}`);
        if (!el) continue;

        el.addEventListener("change", () => {
            if (el.type === "checkbox") settings[key] = el.checked;
            else if (el.type === "range") {
                settings[key] = Number(el.value);
                const label = document.getElementById(`label-${key}`);
                if (label) label.textContent = `${el.value}%`;
            } else if (key === "readingPreference") settings[key] = el.value;
            else settings[key] = el.value;

            pushSettings();
        });

        if (el.type === "range") {
            el.addEventListener("input", () => {
                settings[key] = Number(el.value);
                const label = document.getElementById(`label-${key}`);
                if (label) label.textContent = `${el.value}%`;
            });
        }
    }

    // Reset buttons
    document.getElementById("reset-discordPath")?.addEventListener("click", () => {
        const el = document.getElementById("setting-discordPath");
        if (el) {
            el.value = "";
            settings.discordPath = "";
            pushSettings();
        }
    });
    document.getElementById("reset-dictUrl")?.addEventListener("click", () => {
        const el = document.getElementById("setting-dictUrl");
        if (el) {
            el.value = DEFAULTS.dictUrl;
            settings.dictUrl = DEFAULTS.dictUrl;
            pushSettings();
        }
    });
    document.getElementById("reset-kanaUrl")?.addEventListener("click", () => {
        const el = document.getElementById("setting-kanaUrl");
        if (el) {
            el.value = DEFAULTS.kanaUrl;
            settings.kanaUrl = DEFAULTS.kanaUrl;
            pushSettings();
        }
    });
    document.getElementById("btn-reconnect")?.addEventListener("click", () => {
        ipcRenderer.send("reconnect");
    });
    document.getElementById("btn-reinject")?.addEventListener("click", () => {
        ipcRenderer.send("reinject");
    });
}

// --- IPC from main process ---
ipcRenderer.on("status", (_event, msg) => {
    statusEl.textContent = msg;
});

ipcRenderer.on("connected", () => {
    connectStatusEl.className = "connect-status connected";
    connectStatusEl.textContent = "Connected to Discord";
});

ipcRenderer.on("disconnected", () => {
    connectStatusEl.className = "connect-status disconnected";
    connectStatusEl.textContent = "Not connected to Discord";
});

// --- startup ---
restoreUI();
setupUI();
pushSettings();
