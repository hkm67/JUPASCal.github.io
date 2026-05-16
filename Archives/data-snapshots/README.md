# Data Snapshots

Point-in-time copies of JUPAS source data, kept as an internet archive.

JUPAS regularly removes past programmes from its public site when they are discontinued. Once gone, the historical application/offer figures, requirements, and weightings are not republished. Snapshotting before any data refresh preserves that record.

## Layout

```
Archives/data-snapshots/
  YYYY-MM-DD-<context>/
    <per-school JSON files that are about to change>
    JUPAS_2026_Unified_Data.json
```

## When to add a snapshot

Before any of:
- Re-running `scripts/extraction/*_scrap.py` or `*_pdf_extract.py`
- Re-running `scripts/utils/unify_2026_data.py`
- Editing any per-school JSON under `Reference(YYYY)/`

Commit the snapshot in the same change set as the refresh.

## Recovery

Compare a current programme list against the most recent snapshot to find programmes that JUPAS has removed:

```bash
python3 -c "
import json
old = {p['jupas_code'] for p in json.load(open('Archives/data-snapshots/<DATE>/JUPAS_2026_Unified_Data.json'))}
new = {p['jupas_code'] for p in json.load(open('data/processed/JUPAS_2026_Unified_Data.json'))}
print('Removed:', sorted(old - new))
print('Added:  ', sorted(new - old))
"
```
