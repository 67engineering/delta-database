# Apex Logbook

A private desktop database for your track sessions. Log every setup detail, filter and
sort by any field ("Sydney Motorsport Park, Michelin, ambient under 16°C"), and import
MoTeC `.ld` logs to pull in lap time, fuel, temperatures and top speed automatically.

Everything is stored **locally on your own PC** — no cloud, no account, no subscription.

---

## What you're holding

This is the **source** for the app. You don't need any programming tools installed.
GitHub's free servers will compile it into a normal Windows installer (`.exe`) for you,
and you download the finished installer. The build takes about 10–20 minutes the first
time. You only do this setup **once**.

If a step ever fails, the fix is almost always a single line and can be edited straight
in the browser — send me the red error text and I'll tell you exactly what to change.

---

## Part 1 — Build your installer (one time)

### Step 1 — Make a free GitHub account
Go to **github.com** and sign up. Any free account works.

### Step 2 — Create an empty repository
1. Top-right **+** → **New repository**.
2. Name it `apex-logbook`.
3. Choose **Private** (it's yours alone).
4. Leave everything else unticked. Click **Create repository**.

### Step 3 — Upload these files
On the new repository page, click **uploading an existing file** (the link in the
"Quick setup" box), or go to **Add file → Upload files**.

1. Open the `apex-logbook` folder on your PC.
2. Select everything **inside** it and drag it onto the upload page.
3. Wait for the file list to finish, then click **Commit changes**.

> **Important — the hidden build instructions.** The app is built by a small file at
> `.github/workflows/build.yml`. Folders that start with a dot sometimes don't come
> along in a drag-and-drop. After uploading, check that a folder named **`.github`**
> appears in your file list. If it's missing, add it by hand (2 minutes):
>
> 1. **Add file → Create new file**.
> 2. In the name box type exactly: `.github/workflows/build.yml`
>    (typing the `/` slashes automatically creates the folders).
> 3. Open the `build.yml` file from the `apex-logbook/.github/workflows/` folder on
>    your PC, copy everything in it, and paste it into the box.
> 4. **Commit changes**.

### Step 4 — Watch it build
Click the **Actions** tab at the top of your repository. You'll see a job called
**"Build Windows installer"** running (yellow dot). Give it 10–20 minutes until it turns
into a green tick. You can close the tab and come back — it runs on GitHub's servers.

### Step 5 — Download the installer
1. Go back to the repository's main page.
2. On the right, click **Releases** (it will say a draft like *Apex Logbook v0.1.0*).
3. Click into it and, under **Assets**, download the file ending in
   **`_x64-setup.exe`** (or `.msi`). That's your installer.

### Step 6 — Install and run
Double-click the downloaded installer.

> Because this is a personal app that isn't signed with a paid certificate, Windows will
> show a blue **"Windows protected your PC"** box the first time. This is expected for
> any small unsigned app. Click **More info**, then **Run anyway**. You only see this
> once. (Signing to remove the warning is possible later — it's a paid yearly
> certificate, so I left it out for now.)

After installing, launch **Apex Logbook** from the Start menu. Done — it's a real app now.

---

## Part 2 — Using the app

**Add a session** — click **New session** (top right). Fill in as much or as little as you
like. The **damper matrix** lets you click low/high-speed bump and rebound per corner with
+/− steppers, and tyre pressures are entered cold and hot for each corner.

**Find sessions** — the left rail filters by circuit, tyre brand, session type and
conditions, plus min/max ambient and track temperature. The search box up top matches
tracks, drivers, cars, tyres and your notes. Click any column header to sort by it
(best lap, temps, fuel per lap…).

**Import a MoTeC log** — click **Import MoTeC .ld**, choose a `.ld` file, and the app reads
it and shows the lap time, laps, fuel, ambient temperature and top speed it found. Because
different loggers name their channels differently, you get a **channel mapping** step: if
it picked the wrong channel for, say, ambient temperature, choose the right one from the
dropdown and click **Re-extract**. When it looks right, **Create session** drops all of it
into a new session form for you to finish and save.

> The importer was tested against a real MoTeC log and pulls lap times from the
> `Lap Number` + `Running Lap Time` channels. When you import one of **your own** logs,
> glance at the mapping step once — that confirms your logger's channel names, and it'll
> be right every time after.

---

## Part 3 — Your data and backups

Your sessions live in a small database file on your PC at:

```
C:\Users\<you>\AppData\Roaming\ApexLogbook\sessions.db
```

Nothing leaves your machine. To make a backup or move to another PC, use the **Export**
link on the main screen — it saves all sessions to a single `.json` file. **Import backup**
loads one back in. Keep an occasional export in your OneDrive/Dropbox and you're covered.

---

## If something goes wrong

- **The build failed (red X in Actions).** Click the failed job, find the red error text,
  and send it to me. First-time native builds occasionally need a one-line tweak; you can
  edit any file directly on GitHub (open it → pencil icon → commit) and the build re-runs
  on its own.
- **No build started at all.** The `.github/workflows/build.yml` file didn't upload — do
  the "hidden build instructions" box in Step 3.
- **Windows won't open the installer.** Use **More info → Run anyway** (Step 6).

---

## Updating later

When there's an improved version, you replace the changed files on GitHub (open a file →
pencil → paste new contents → commit, or upload again). GitHub rebuilds automatically and a
fresh installer appears under **Releases**. Your saved sessions are untouched by updating.
