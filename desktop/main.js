// Задачи for the computer: the site in its own window, kept in the tray.
// Ctrl+Space anywhere shows the window (or hides it when it is already in front).
const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, shell, screen } = require("electron");
const path = require("path");
const fs = require("fs");

const URL = "https://occasionalddd100.github.io/tasks/";
const KEYS = ["Control+Space", "Control+Alt+Space"];
let win = null, tray = null, quitting = false, hotkey = "";

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => show());

const stateFile = () => path.join(app.getPath("userData"), "window.json");
const loadBounds = () => { try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch { return null; } };
const saveBounds = () => { try { if (win && !win.isMinimized()) fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), max: win.isMaximized() })); } catch {} };
const onScreen = b => b && screen.getAllDisplays().some(d => b.x < d.bounds.x + d.bounds.width - 80 && b.x + b.width > d.bounds.x + 80 && b.y >= d.bounds.y - 20 && b.y < d.bounds.y + d.bounds.height - 80);

function create(hidden) {
  const b = loadBounds();
  win = new BrowserWindow({
    ...(onScreen(b) ? { x: b.x, y: b.y, width: b.width, height: b.height } : { width: 1400, height: 900 }),
    minWidth: 420, minHeight: 400, show: false, autoHideMenuBar: true, backgroundColor: "#0a0a0a",
    title: "Задачи", icon: path.join(__dirname, "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true },
  });
  if (b?.max) win.maximize();
  win.loadURL(URL);
  win.once("ready-to-show", () => { if (!hidden) show(); });
  // links to other sites open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(URL)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(URL)) { e.preventDefault(); shell.openExternal(url); } });
  // no connection yet (start at login before the network is up): try again
  win.webContents.on("did-fail-load", (_e, code) => { if (code !== -3) setTimeout(() => win && win.loadURL(URL), 5000); });
  // the close button puts it away into the tray
  win.on("close", e => { saveBounds(); if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on("resize", saveBounds); win.on("move", saveBounds);
}

function show() {
  if (!win) return create(false);
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function toggle() {
  if (win && win.isVisible() && win.isFocused()) win.hide(); else show();
}

function trayMenu() {
  const login = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Открыть Задачи", click: show },
    { label: hotkey ? "Горячая клавиша: " + hotkey.replace("Control", "Ctrl") : "Горячая клавиша занята другой программой", enabled: false },
    { type: "separator" },
    { label: "Запускать при входе в Windows", type: "checkbox", checked: login, click: () => { app.setLoginItemSettings({ openAtLogin: !login, args: ["--hidden"] }); trayMenu(); } },
    { label: "Обновить страницу", click: () => win && win.webContents.reloadIgnoringCache() },
    { type: "separator" },
    { label: "Выход", click: () => { quitting = true; app.quit(); } },
  ]));
}

app.whenReady().then(() => {
  app.setAppUserModelId("io.github.occasionalddd100.tasks.desktop");
  const hidden = process.argv.includes("--hidden");
  create(hidden);
  hotkey = KEYS.find(k => { try { return globalShortcut.register(k, toggle); } catch { return false; } }) || "";
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "icon.png")).resize({ width: 16, height: 16 }));
  tray.setToolTip("Задачи" + (hotkey ? " (" + hotkey.replace("Control", "Ctrl") + ")" : ""));
  tray.on("click", toggle);
  trayMenu();
  // first run: start with Windows by default, quietly in the tray
  const flag = path.join(app.getPath("userData"), "first-run");
  if (!fs.existsSync(flag)) { try { fs.writeFileSync(flag, "1"); app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] }); trayMenu(); } catch {} }
});

app.on("before-quit", () => { quitting = true; });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", e => e.preventDefault());
