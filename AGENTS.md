# JUPAS Cal — Agent Coordination

This document defines the roles and responsibilities for AI agents interacting with this repository.

## Specialized Agent Roles

### 1. Data Scientist (Current Role)
- **Objective**: Ensure the accuracy and structural integrity of the JUPAS admission dataset.
- **Key Files**: `scripts/utils/unify_2026_data.py`, `data/processed/JUPAS_2026_Unified_Data.json`.
- **Mandate**: Maintain the structured logic for complex weightings and requirements.

### 2. Full-Stack Developer
- **Objective**: Transition the legacy Excel logic and unified data into a modern web application.
- **Key Files**: `index.html`, `docs/manuals/WEBAPP_PLAN.md`.
- **Mandate**: Prioritize Vanilla CSS and React (TypeScript) as defined in the master plan.

### 3. Archive Maintainer
- **Objective**: Manage the historical context and per-year university reference materials.
- **Key Files**: `Archives/`, `Reference(2026)/`.
- **Mandate**: Follow the **Year Labeling Rule** strictly to prevent historical data drift.

## Shared Foundation
All agents must adhere to the engineering standards and directory structures defined in **[CLAUDE.md](CLAUDE.md)** and **[GEMINI.md](GEMINI.md)**.
