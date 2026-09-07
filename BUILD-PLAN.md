# Superset: build plan

> ## Project name: **Superset**
>
> | | |
> |---|---|
> | Product name | **Superset** |
> | Repository | `superset` |
> | npm package name | `superset` |
> | PWA manifest `name` | `Superset` |
> | PWA manifest `short_name` | `Superset` |
> | localStorage key | `superset.v1` |
> | Export filename | `superset-YYYY-MM-DD.json` |
> | Image cache name | `superset-img-v1` |
> | Standalone artifact | `superset-standalone` |
>
> The name is **Superset** everywhere the user can see it. It is never
> abbreviated, never lowercased in prose, and never appears as a JavaScript
> identifier. **Read section 1a before writing any code**, because the word
> collides with a slot type and with set theory.

A single-page, offline-capable strength training planner. Browse a public-domain
catalog of 876 exercises, filter by equipment and level, build multi-day routines
with per-set prescriptions, and see live weekly training volume broken down by
**muscle sub-group** on an anatomical heat map.

This document is the complete specification. Follow it top to bottom. Everything
marked DECIDED is settled; do not re-litigate it. Everything marked OPEN has a
stated default: take the default and note it in the commit message.

---

## 0. Context and intent

Built for one person (the repo owner), not for distribution. Priorities, in order:

1. **Correct volume math.** The whole point is answering "which sub-group is my
   week under-training". Everything else is scaffolding.
2. **No operational burden.** No server, no Docker, no database, no accounts.
3. **Works on Android phone and on desktop**, from the same codebase.
4. Looks good enough that the owner opens it weekly.

Explicitly out of scope for v1: workout logging, rest timers, progression
engines, cross-device sync, multi-user anything. See section 13 for the backlog
and the seams to leave for them.

---

## 1. Decisions (locked)

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Stack | React 18 + Vite 5, plain JS (no TypeScript) | Owner chose. TS omitted to keep the single-file build simple; add later if desired. |
| 2 | Hosting | GitHub Pages, plus a `file://`-compatible single-file build | Owner chose "both". |
| 3 | Sync | Manual export/import of a JSON file | Owner chose simplest. Leave a clean seam (section 5.4). |
| 4 | Data source | `yuhonas/free-exercise-db`, vendored | Public domain, 876 exercises, has level/equipment/mechanic/force/muscles/instructions/images. |
| 5 | Images | Hotlinked from raw.githubusercontent.com, cached by service worker | Vendoring ~1750 JPEGs would bloat the repo. |
| 6 | Sub-muscle mapping | Deterministic rule-based seeder (`enrich.py`), run once | Free, reproducible, no API dependency, auditable. LLM refinement is a later optional pass. |
| 7 | Storage | `localStorage`, single JSON blob under one key | Routines are tiny (kilobytes). IndexedDB is unnecessary complexity until logging lands. |
| 8 | State management | React `useReducer` + one context. No Redux, no Zustand. | App is small. |
| 9 | Styling | Hand-written CSS with custom properties, one stylesheet. No Tailwind, no CSS-in-JS. | Keeps the single-file build trivial and the token system explicit. |
| 10 | Routing | In-app tab state, no router library | Four screens; hash routing would complicate `file://`. |
| 11 | Secondary muscle discount | 0.5, exposed as a constant in `enrich.py` | Common convention. |
| 12 | Set credit model | Peak-normalized (see 6.2), toggleable to raw fractional | Matches how training literature counts sets. |
| 13 | **Project name** | **Superset** (repo `superset`) | Owner chose. See 1a for the naming rules and the slot-type collision. |

### 1a. Naming, and the one collision it creates

**DECIDED. This section overrides any conflicting wording elsewhere in this
document.**

The project is called **Superset**. The name was chosen because a superset is
the clearest single word for what the app produces: two or more things trained
together as one unit. It also carries the set-theory sense of a set that
contains others, which is what the coverage view does with muscle sub-groups.

That double meaning is the problem. Three separate things in this project want
the word "superset":

| Sense | Where it appears | What to call it |
|---|---|---|
| The product | UI chrome, README, manifest, repo | **Superset**, capitalised |
| A slot holding 2+ exercises trained back to back | Data model, routine builder | stored as `"paired"`, labelled **Superset** in the UI |
| A set containing another set | Nowhere in code | avoid the word entirely |

Rules, in priority order:

1. **The stored slot type value is `"paired"`, not `"superset"`.** This is the
   one deviation from a naive reading of section 5.1. It exists so that
   `slot.type === "paired"` never reads as a reference to the product.
2. **The user-facing label for a `paired` slot is still "Superset".**
   Lifters call it a superset; do not rename it to "paired set" in the UI.
   Button reads "Make superset", the bracket label reads "Superset".
3. **The app name is never an identifier.** No `superset` variable, no
   `Superset` component, no `SUPERSET_` constant. The name lives in
   `package.json`, the manifest, `index.html`'s `<title>`, and one heading in
   the app shell. Nowhere else.
4. **CSS class prefix, if one is needed, is `sx-`.** Short, unambiguous, and
   does not read as the slot type.
5. **In prose and comments, capitalised Superset means the product** and
   lowercase superset means the training technique. Keep this consistent in
   commit messages too.

There is one external collision worth knowing: Apache Superset is a
well-known open-source BI tool. This is a private personal repo, so it does not
matter functionally, but it does mean searching "superset" plus almost any
technical term will surface that project instead of yours. Do not rename to
avoid this; just do not expect the name to be findable.

---

## 2. Repository layout

```
superset/
├── README.md
├── package.json
├── vite.config.js                 # Pages build
├── vite.standalone.config.js      # file:// single-file build
├── index.html
├── .github/workflows/deploy.yml   # Pages deploy
├── tools/
│   ├── enrich.py                  # provided; run once
│   └── exercises.raw.json         # downloaded, gitignored (regenerable)
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── icon-192.png, icon-512.png
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── styles.css
    ├── data/
    │   ├── exercises.json         # generated by enrich.py, COMMITTED
    │   └── taxonomy.json          # generated by enrich.py, COMMITTED
    ├── lib/
    │   ├── store.js               # reducer, persistence, export/import
    │   ├── coverage.js            # all volume math
    │   └── constants.js           # image base URL, defaults, heat ramp
    └── components/
        ├── Library.jsx
        ├── ExerciseDetail.jsx
        ├── RoutineBuilder.jsx
        ├── Coverage.jsx
        ├── BodyMap.jsx
        ├── Settings.jsx
        └── ui/                    # Chip, Drawer, NumberField, Segmented
```

`src/data/*.json` are committed artifacts. The app never regenerates them.

---

## 3. Step 1: data pipeline (do this first)

```bash
mkdir -p tools
curl -sLO https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json -o tools/exercises.json
mv tools/exercises.json tools/exercises.raw.json
python tools/enrich.py     # writes src/data/exercises.json and taxonomy.json
```

`enrich.py` is provided alongside this plan. It is already written and tested.
Paths inside it are anchored to the script's own location (not the cwd), so it
can be run either as `python tools/enrich.py` from the repo root (the form
above) or as `python enrich.py` from inside `tools/`.
Expected output:

```
876 exercises  confidence: {'high': 333, 'med': 543, 'low': 0}
unmapped: 0 []
```

### 3.1 What it produces

Each exercise record:

```json
{
  "id": "Incline_Dumbbell_Press",
  "name": "Incline Dumbbell Press",
  "level": "beginner",           // beginner | intermediate | expert
  "equipment": "dumbbell",
  "mechanic": "compound",        // compound | isolation | null
  "force": "push",               // push | pull | static | null
  "category": "strength",
  "primary": ["chest"],
  "secondary": ["shoulders", "triceps"],
  "steps": ["...", "..."],
  "images": ["Incline_Dumbbell_Press/0.jpg", "Incline_Dumbbell_Press/1.jpg"],
  "sub": { "pec_upper": 0.31, "pec_mid": 0.15, "delt_ant": 0.10, "tricep_long": 0.10, "...": 0.0 },
  "conf": "high",                // high = a name keyword rule fired, med = base split only
  "reviewed": false
}
```

`sub` weights always sum to 1.0. `conf` and `reviewed` exist so a later manual or
LLM pass can overwrite selectively without redoing everything.

`taxonomy.json` holds 7 majors and 41 sub-groups, each with a `region` key that
maps it onto an SVG region (several sub-groups share one region: the three
triceps heads all render into `tricep`).

### 3.2 Known data quality issues (do not "fix" in code)

The upstream dataset labels calves as a secondary muscle for barbell squats,
which is anatomically defensible but inflates calf volume in the coverage view.
Similar noise exists elsewhere. The correct fix is a review pass on the ~150
exercises the owner actually programs, editing `src/data/exercises.json` directly
and setting `"reviewed": true`. Do not add heuristics to the app to compensate.

Build a tiny review affordance instead: in the exercise detail drawer, show the
`sub` weights as an editable list when a `?review=1` query param is present,
with a "copy JSON patch" button. That keeps review out of the main UI while
making it possible. This is a nice-to-have, not a blocker.

---

## 4. Step 2: scaffold and build configs

`package.json`:

```json
{
  "name": "superset",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:standalone": "vite build --config vite.standalone.config.js",
    "build:all": "npm run build && npm run build:standalone",
    "preview": "vite preview"
  },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^5.4.11",
    "vite-plugin-singlefile": "^2.0.3"
  }
}
```

Both Vite configs are provided alongside this plan. The critical details:

- **Pages build**: `base: './'` so it works at any repo path, `assetsInlineLimit: 0`
  so fonts and icons stay as real files the service worker can cache.
- **Standalone build**: `vite-plugin-singlefile` with `removeViteModuleLoader: true`.
  This is mandatory. Chrome blocks `<script type="module">` over `file://` with a
  CORS error, so the JS must be inlined as a classic script.

**Because of the `file://` constraint, the app must never `fetch()` its own data.**
Import the JSON directly (`import exercises from './data/exercises.json'`) so
Vite bundles it. This makes both builds identical in behaviour and is why
IndexedDB and a data-loading state are unnecessary.

Expected artifact sizes: Pages `dist/` around 1.6 MB, standalone
`dist-standalone/index.html` around 1.5 MB as one file. If standalone exceeds
3 MB, something is being double-inlined; check `assetsInlineLimit`.

---

## 5. Step 3: data model and storage

### 5.1 Persisted shape

One `localStorage` key: `superset.v1`.

```js
{
  version: 1,
  settings: {
    equipmentProfiles: {
      home: ["body only", "dumbbell", "bands", "exercise ball"],
      gym:  ["barbell", "dumbbell", "cable", "machine", "body only",
             "kettlebells", "e-z curl bar", "bands", "medicine ball", "other"]
    },
    activeProfile: "gym",          // "home" | "gym" | "all"
    maxLevel: "expert",            // filter ceiling: beginner | intermediate | expert
    creditMode: "peak",            // "peak" | "fraction"  (see 6.2)
    targets: { /* subgroupId: [min, max] weekly effective sets */ }
  },
  routines: [
    {
      id: "r_ab12",
      name: "Upper/Lower",
      cycleDays: 7,                // length of one full rotation, in days
      days: [
        {
          id: "d_1", name: "Upper A", note: "",
          slots: [
            {
              id: "s_1",
              type: "single",      // "single" | "paired"   (UI label: "Superset")
              entries: [
                {
                  exerciseId: "Incline_Dumbbell_Press",
                  sets: 3,
                  repMin: 6, repMax: 10,
                  restSec: 150,
                  rpe: 8,            // nullable
                  tempo: "",         // free text, e.g. "3-1-1-0"
                  setType: "normal", // normal|dropset|myo|amrap|cluster|tut|isometric
                  note: ""
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  activeRoutineId: "r_ab12"
}
```

A `paired` slot holds 2+ entries; the UI renders them bracketed and shares one
rest value (take the first entry's `restSec`).

`cycleDays` matters: a 7-day cycle with 4 days means each day runs once per week.
A 5-day cycle means each day runs 7/5 = 1.4 times per week. This is the only
place scheduling enters the math (see 6.1).

### 5.2 Rules

- Write through on every mutation. Debounce persistence by 300 ms.
- Wrap reads in try/catch. On parse failure, keep a backup at
  `superset.v1.corrupt.<timestamp>` and start fresh rather than crashing.
- Seed `settings.targets` from `DEFAULT_TARGETS` in `constants.js` for any
  sub-group the user has not overridden. Do not persist unchanged defaults.

### 5.3 Default weekly target ranges

Effective sets per week. These are opinionated starting points, editable in
Settings. Use them; do not invent different numbers.

| Tier | Sub-groups | Target |
|---|---|---|
| Primary movers | `pec_mid`, `lat`, `quad_vl`, `quad_vm`, `glute_max`, `ham_bf` | 8 to 16 |
| Secondary movers | `pec_upper`, `pec_lower`, `delt_ant`, `delt_lat`, `delt_post`, `rhomboid`, `trap_mid`, `trap_upper`, `bicep_long`, `bicep_short`, `tricep_long`, `tricep_lat`, `quad_rf`, `ham_med`, `abs_upper`, `oblique` | 6 to 12 |
| Support | `teres`, `trap_lower`, `brachialis`, `tricep_med`, `erector`, `glute_med`, `adductor`, `calf_gastroc`, `calf_soleus`, `abs_lower`, `serratus`, `forearm_flex`, `forearm_ext`, `grip` | 4 to 10 |
| Minimal | `cuff`, `tva`, `hip_flexor`, `tibialis`, `neck` | 2 to 6 |

### 5.4 Export and import

Settings screen. Export dumps the whole `superset.v1` object plus an
`exportedAt` ISO timestamp, downloaded as `superset-YYYY-MM-DD.json` via a Blob
and an `<a download>`. Import reads a file, validates `version === 1`, and
**replaces** state after a confirmation that names how many routines will be
overwritten.

Seam for future sync: keep all persistence behind `store.js` exports
`loadState()`, `saveState(s)`, `serialize()`, `deserialize(text)`. A Gist sync
adapter later swaps only those four.

---

## 6. Step 4: coverage math

This is the core of the app. Put all of it in `src/lib/coverage.js` as pure
functions with no React imports.

### 6.1 Weekly frequency

```
weeklyFactor = 7 / routine.cycleDays
```

Each day in the routine occurs once per cycle, so every slot in every day is
multiplied by `weeklyFactor`.

### 6.2 Set credit, two modes

For an entry with `sets` sets and exercise sub-weights `w[g]`:

**`peak` mode (default).** Rescale so the single most-targeted sub-group earns a
full set of credit:

```
credit(g) = sets * w[g] / max(w)
```

Bench press (`pec_mid` = 0.25 is the max) gives `pec_mid` a full set, `pec_upper`
half a set, `delt_ant` 0.4 of a set. This matches how training literature counts
sets, where a compound is "one set for chest" and partial credit elsewhere.

**`fraction` mode.** Raw normalized weights:

```
credit(g) = sets * w[g]
```

Every set distributes exactly 1.0 total credit across all sub-groups. More
internally consistent, but a set of bench and a set of curls are no longer
comparable as "one set of chest work" and "one set of biceps work". Offer it as
a toggle because the difference is a genuine modelling disagreement, not a bug.

### 6.3 Weekly volume

```js
weeklyVolume(routine, exercisesById, mode) -> { [subgroupId]: number }
```

Sum `credit(g) * weeklyFactor` over every entry in every slot in every day.
Round for display only, never in the accumulator.

### 6.4 Status per sub-group

```
below   : v < min
in      : min <= v <= max
above   : v > max
```

Also compute a `deficit = max(0, min - v)` used for ranking suggestions.

### 6.5 Gap suggestions

For each sub-group with status `below`, rank candidate exercises by:

```
score = w_norm[g]                                        // how much it hits the gap
      - 0.6 * Σ_over_saturated_g' ( w_norm[g'] )          // penalty for piling onto
                                                          //   already-above groups
      + 0.15 * (mechanic === "compound" ? 1 : 0)          // mild compound preference
```

where `w_norm` is the peak-normalized weight vector. Filter candidates to the
active equipment profile and `maxLevel` first. Exclude exercises already in the
routine. Return the top 5 per gapped sub-group.

Keep this function pure and unit-testable; it is the piece most likely to need
tuning once real routines exist.

### 6.6 Per-exercise preview

The exercise detail drawer shows the same body map fed by that single exercise's
`sub` vector normalized to peak, so the strongest region renders at full heat.
This is the "what does this hit" figure the owner asked for, generated from one
SVG asset rather than 876 images.

---

## 7. Step 5: the body map

`BodyMap.jsx` renders one inline SVG with two views (front, back) and takes:

```jsx
<BodyMap view="front" values={{ pec_mid: 12.4, lat: 8.1 }} scaleMax={16} onRegionClick={fn} />
```

### 7.1 Regions

30 region ids, from the `region` field in `taxonomy.json`:

```
Front: neck, delt_ant, delt_lat, pec_upper, pec_mid, pec_lower, serratus,
       bicep, brachialis, forearm, abs_upper, abs_lower, oblique, hip_flexor,
       quad, adductor, tibialis, calf
Back:  neck, trap_upper, trap_mid, trap_lower, delt_post, cuff, rhomboid,
       teres, lat, erector, tricep, forearm, glute, ham, calf
```

Region value = sum of the values of every sub-group whose `region` equals that
id. So `tricep` heat is the sum of `tricep_long`, `tricep_lat`, `tricep_med`.

### 7.2 Drawing it

Draw a **stylized diagrammatic body**, not an anatomical illustration. Clean
geometric shapes with rounded joins, symmetrical, front and back sharing a
silhouette. Two reasons: it is achievable by hand in SVG paths, and a schematic
reads better than mediocre realism in a data tool. Target a 260 x 620 viewBox
per view.

Requirements:
- Every region is one `<path>` with `data-region` and an `<title>` for a11y.
- Bilateral regions (delts, arms, quads) are drawn as two mirrored paths sharing
  the same `data-region` value.
- A silhouette outline path underneath at `--line`, so unfilled regions still
  read as a body.
- No text inside the SVG. Labels live in the DOM beside it.

### 7.3 Heat scale

`fill` comes from a 5-stop ramp on `t = clamp(value / scaleMax, 0, 1)`:

| t | hex | meaning |
|---|---|---|
| 0.00 | `#1F262E` | untouched |
| 0.25 | `#2F4A5E` | minimal |
| 0.50 | `#5E7C57` | approaching target |
| 0.75 | `#B8913A` | in range |
| 1.00 | `#C9573C` | at or above ceiling |

Interpolate in sRGB, it is close enough at these stops. `scaleMax` defaults to
the highest target ceiling across visible sub-groups.

Hover and focus raise `stroke` to `--accent` at 1.5px. Click filters the
coverage table to that region's sub-groups.

---

## 8. Step 6: design system

### 8.1 Direction

The app's entire thesis is "where is the load going". So **chroma is reserved for
data**: the heat ramp is the only saturated colour in the interface, and every
control is neutral or the single cool accent. Nothing in the chrome competes
with the body map. This is the discipline that makes it look designed rather
than decorated. Do not add a second decorative accent, gradients on buttons, or
coloured category badges.

### 8.2 Tokens

Declare in `:root` in `styles.css`. Every colour in the app must come from here.

```css
--bg:        #101317;
--surface:   #171C22;
--surface-2: #1F262E;
--line:      #2C353F;
--line-soft: #222A33;
--text:      #E6EBF0;
--text-dim:  #8795A4;
--text-faint:#5C6875;
--accent:    #3FBFB4;   /* controls only, never data */
--accent-dim:#1E4F4C;
--under:     #4E7FA8;   /* status: below target */
--in:        #4FA77E;   /* status: in range */
--over:      #D8763C;   /* status: above ceiling */
--radius:    3px;       /* small and consistent; this is an instrument, not a card UI */
```

### 8.3 Type

```
Display / headings : "Space Grotesk", "Grotesk", system-ui, sans-serif   (500, 700)
Body / UI          : "IBM Plex Sans", system-ui, -apple-system, sans-serif (400, 500)
Numerals / data    : "IBM Plex Mono", ui-monospace, Menlo, monospace      (400, 500)
```

Every number in the interface (set counts, rep ranges, volume, rest seconds)
uses the mono face with `font-variant-numeric: tabular-nums`. This is the
typographic rule that makes the coverage table scannable and it is not optional.

Load fonts via a Google Fonts `<link>` in `index.html`, with the full system
fallback stacks above. The standalone `file://` build will fall back to system
fonts when offline; that is acceptable and must not break layout, so test with
fonts blocked.

Scale: 11 / 13 / 15 / 19 / 26 / 34 px. Headings in Space Grotesk 500 with
`letter-spacing: -0.01em`. Section eyebrows in mono, 11px, uppercase,
`letter-spacing: 0.08em`, `--text-faint`.

### 8.4 Layout

Desktop (>= 900px): fixed left rail with the four screens, content area, and on
the Routine and Coverage screens a sticky right column holding the body map so
it updates live while editing. That live update is the signature moment of the
app; make sure adding a set visibly warms a region.

Mobile: bottom tab bar, single column, body map collapses to a summary strip
that expands on tap. Test at 360px width.

### 8.5 Quality floor

Keyboard focus visible on every interactive element (`outline: 2px solid
var(--accent); outline-offset: 2px`). `prefers-reduced-motion` respected: heat
transitions drop to instant. All interactive targets at least 40px on touch.

---

## 9. Step 7: screens

### 9.1 Library

Purpose: find an exercise and add it to a day.

- Search box, debounced 150 ms, matching name and primary muscle.
- Filters as chip rows: major muscle group (from taxonomy), equipment
  (multi-select, pre-filtered by the active profile), level, mechanic, force.
- Active profile shown as a segmented control (Home / Gym / All) that swaps the
  equipment filter set. Changing it must not clear other filters.
- Result count always visible ("128 of 876").
- **Virtualize the list.** 876 rows with images will jank on a phone otherwise.
  Hand-roll a simple windowed list; do not add a dependency for it.
- Each row: name, equipment chip, level chip, and a 2-3 word muscle summary
  derived from the top sub-groups by weight. Image loads lazily
  (`loading="lazy"`).
- Row click opens the detail drawer. A persistent "Add to..." button opens a day
  picker for the active routine.

Empty state: "No exercises match. Widen the equipment profile or clear a filter."
Not an apology, and it names the fix.

### 9.2 Exercise detail (drawer, not a page)

Both images side by side (start and end position), the numbered instruction
steps, equipment / level / mechanic / force, the sub-group weight list sorted
descending with mono numerals, a mini body map, and the `conf` flag rendered
honestly as "auto-mapped" versus "reviewed".

Image URL construction, in `constants.js`:

```js
export const IMG_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
```

**Note:** the upstream README documents `/main/dist/exercises/`, which returns
404. The path above is verified working. Do not "correct" it back.

Handle image load failure with a neutral placeholder block; some entries have
missing files.

### 9.3 Routine builder

- Routine selector plus create / rename / duplicate / delete.
- `cycleDays` as a number field with a helper line: "4 days over a 7 day cycle
  means each day runs once per week."
- Days as reorderable cards. Each day holds slots; each slot holds one entry, or
  several when it is a `paired` slot.
- Entry editor, inline, all on one row on desktop and stacked on mobile:
  sets, rep range (two fields), rest (seconds), RPE, tempo, set type, note.
  All numeric inputs are mono, tabular, with steppers usable on touch.
- "Make superset" merges the selected slot with the one below. "Split" reverses.
  The button label says "Superset"; the stored value is `"paired"` (see 1a).
- Drag to reorder is nice but not required; up/down buttons are acceptable and
  far more reliable on touch. Prefer the buttons for v1.
- The right column body map and a compact per-day volume readout update on
  every keystroke. Debounce recomputation by 80 ms.

### 9.4 Coverage

The analysis screen for the active routine.

- Front and back body maps side by side, heat from weekly volume.
- Below them, the ledger: one row per sub-group grouped under its major, showing
  a horizontal bar with the target range drawn as a bracket overlay, the numeric
  value in mono, and a status dot in `--under` / `--in` / `--over`.
- Sort control: by major (default), by deficit, by volume.
- A gap panel listing sub-groups below target, each expandable to the top 5
  suggested exercises from 6.5, each with an "add to day" action.
- A credit mode toggle (peak / fraction) with a one-line explanation of the
  difference. Recompute live so the owner can see how much the choice matters.

Empty state when no routine exists: "Build a routine to see where your volume
lands." with a button that creates one.

### 9.5 Settings

Equipment profiles (editable checkbox lists over the 13 equipment values in the
dataset), max level, credit mode, per-sub-group target ranges in an editable
table, export, import, and a "reset to defaults" with confirmation.

Show the data provenance here: dataset name, license (public domain), exercise
count, taxonomy version, and how many exercises are `reviewed` versus
auto-mapped. Honest provenance in the UI, not buried in a README.

---

## 10. Step 8: PWA (Pages build only)

`public/manifest.webmanifest`: name "Superset", `display: "standalone"`,
`start_url: "./"`, `theme_color: "#101317"`, 192 and 512 icons.

`public/sw.js`: cache-first for the app shell (precached on install), and
stale-while-revalidate for `raw.githubusercontent.com` images in a separate
cache named `superset-img-v1` capped at roughly 300 entries with simple FIFO
eviction. Bump a `CACHE_VERSION` constant on every deploy and delete stale
caches in `activate`.

Register the service worker **only** when `location.protocol !== 'file:'`:

```js
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
```

The standalone build has no offline image caching. Document that in the README
as a known limitation rather than working around it.

---

## 11. Step 9: deployment

`.github/workflows/deploy.yml`: on push to `main`, Node 20, `npm ci`,
`npm run build:all`, upload `dist/` via `actions/upload-pages-artifact`, deploy
with `actions/deploy-pages`. Also attach `dist-standalone/index.html` as a
workflow artifact named `superset-standalone` so it can be downloaded and kept on
disk.

Repo is public (Pages on free tier requires it). This is fine: only code and
public-domain data live in the repo. All routines and settings stay in the
browser's localStorage and are never committed. Say so in the README.

---

## 12. Acceptance checklist

Do not consider the build done until all of these pass.

**Data**
- [ ] `enrich.py` runs clean, 876 exercises, 0 unmapped.
- [ ] Every exercise's `sub` weights sum to 1.0 within 1e-6.
- [ ] Every `sub` key exists in `taxonomy.json`.
- [ ] Every taxonomy `region` is drawn in `BodyMap.jsx`.

**Math**
- [ ] `weeklyVolume` on a 4-day, 7-day-cycle routine returns the same numbers as
      a hand calculation for at least three sub-groups.
- [ ] A 5-day cycle produces exactly 7/5 times the volume of the same routine at
      a 7-day cycle.
- [ ] Switching credit mode changes numbers but never changes which sub-groups
      are non-zero.

**App**
- [ ] Library filters compose correctly; result count matches the rendered list.
- [ ] Scrolling the full 876-item list is smooth on a mid-range Android phone.
- [ ] Adding a set in the routine builder visibly warms the corresponding body
      map region without a full re-render flash.
- [ ] Export then import round-trips state exactly.
- [ ] Reload preserves all routines and settings.
- [ ] Corrupting the localStorage value by hand does not white-screen the app.

**Naming (section 1a)**
- [ ] `package.json` name is `superset`; manifest `name` and `short_name` are `Superset`.
- [ ] `<title>` and the app shell heading read `Superset`.
- [ ] `grep -rn "superset" src/` returns only the UI label strings, never a
      slot type value, variable, component, or constant.
- [ ] `grep -rn '"superset"' src/` returns nothing; all slot types are `"paired"`.
- [ ] localStorage key is `superset.v1`; an export produces `superset-<date>.json`.
- [ ] The routine builder still shows the word "Superset" to the user.

**Builds**
- [ ] `npm run build` output served from a subpath loads all assets.
- [ ] `dist-standalone/index.html` opened directly from the filesystem in Chrome
      works fully, including exercise data, with only images requiring network.
- [ ] Standalone build has no `type="module"` script tag.
- [ ] Both builds render correctly with webfonts blocked.
- [ ] Layout is usable at 360px width and at 1440px.
- [ ] Keyboard-only navigation reaches every control with a visible focus ring.

---

## 13. Backlog (do not build now, leave seams)

Ordered by expected value.

1. **Review pass on ~150 core exercises.** The single highest-value follow-up.
   The `?review=1` affordance in 3.2 supports it.
2. **Logging.** Sessions and per-set actuals, which then enable planned versus
   actual volume. This is where localStorage should become IndexedDB via Dexie,
   and where `store.js` earns its abstraction.
3. **Private Gist sync.** Roughly 40 lines behind the four `store.js` functions:
   a PAT in settings, a fetch to pull, a PATCH to push, last-write-wins with a
   timestamp comparison and a manual conflict prompt.
4. **Rest timer.** Needs a wake lock; a PWA can do it on Android but it is
   finicky. Not worth it until logging exists.
5. **LLM refinement of the sub-group weights.** A second `tools/` script that
   only touches records where `reviewed === false` and `conf === "med"`, with a
   strict JSON schema and a two-pass agreement check. Pin the model version in
   the artifact metadata.
6. **Volume trend over time.** Meaningless until several months of logs exist.

---

## 14. Gotchas, collected

1. The product is named **Superset**, and "superset" is also a slot type and a
   set-theory term. Section 1a governs: the stored slot value is `"paired"`, the
   UI label is "Superset", and the app name never appears as an identifier in
   code. Do not reintroduce `type: "superset"`.
2. Image base URL is `/main/exercises/`, not the `/main/dist/exercises/` the
   upstream README documents. Verified 2026-08-30.
3. `vite-plugin-singlefile` needs `removeViteModuleLoader: true` or the
   `file://` build fails with a CORS error on the module script.
4. Never `fetch()` bundled data; import it, or the `file://` build breaks.
5. Service worker registration must be guarded on protocol.
6. `assetsInlineLimit: 0` on the Pages build, effectively infinite on the
   standalone build. Getting these backwards produces a working-but-huge Pages
   build or a broken standalone one.
7. 77 exercises have a null `equipment` in the source; `enrich.py` already
   coerces these to `"other"`. The equipment filter must include `"other"` in
   the gym profile or those exercises become unreachable.
8. 30 exercises have null `force` and 87 have null `mechanic`. Filters must
   treat null as "unspecified" and not silently exclude.
9. Sub-groups sharing an SVG region must be summed, not overwritten. The three
   triceps heads collapsing to one `tricep` region is the case to test.
