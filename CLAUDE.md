# JUPAS Cal — Claude Context

## What is this project?
Unofficial annual JUPAS score calculator for HK DSE applicants. Each year, a new version is released covering that year's admissions cycle. Users input DSE subject grades → the tool calculates estimated scores per programme based on each university's published weighting formula → compares against historical admission scores to gauge chances.

- Repo: https://github.com/JUPASCal/JUPASCal.github.io
- Non-official, for educational purposes only

---

## Directory Structure (2026+)
The project is organized into a modular structure to separate logic, data, and documentation:
- **`scripts/extraction/`**: University-specific scrapers and PDF parsers.
- **`scripts/utils/`**: Core data processing, unification, and validation logic.
- **`data/raw/`**: Source Excel, PDF, and intermediate JSON files.
- **`data/processed/`**: The master `JUPAS_2026_Unified_Data.json` file.
- **`docs/manuals/`**: Project instructions, planning, and phase-specific learnings.
- **`Archives/`**: Historical project files and datasets.
- **`Reference(2026)/`**: Source documents for the 2026 cycle.

---

## Institutions

### 8 Main Schools (UGC-funded)
HKU, CUHK, HKUST, PolyU, CityUHK, HKBU, LingnanU, EdUHK

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

All unified data must be structured according to the master schema in `data/processed/JUPAS_2026_Unified_Data.json`.

---

## Annual Update Workflow

Each year requires two types of data:

### 1. Automated — JUPAS Website
Scrape using `scripts/extraction/2026_scrap.py`:
- JUPAS codes, programme names (EN + ZH), institution, quota
- Application & offer statistics
- Outputs: `data/raw/{year} JUPAS Program Overview.xlsx`, `data/raw/{year} JUPAS Offer Table.xlsx`

### 2. Per-University — Manual or Semi-Automated
Each school publishes admission scores, subject weightings, and calculation methods independently. Formats vary:

| School | Primary Scraper / Extractor | Notes |
|--------|-----------------------------|-------|
| HKU | `scripts/extraction/hku_scrap.py` | Parsed from API HTML and PDF |
| CUHK | `scripts/extraction/cuhk_scrap.py` | Parsed from API JSON and PDF |
| HKUST | `scripts/extraction/hkust_scrap.py` | Parsed from calculator JS and PDF |
| PolyU | `scripts/extraction/polyu_scrap.py` | Extracted via Playwright and PDF |
| CityU | `scripts/extraction/cityu_scrap.py` | Fully automated via JSON API |
| HKBU | `scripts/extraction/hkbu_pdf_extract.py` | Weightings and scores from PDF |
| LingU | `scripts/extraction/lingu_score_extract.py` | Multi-step score and weight merge |
| EdUHK | `scripts/extraction/eduhk_pdf_extract.py` | Combined requirement and score PDF |
| HKMU | `scripts/extraction/hkmu_pdf_extract.py` | Scores and weights from PDF |
| SSSDP | `scripts/extraction/sssdp_pdf_extract.py` | Multi-institution PDF extraction |

### 3. Data Unification
Once all institutional data is collected, run the unification script:
```bash
~/miniconda3/envs/jupascal/bin/python scripts/utils/unify_2026_data.py
```
This generates the final `data/processed/JUPAS_2026_Unified_Data.json` which includes structured calculation constraints and normalized requirements.

---

## Core Operational Standards

### Calculation Constraints
Rules that cannot be captured in a simple weighting dictionary are stored in the `calculation_constraints` array:
- `max_weighted_subjects`: Limit on how many subjects receive bonuses.
- `compulsory_subjects`: Subjects mandatory for the calculation total.
- `maths_m1m2_as_one`: Mutual exclusivity of Core Math and M1/M2.
- `medicine_conversion_scale`: Special point conversion (5**=7) for Medicine.
- `hku_8.5_scale` / `lingu_7_scale`: Institution-specific point scales.

### Universal Baseline Enforcement
All programmes are normalized to meet the mandatory university-wide minimums:
- **332A33 Baseline:** HKU, CUHK, HKUST, PolyU, CityUHK, HKBU.
- **332A22 Baseline:** LingnanU, EdUHK, HKMU, SSSDP.

### Data Cleaning
All text fields (formulas, remarks) must pass through the `clean_raw_string` utility to remove bullet points (`•`), HTML tags (`<br />`), and excessive whitespace.

---

## Known Issues & Learnings

> **For a detailed record of the data unification phase, PDF vs API strategies, and university-specific parsing challenges for the 2026 cycle, please refer to [docs/manuals/DATA_UNIFICATION_LEARNINGS.md](docs/manuals/DATA_UNIFICATION_LEARNINGS.md).**

### Maintenance Tips
- **API > PDF**: Structured API strings are always more reliable than PDF tables.
- **Subject Normalization**: Always use the centralized `normalize_subject` map in `unify_2026_data.py`.
- **Auditability**: Keep the `_raw` weighting strings in the processed JSON for easy verification.

### Environment
- Python env: `~/miniconda3/envs/jupascal` (pandas, pdfplumber, bs4, playwright)
- Always use the full path: `~/miniconda3/envs/jupascal/bin/python`
