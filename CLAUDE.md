# JUPAS Cal — Claude Context

## What is this project?
Unofficial annual JUPAS score calculator for HK DSE applicants. Each year, a new version is released covering that year's admissions cycle. Users input DSE subject grades → the tool calculates estimated scores per programme based on each university's published weighting formula → compares against historical admission scores to gauge chances.

- Repo: https://github.com/JUPASCal/JUPASCal.github.io
- Non-official, for educational purposes only

---

## Institutions

### 8 Main Schools (UGC-funded)
HKU, CUHK, HKUST, PolyU, CityU, HKBU, LingU, EdUHK

### Others
- **HKMU** — self-funded programmes
- **SSSDP** — aggregated list of various institutions; some HKMU programmes appear here rather than under HKMU directly

---

## Year Labeling Rule (CRITICAL)

When collecting data for year Y's calculator:
- **Admission scores** → use year Y-1 actuals (last year's results)
- **Subject weightings & calculation methods** → use year Y-1 published data

This is because we compare a student's calculated score (using a known formula) against last year's admission scores. If we used Y's weightings with Y-1 scores, the comparison would be unfair if the school changed its formula.

**Y's weightings are collected and stored but labelled `data_year: Y`** — they will only be used in the Y+1 calculator, once Y's admission scores are available.

All scraped data (API or PDF) must be labelled with:
- `data_year_scores`: the year the scores refer to
- `data_year_weightings`: the year the weightings/methods refer to

---

## Annual Update Workflow

Each year requires two types of data:

### 1. Automated — JUPAS Website
Scrape using the `{year}_scrap.py` script:
- JUPAS codes, programme names (EN + ZH), institution, quota
- Application & offer statistics
- Outputs: `{year} JUPAS Program Overview.xlsx`, `{year} JUPAS Offer Table.xlsx`

### 2. Per-University — Manual or Semi-Automated
Each school publishes admission scores, subject weightings, and calculation methods independently. Published annually, usually around July. Formats vary:

| School | Typical Format | Notes |
|--------|---------------|-------|
| HKU | PDF + webpage | Scoring formula + expected scores |
| CUHK | PDF | 4 documents — see breakdown below |
| HKUST | PDF | Admission scores |
| PolyU | PDF (per programme) | Bulk scraping possible; prior scripts in `Archives/` |
| CityU | JSON API | Fully scrapeable — see breakdown below |
| HKBU | PDF (2 sources) | Weightings from GER-PERs.pdf; scores from JUPAS combined PDF |
| LingU | PDF | Weighting + admission scores |
| EdUHK | PDF | Weighting, entrance requirements, admission scores |
| HKMU | PDF | Admission scores |
| SSSDP | Varies | Per institution |

---

## Per-School Reference Documents

### CUHK
URL: https://admission.cuhk.edu.hk/application/jupas/download-area-for-important-information/

| Document | Filename Pattern | Contains |
|----------|-----------------|---------|
| Admission Grades (prev. year) | `Admission-Grades-{Y-1}.pdf` | Last year's admission scores + subject weightings per programme — used to predict current year range |
| Main Weighting & Calculation | `Useful-Information-for-JUPAS-Applicants-{Y}.pdf` | Score calculation methods, subject weightings for current year |
| Retake Penalty | `Arrangement-for-more-than-one-sitting-{Y}.pdf` | Score penalty rules for applicants who retook HKDSE |
| Applied Learning | `ApL-{Y}.pdf` | How ApL subjects are recognised and counted |

### CUHK
URL: https://admission.cuhk.edu.hk/application/jupas/download-area-for-important-information/
API: https://admission.cuhk.edu.hk/wp-content/uploads/data.json (plain JSON, no auth needed)
Scraper: `cuhk_scrap.py`

**API fields** (85 programmes):
| Field | Contains |
|-------|----------|
| `code` | JUPAS code |
| `name`, `faculty` | Programme name and faculty |
| `principle` | Calc method text (e.g. "Best 5 Subjects", "5 Subjects", "6 Graded Subjects") |
| `formula` | Machine-readable formula (e.g. `AENGL+ACHIN+Best(3)`, `Best(5)`) |
| `weight`, `weight_remarks` | Subject weightings (e.g. `ACHIN:1.2`) |
| `requirement` | Object: `CHI`, `ENG`, `MATH` min grades + `ELECT` array |
| `subject_1`, `subject_2` | Preferred/required elective subjects |
| `static_data_1` | **Expected/reference score for current entry year** (NOT last year's actual) |
| `score_remark` | Note on how expected score is interpreted |

**Year labeling**:
- `formula`, `weight`, `requirement` → year of entry the page is currently showing (e.g. 2026)
- `static_data_1` → CUHK's **projected reference score** for that entry year — distinct from actual admission scores
- Actual prior-year admission scores → `Admission-Grades-{Y-1}.pdf`

**PDF documents**:
| Document | Filename | Contains |
|----------|----------|----------|
| Admission Grades (prev year) | `Admission-Grades-{Y-1}.pdf` | Actual admission scores + weightings |
| Programme Requirements | `Useful-Information-for-JUPAS-Applicants-{Y}.pdf` | Current year weightings & calc methods |
| Retake Penalty | `Arrangement-for-more-than-one-sitting-{Y}.pdf` | Score penalty for retake applicants |
| ApL Recognition | `ApL-{Y}.pdf` | How ApL subjects are counted |
| Projected Enrolment | `Projected-Enrolment-{Y}.pdf` | Quota info |
| Flexible Admission | `Flexible-Admission-Arrangement-{Y}-Entry.pdf` | Special admission arrangements |
| Interview Arrangements | `Interview-Arrangement-{Y-1}.pdf` | Interview details for prior year |
| JUPAS Leaflet | `JUPAS-Leaflet-{Y}.pdf` | General brochure (large, not needed for calc) |

---

### CityU
Fully automated via internal JSON API (requires Playwright — blocked by Incapsula WAF for plain curl/requests).
Scraper: `cityu_scrap.py`

**College IDs** (hardcoded in frontend):
`500` Biomedicine, `1` Business, `427` Computing, `2` Engineering, `3` Liberal Arts & Social Sciences, `4` Science, `5` Vet & Life Sciences, `6` Creative Media, `8` Energy & Environment, `9` Law, `103` Interdisciplinary

**API endpoints** (base: `https://www.cityu.edu.hk/admo/_static_json/_api_json`):

| Endpoint | Data |
|----------|------|
| `get-programme-by-collage/{college_id}.json` | All programmes per college; filter `moderation_state == "Published"` to get current year only; contains `nid`, JUPAS code, calc mode |
| `get-dse-subjects-elective.json` | Lookup table: subject tid → name (fetch once) |
| `get-dse-subjects-other_lang.json` | Lookup table: other language subject tid → name (fetch once) |
| `get-dse-calc-info/hist-data/{nid}.json` | Historical scores: `field_lower_score`, `field_med_score`, `field_score_formula`, `field_year` |
| `get-dse-calc-info/weight-info/{nid}.json` | Subject weightings per programme |
| `get-dse-calc-info/weight-info-2/{nid}.json` | Additional weighting info |
| `get-dse-calc-info/basic-req-info/{nid}.json` | Compulsory subjects + minimum grade |
| `get-dse-calc-info/min-req-info/{nid}.json` | Elective requirements: which subjects count, min count, min grade |
| `get-dse-calc-info/other-info/{nid}.json` | Misc flags (e.g. history enabled) |

Note: `?_=<timestamp>` query params are cache-busting only — not needed.

**PDF document** (also available, blocked by Incapsula — must download via Playwright session):
- `2026_JUPAS_AdmissionScoreFormulaAndScores.pdf` — URL pattern: `https://www.cityu.edu.hk/admo/sites/default/files/{YYYY}-{MM}/{YYYY}_JUPAS_AdmissionScoreFormulaAndScores.pdf`
- Contains: 2026 score formula + 2025 admission scores (lower quartile + median) in one document
- Score conversion table also included (5**=8.5, 5*=7, 5=5.5, etc.)
- Note from PDF: *"scores calculated based on 2026 formula and HKDSE results of applicants with Main Round offers in 2025 entry"* — scores and formula year are explicitly stated
- To download via Playwright: visit `https://www.cityu.edu.hk/admo/` first to get cookies, then use `page.request.get(url)` to fetch the PDF bytes
- PDF extractor script: `cityu_pdf_extract.py` — extracts 52/58 programmes (new programmes with no score history are not in PDF)
- Second PDF: `2026_JUPAS_MainAdmissionScoreCalculation.pdf` — URL pattern same dir, filename `{YYYY}_JUPAS_MainAdmissionScoreCalculation.pdf` — contains detailed per-subject weightings (English/Chinese/Maths/Electives as separate columns); extractor: `cityu_pdf_weights_extract.py`
- **API is the primary source** (most complete, structured); PDFs are cross-reference/backup

---

### HKU
API: `https://admissions.hku.hk/api/hkdse/admission_standard`
PDF: `HKU-JUPAS-Admissions-Information-2026.pdf` (in `Reference(2026)/HKU/`)
Scraper: `hku_scrap.py`

**API response structure** (`data.data.programme`):
- Nested by faculty → programme name → programme object
- 58 total entries; 1 is self-financed (`programme_code = "N/A"`) → skip; 57 JUPAS programmes
- JUPAS code = `"JS" + programme_code` (4-digit numeric, e.g. `6004` → `JS6004`)

| Field | Contains |
|-------|----------|
| `programme_code` | 4-digit HKU code |
| `programme_name`, `programme_faculty`, `degree_type` | Programme metadata |
| `accordionHTML` | HTML with min requirements + 2026 scoring formula |
| `field_hkuad_dse_subject_w` | HTML with subject weighting table (e.g. "X 1.5: Biology / Chemistry") — null for most |
| `curriculum_weight` | Flag: 0=none, 1=has weighting, 3=complex weighting scheme |

**Parsing `accordionHTML`**:
- `table.section-Minimum-Level-Requirement` → row[1] cells = [Eng, Chin, Math, CSD, E1, E2] min levels
- `table.section-Other-Requirements` → other requirements text
- `table.table-style-2` → row where `<th>` contains "HKDSE Scoring Formula" → `<td>` = 2026 formula

**PDF column layout** (each data row has exactly one programme):
| Col | Contains |
|-----|----------|
| 0 | HKU 4-digit code |
| 1 | Programme name |
| 2 | 2026 scoring formula |
| 3–8 | Min Eng / Chin / Math / CSD / E1 / E2 |
| 9 | Other requirements / specific elective subjects |
| 10 | 2025 historical formula (or "–" for new programmes) |
| 11 | Upper Quartile score (2025) |
| 12 | Median (14-col pages) or "Median LQ" merged (13-col pages — truncated!) |
| 13 | LQ (14-col pages only) |

**Score extraction** — use `extract_words` x-band approach for ALL pages (bypasses merged-column truncation on 13-col pages):
- UQ: x0 in [1035, 1065]; Median: x0 in [1080, 1110]; LQ: x0 in [1125, 1155]
- Filter: `SCORE_RE = re.compile(r'^(\d{1,3}|\u2013)$')` — 1-3 digit numbers or em-dash only (excludes year numbers "2025"/"2026" from page headers)
- Match by row order (words in top-to-bottom order = same order as table rows)
- "–" (U+2013) in score = new programme with no history → normalize to `""`

**Output**: `Reference(2026)/HKU/HKU_2026_Data.json/xlsx` — 57 programmes (54 with 2025 scores; 3 new programmes have no scores)

---

### HKUST
JS: `hkust_calculator.js` (saved in `Reference(2026)/HKUST/`)
PDFs: `ADMISSIONS-REQUIREMENTS-2026.pdf`, `ADMISSIONS-SCORES-2025.pdf`, `EXTRA-BONUS-6TH-SUBJECT.pdf`, `GRADE-CONVERSION.pdf`, `ALT-QUALIFICATION-CHINESE.pdf`
Scraper: `hkust_scrap.py`

**JUPAS codes**: JS5xxx (33 programmes across 6 schools/academies)

**JS data structure** (`programmes:[{...}]` — second occurrence at ~pos 171544):
- JS boolean literals `!0`/`!1` → replace with `true`/`false` before JSON parsing
- Unquoted object keys → quote with regex `r'(?<=[{,\[])([a-zA-Z_]\w*):' → '"\1":'`

| Field | Contains |
|-------|----------|
| `jcode` | JUPAS code (JS5xxx) |
| `name` | "JS5xxx Programme Name" — strip prefix |
| `faculty` | School name |
| `engMultiplier` | English weight: x1, x1.5, x2 |
| `secondMultiplier` | Weight for second specified subject |
| `secondMultiplierSubject` | "Math", "Chinese", etc. |
| `anotherSpecifiedSubject` | Required elective description |
| `otherSubjects` | Free-text HTML describing remaining subject slots + bonus weightings |
| `subjectNum` | Number of subjects in formula (usually 5) |
| `max_attainable_weighting` | Max possible weighted total |
| `expected_score` | 2026 expected/reference score |
| `noticesAfterCal.MS` | 2025 Median score |
| `noticesAfterCal.LQ` | 2025 Lower Quartile score |
| `noticesAfterCal.NO_MSLQ` | Non-empty = no reference scores |
| `requirements` | `[{subject, level}]` min level per subject |
| `extra_subject_bonus_category` | Bonus subject categories list |

**Scores PDF** (`ADMISSIONS-SCORES-2025.pdf`, 1 page, 11 tables):
- 5-col tables: `[HA, '', MS, '', LQ]` — Engineering/Science/HSS
- 7-col tables: `['', HA, '', MS, '', LQ, '']` — some Business tables
- HA lookup: key = `(float(MS), float(LQ))` — all 41 rows have unique pairs
- **Float key required**: JS stores `'37.50'`; PDF parses to `37.5`; use `float()` for both sides

**Output**: `Reference(2026)/HKUST/HKUST_2026_Data.json/xlsx` — 33 programmes, all with 2025 scores (HA + Median + LQ)

---

### PolyU
JS: `polyu_calculator.js` (saved in `Reference(2026)/PolyU/`) — Drupal Behaviour; loads data at runtime from `drupalSettings.jupas_calculator` (not hardcoded in the JS file)
Scraper: `polyu_scrap.py` — uses **Playwright** (`networkidle` wait) to render the page and extract `drupalSettings.jupas_calculator` via `page.evaluate()`
Calculator URL: `https://www.polyu.edu.hk/study/ug/admissions/jupas` (NOT `/jupas-calculator` — that 404s)
Raw JSON cached to: `Reference(2026)/PolyU/polyu_drupal_settings.json`

PDFs in `Reference(2026)/PolyU/`:
- `ADMISSION-FIGURES-2025.pdf` — 2025 admission scores (13 pages, 54 programmes)
- `2025_JS3xxx_SW.pdf` — 2025 subject weighting PDFs (45 files)
- `2026_JS3xxx_SW.pdf` — 2026 subject weighting PDFs (44 files)

**`drupalSettings.jupas_calculator` structure**:
| Key | Contains |
|-----|----------|
| `year` | Entry year (2026) — formula/weightings year |
| `data.ADMISSIONS` | Array of 46 programme rows (see fields below) |
| `data.JS3xxx` | Per-programme weight table: `[{Subject Name, Subject Weighting, Subject Category}]` — 2026 weightings |
| `scores.core_subject` | Grade→value: `5**=8.5, 5*=7, 5=5.5, 4=4, 3=3, 2=2, 1=1` |
| `scores.elective` | Same as core |
| `scores.apl` | `Attained with Distinction=4, Attained=3` |
| `scores.other_language` | `A=5, B=4, C=3, D=2, E=1` |
| `requirements` | `[{key, name, level, category}]` universal minimum levels |
| `minimum_level` | Flat dict: `{core_subject_1: '3', ..., elective_subject: '3'}` |

**`ADMISSIONS` row fields**:
| Field | Contains |
|-------|----------|
| `JUPAS Code` | JS3xxx |
| `Scheme / Programme` | Programme name |
| `Faculty / School` | Faculty |
| `Admission Score Calculation Mechanism` | Formula name (see below) |
| `Intake Score` | HTML with "Average Score: X.XX" and "Lower Quartile: X.XX" (2025 actuals) |
| `Preferred Subjects` | HTML text |
| `Relevant Subjects` | HTML text |
| `Remarks` | HTML text |
| `Quota` | HTML text |

**Calculation mechanisms** (determines which subjects count):
- `"Any Best 5 Subjects"` → best 5
- `"4 Core + Best 2 Elective Subjects"` → 4 cores + best 2 electives
- `"Chinese & English Languages + Any Best 3"` → Chin + Eng + best 3
- `"Any Best 6 Subjects"` → best 6
- `"... + bonus"` variants → add fractional bonus for the 6th subject

**Score formula**: `Total = sum of best-N subjects where each subject score = grade_value × subject_weight`

**Weight table format** (`data.JS3xxx`):
```json
[{"Subject Name": "English Language", "Subject Weighting": "2", "Subject Category": "Category A Subject"}]
```
- Category A = DSE core/elective; Category B = M1/M2; Category C = Other Qual

**Programme codes**: JS3xxx — 46 in drupalSettings; 54 in admission figures PDF

**No weighting PDFs** (9 codes use "Any Best 5 Subjects" formula — no SW PDF exists):
`JS3010, JS3020, JS3100, JS3110, JS3120, JS3330, JS3557, JS3571, JS3910`

**JS3241 → JS3243**: JS3241 has a 2025 weighting PDF but is absent from 2026 drupalSettings data (404 for 2026 PDF). JS3243 is confirmed present in 2026 data — likely restructured/renamed.

**Output**: `Reference(2026)/PolyU/PolyU_2026_Data.json/xlsx` (46 programmes), `PolyU_2026_Weights.json` (full per-subject weight tables for calculator use)

---

### HKBU
Weightings PDF: `https://admissions.hkbu.edu.hk/content/ito/en/_jcr_content.ssocheck.json?pathPdf=/content/dam/ao-assets/document/news/general-entrance-requirements-for-the-2025-entry/2026-GER-PERs.pdf`
Scores PDF: JUPAS combined PDF `af_{Y-1}_JUPAS.pdf` — see JUPAS Combined PDF section below
Extractors: `hkbu_pdf_extract.py` (weightings), `hkbu_score_extract.py` (scores → merge into JSON)

**22 programmes** (JS2xxx) across: Faculty of Arts and Social Sciences, School of Business, School of Chinese Medicine, School of Communication, School of Creative Arts, Faculty of Science, Transdisciplinary Programmes.

**Score formula**: All HKBU programmes use **Best 5** (any best 5 HKDSE subjects).

**GER-PERs.pdf structure** (5 pages, pdfplumber extracts cleanly):
- Page 1: General Entrance Requirements table + Category C score conversion table (skip for programme extraction)
- Pages 2–5: 13-column programme tables organised by school; skip 2 header rows per table

| Column | Contains |
|--------|----------|
| 0 | JUPAS code (JS2xxx) |
| 1 | Programme full title |
| 2 | Admissions approach ("Broad-based" / "Programme-based") |
| 3–6 | Min CHI / ENG / CSD / MATH |
| 7 | Min Elective 1 (may embed constraint text, e.g. "3\n(One elective must be Biology or Chemistry)") |
| 8 | Min Elective 2 (None for Chinese Medicine — merged cell) |
| 9–11 | M1/M2 / Cat B / Cat C accepted (✓ = `\uf0fc`, × = `\uf04f`) |
| 12 | Specific subject weights, e.g. `ENG (x 2)\nHMSC^ (x 1.1)` |

**Duplicate codes**: JS2910/JS2920/JS2930/JS2940/JS2960 appear in two sections each (e.g. both Creative Arts and Transdisciplinary). Keep first occurrence only.

**GER min levels**: CHI=3*, ENG=3, CSD=Attained, MATH=2, E1=3, E2=3 (universal). `3#` on CHI for Chinese Medicine = no alternative Chinese accepted.

**JUPAS scores PDF structure** (af_{Y-1}_HKBU.pdf, 7 pages; one table per programme):
- Table rows: header row with `['Mean', '', 'CHIN', 'ENGL', 'MATH', 'CSD', 'Elective 1–4']`, then Median row (col 0 = Mean score float), then Lower Quartile row
- Scores provided: `score_mean` (numeric average), `score_median_grades` (dict of subject→grade), `score_lq_grades`
- Note: HKBU does NOT publish a numeric LQ/UQ total score — only grade breakdowns per position

**Website scores page** (`https://admissions.hkbu.edu.hk/admissions/hkdse.html#admissions-scores`) uses Angular/Vue dynamic rendering — not scrapeable without Playwright. Use the JUPAS combined PDF instead.

**Output**: `Reference(2026)/HKBU/HKBU_2026_Data.json/xlsx` — 22 programmes with 2026 weightings + 2025 scores

---

### LingU
Scores PDF: JUPAS combined PDF `af_{Y-1}_JUPAS.pdf` (p16-18) — split to `af_{Y-1}_LingU.pdf`
Weightings PDF: `Admission_Requirements_JUPAS_{Y}.pdf` (download from LingU admissions page)
Reference page: `https://www.ln.edu.hk/admissions/ug/page/detail/114`
Extractors: `lingu_score_extract.py` (scores), `lingu_weights_extract.py` (weightings → merge)

**23 programmes** (JS7xxx).

**Score formula**: All LingU programmes use **Best 5** (any best 5 HKDSE subjects).

**Grade conversion (LingU-specific)**: 5\*\*=7, 5\*=6, 5=5, 4=4, 3=3, 2=2, 1=1 (same as EdUHK Cat A; different from CityU/PolyU which use 5\*\*=8.5)

**Scores PDF structure** (`af_{Y-1}_LingU.pdf`, 3 pages, two-column layout):
- Left column (x < 200): JS code + programme name
- Right column (x ≥ 200): score bands by x-position
- Page 1: Median row appears ABOVE the JS code row (score precedes code)
- Page 2+: JS code and Median row appear on the SAME y-position
- Both layouts handled by state machine with `pending_median` buffer
- LQ row always follows Median; state machine detects it as "2nd score row after Median set"
- `carry_faculty` passed between `process_page()` calls for multi-page faculty sections

**Scores x-bands**:
| Field | x_min | x_max |
|-------|-------|-------|
| score | 258 | 298 |
| CHIN  | 320 | 350 |
| ENGL  | 370 | 405 |
| MATH  | 420 | 455 |
| Elective1 | 470 | 510 |
| Elective2 | 525 | 560 |

**Weightings PDF structure** (`Admission_Requirements_JUPAS_{Y}.pdf`, pages 6-10):
- Clean text (no tables); JS7xxx code + name as header line, then one weight entry per line
- Format: `Subject Name weight` (e.g. "English Language 2")
- Known PDF typo: second occurrence of JS7215 is actually JS7216 — fixed via `TYPO_FIX` dict
- Run-on artifact: "Health Management and Social Care Physics" → two subjects (HMSC + Physics) — fixed via `SUBJECT_SPLITS` dict
- Typo: "Physic" → "Physics" — fixed via `SUBJECT_TYPOS` dict

**Run both extractors in order**:
```bash
~/miniconda3/envs/jupascal/bin/python lingu_score_extract.py   # writes LingU_2026_Data.json
~/miniconda3/envs/jupascal/bin/python lingu_weights_extract.py # merges weightings into same JSON
```

**Output**: `Reference(2026)/LingU/LingU_2026_Data.json/xlsx` — 23 programmes with 2025 scores + 2026 weightings

---

### EdUHK
Scores + 2026 weightings PDF: JUPAS combined PDF `af_{Y-1}_JUPAS.pdf` (p23-26) — both years in one document
Entrance requirements PDF: `EdUHK_Entrance_Requirements_and_Admission_Score_Calculation.pdf`
Download via wget (site uses legacy SSL): `wget --no-check-certificate -O ... <url>`
URL: `https://www.eduhk.hk/acadprog/downloads/EdUHK_Entrance%20Requirements%20and%20Admission%20Score%20Calculation.pdf`
Extractor: `eduhk_pdf_extract.py` (reads both PDFs, merges, saves)

**26 programmes** (JS8xxx): 19 bachelor's + 6 five-year double degree teacher education + 1 Higher Diploma.

**Score formula**: All EdUHK programmes use **Best 5** (any best 5 HKDSE subjects, CSD excluded).

**Grade conversion**: Cat A: 5\*\*=7, 5\*=6, 5=5, 4=4, 3=3, 2=2, 1=1

**JUPAS scores PDF structure** (`af_{Y-1}_EdUHK.pdf`, 4 pages, 10-column table):
Both 2025 scores AND 2025/2026 weightings are in the same document.

| Column | Contains |
|--------|----------|
| 0 | JUPAS code (JS8xxx) |
| 1 | Programme Title |
| 2 | Subject weights for 2025 entry |
| 3 | None (merged) |
| 4 | Lower Quartile score (2025) |
| 5 | Median score (2025) |
| 6 | Mean score of specific subject (e.g. "Chinese: 6"; often "-") |
| 7 | None (merged) |
| 8 | Subject weights for 2026 entry |
| 9 | Remarks |

**Entrance requirements PDF structure** (2 pages):
- Page 1: GERs table (Bachelor's: Chi=3, Eng=3, Math=2, CSD=Attained, E1=2, E2=2) + grade conversion table
- Page 1 Table 3 (11 cols): Five-year Teacher Education Double Degree programmes (JS8001–JS8007)
- Page 2 Table 1 (15 cols): All remaining programmes (JS8008–JS8727 + JS8507 HD)

Col layout for page 2 (15 cols): `[None, code, None, name, chi, None, eng, math, csd, elect1, elect2, weights_col1, weights_col2, None, remarks]`

**Programme types** (from section headers, often split across PDF cells — match short keywords):
- "Teacher Education" → Teacher Education (5-year)
- "Non-Teacher" → Non-Teacher Education (4-year)  ← check before "Teacher" (substring)
- "Higher Diploma" → Higher Diploma (2-year)

**Weight parsing** — two quirks requiring special handling:
1. **Line-wrapped entries**: "Chinese Language\n(x1.5)" — accumulate lines until one ends with `(x N.NN)` to form one entry
2. **Inline multiple entries**: "DAT (x1.5) History (x1.5)" on one line — use `re.findall(r'(.+?)\s*\(x\s*([\d.]+)\)\*?', entry)` to split
3. **Complex "best one of" entries**: JS8007/JS8013 have "The best one subject of X, Y or Z (x1.5)" — these parse imperfectly (comma splits produce noise); raw text preserved in `subject_weights_raw`; handled in calculation logic

**Merged-row issue**: JS8002 and JS8003 share one row in the entrance requirements PDF → weight cell is concatenated and unreliable. Fix: mark with `weights_merged=True`, fall back to per-row weights from scores PDF.

**Biennial admissions**: Some programmes/majors admit in alternating years. Notes appear in the programme name cell as "[Biology & Chemistry major will be offered in 2026/27]". Captured in `admission_notes` field.

**Output**: `Reference(2026)/EdUHK/EdUHK_2026_Data.json/xlsx` — 26 programmes with 2025 scores + 2026 weightings + min requirements + programme type

---

### HKMU
Scores PDF: JUPAS combined PDF `af_{Y-1}_JUPAS.pdf` (p42-44) — split to `af_{Y-1}_HKMU.pdf`
Extractor: `hkmu_pdf_extract.py`

**28 programmes** (JS9xxx) across: School of Arts & Social Sciences, Lee Shau Kee School of Business & Administration, School of Education & Languages, School of Science & Technology.

**Score formula**: Best 5 (any best 5 subjects in Cat A, B, or C; explicitly stated in PDF).

**Grade conversion (Cat A)**: 5\*\*=7, 5\*=6, 5=5, 4=4, 3=3, 2=2 (Level 1 not shown in table; assumed =1).

**Important**: HKMU does NOT separately publish "next year's weightings" in this PDF. The weights column represents the weights used for the 2025 scores. Both `data_year_scores` and `data_year_weightings` are set to `2025`. If HKMU publishes updated 2026 weightings separately, this would need to be merged in.

**Scores PDF structure** (`af_{Y-1}_HKMU.pdf`, 3 pages, 9-column table):
- Page 1: Intro text + grade conversion tables only (no programme data)
- Pages 2–3: Programme data with school section headers

| Column | Contains |
|--------|----------|
| 0 | JUPAS code (JS9xxx^) or school section header |
| 1–3 | Programme name (may be split across multiple rows) |
| 4 | Median score (2025) |
| 5 | Lower Quartile score (2025) |
| 6–8 | Subject weights (e.g. "Chi Lang (x2)\nEng Lang (x1.5)"; "-" for none) |

**^ suffix**: Most codes are followed by `^` (self-financed programme marker). JS9580 has no `^`. Strip `^` when extracting.

**Multi-row programme names**: Name may span 2–4 rows; only col0 of the first row has the JS code. Continuation rows have None in col0. Collect name from cols 1–3 across all rows.

**Weight abbreviations** (abbreviated in PDF — not full HKDSE subject names):
- "Chi Lang" → Chinese Language
- "Eng Lang" → English Language
- "Chi Literature" → Chinese Literature
- "Child Care & Edu" / "Child Care & Dev" → Applied Learning subjects (for JS9580)

**School section carry-over**: When a school section spans across pages, the section header is only on page 2. `current_school` must be carried over when iterating pages.

**Output**: `Reference(2026)/HKMU/HKMU_2026_Data.json/xlsx` — 28 programmes with 2025 scores + weights

---

### SSSDP
PDF URL: `https://www.jupas.edu.hk/f/page/3669/af_{year}_SSSDP.pdf`
Extractor: `sssdp_pdf_extract.py`

**54 programmes** across 7 institutions, all self-financed / SSSDP-subsidised.
SSSDP programmes are for LOCAL JUPAS applicants only (stated in PDF).

| Institution | Code Prefix | Pages | Score Type | Notes |
|-------------|-------------|-------|------------|-------|
| HKMU (SSSDP) | JSSU | 3-5 | Median + LQ | Also has subject weights; JSSU ≠ JS9xxx |
| Hong Kong Shue Yan University | JSSY | 6 | Average | Code embedded in programme text |
| Saint Francis University | JSSA | 7-8 | Mean (Best 5) | Some scores have `*` (interview required) |
| THEi | JSSV | 9-10 | Average (Best 5) | Different Cat C scoring; "Not Applicable" = no score |
| Hang Seng University (HSUHK) | JSSH | 11 | Average | Code embedded in programme text |
| Tung Wah College | JSST | 12 | Mean | Clean 5-col table |
| UOW College Hong Kong | JSSW | 13 | Admission Score | Simple 2-programme table |

**HKMU dual-track**: JS9xxx codes (main JUPAS combined PDF) = self-financed places; JSSU codes (SSSDP PDF) = SSSDP-subsidised places at the same university. Both exist and have separate admission scores.

**Score types differ by institution**: Most provide only a single mean/average score. Only HKMU SSSDP provides Median + LQ. Use `score_type` field ("mean" | "median+lq") to distinguish.

**No separate weightings PDF**: SSSDP institutions do not publish separate annual weightings PDFs. The weights in the scores PDF represent the weights used for those 2025 scores → both `data_year_scores` and `data_year_weightings` = 2025.

**THEi-specific quirks**:
- Formula: Best 5 = Eng + Chin + Math + CSD (Attained counts as Level 2) + best elective (not free Best 5)
- Cat C scoring: A=3, B=3, C=3, D=2, E=2 (different from all other schools which use A=7, B=6...)
- Score type is labelled "Academic Year" in the PDF
- JSSV14 has "Not Applicable" score → `score_mean = null`
- Code is in col 7 (not col 0) on page 9; col 2 on page 10

**Shue Yan and Hang Seng**: Code is embedded within the programme name cell (e.g. "JSSY01 Bachelor of Commerce..."), not in its own column. Extract with `re.search(r"JSS[A-Z]\d+", text)`.

**HKMU SSSDP table structure** (pages 4-5):
- Page 4: 15-col table; code=col0, name=col3-5, median=col6, lq=col9, weights=col12-14
- Page 5: 9-col table (same as af_2025_HKMU.pdf); code=col0, name=col1-3, median=col4, lq=col5, weights=col6-8
- `^` suffix on most JSSU codes (self-financed marker) — strip when storing
- School section carry-over between pages (same pattern as HKMU extractor)

**Output**: `Reference(2026)/SSSDP/SSSDP_2026_Data.json/xlsx` — 54 programmes

---

### JUPAS Combined PDF (All Schools)
URL pattern: `https://www.jupas.edu.hk/f/page/3667/af_{year}_JUPAS.pdf`
Auto-splitter: `jupas_pdf_split.py`
Saved to: `Reference({year+1})/af_{year}_JUPAS.pdf`

Contains admission scores for all 9 schools in one document (CityU, HKBU, LingU, CUHK, EdUHK, PolyU, HKUST, HKU, HKMU). Page 1 is a cover/intro; school sections follow in variable order.

**Auto-detection method** (`jupas_pdf_split.py`):
- Each page's first line follows: `{Institution Name} – {Year} JUPAS Admissions Scores Page X of Y`
- Institution name is extracted and matched to a short key via keyword lookup (space-collapsed for robustness)
- Contiguous pages with the same institution = one school's section

**Keyword matching order** (order matters — more specific first):
1. "Science and Technology" → HKUST
2. "Polytechnic" → PolyU
3. "Chinese University" → CUHK
4. "Education University" → EdUHK
5. "Baptist" → HKBU
6. "Metropolitan" → HKMU
7. "City University" → CityU  ← must come before "University of Hong Kong"
8. "Lingnan" → LingU  ← match after space-collapse ("Lin gnan" kerning artifact)
9. "University of Hong Kong" → HKU  ← broadest, must be last

**Known quirks**:
- LingU header extracted as "Lin gnan University" (PDF kerning artifact) — fixed by `re.sub(r"\s+", "", name)` before matching
- "City University of Hong Kong" contains "University of Hong Kong" as substring — CityU keyword must rank above HKU
- PolyU pages use a slightly different header layout (institution on line 1, "Page X of Y" on line 3) but first-line detection still works

**Usage**:
```bash
# Download the PDF first, then:
~/miniconda3/envs/jupascal/bin/python jupas_pdf_split.py --year 2025
# Reads:  Reference(2026)/af_2025_JUPAS.pdf
# Writes: Reference(2026)/{school}/af_2025_{school}.pdf
```

---

## 2025 Weights Extraction — Status & Field Names

For the 2026 calculator, 2025 scores must be paired with 2025 weightings. Here is the status of each school's 2025 weight extraction and the field names used in the corresponding JSON files:

| School | Status | Field Added | Source |
|--------|--------|-------------|--------|
| LingU | ✅ Done | `subject_weights_2025` (dict) | `lingu_2025_weights_extract.py` ← `LingU 2025 Weighting.pdf` |
| CityU | ✅ Done | `subject_weights_2025` (per-category dict with `weight_english/chinese/maths/electives`) | inline script ← `2025_JUPAS_Main_Admission_Score_Calculation.pdf` |
| HKBU | ✅ Done | `subject_weights_2025` (abbreviated-key dict, e.g. `{"ENG": 2.0}`) | inline script ← `HKBU 2025 Weighting.pdf` |
| CUHK | ✅ Done | `subject_weights_2025_raw` (raw bullet string), `score_uq/median/lq_2025` | merged from `CUHK_PDF_2025_Extracted.json` |
| EdUHK | ✅ Done | `subject_weights_2025` (dict) | already in JUPAS combined PDF col 2 |
| HKU | ✅ Sufficient | `formula_2025` (formula text string, already in JSON from scraper) | from API `accordionHTML` |
| HKUST | ✅ Partial | `formula_text_2025` (raw text, 16/33 codes); remaining 17 → use `engMultiplier`/`secondMultiplier` (confirmed stable 2025≡2026) | `HKUST_UGBrochure_JUPAS_Online_May2025.pdf` |
| PolyU | ✅ Done | `weights_2025` (compact string, same format as `weights_2026`); `PolyU_2025_Weights.json` (structured list) | 45 × `2025_JS3xxx_SW.pdf` in `Reference(2026)/PolyU/` |
| HKMU | ✅ N/A | `data_year_weightings: 2025` (weights and scores both 2025) | already in HKMU extractor output |
| SSSDP | ✅ N/A | `data_year_weightings: 2025` (same as scores) | already in SSSDP extractor output |

**LingU 2025 PDF quirk**: Copyright footer `C OPYRIGHT© 2025 LINGNAN UNIVERSITY. ALL RIGHTS RESERVED. 4` (with space, ends with page number) matches `WEIGHT_RE` — skip via `"OPYRIGHT" in line` substring check, NOT startswith. See `lingu_2025_weights_extract.py`.

**PolyU 2025 SW PDFs**: Each 1-page PDF has 2 tables — Table 0 = Category A subjects, Table 1 = Category C (other language) subjects. No Category column is in the PDF; infer from table index. JS3241 was renamed JS3243 for 2026 — use JS3241's 2025 weights for JS3243.

**HKUST formula stability**: Cross-checked 9 codes where 2025 brochure formula text exists — `engMultiplier`/`secondMultiplier` in 2026 JS data match 2025 brochure exactly. Safe to use 2026 multipliers as 2025 proxy for the 17 codes with merged-cell formula gaps. Engineering school (JS5220–JS5282) and Business (JS5311–JS5318, JS5332) are merged-cell gaps in pdfplumber.

**CUHK note**: `CUHK_PDF_2025_Extracted.json` (70 entries) has actual 2025 UQ/Median/LQ scores and raw weight strings. The `CUHK_2026_Data.json` `expected_score` field is CUHK's projected reference for 2026 entry — not the same as actual 2025 admission scores. Both are now in the JSON.

---

## Score Calculation Methods
Programmes use different formulas — these must be sourced per school each year:
- **Best 5** — top 5 subjects (sometimes Chinese is compulsory)
- **3 Cores + 2 Electives** — Chinese, English, Maths + best 2 electives
- **3 Cores + 2 Electives (Science required)** — one elective must be science
- **Weighted score** — each subject × programme-specific weighting factor
- **Bonus points** — some schools add bonuses for certain subjects or grades

---

## Architecture

### Current: Excel + OneDrive
- `index.html` embeds an Excel file hosted on OneDrive via iframe
- Excel uses complex cell references and formulas to handle different calculation methods per programme
- Limitation: difficult to maintain ("spaghetti"), no persistent user data, limited to Excel's capabilities

### Legacy System Analysis
The project is currently transitioning from an Excel-based system. A detailed technical breakdown of the Excel sheet's logic (v1.0.3) can be found in [EXCEL_LOGIC.md](EXCEL_LOGIC.md).

### Future Direction: Web Application
- Replace Excel with a proper web app
- Input form for DSE grades, dynamic score calculation, ranked results vs. historical admission scores
- Potential stack: static HTML/JS (no backend needed) or FastAPI + JS frontend
- All weighting/calculation rules stored as structured data (JSON or similar)

---

## Environment
- Python env: `~/miniconda3/envs/jupascal` (pandas, requests, beautifulsoup4, openpyxl, pdfplumber, pypdf)
- Run scripts with: `~/miniconda3/envs/jupascal/bin/python <script.py>`

---

## PDF Extraction — Merged Cell Pattern (Common Across All Universities)

PDFs from all universities commonly use **merged cells** in their tables. pdfplumber assigns the content of a merged cell to only ONE of the rows it spans; neighbouring rows in the same group get `None`/empty for those columns.

**Detection**: A programme is likely in a merged group (empty due to merge, not truly missing data) if its `weight_electives` column contains partial data — either:
- `·` bullet points (e.g. `· Biology | · Chemistry`)
- Descriptive text (e.g. `1: Other elective subjects`)
A programme with `weight_electives = ""` or only bare numbers like `"2:"` is genuinely empty (e.g. new programme with no published data yet).

**Fix — `fill_merged_cells(results)`** (see `cityu_pdf_weights_extract.py`):
1. Group consecutive same-college programmes into "merge groups" — a group breaks when two adjacent programmes BOTH have data
2. Within each group with exactly one filled entry, propagate its values to empty neighbours that pass the `likely_in_merged_group()` check
3. Mark filled entries with `fill_note: "inherited from JSXXXX"` for auditability

**Heuristics used**:
- Same-college boundary: don't fill across college sections
- Only fill if `weight_electives` has real content (not just leaked numbers)
- `fill_note` flags all inherited values for manual review

---

## Known Issues & Learnings

> **For a detailed record of the data unification phase, PDF vs API strategies, and university-specific parsing challenges for the 2026 cycle, please refer to [DATA_UNIFICATION_LEARNINGS.md](DATA_UNIFICATION_LEARNINGS.md).**

### Scraping (`{year}_scrap.py`)
- Some university pages lack the expected `program_table program_table-hasFC` table — skip with a `None` check, don't crash
- Some programme pages lack the `programInfo_block programInfo_block-firstyear` quota div — handle gracefully with a `None` check
- Step 1 (Programme Overview) is slow but only needs to run once — check for existing output file and skip if already present
- Step 2 (Offer Table) uses `time.sleep(1)` per programme (~400+ programmes) — always run in background, takes ~7-10 min
- Progress output uses `\r` — does not flush to background task output file; check for output Excel files to confirm progress instead

### Git / GitHub
- Python conda environment: `jupascal` — always use full path `~/miniconda3/envs/jupascal/bin/python`
- Archives follow naming: `Archives/{year} JUPAS 計分器/`
