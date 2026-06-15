const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const CDP = require("chrome-remote-interface");

const DEBUG_PORT = 9222;
const DISCORD_EXES = ["Discord.exe", "DiscordPTB.exe", "DiscordCanary.exe"];

let mainWindow = null;
let discordProcess = null;
let cdpClient = null;
let scriptIdentifier = null;
let lastSettings = null;

// --- paths ---
function findDiscordPath(hint) {
    if (hint && fs.existsSync(hint)) return hint;
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) return null;
    const discordBase = path.join(localAppData, "Discord");
    if (!fs.existsSync(discordBase)) return null;
    for (const entry of fs.readdirSync(discordBase, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith("app-")) continue;
        for (const exe of DISCORD_EXES) {
            const full = path.join(discordBase, entry.name, exe);
            if (fs.existsSync(full)) return full;
        }
    }
    return null;
}

// --- CDP helpers ---
function getTargets(port) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${port}/json`, res => {
            let data = "";
            res.on("data", c => data += c);
            res.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on("error", reject);
    });
}

function findMainTarget(targets) {
    return targets.find(t =>
        t.type === "page" &&
        t.url && (t.url.includes("discord.com/channels") || t.url.includes("discordapp.com/channels"))
    );
}

async function connectToDiscord(port) {
    const targets = await getTargets(port);
    const target = findMainTarget(targets);
    if (!target) throw new Error("No Discord page target found");
    const client = await CDP({ target: target.id, port });
    await client.Page.enable();
    await client.Runtime.enable();
    return client;
}

// --- inject ---
function loadInjectScript() {
    const injectPath = path.join(__dirname, "inject.js");
    if (!fs.existsSync(injectPath)) throw new Error("inject.js not found");
    return fs.readFileSync(injectPath, "utf-8");
}

async function injectScript(client, script) {
    // Remove previous injection if any
    if (scriptIdentifier) {
        try {
            await client.Page.removeScriptToEvaluateOnNewDocument({ identifier: scriptIdentifier });
        } catch { /* ignore */ }
        scriptIdentifier = null;
    }

    const result = await client.Page.addScriptToEvaluateOnNewDocument({ source: script });
    scriptIdentifier = result.identifier;

    // Also evaluate it now on the current page
    await client.Runtime.evaluate({
        expression: script,
        awaitPromise: false,
    });
}

async function pushSettings(client, settings) {
    if (!client) return;
    try {
        await client.Runtime.evaluate({
            expression: `window.__jpRomajiUpdateSettings(${JSON.stringify(settings)})`,
        });
    } catch (e) {
        console.error("Failed to push settings:", e.message);
    }
}

// --- Discord lifecycle ---
async function launchDiscord(discordPath, port) {
    const exe = findDiscordPath(discordPath);
    if (!exe) throw new Error("Discord not found. Set the path in Advanced settings.");

    // Try to kill existing Discord instances
    for (const exe of DISCORD_EXES) {
        try {
            execSync(`taskkill /f /im ${exe} 2>nul`, { stdio: "ignore" });
        } catch { /* may not be running */ }
    }

    discordProcess = spawn(exe, [`--remote-debugging-port=${port}`], {
        detached: false,
        stdio: "ignore",
    });

    discordProcess.on("exit", code => {
        console.log("Discord exited with code", code);
        discordProcess = null;
        cdpClient = null;
        scriptIdentifier = null;
        if (mainWindow) mainWindow.webContents.send("disconnected");
    });

    // Wait for CDP to become available
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
            const targets = await getTargets(port);
            if (findMainTarget(targets)) return;
        } catch { /* not ready yet */ }
    }
    // Timed out — kill the orphaned Discord process
    try { discordProcess.kill(); } catch { /* ignore */ }
    discordProcess = null;
    throw new Error("Discord started but CDP did not become available");
}

async function tryConnect(existingPort) {
    try {
        const targets = await getTargets(existingPort);
        if (findMainTarget(targets)) return true;
    } catch { /* no connection */ }
    return false;
}

// --- main setup ---
async function setup(settings) {
    const port = settings.debugPort || DEBUG_PORT;
    const status = msg => {
        if (mainWindow) mainWindow.webContents.send("status", msg);
        console.log(msg);
    };

    status("Connecting to Discord…");

    let client = null;
    const alreadyRunning = await tryConnect(port);

    if (alreadyRunning) {
        status("Discord already running, connecting…");
        client = await connectToDiscord(port);
    } else {
        status("Launching Discord…");
        await launchDiscord(settings.discordPath, port);
        status("Discord started, connecting…");
        client = await connectToDiscord(port);
    }

    cdpClient = client;
    status("Connected! Injecting script…");

    const script = loadInjectScript();
    await injectScript(client, script);
    await pushSettings(client, settings);

    status("✓ Active");
    if (mainWindow) mainWindow.webContents.send("connected");
}

// --- Electron app ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 560,
        height: 640,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        title: "Japanese to Romaji — Injector",
    });

    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
    mainWindow.setMenuBarVisibility(false);

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();
});

// --- IPC handlers ---
ipcMain.on("settings-updated", (_event, settings) => {
    lastSettings = settings;
    if (cdpClient) {
        pushSettings(cdpClient, settings);
    } else {
        // First settings from renderer — start connecting
        setup(settings).catch(err => {
            console.error("Setup failed:", err);
            if (mainWindow) {
                mainWindow.webContents.send("status", `Error: ${err.message}`);
                mainWindow.webContents.send("disconnected");
            }
        });
    }
});

ipcMain.on("reconnect", async () => {
    if (mainWindow) mainWindow.webContents.send("status", "Reconnecting…");
    if (cdpClient) {
        try { await cdpClient.close(); } catch { /* ignore */ }
        cdpClient = null;
    }
    scriptIdentifier = null;
    if (lastSettings) {
        try {
            await setup(lastSettings);
            if (mainWindow) mainWindow.webContents.send("status", "✓ Reconnected");
        } catch (err) {
            if (mainWindow) {
                mainWindow.webContents.send("status", `Reconnect failed: ${err.message}`);
                mainWindow.webContents.send("disconnected");
            }
        }
    } else {
        if (mainWindow) {
            mainWindow.webContents.send("status", "No settings available — adjust a setting first");
            mainWindow.webContents.send("disconnected");
        }
    }
});

ipcMain.on("reinject", async () => {
    if (!cdpClient) {
        if (mainWindow) mainWindow.webContents.send("status", "Not connected");
        return;
    }
    try {
        const script = loadInjectScript();
        await injectScript(cdpClient, script);
        if (mainWindow) mainWindow.webContents.send("status", "✓ Re-injected");
    } catch (err) {
        if (mainWindow) mainWindow.webContents.send("status", `Re-inject failed: ${err.message}`);
    }
});

app.on("window-all-closed", () => {
    if (discordProcess) {
        try { discordProcess.kill(); } catch { /* ignore */ }
    }
    app.quit();
});
