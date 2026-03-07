# JUPAS Cal 2026 — Project Instructions

## Overview
An unofficial JUPAS score calculator for HK university applicants. Users input their DSE subject grades; the tool calculates estimated scores per programme based on each university's published weighting formula, then compares against historical admission scores.

---

## Participating Institutions

### 8 Main Schools (UGC-funded)
| Abbr | Institution |
|------|-------------|
| HKU | University of Hong Kong |
| CUHK | Chinese University of Hong Kong |
| HKUST | Hong Kong University of Science and Technology |
| PolyU | Hong Kong Polytechnic University |
| CityU | City University of Hong Kong |
| HKBU | Hong Kong Baptist University |
| LingU | Lingnan University |
| EdUHK | Education University of Hong Kong |

### Other
| Abbr | Institution | Notes |
|------|-------------|-------|
| HKMU | Hong Kong Metropolitan University | Self-funded programmes |
| SSSDP | Study Subsidy Scheme for Designated Professions/Sectors | Aggregated list of various institutions; some HKMU programmes appear here instead of under HKMU |

---

## Data Needed Per School

For each school and each programme, the following must be collected:

| Data | Source Type | Notes |
|------|-------------|-------|
| JUPAS code | JUPAS website (scraped) | e.g. JS1000 |
| Programme name (EN + ZH) | JUPAS website (scraped) | |
| Quota | JUPAS website (scraped) | |
| Application statistics | JUPAS website (scraped) | |
| Offer statistics / admission scores | Per-university (PDF or webpage) | Varies by school |
| Subject weightings | Per-university (PDF or webpage) | Varies by school |
| Score calculation method | Per-university (PDF or webpage) | e.g. Best 5, 3 Cores + 2 electives |
| Minimum entry requirements | Per-university (PDF or webpage) | |

---

## Data Sources (Per School)

Each school publishes data differently. Common formats: PDF, HTML table, or downloadable Excel.

- **HKU** — Publishes scoring formula + expected scores PDF; also has web page
- **CUHK** — PDF with admission scores and weightings per programme
- **HKUST** — PDF with admission scores
- **PolyU** — Subject weighting PDFs per programme (bulk download possible via script)
- **CityU** — Combined PDF: score formula + admission scores
- **HKBU** — Subject weight table PDF; detailed score page online
- **LingU** — Weighting PDF + admission scores PDF
- **EdUHK** — Combined weighting & entrance requirements PDF + admission scores PDF
- **HKMU** — Admission scores PDF
- **SSSDP** — Varies per institution in the list

---

## Score Calculation Methods

Different schools / programmes use different formulas. Common patterns:

- **Best 5** — Top 5 subject scores (with or without Chinese required)
- **3 Cores + 2 Electives** — Compulsory Chinese, English, Maths + best 2 electives
- **3 Cores + 2 Electives (Science required)** — As above but one elective must be a science subject
- **Weighted score** — Each subject multiplied by a programme-specific weighting factor
- **Bonus points** — Some schools add bonus for certain subjects or grades

---

## Automation Strategy

### Already Automated (scraping script: `2026_scrap.py`)
- All JUPAS codes, programme names (EN + ZH), institutions
- Quota per programme
- Application & offer statistics (historical)
- Output: `2026 JUPAS Program Overview.xlsx`, `2026 JUPAS Offer Table.xlsx`

### To Automate (per school)
- PolyU — already has a scraping script from prior years (`polyu.ps1`)
- CUHK — tabula-based PDF extraction (prior scripts exist in Archives)
- Others — to be built per school

### Manual (for now)
- Schools that only publish PDFs with no machine-readable structure
- Verify scraped data against source

---

## Future Direction: Web Application
The current Excel-based approach uses complex cell references and formulas ("spaghetti code") to handle the different calculation methods. A proper web app would:
- Have a clean input form (DSE grades per subject)
- Calculate scores dynamically per programme using stored weighting rules
- Display results ranked by estimated score vs. historical admission scores
- Be easier to maintain and update each year

**Potential stack:** Python (FastAPI or Flask) backend + simple HTML/JS frontend, or a static site with JS only.

---

## Workflow for 2026 Update

1. [x] Archive 2024 & 2025 files
2. [x] Create `2026_scrap.py` and run → `2026 JUPAS Program Overview.xlsx` + `2026 JUPAS Offer Table.xlsx` (422 programmes)
3. [ ] Collect per-school weighting & admission score data:
   - [x] CUHK — 4 PDFs in `Reference(2026)/CUHK/`
   - [x] CityU — API scraper (`cityu_scrap.py`) + 2 PDFs + 2 extractors in `Reference(2026)/CityU/`
   - [ ] HKU — **next up**
   - [ ] HKUST
   - [ ] PolyU (prior `polyu.ps1` in Archives)
   - [ ] HKBU
   - [ ] LingU
   - [ ] EdUHK
   - [ ] HKMU
   - [ ] SSSDP
4. [ ] Build automation scripts per school where possible
5. [ ] Compile all data into the 2026 Excel (or web app)
6. [ ] Update `index.html` with new OneDrive embed link
7. [ ] Commit and open Pull Request on GitHub
