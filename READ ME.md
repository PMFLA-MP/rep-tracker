# REP PERFORMANCE TRACKER — LIVE VERSION
**Administrator Guide**
Live performance tracking · Gist-backed cloud storage · 2026 and beyond

---

## Overview

The Live version is the primary ongoing performance tracker for your sales team. All rep data is stored dynamically in a GitHub Gist — no source code changes are needed to add reps, enter data, or update the roster. It is designed for 2026 and future years.

---

## Deployments & Access

| Field | Value |
|---|---|
| Live URL | https://mollyp999.github.io/rep-tracker |
| GitHub Repo | github.com/mollyp999/rep-tracker |
| Gist ID | 05de8ff752660ec276188a46f1f09e17 |
| Gist URL | https://gist.github.com/mollyp999/05de8ff752660ec276188a46f1f09e17 |
| Token localStorage Key | `rep-tracker-v4-gh-token` |
| Source File | `/home/claude/rep-tracker-v4/app.jsx` |
| Compiled Output | `/mnt/user-data/outputs/index-v4.html` |

---

## Authentication

The app is gated behind a GitHub Personal Access Token. On first load, a token entry screen is shown. The token is stored in the browser's localStorage under the key `rep-tracker-v4-gh-token` — separate from the historical version so both can be open at once.

**Token Requirements:**
- Scope: `gist` (read and write)
- Account: `mollyp999`
- Generate at: github.com/settings/tokens

---

## Data Storage

All data is stored in a single GitHub Gist file named `storage.json`. The app reads and writes this file on every change.

| Key | Contents |
|---|---|
| `leaderboard-reps-v2` | Rep roster definitions (name, start, group, tier, targets, active status) |
| `leaderboard-data-v1` | Monthly performance entries, keyed as `rep::YYYY::Mon` |
| `leaderboard-meetings-v1` | 1-on-1 meeting scheduled/met dates and history per rep |
| `leaderboard-roster-v1` | Roster overrides (active/inactive status, departure dates, notes) |
| `leaderboard-benchmarks-v1` | Custom benchmark thresholds |
| `leaderboard-depthead-v1` | Dept Head pipeline data |
| `leaderboard-products-v1` | Product mix breakdown per rep/month |

---

## Views & Features

### Leaderboard
Main ranked view of all active reps. Period selector defaults to the current calendar month automatically.
- **Period filter:** Current Month button (green), 2026 month dropdown, 2026 YTD, All Time
- **Group filter:** All, Dept Head, Team Leader, OCTA, Up & Comer, RIT
- **Status filter:** Exceeding, Promote, On Track, Meet Soon, Act Now
- Expandable rep rows with full monthly breakdown, charts, and meeting panel
- **Meeting Mode:** masks rep names for use during team meetings
- **Benchmarks:** configurable thresholds for all status tiers

### Points Groups
Group-level breakdown sorted by average funded amount. Useful for comparing team leader groups head-to-head.

### Team Comparison
Side-by-side performance charts across all reps. Filter by period and group.

### Rep Compare
Select two reps to view a detailed side-by-side comparison of all metrics.

### Dept Heads
Dedicated panel for Max Gualtieri and Dave Salas with pipeline tracking and custom data entry.

### Product Mix
Track deal volume and funded amounts broken down by product type (MCA, Term, SBA, etc.) per rep per month.

### Data Entry
Enter or import monthly performance data. Supports manual entry and CSV import from Salesforce exports. Year options: 2026, 2027, 2028.
- **CSV Import:** drop a file with headers `Rep Name, Month, Year, Apps Sent, Received, Approved, Units Funded, Funded Amount, Meeting %`
- Headers are auto-detected in any order, case-insensitive
- Unrecognized reps and months are flagged with row-level errors
- Entries are staged locally and saved to Gist on confirm

### Roster
Add, edit, deactivate, or reactivate reps. All changes saved directly to the Gist. Rep fields: name, start date, group, expected position, tier, tenure tier, monthly target, days to next tier, notes.

---

## Position Groups

| Group | Description |
|---|---|
| Dept Head | Department leadership (Max Gualtieri, Dave Salas) — excluded from main leaderboard |
| Team Leader | Senior reps who lead a sub-team |
| OCTA | Experienced individual contributors |
| Up & Comer | High-performing reps showing strong trajectory |
| RIT | Rep in Training — new or ramping reps |

---

## Build & Deploy Process

### Step 1 — Compile
```bash
cd /home/claude/rep-tracker-v4
node -e "const babel=require('@babel/core'),fs=require('fs');const r=babel.transformSync(fs.readFileSync('app.jsx','utf8'),{presets:['@babel/preset-react'],filename:'app.jsx'});fs.writeFileSync('app-compiled.js',r.code);"
```

### Step 2 — Inject into HTML
```python
existing = open('/mnt/user-data/outputs/index-v4.html').read()
code = open('/home/claude/rep-tracker-v4/app-compiled.js').read()
start = existing.rindex('<script>') + len('<script>')
end = existing.rindex('</script>')
final = existing[:start] + '\n' + code + '\n  ' + existing[end:]
open('/mnt/user-data/outputs/index-v4.html','w').write(final)
```

### Step 3 — Bake Gist ID
```bash
sed -i 's/REPLACE_WITH_YOUR_GIST_ID/05de8ff752660ec276188a46f1f09e17/' index-v4.html
```

### Step 4 — Upload to GitHub
Go to `github.com/mollyp999/rep-tracker`, open `index.html`, click Edit, select all, paste the contents of `index-v4.html`, and commit. GitHub Pages deploys in ~30 seconds.

---

## Known Constraints & Notes

- **Do not use esbuild with `--minify`** — it mangles `Set` and causes runtime crashes
- **CDN scripts must load synchronously:** React 18.2, ReactDOM 18.2, PropTypes 15.8.1, Recharts 2.12.7 (jsDelivr UMD)
- **Use `storage.save()`** — not `storage.set()`
- **`React.useContext()` must only be called at the component level** — never inside helper functions like `parseCSV`
- **The Gist file must be named exactly `storage.json`** — any other name returns empty data silently
- **Year range: 2026, 2027, 2028** — earlier years intentionally excluded from data entry
- Token key `rep-tracker-v4-gh-token` is separate from the historical version's `rep-tracker-gh-token`
