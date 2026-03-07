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
| HKBU | PDF + webpage | Subject weight table + detailed score page |
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

### Future Direction: Web Application
- Replace Excel with a proper web app
- Input form for DSE grades, dynamic score calculation, ranked results vs. historical admission scores
- Potential stack: static HTML/JS (no backend needed) or FastAPI + JS frontend
- All weighting/calculation rules stored as structured data (JSON or similar)

---

## Environment
- Python env: `~/miniconda3/envs/jupascal` (pandas, requests, beautifulsoup4, openpyxl)
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

### Scraping (`{year}_scrap.py`)
- Some university pages lack the expected `program_table program_table-hasFC` table — skip with a `None` check, don't crash
- Some programme pages lack the `programInfo_block programInfo_block-firstyear` quota div — handle gracefully with a `None` check
- Step 1 (Programme Overview) is slow but only needs to run once — check for existing output file and skip if already present
- Step 2 (Offer Table) uses `time.sleep(1)` per programme (~400+ programmes) — always run in background, takes ~7-10 min
- Progress output uses `\r` — does not flush to background task output file; check for output Excel files to confirm progress instead

### Git / GitHub
- Python conda environment: `jupascal` — always use full path `~/miniconda3/envs/jupascal/bin/python`
- Archives follow naming: `Archives/{year} JUPAS 計分器/`
