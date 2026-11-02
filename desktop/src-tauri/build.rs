fn main() {
    // the page is remote, so the app's own commands need explicit permissions (granted in capabilities/default.json)
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["hotkey_get", "hotkey_set"])),
    )
    .expect("failed to run tauri-build");
}
