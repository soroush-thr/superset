# Superset

A single-page, offline-capable strength training planner. Browse a public-domain
catalog of 876 exercises, filter by equipment and level, build multi-day routines
with per-set prescriptions, and see live weekly training volume broken down by
muscle sub-group on an anatomical heat map.

Built for one person, not for distribution — see [BUILD-PLAN.md](BUILD-PLAN.md)
for the full spec this was built against.

## Stack

React 18 + Vite 5, plain JavaScript. `useReducer` + one context for state, one
hand-written CSS stylesheet, no router (four screens, in-app tab state). No
server, no database, no accounts.

## Running it

```bash
npm install
npm run dev              # http://localhost:5173
```

```bash
npm run build             # GitHub Pages build -> dist/
npm run build:standalone  # single-file build -> dist-standalone/index.html
npm run build:all         # both
```

The standalone build is one HTML file with everything inlined (JS, CSS, the
exercise data) — double-click it or open it with `file://` in a browser, no
server required. It has no offline image caching (see Limitations below).

## Data pipeline

The exercise catalog is generated once, not fetched at runtime:

```bash
curl -sLO https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json -o tools/exercises.json
mv tools/exercises.json tools/exercises.raw.json
python tools/enrich.py
```

This writes `src/data/exercises.json` and `src/data/taxonomy.json`, both
committed to the repo. The app never regenerates them and never fetches its
own data — everything is imported and bundled at build time, which is also
why the standalone `file://` build works at all (Chrome blocks `fetch()` and
module scripts with imports over `file://`).

## Data provenance

- **Dataset**: [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db), public domain, 876 exercises.
- **Sub-muscle mapping**: a deterministic rule-based seeder (`tools/enrich.py`), run once. Each exercise gets a `sub` weight vector across 41 muscle sub-groups, plus a `conf` flag (`high` when a name keyword rule fired, `med` otherwise) and a `reviewed` flag for later manual correction. The exact counts are visible in the app's Settings screen.
- **Known data quality issues**: the upstream dataset over-attributes some secondary muscles (e.g. calves on barbell squats). The intended fix is a manual review pass on the exercises actually programmed, not app-side heuristics — see BUILD-PLAN.md section 3.2.
- Images are hotlinked from `raw.githubusercontent.com` (not vendored, to keep the repo small) and cached by the service worker on the Pages build.

## Privacy

All routines, settings, and targets live only in your browser's
`localStorage`, under one key. Nothing is ever sent to a server — there is
no server. This repo is public (GitHub Pages requires it on the free tier),
but only code and the public-domain exercise catalog are committed; your
actual training data never leaves your device unless you explicitly export
it.

## Limitations

- The standalone `file://` build has no offline image caching (no service
  worker attaches to a `file://` origin) — exercise images require network.
- Sync between devices is manual: export a JSON file from Settings, import
  it on the other device.

## Deployment

`.github/workflows/deploy.yml` builds both targets on every push to `main`,
deploys `dist/` to GitHub Pages, and attaches `dist-standalone/index.html`
as a downloadable workflow artifact.
