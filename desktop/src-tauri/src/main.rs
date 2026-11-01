// Задачи for the computer: the site in its own window, kept in the tray.
// Ctrl+Space anywhere shows the window (or hides it when it is already in front).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_window_state::StateFlags;

mod update;

fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn toggle(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) && !w.is_minimized().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show(app);
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Ctrl+Space, or Ctrl+Alt+Space when another program holds it
            let keys = [
                (Shortcut::new(Some(Modifiers::CONTROL), Code::Space), "Ctrl+Space"),
                (Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space), "Ctrl+Alt+Space"),
            ];
            let mut label = String::from("занята другой программой");
            for (key, name) in keys {
                if app.global_shortcut().register(key).is_ok() {
                    label = name.to_string();
                    break;
                }
            }

            // first run: start with Windows, quietly in the tray
            if let Ok(dir) = app.path().app_config_dir() {
                let _ = std::fs::create_dir_all(&dir);
                let flag = dir.join("first-run");
                if !flag.exists() {
                    let _ = app.autolaunch().enable();
                    let _ = std::fs::write(&flag, "1");
                }
            }
            let auto = app.autolaunch().is_enabled().unwrap_or(false);

            let open = MenuItem::with_id(app, "open", "Открыть Задачи", true, None::<&str>)?;
            let hotkey = MenuItem::with_id(app, "hotkey", format!("Горячая клавиша: {label}"), false, None::<&str>)?;
            let autostart = CheckMenuItem::with_id(app, "auto", "Запускать при входе в Windows", true, auto, None::<&str>)?;
            let reload = MenuItem::with_id(app, "reload", "Обновить страницу", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
            let build = app.package_info().version.patch;
            let version = MenuItem::with_id(app, "version", format!("Версия {build}, обновляется сама"), false, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&open, &hotkey, &sep1, &autostart, &reload, &version, &sep2, &quit])?;
            let auto_item = autostart.clone();

            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(format!("Задачи ({label})"))
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => show(app),
                    "quit" => app.exit(0),
                    "reload" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.eval("location.reload()");
                        }
                    }
                    "auto" => {
                        let m = app.autolaunch();
                        let on = m.is_enabled().unwrap_or(false);
                        let _ = if on { m.disable() } else { m.enable() };
                        let _ = auto_item.set_checked(!on);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        toggle(tray.app_handle());
                    }
                })
                .build(app)?;

            // updates: a newer desktop-N release is put in quietly while the window is away
            let handle = app.handle().clone();
            std::thread::spawn(move || update::watch(handle, build));

            if !std::env::args().any(|a| a == "--hidden") {
                show(app.handle());
            }
            Ok(())
        })
        // the close button puts it away into the tray
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Задачи");
}
