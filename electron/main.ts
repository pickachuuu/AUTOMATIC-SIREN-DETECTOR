import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const isDev = !app.isPackaged;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0b0d10",
    title: "Automatic Siren Detector",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    void mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    void mainWindow.loadFile(path.join(projectRoot, "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("dialog:select-wav", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose a WAV file",
    properties: ["openFile"],
    filters: [{ name: "WAV audio", extensions: ["wav"] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const data = await fs.readFile(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    bytes: Array.from(data)
  };
});

ipcMain.handle("samples:list", async () => {
  const dataDir = path.join(projectRoot, "data");
  const entries = await fs.readdir(dataDir);
  return entries
    .filter((entry) => entry.toLowerCase().endsWith(".wav"))
    .sort()
    .map((entry) => ({
      name: entry,
      path: path.join(dataDir, entry)
    }));
});

ipcMain.handle("samples:read", async (_event, samplePath: string) => {
  const dataDir = path.resolve(projectRoot, "data");
  const resolved = path.resolve(samplePath);
  if (!resolved.startsWith(dataDir + path.sep)) {
    throw new Error("Sample path is outside the bundled data directory.");
  }

  const data = await fs.readFile(resolved);
  return {
    name: path.basename(resolved),
    path: resolved,
    bytes: Array.from(data)
  };
});

ipcMain.handle("analysis:export-json", async (_event, defaultName: string, jsonText: string) => {
  const result = await dialog.showSaveDialog({
    title: "Export analysis JSON",
    defaultPath: defaultName.endsWith(".json") ? defaultName : `${defaultName}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await fs.writeFile(result.filePath, jsonText, "utf-8");
  return result.filePath;
});

ipcMain.handle("shell:show-path", async (_event, targetPath: string) => {
  await shell.showItemInFolder(targetPath);
});
