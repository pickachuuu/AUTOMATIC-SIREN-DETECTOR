import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sirenDesktop", {
  selectWavFile: () => ipcRenderer.invoke("dialog:select-wav"),
  listBundledSamples: () => ipcRenderer.invoke("samples:list"),
  readBundledSample: (samplePath: string) => ipcRenderer.invoke("samples:read", samplePath),
  exportAnalysisJson: (defaultName: string, jsonText: string) =>
    ipcRenderer.invoke("analysis:export-json", defaultName, jsonText),
  showPath: (targetPath: string) => ipcRenderer.invoke("shell:show-path", targetPath)
});
