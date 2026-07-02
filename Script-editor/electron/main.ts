import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createServer, type Server } from "node:http";

let window: BrowserWindow | null = null;
let previewServer: Server | null = null;
const root = __dirname;

function createWindow() {
  window = new BrowserWindow({ width: 1440, height: 900, minWidth: 950, minHeight: 620, title: "Script Editor", webPreferences: { preload: join(root, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  if (!app.isPackaged) window.loadURL("http://localhost:5173");
  else window.loadFile(join(root, "../dist/index.html"));
}

ipcMain.handle("file:open", async () => {
  const result = await dialog.showOpenDialog(window!, { properties: ["openFile"], filters: [{ name: "Twine HTML", extensions: ["html", "htm"] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  const path = result.filePaths[0];
  return { path, name: basename(path), html: await readFile(path, "utf8") };
});

ipcMain.handle("file:save", async (_event, payload: { path?: string; html: string; saveAs?: boolean }) => {
  let path = payload.path;
  if (!path || payload.saveAs) {
    const result = await dialog.showSaveDialog(window!, { defaultPath: path || "Story.html", filters: [{ name: "HTML", extensions: ["html"] }] });
    if (result.canceled || !result.filePath) return null;
    path = result.filePath;
  } else {
    try { await copyFile(path, path.replace(/\.html?$/i, "") + ".backup.html"); } catch { /* First save may have no source. */ }
  }
  const temporary = join(dirname(path), `.${basename(path)}.tmp`);
  await writeFile(temporary, payload.html, "utf8");
  await rename(temporary, path);
  return { path, name: basename(path) };
});

ipcMain.handle("file:preview", async (_event, html: string) => {
  previewServer?.close();
  const reporter = `<script>(function(){function report(message){fetch('/__script_editor_error',{method:'POST',headers:{'content-type':'text/plain'},body:String(message)}).catch(function(){})}window.addEventListener('error',function(e){report(e.message||e.error)});window.addEventListener('unhandledrejection',function(e){report(e.reason&&e.reason.message||e.reason)})}());</script>`;
  const previewHtml = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${reporter}</head>`) : reporter + html;
  previewServer = createServer((request, response) => {
    if (request.url === "/__script_editor_error" && request.method === "POST") {
      let body = ""; request.setEncoding("utf8"); request.on("data", chunk => body += chunk); request.on("end", () => { window?.webContents.send("preview:error", body || "Unknown preview error"); response.writeHead(204); response.end(); }); return;
    }
    if (request.url !== "/" && request.url !== "/preview.html") { response.writeHead(404); response.end("Not found"); return; }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); response.end(previewHtml);
  });
  await new Promise<void>((resolve, reject) => { previewServer!.once("error", reject); previewServer!.listen(0, "127.0.0.1", resolve); });
  const address = previewServer.address();
  if (!address || typeof address === "string") throw new Error("Preview server did not start.");
  const url = `http://127.0.0.1:${address.port}/preview.html`;
  await shell.openExternal(url);
  return { url };
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { previewServer?.close(); if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
