// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod motec;

use std::collections::HashMap;

#[tauri::command]
fn get_sessions() -> Result<Vec<String>, String> {
    db::get_all()
}

#[tauri::command]
fn save_session(id: String, data: String) -> Result<(), String> {
    db::upsert(&id, &data)
}

#[tauri::command]
fn delete_session(id: String) -> Result<(), String> {
    db::delete(&id)
}

#[tauri::command]
fn parse_ld(
    data: String,
    overrides: Option<HashMap<String, String>>,
) -> Result<motec::Summary, String> {
    motec::parse_ld_bytes(&data, overrides)
}

#[tauri::command]
fn data_location() -> String {
    db::db_location()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_sessions,
            save_session,
            delete_session,
            parse_ld,
            data_location
        ])
        .run(tauri::generate_context!())
        .expect("error while running Apex Logbook");
}
