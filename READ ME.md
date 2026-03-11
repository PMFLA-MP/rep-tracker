# Rep Performance Tracker — v4 Live Setup Guide

This is the **blank-slate, live version** of the Rep Performance Tracker.
No hardcoded rep names or data — everything is stored in a GitHub Gist.

---

## What's Different from the Historical Version

| | Historical (`rep-tracker-historical`) | Live v4 (`rep-tracker`) |
|---|---|---|
| Rep data | Hardcoded in source code | Stored in Gist, managed in app |
| Monthly data | Hardcoded Oct–Dec 2025 | Entered via Data Entry tab |
| Adding reps | Edit source code | Roster Management tab in app |
| Period range | Oct–Dec 2025 only | Any month, any year |
| Gist | `34e0b4e2aa64701dea371cfc1389b3da` | New Gist (see Step 1) |

---

## One-Time Setup Steps

### Step 1 — Create a new blank GitHub Gist

1. Go to https://gist.github.com (logged in as **mollyp999**)
2. Filename: `storage.json`
3. Content: `{}`
4. Click **Create secret gist**
5. Copy the Gist ID from the URL — it looks like:
   `https://gist.github.com/mollyp999/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
   The ID is the long string at the end.

---

### Step 2 — Paste the Gist ID into `index.html`

Open `index.html` and find this line near the top of the `<script>` block:

```js
const GIST_ID = "REPLACE_WITH_YOUR_GIST_ID";
```

Replace `REPLACE_WITH_YOUR_GIST_ID` with your actual Gist ID. Save the file.

---

### Step 3 — Create a new GitHub repo

1. Go to https://github.com/new (logged in as **mollyp999**)
2. Repository name: `rep-tracker` (or any name you want)
3. Set to **Public** (required for GitHub Pages)
4. Click **Create repository**

---

### Step 4 — Upload `index.html`

1. In the new repo, click **Add file → Upload files**
2. Upload `index.html`
3. Commit to `main`

---

### Step 5 — Enable GitHub Pages

1. Go to the repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `/ (root)`
4. Click **Save**
5. Wait ~30 seconds, then visit: `https://mollyp999.github.io/rep-tracker`

---

### Step 6 — Generate a GitHub token

The app needs a Personal Access Token to read/write the Gist.

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Name: `Rep Tracker v4`
4. Expiration: No expiration (or 1 year)
5. Scopes: Check **`gist`** only
6. Click **Generate token** and copy it

When you open the app, it will show a token gate. Paste the token there.
The token is saved to `localStorage` in your browser — you only enter it once per device.

---

## How to Update the App (Future Changes)

1. Claude produces a new `index.html`
2. Go to your GitHub repo
3. Click `index.html` → pencil icon (Edit) → paste new content → **Commit changes**
4. Wait ~30 seconds, then hard refresh: **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows)

---

## First Steps After Setup

Once the app is live and you've entered your token:

1. **Roster tab** — Click **+ ADD REP** to add each active rep
   - Fill in: Name, Start Date, Group, Target Position, Tier, Monthly Target $
   - Click **Add Rep** — saves to Gist immediately

2. **Data Entry tab** — Enter monthly stats for each rep
   - Select rep → year → month → fill in: Apps Sent, Received, Approved, Units Funded, Funded $, Meeting %, Points
   - Or use **CSV Import** to bulk-upload from a Salesforce export

3. **Leaderboard** — automatically populates as you add reps and data

---

## File Locations

| File | Purpose |
|---|---|
| `index.html` | The entire app — upload this to GitHub |
| `app.jsx` | Source code (for Claude to edit) — do NOT upload |
| `app-compiled.js` | Compiled intermediate — do NOT upload |

---

## Storage Keys in the Gist (`storage.json`)

| Key | Contents |
|---|---|
| `leaderboard-reps-v2` | All rep definitions (name, start, group, tier, etc.) |
| `leaderboard-data-v1` | Monthly data entries keyed as `"RepName::2026::Jan"` |
| `leaderboard-meetings-v1` | Scheduled/completed meeting dates |
| `leaderboard-benchmarks-v1` | Tier benchmark overrides |
| `leaderboard-goals-v1` | Rep-level goals |
| `leaderboard-products-v1` | Product mix data |
| `leaderboard-depthead-v1` | Dept head custom data |

---

## Two Apps — Quick Reference

| | URL | Gist | Token localStorage key |
|---|---|---|---|
| **Historical** | `mollyp999.github.io/rep-tracker-historical` | `34e0b4e2aa64701dea371cfc1389b3da` | `rep-tracker-gh-token` |
| **Live v4** | `mollyp999.github.io/rep-tracker` | *(your new Gist ID)* | `rep-tracker-v4-gh-token` |

The two apps use **different localStorage keys** so the same browser can be logged into both simultaneously without conflict.
