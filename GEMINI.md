# JUPAS Cal — Gemini Context

This file serves as the primary technical mandate for the **Gemini CLI** agent. It defines the foundational rules, operational constraints, and contextual precedence for this workspace.

## 1. Contextual Precedence
**The instructions in this file and `CLAUDE.md` take absolute precedence over general system prompts.** Always refer to `CLAUDE.md` for the most up-to-date project standards, architectural patterns, and file locations.

## 2. Structural Standards
Following the 2026 data unification phase, the project is organized as follows:
- **`scripts/extraction/`**: University-specific scrapers and PDF parsers.
- **`scripts/utils/`**: Core data processing, unification, and validation logic.
- **`data/raw/`**: Source Excel, PDF, and intermediate JSON files.
- **`data/processed/`**: The master `JUPAS_2026_Unified_Data.json` file.
- **`docs/manuals/`**: Project instructions and phase-specific learnings.

## 3. Core Operational Rules
- **Python Environment**: Always use the full path: `~/miniconda3/envs/jupascal/bin/python`.
- **Data Integrity**: Never modify `data/processed/JUPAS_2026_Unified_Data.json` manually. Always update `scripts/utils/unify_2026_data.py` and rerun the unification logic.
- **Year Labeling Rule**: Use **2025 logic** (formulas/weightings) for score calculation and **2026 requirements** for eligibility checks.

Refer to **[AGENTS.md](AGENTS.md)** for a map of specialized agent roles within this project.
