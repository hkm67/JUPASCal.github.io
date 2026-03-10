# JUPAS Cal 2026 — Web App Implementation Plan

## Architecture

**2 files only:**
- `index.html` — entire app (input UI, calculator, results, CSS, JS)
- `data.js` — `const JUPAS_DATA = [...]` wrapping the minified unified JSON

No frameworks, no build tools, no CDN. Vanilla JS. Static GitHub Pages.

---

## File Structure

```
/
├── index.html              ← Single-page application (replaces current iframe page)
├── data.js                 ← const JUPAS_DATA = [...]; (minified JSON wrapper)
└── Archives/               ← unchanged
```

---

## Data Loading & Preprocessing (on page load, once per session)

1. Read `JUPAS_DATA` from `data.js`
2. Build `programmeMap`: `{ jupas_code → entry }` for O(1) lookup
3. Collect unique institutions + faculties for filter dropdowns
4. Build subject normalisation map (canonical name → weight dict key variants)
5. Pre-validate data (deduplicate JUPAS codes — CUHK has some duplicates)

---

## Input UI

### Layout
```
┌─────────────────────────────────┐
│  JUPAS Cal 2026       [EN / 中文]│
│─────────────────────────────────│
│  CORE SUBJECTS                  │
│  Chinese Language  [5* ▼]       │
│  English Language  [5  ▼]       │
│  Mathematics       [4  ▼]       │
│  CSD              [Attained ▼]  │
│                                 │
│  Optional M Module              │
│  None / M1 / M2   [None ▼]     │
│                                 │
│  ELECTIVES                      │
│  Elective 1  [Biology ▼] [5▼]  │
│  Elective 2  [Physics ▼] [4▼]  │
│  [+ Add Elective] (max 5)       │
│                                 │
│  Applied Learning (ApL)  [▼]    │
│  Other Language          [▼]    │
│─────────────────────────────────│
│  [Calculate]                    │
└─────────────────────────────────┘
```

- Core subjects: always visible, always have a grade
- CSD: `Attained / Not Attained`
- M module: `None / M1 / M2` — shows grade dropdown if not None
- Electives: dynamic (add/remove rows); subject dropdown + grade dropdown; start with 2 shown
- ApL: `Not taken / Attained with Distinction / Attained`
- Other language: subject dropdown + grade `A/B/C/D/E`
- Live recalculation on every input change; debounce 50ms

---

## Grade-to-Score Conversion

| Scale | Schools | 5** | 5* | 5 | 4 | 3 | 2 | 1 |
|-------|---------|-----|----|----|---|---|---|---|
| 8.5 scale | CityUHK, PolyU, HKU, HKUST | 8.5 | 7 | 5.5 | 4 | 3 | 2 | 1 |
| 7 scale | CUHK, HKBU, LingnanU, EdUHK, HKMU, SSSDP | 7 | 6 | 5 | 4 | 3 | 2 | 1 |

Special:
- CSD: Attained=1, Not Attained=0 (not eligible for Best-N pool)
- ApL: Attained with Distinction=4, Attained=3
- Other language: A=5, B=4, C=3, D=2, E=1

---

## Calculation Engine

### Formula Dispatch

| formula_2026_id | Schools | Handler |
|---|---|---|
| `best5` / `best4` / `best6` | HKBU, LingU, EdUHK, HKMU, SSSDP (+ many others) | `calcBestN()` |
| `best5` with weights + best_of | CityU, CUHK, HKU, HKUST, PolyU | `calcBestN()` extended |
| `3c2x` | CityU (some) | `calc3C2X()` |
| ALICE notation (CUHK custom ~12) | CUHK | `calcCustomCUHK()` |
| HKUST with bonus scale | All 33 HKUST | `calcHKUSTBonus()` |

### `calcBestN(subjectScores, N, requiredSubjects, bestOfGroups, constraints)`
1. Convert each user grade → numeric score (per scale)
2. Apply subject weight multipliers (default 1.0 if not in dict)
3. Handle `best_of_weights_2026` groups: for each group, apply group weight to matching subjects, take best `count` from the group; mark as consumed
4. Ensure `compulsory_subjects` are included first
5. Fill remaining slots with highest weighted scores
6. Apply constraints (e.g. `maths_m1m2_as_one`)

### `calc3C2X()`
- Fixed: Chinese + English + Maths (at their weights)
- Pool: top 2 elective weighted scores

### `calcCustomCUHK()`
- Parse ALICE notation: `AENGL+ACHIN+Best(3)` etc.
- Handle `m1m2_half_replacement` for JS4501/JS4502

### `calcHKUSTBonus()`
- Compute Best 5 weighted score
- Add bonus for 6th subject from `bonus_scale` lookup
- Apply `max_attainable_weighting` cap check

### `calculateAll()`
- Runs all 432 calculations given current user grades
- Returns `[{ jupas_code, score, notes }]`
- Called on every grade change; results stored for filter/sort

---

## Results Display

### Table columns
| JUPAS Code | Programme | Institution | Calculated Score | Median | LQ | Chance |

### Chance indicator
- `score >= median` → 🟢 Above Median
- `lq <= score < median` → 🟡 Within Range
- `score < lq` → 🔴 Below LQ
- No LQ/median (HKBU: mean only; SSSDP: mean only) → compare to available benchmark, label appropriately
- No historical score → ⚪ No Data

### Programme detail expand
- Full name EN + ZH
- Formula used (human-readable)
- Subject weights breakdown (which subjects contributed)
- Min requirements check (✓ / ✗)
- Remarks / notes
- Link to JUPAS page

### Mobile
- Card layout (single column)
- Calculated score shown prominently
- Tap to expand detail

---

## Filter & Sort

### Filters
- Institution: multi-select checkboxes (10 institutions)
- Faculty: dropdown
- Hide programmes with no historical score: toggle

### Sort options
- Calculated score (high→low) — default
- Gap to median
- Gap to LQ
- Institution A–Z
- Programme name A–Z

### Search
- Live text filter on programme name (EN or ZH) or JUPAS code

---

## Bilingual Support

- `LANG` state: `'en'` or `'zh'`
- All UI text via `t(key)` function looking up `I18N` object
- Programme names: `name_en` / `name_zh` toggled
- Subject names: from `term_glossary.json` (inlined)
- Institution names: from `term_glossary.json`
- Formula descriptions: per `formula_2026_id` from glossary
- Language preference saved to `localStorage`

---

## Key Edge Cases

| Case | Programme(s) | Handling |
|---|---|---|
| max_weighted_subjects (only 3 subjects can use enhanced weights) | CUHK JS4601 | Sort by excess weight; apply to top 3 only |
| M1/M2 half-substitution | CUHK JS4501, JS4502 | After Best 5, check if half-swap improves score |
| maths_m1m2_as_one | Many CityU/HKU | Keep higher of Math vs M1/M2; exclude other |
| HKBU: mean only, no LQ/UQ | All 22 HKBU | Compare to mean; no green/yellow/red |
| PolyU 6th subject bonus | 15 PolyU programmes | Approximate (flag in notes) |
| CSD not in Best-N pool | All | Score as 1, never eligible for Best-N |
| ApL generic bonus | CUHK, HKU (some) | Only include if explicit weight entry exists |
| New programmes (no history) | ~3 HKU + others | Show calculated score; note "no historical data" |
| CUHK duplicate codes | JS4264, JS4386 etc. | Deduplicate on load (last-wins) |
| PolyU weight values are raw multipliers (5,7,10) | All PolyU | Not ratios; apply directly as multipliers |

---

## CSS Design System

```css
:root {
  --green: #16a34a;   /* above median */
  --yellow: #ca8a04;  /* within range */
  --red: #dc2626;     /* below LQ */
  --grey: #6b7280;    /* no data */
  --bg: #f9fafb;
  --card: #ffffff;
  --border: #e5e7eb;
}
```

Mobile-first CSS Grid. No external CSS framework.

---

## Implementation Phases

| Phase | Content | Est. Effort |
|---|---|---|
| 1 | Static structure, data loading, I18N shell | 1–2h |
| 2 | Input UI (core/elective/M/ApL dropdowns) | 2–3h |
| 3 | Calculation engine (all formula types + validation) | 3–5h |
| 4 | Results table (chance indicator, sort) | 2–3h |
| 5 | Filters, search, UX polish | 1–2h |
| 6 | Bilingual polish + edge cases | 1–2h |
| 7 | Final integration, GitHub Pages test | 1h |

**Recommended order:** Phase 3 first (calculation engine in isolation, validated against known scores) → Phase 1+2 → Phase 4–7.

### Validation targets for Phase 3
- CityU JS1211: calculated score should be ~39 (median=39.0, lq=38.0)
- CUHK JS4601: verify max_weighted_subjects cap behaviour
- HKUST JS5101: expected_score ~33.0 should be reproducible
