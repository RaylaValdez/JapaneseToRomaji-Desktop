# Japanese to Romaji Injector

A desktop tool that injects romaji reading annotations into Discord messages containing Japanese text, using Electron and the Chrome DevTools Protocol.

## Features

- **Ruby annotations** - Japanese kanji and kana in chat messages are wrapped with `<ruby>` tags showing their romaji readings
- **Hover tooltips** - Hover over any kanji to see its kun'yomi / on'yomi readings and English meanings
- **Configurable** - Toggle annotations for kanji, kana, and usernames independently; choose reading preference; adjust font sizes
- **Live updates** - Automatically annotates new messages as they appear; reacts to message edits

## How it works

The app launches Discord (or connects to an already-running instance) with `--remote-debugging-port` enabled. It then uses the Chrome DevTools Protocol (CDP) to inject a script into Discord's renderer process. The script fetches a kanji dictionary and kana-to-romaji mapping, monitors the DOM for Japanese text, and renders reading annotations inline.

Kanji dictionary and kana map are loaded from:
- https://github.com/RaylaValdez/jp-kanji

## Download

Pre-built portable executables are available on the [Releases](https://github.com/RaylaValdez/JapaneseToRomaji-Desktop/releases) page. No installation required.

## Building from source

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- npm (included with Node.js)

### Steps

```bash
# Clone the repository
git clone https://github.com/RaylaValdez/JapaneseToRomaji-Desktop.git
cd JapaneseToRomaji-Desktop

# Install dependencies
npm install

# Run (development)
npm start

# Package as portable executable
npm run build
```

The built executable will be in the `dist/` directory.

## Usage

1. Close Discord completely (the app will relaunch it automatically)
2. Run `JapaneseToRomaji-Desktop` (or `npm start` if running from source)
3. A settings window will appear - Discord will launch alongside it
4. Once the status shows **Connected**, Japanese text in Discord will have reading annotations

### Settings

| Setting | Description |
|---|---|
| Annotate kanji | Show readings for kanji characters |
| Annotate kana | Show readings for hiragana / katakana |
| Show kanji info tooltip | Display a tooltip with readings and meanings on hover |
| Annotate usernames | Apply annotations to usernames that contain Japanese |
| Reading preference | Prefer kun'yomi (訓) or on'yomi (音) readings |
| Ruby font size | Size of the reading text above characters |
| Tooltip font size | Size of the hover tooltip |

### Advanced

- **Discord path** - Manually specify the Discord executable if auto-detection fails
- **Debug port** - CDP port for remote debugging (default: 9222)
- **Kanji / Kana URLs** - Custom dictionary sources

## Acknowledgements

- [chrome-remote-interface](https://github.com/cyrus-and/chrome-remote-interface) - Node.js CDP client
- [Electron](https://www.electronjs.org/) - Desktop application framework
- [jp-kanji](https://github.com/RaylaValdez/jp-kanji) - Kanji and kana dictionary data

## License

MIT
