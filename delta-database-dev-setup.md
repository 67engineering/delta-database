# Delta Database — Local Development + Release Runbook

Goal: move from "editing a preview in chat" to **developing the real desktop app locally in VS Code with Claude Code**, and **shipping versioned releases that auto-update installed users**.

This assumes a **Windows** machine (your release target). Work top to bottom; each phase ends with a check so you know it worked before moving on.

---

## Phase 0 — Install the toolchain (one time, ~30–45 min)

Install these in order. After each, open a **new** terminal (PowerShell) and run the verify command.

1. **Node.js (LTS)** — https://nodejs.org → download the LTS installer → run it with defaults.
   - Verify: `node -v` (should print v20+ ) and `npm -v`.

2. **Rust** — https://www.rust-lang.org/tools/install → download `rustup-init.exe` → run it → choose the default install (1).
   - Verify: `rustc --version` and `cargo --version`.

3. **Microsoft C++ Build Tools** (Tauri compiles native code on Windows and needs these) — download **"Build Tools for Visual Studio"** from https://visualstudio.microsoft.com/downloads/ (under "Tools for Visual Studio"). In the installer, tick the **"Desktop development with C++"** workload, then Install. Reboot if prompted.

4. **WebView2 runtime** — already present on Windows 11 and up-to-date Windows 10. If in doubt, install the "Evergreen Bootstrapper" from https://developer.microsoft.com/microsoft-edge/webview2/.

5. **Git** — https://git-scm.com/download/win → install with defaults.
   - Verify: `git --version`.
   - Set your identity once:
     ```
     git config --global user.name "Your Name"
     git config --global user.email "you@example.com"
     ```

6. **VS Code** — https://code.visualstudio.com → install. (Needs version 1.98.0 or newer for the Claude Code extension; a fresh install is fine.)

7. **A paid Claude plan** (Pro or Max) or an Anthropic Console account — this is what Claude Code authenticates against. No API key is required for the VS Code extension.

**Phase 0 check:** all six `--version` commands print a version.

---

## Phase 1 — Get the project onto your machine as a Git repo

1. Make a working folder, e.g. `C:\dev\delta-database`.

2. Put the app source in it. Use the Tauri scaffold zip already produced (`apex-logbook.zip`); unzip its contents into `C:\dev\delta-database` so you have `src\`, `src-tauri\`, `package.json`, etc.

3. Replace the UI file with the latest preview: copy the current `apex-logbook-preview-v2.jsx` over `src\App.jsx` (Claude Code can also do this for you in Phase 2 — either is fine).

4. Install dependencies:
   ```
   cd C:\dev\delta-database
   npm install
   ```

5. Create a **GitHub account** (github.com) if you don't have one.

6. Create a repository. **Recommendation: make it public** — auto-update downloads are simplest from a public repo's Releases. (If you want the *code* private, create one **public** repo just for releases later; note it and move on for now.)

7. Turn the folder into a repo and push:
   ```
   git init
   git add .
   git commit -m "Initial import of Delta Database"
   git branch -M main
   git remote add origin https://github.com/<your-username>/delta-database.git
   git push -u origin main
   ```
   (Confirm `.gitignore` excludes `node_modules/`, `src-tauri/target/`, and `dist/`. The scaffold should already have this; if not, Claude Code will add it in Phase 2.)

**Phase 1 check:** your code is visible on github.com and `npm install` completed without errors.

---

## Phase 2 — Install Claude Code and wire it into VS Code

1. Install the CLI (this is also what the extension uses under the hood):
   ```
   npm install -g @anthropic-ai/claude-code
   ```

2. In VS Code: open the Extensions panel (`Ctrl+Shift+X`), search **"Claude Code"**, and install the one published by **Anthropic**. (Confirm the publisher — avoid look-alikes.)

3. Open your project: **File → Open Folder →** `C:\dev\delta-database`.

4. Open the integrated terminal (`` Ctrl+` ``) and run:
   ```
   claude
   ```
   Follow the one-time sign-in flow (it opens a browser). The extension panel and the terminal share the same session.

5. Give Claude Code project context. Ask it, in the panel:
   > "Create a CLAUDE.md at the repo root describing this project: a Tauri v2 desktop app (Rust + React/Vite + SQLite) called Delta Database for motorsport session/setup/tyre tracking. The UI currently lives in src/App.jsx (ported from a standalone preview). Note the compile-check and build commands. Keep it concise."

   `CLAUDE.md` is read automatically at the start of every session, so this is how Claude "remembers" the project.

**Phase 2 check:** typing a request in the Claude Code panel gets a response, and it can read your files.

---

## Phase 3 — Get the real desktop app running locally

Ask Claude Code to do each of these; review the diffs it proposes before accepting.

1. **Launch the app in dev mode:**
   ```
   npm run tauri dev
   ```
   This compiles the Rust shell and opens the actual desktop window with hot-reload on the React side. First run is slow (Rust compiles); later runs are fast.

2. **Port the simulated pieces to real ones.** In the preview, MoTeC parsing, file writes, and storage are simulated. Have Claude Code, one at a time:
   - wire `window.storage` (preview) to real SQLite via Tauri commands;
   - implement real file handling (drop `.ld`/`.ldx`, write under the app directory) using Tauri's filesystem APIs;
   - keep the JSON **export/import** working against the real database.

   Do these incrementally, testing in the dev window after each.

3. **Make a local test installer:**
   ```
   npm run tauri build
   ```
   The installer lands in `src-tauri\target\release\bundle\nsis\`. Install it, click around, uninstall. This proves the packaged app works before you ever cut a release.

**Phase 3 check:** `npm run tauri dev` opens the app; `npm run tauri build` produces an installer you can run.

---

## Phase 4 — Add the auto-updater to the app

Have Claude Code make these changes (it knows the file layout; the specifics are here so you can verify).

1. **Generate signing keys** (this pair is what proves an update genuinely came from you):
   ```
   npm run tauri signer generate -- -w %USERPROFILE%\.tauri\delta-database.key
   ```
   Set a password when prompted. **Back up both the `.key` file and the password in a password manager.** If you lose the private key you can never push updates to already-installed apps again.

2. **Add the updater plugin** (adds both the Rust crate and JS binding):
   ```
   npm run tauri add updater
   npm run tauri add process
   ```
   (`process` gives you `relaunch()` after an update.)

3. **Initialize the plugin** in `src-tauri/src/lib.rs` inside the `setup` closure:
   ```rust
   #[cfg(desktop)]
   app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
   ```

4. **Configure `src-tauri/tauri.conf.json`:**
   ```json
   {
     "bundle": {
       "createUpdaterArtifacts": true
     },
     "plugins": {
       "updater": {
         "endpoints": [
           "https://github.com/<your-username>/delta-database/releases/latest/download/latest.json"
         ],
         "pubkey": "PASTE_CONTENTS_OF_delta-database.key.pub_HERE",
         "windows": { "installMode": "passive" }
       }
     }
   }
   ```
   `createUpdaterArtifacts: true` is what makes the build emit the signed `.sig` files the updater needs. The `pubkey` is the **contents** of the `.key.pub` file (not a path).

5. **Grant updater permissions** in `src-tauri/capabilities/default.json` (or `main.json`) — add to the `permissions` array:
   ```json
   "updater:default",
   "process:allow-restart"
   ```

6. **Add the update check in the frontend** (e.g. run once on app start):
   ```js
   import { check } from '@tauri-apps/plugin-updater';
   import { relaunch } from '@tauri-apps/plugin-process';

   async function checkForUpdates() {
     const update = await check();
     if (update) {
       // optionally show your own in-app prompt here first
       await update.downloadAndInstall();
       await relaunch();
     }
   }
   ```

7. **Keep the version in sync across three files** — the version number must match in:
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`

   Tell Claude Code to always bump all three together (it can do this in one step).

**Phase 4 check:** `npm run tauri build` now also produces a `.sig` file next to the installer in the `nsis` bundle folder.

---

## Phase 5 — Set up the GitHub Actions release pipeline (one time)

1. **Add repository secrets.** On GitHub: **repo → Settings → Secrets and variables → Actions → New repository secret.** Add:
   - `TAURI_SIGNING_PRIVATE_KEY` → paste the **entire contents** of your `delta-database.key` file.
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` → the password you set in Phase 4.

2. **Give Actions write access.** **repo → Settings → Actions → General → Workflow permissions →** select **"Read and write permissions"** → Save. (Without this the action can't create the release.)

3. **Create the workflow file** at `.github/workflows/publish.yml`:
   ```yaml
   name: publish
   on:
     push:
       tags:
         - 'v*'
     workflow_dispatch:

   jobs:
     publish-tauri:
       permissions:
         contents: write
       runs-on: windows-latest
       steps:
         - uses: actions/checkout@v4
         - name: Setup Node
           uses: actions/setup-node@v4
           with:
             node-version: lts/*
         - name: Install Rust stable
           uses: dtolnay/rust-toolchain@stable
         - name: Install frontend dependencies
           run: npm ci
         - name: Build and release
           uses: tauri-apps/tauri-action@v0   # pin to the current major shown on the tauri-action README
           env:
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
             TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
             TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
           with:
             tagName: ${{ github.ref_name }}
             releaseName: 'Delta Database ${{ github.ref_name }}'
             releaseBody: 'See the assets to download and install.'
             releaseDraft: false
             prerelease: false
   ```
   This builds the Windows installer, signs the updater artifacts, **creates the GitHub Release, and uploads the installer plus `latest.json`** — which is exactly the file your app's updater endpoint points at.

4. Commit and push the workflow:
   ```
   git add .github/workflows/publish.yml
   git commit -m "Add release pipeline"
   git push
   ```

**Phase 5 check:** the workflow appears under the repo's **Actions** tab (it won't run yet — it triggers on a version tag).

---

## Phase 6 — Cut your first release

1. Bump the version in all three files to e.g. `0.4.0` (ask Claude Code: *"bump the app version to 0.4.0 in package.json, tauri.conf.json and Cargo.toml"*).

2. Commit, tag, and push the tag:
   ```
   git add -A
   git commit -m "Release v0.4.0"
   git tag v0.4.0
   git push origin main --tags
   ```

3. Watch the **Actions** tab — the build runs (~5–15 min). When it finishes, a new **Release** appears with the installer and `latest.json` attached.

4. **How users get it:** anyone who already installed the app will have it detect the new `latest.json` on next launch (via your `checkForUpdates`) and update automatically. New users download the installer from the Releases page.

**Every future release is just:** bump the three versions → commit → `git tag vX.Y.Z` → `git push --tags`.

---

## Phase 7 — Protect user data across updates

Because data lives in SQLite, add a tiny **schema version** number in the database and a **migration on startup** — the same idea as the preview's `migrateSetups`, but on the real DB. Ask Claude Code to:
- store a `schema_version` value,
- run ordered migrations when the installed version is behind,
- and keep the JSON export/import as the canonical portable backup.

This guarantees an auto-update never orphans someone's existing cars, events, or tyre bank.

---

## The ongoing loop

1. Describe a change to **Claude Code** in VS Code → review the inline diff → accept.
2. `npm run tauri dev` to see it live; iterate.
3. When happy: bump version → commit → tag → push → CI publishes → users auto-update.

**Where chat-Claude (me) still helps:** thinking through features, drafting complex components, reviewing the AS-standards logic, or planning bigger refactors — then you hand the plan to Claude Code to execute against the real repo.

---

## Honest caveats

- **"Unknown publisher" warning:** without a paid code-signing certificate, Windows SmartScreen shows an "unknown publisher" prompt on install. It's harmless (users click "More info → Run anyway"), and reputation builds over time. An **EV code-signing certificate** removes it but costs money and is a separate setup — fine to defer until you have real external users.
- **Public vs private repo:** the simplest updater setup reads `latest.json` from a **public** repo's Releases. If your code must stay private, keep a separate public repo for releases and point the updater endpoint there.
- **This is Windows-only** as written. Adding macOS/Linux later means expanding the CI matrix and (for macOS) Apple signing/notarization.
- **These steps run on your machine and in GitHub's cloud** — I can't execute them from chat. But Claude Code, running locally, can do essentially all of Phases 2–7 for you; your job is mostly installing the toolchain (Phase 0), the GitHub clicks (secrets/permissions), and approving diffs.
