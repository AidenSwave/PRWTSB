# Editor

A small cross-platform passage editor for existing Twine/SugarCube HTML exports. It preserves the embedded runtime and edits the `<tw-storydata>` section in place.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install` in this directory.
3. Run `npm run dev`.

Use **Open** to select an exported story. Drag passages on the map, edit raw passage text, and use **Save** to update the HTML. An adjacent `.backup.html` is created before overwriting an existing file.

## Build installers

Run `npm run dist`. Electron Builder creates a macOS DMG on macOS and a Windows NSIS installer on Windows.

## Current scope

- Opens and saves Twine 2 HTML containing `<tw-storydata>`.
- Edits passage titles, tags, positions, and raw text.
- Creates and deletes passages.
- Draws `[[link]]`, `[[label->target]]`, `[[target<-label]]`, and `[[label|target]]` relationships.
- Previews a temporary exported HTML file in the default browser.
- Opens passages in a focused visual screenplay editor by double-clicking them.
- Provides visual character, dialogue, action, option, delay, audio, sequence, and socket blocks, with a raw Source tab for exact syntax.
- Supports named map groups, automatic four-sided connections, draggable reroute points, coloured sockets, and a selectable starting passage.
- Stores editor-only layout information in the HTML without placing it inside Twine's story data.

It intentionally leaves SugarCube, story JavaScript, story CSS, and custom passage scripting untouched.
