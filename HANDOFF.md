# Delta Database — Handoff to Claude Code

## What this is
A Windows desktop app for motorsport engineering: tracking events, track sessions, car
setups, and a tyre bank (individual tyres and sets, with wear / tread / km / heat-cycle
tracking). Built as **Tauri v2** — Rust shell + React/Vite frontend + SQLite for storage.

## Current state (read this carefully)
The entire UI lives in `src/App.jsx` (~3,600 lines, imports only `react` and
`lucide-react`). It was originally built as a standalone browser **preview**, so several
things are **simulated** and need to be made real:

1. **Persistence is faked.** All data lives in one JS object
   `db = { settings, carProfiles[], events[] }`, persisted through a preview-only
   `window.storage` API (see `loadDB` / `saveDB` near the top of the file). This must be
   replaced with **SQLite via Tauri commands**. Simplest first step: store the same `db`
   JSON as a single document/row in SQLite, preserving the exact shape; normalise later if
   desired. `window.storage` does not exist in the Tauri webview, so today data does not
   survive a restart.
2. **MoTeC parsing is faked.** Dropping `.ld` / `.ldx` files calls `simMotec(...)`, which
   fabricates laps / best lap / fuel. Real parsing should happen on the Rust side and be
   exposed as a Tauri command. (`.ld` = binary telemetry; `.ldx` = XML sidecar with
   beacons / laps / math channels — keep the pair together.)
3. **File I/O is faked.** Drag-drop handling, the "open files folder" action, and the
   app-directory setting are simulated. Use Tauri's filesystem / dialog APIs for the real
   versions.
4. **Export uses `window.print`.** The event report / setup-sheet export prints via the
   browser. Fine to keep initially.
5. **JSON export / import is real logic** (Settings → Data backup & transfer) and should
   keep working against the real store — it's the canonical portable backup format.

## Data model (mirror this shape when persisting)
- `db.settings`: units (speed / temp / pressure / distance / volume), appDir, theme.
- `db.carProfiles[]`: each has channelMap, setupSchema, setups[], **tyreBank[]** (sets —
  each with up to 4 embedded tyres by corner, plus set-level optimumHot / treadPoints /
  notes and a representative brand / compound / size), and **looseTyres[]** (the
  unassigned tyre pool). Individual tyres own: serial, brand, compound, size,
  datePurchased, dateFitted, optimumHot, treadPoints, history[], treads[]. A tyre's km and
  heat cycles are **derived** from the sessions it was mounted in, not stored.
- `db.events[]`: event metadata + timeline[] + sessions[]. Each session holds conditions,
  tyres `{ tyreSetId, mounted[] (tyre ids), pressures, temps }`, performance, files[],
  feedback, notes.
- On load the app runs `ensureCatalog()` then `migrateSetups()` to backfill / repair older
  data. Keep this migration-on-load pattern and extend it with a stored **schema version**
  so future app updates never orphan a user's data.

## Roadmap (full detail in `delta-database-dev-setup.md` in this repo)
- **Phase 3:** get `npm run tauri dev` launching; replace `window.storage` with SQLite;
  implement real file handling.
- **Phase 4:** add the auto-updater plugin + signing keys.
- **Phase 5:** GitHub Actions release pipeline (tauri-action, tag-triggered).
- **Phase 6:** versioned releases (bump version in `package.json`, `tauri.conf.json`, and
  `Cargo.toml`, in sync → tag → push).
- **Phase 7:** SQLite schema migrations.

## Working preferences
- Show a short plan before large changes; work in small, reviewable steps.
- Preserve the existing data model and the migration-on-load behaviour.
- Commit to git frequently so changes can be rolled back easily.
