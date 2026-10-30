mod commands;
mod cover;
mod fetch;
pub mod library;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Restore the last library if it still exists on disk. (An older
            // config names its folder; activating rewrites it to the file.)
            let handle = app.handle().clone();
            let cfg = state::read_config(&handle);
            if let Some(lib) = cfg.library {
                let path = std::path::PathBuf::from(&lib);
                if path.exists() {
                    if let Err(e) = state::activate_library(&handle, &path) {
                        log::warn!("could not restore library {lib}: {e:#}");
                    }
                } else {
                    log::info!("saved library {lib} no longer exists; starting unset");
                }
            }
            Ok(())
        })
        .invoke_handler(commands::handlers())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
