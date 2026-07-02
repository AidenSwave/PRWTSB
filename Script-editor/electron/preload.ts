import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  open: () => ipcRenderer.invoke("file:open"),
  save: (payload: { path?: string; html: string; saveAs?: boolean }) => ipcRenderer.invoke("file:save", payload),
  preview: (html: string) => ipcRenderer.invoke("file:preview", html),
  onPreviewError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("preview:error", listener);
    return () => ipcRenderer.removeListener("preview:error", listener);
  }
});
