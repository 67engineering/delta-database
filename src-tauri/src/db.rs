//! Local SQLite storage. Each session is a JSON document keyed by id, kept in the
//! OS application-data directory so it survives updates and lives on the user's disk.

use rusqlite::Connection;
use std::path::PathBuf;

fn db_path() -> Result<PathBuf, String> {
    let mut dir = dirs::data_dir().ok_or("Could not locate application data directory")?;
    dir.push("ApexLogbook");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.push("sessions.db");
    Ok(dir)
}

fn conn() -> Result<Connection, String> {
    let c = Connection::open(db_path()?).map_err(|e| e.to_string())?;
    c.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            id      TEXT PRIMARY KEY,
            updated INTEGER NOT NULL,
            data    TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(c)
}

/// Every session document as a JSON string, newest first.
pub fn get_all() -> Result<Vec<String>, String> {
    let c = conn()?;
    let mut stmt = c
        .prepare("SELECT data FROM sessions ORDER BY updated DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn upsert(id: &str, data: &str) -> Result<(), String> {
    let c = conn()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    c.execute(
        "INSERT INTO sessions (id, updated, data) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET updated = ?2, data = ?3",
        rusqlite::params![id, now, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete(id: &str) -> Result<(), String> {
    let c = conn()?;
    c.execute("DELETE FROM sessions WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn db_location() -> String {
    db_path().map(|p| p.display().to_string()).unwrap_or_default()
}
