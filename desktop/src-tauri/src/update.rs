// Self-update from the repository's releases: each build is published as desktop-N (N = build number,
// also the patch of the app version). An installed copy (uninstall.exe next to it) checks after start and
// every few hours; a newer Tasks-Setup.exe is downloaded and run in passive mode, which replaces the app
// and starts it again. The portable exe is left alone.
use std::io::Read;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

const API: &str = "https://api.github.com/repos/occasionalddd100/tasks/releases?per_page=30";

fn installed() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("uninstall.exe").exists()))
        .unwrap_or(false)
}

fn newer(current: u64) -> Option<(u64, String)> {
    let v: serde_json::Value = ureq::get(API)
        .set("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(30))
        .call()
        .ok()?
        .into_json()
        .ok()?;
    v.as_array()?
        .iter()
        .filter_map(|r| {
            if r["draft"].as_bool() == Some(true) {
                return None;
            }
            let n: u64 = r["tag_name"].as_str()?.strip_prefix("desktop-")?.parse().ok()?;
            let url = r["assets"].as_array()?.iter().find(|a| a["name"] == "Tasks-Setup.exe")?["browser_download_url"]
                .as_str()?
                .to_string();
            Some((n, url))
        })
        .filter(|(n, _)| *n > current)
        .max_by_key(|(n, _)| *n)
}

fn fetch(url: &str, n: u64) -> Option<std::path::PathBuf> {
    let mut body = Vec::new();
    ureq::get(url)
        .timeout(Duration::from_secs(600))
        .call()
        .ok()?
        .into_reader()
        .take(300_000_000)
        .read_to_end(&mut body)
        .ok()?;
    if body.len() < 200_000 || &body[..2] != b"MZ" {
        return None;
    }
    let p = std::env::temp_dir().join(format!("Tasks-Setup-{n}.exe"));
    std::fs::write(&p, &body).ok()?;
    Some(p)
}

fn away(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| !w.is_visible().unwrap_or(true) || w.is_minimized().unwrap_or(false))
        .unwrap_or(true)
}

fn log(app: &AppHandle, line: &str) {
    if let Ok(dir) = app.path().app_config_dir() {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("update.log")) {
            let _ = writeln!(f, "{line}");
        }
    }
}

fn install(app: &AppHandle, file: &std::path::Path, n: u64) -> bool {
    let _ = app
        .notification()
        .builder()
        .title("Задачи обновляются")
        .body(format!("Ставлю версию {n}, через несколько секунд окно вернётся."))
        .show();
    // passive install (a small progress bar), then start the new version
    let exe = std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default();
    let mut cmd = std::process::Command::new("cmd");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // raw: cmd parses its own quotes
        cmd.raw_arg(format!("/C \"\"{}\" /P & start \"\" \"{}\"\"", file.display(), exe));
        cmd.creation_flags(0x0800_0000);
    }
    match cmd.spawn() {
        Ok(_) => {
            log(app, &format!("installing {n}"));
            app.exit(0);
            true
        }
        Err(e) => {
            log(app, &format!("could not start the installer: {e}"));
            false
        }
    }
}

/// Look now. `now`: install right away (asked for by hand); otherwise wait until the window is put away.
/// Returns what happened, for the settings and the tray.
pub fn check(app: &AppHandle, current: u64, now: bool) -> String {
    if !installed() {
        return "Это версия без установки: обновления ставятся через Tasks-Setup.exe".into();
    }
    let Some((n, url)) = newer(current) else {
        log(app, &format!("checked: {current} is the newest"));
        return format!("Стоит последняя версия ({current})");
    };
    let Some(file) = fetch(&url, n) else {
        log(app, &format!("download of {n} failed"));
        return format!("Не получилось скачать версию {n}");
    };
    if !now && !away(app) {
        let _ = app
            .notification()
            .builder()
            .title("Есть новая версия Задач")
            .body(format!("Версия {n} скачана. Поставлю, когда свернёшь или спрячешь окно."))
            .show();
        // don't pull the window from under the person
        while !away(app) {
            std::thread::sleep(Duration::from_secs(20));
        }
    }
    if install(app, &file, n) { format!("Ставлю версию {n}") } else { format!("Не получилось запустить установку версии {n}") }
}

pub fn watch(app: AppHandle, current: u64) {
    if !installed() {
        return;
    }
    std::thread::sleep(Duration::from_secs(20));
    loop {
        check(&app, current, false);
        std::thread::sleep(Duration::from_secs(30 * 60));
    }
}
