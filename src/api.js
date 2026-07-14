// Bridge to the Rust backend. When running inside the packaged desktop app we
// call Tauri commands; in a plain browser preview we fall back to an in-memory
// store so the UI is still explorable (no persistence, MoTeC import disabled).
import { invoke } from "@tauri-apps/api/core";

export const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let mem = [];

export async function getSessions() {
  if (!inTauri) return mem.map((s) => JSON.stringify(s));
  return invoke("get_sessions");
}
export async function saveSession(s) {
  if (!inTauri) {
    mem = [s, ...mem.filter((x) => x.id !== s.id)];
    return;
  }
  return invoke("save_session", { id: s.id, data: JSON.stringify(s) });
}
export async function deleteSession(id) {
  if (!inTauri) {
    mem = mem.filter((x) => x.id !== id);
    return;
  }
  return invoke("delete_session", { id });
}
export async function parseLd(dataB64, overrides) {
  if (!inTauri)
    throw new Error("MoTeC import is only available in the desktop app.");
  return invoke("parse_ld", { data: dataB64, overrides: overrides || null });
}
export async function dataLocation() {
  if (!inTauri) return "Browser preview — data is not saved.";
  return invoke("data_location");
}
