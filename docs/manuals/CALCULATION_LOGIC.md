# JUPAS Cal — Calculation Logic & Engine

This document defines the computational logic for the JUPAS 2026 Calculator. The logic is designed to be purely client-side (JavaScript) while maintaining bit-perfect parity with our Python reference implementation.

## 1. The Calculation Pipeline

For a given programme and a student's grades, the engine follows these four steps:

### Step A: Grade Conversion
Convert DSE letter/number grades into raw points using the programme's specific `score_conversion_table`. Each programme's table is pre-embedded in the JSON, so no manual branching is required in code.

For reference, the two scales in use are:

| Scale | Institutions | 5** | 5* | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|---|---|---|
| **8.5 Scale** | HKU, HKUST, CityUHK, PolyU, CUHK (most programmes) | 8.5 | 7.0 | 5.5 | 4.0 | 3.0 | 2.0 | 1.0 |
| **7 Scale** | LingnanU, EdUHK, HKBU, HKMU, SSSDP, CUHK Medicine (JS4501/JS4502) | 7.0 | 6.0 | 5.0 | 4.0 | 3.0 | 2.0 | 1.0 |

*   **Other Language (Cat C):** A=5, B=4, C=3, D=2, E=1 (standard); CUHK Medicine uses A=7, B=6, C=5, D=4, E=3.
*   **CSD:** Attained → 0 points (excluded from Best-N pool entirely).
*   **ApL:** Attained with Distinction → 4, Attained → 3 (only counted if explicitly listed in `subject_weights_2025`).

### Step B: Weighting Application
Apply multipliers from `subject_weights_2025` and `best_of_weights_2025`.
*   **Flat Weight:** `weighted_score = converted_points * multiplier`
*   **Conditional Pool:** Identify the top N subjects from a pool (e.g., M1 or M2) and apply the pool's multiplier to them.

### Step C: Constraint Filtering
Filter the subjects based on `calculation_constraints`:
*   **Compulsory Subjects:** These MUST be included in the total, regardless of their score.
*   **Mutual Exclusivity:** E.g., `maths_m1m2_as_one` prevents the calculator from using both Core Math and M1/M2 in the same "Best N" total.

### Step D: Selection (Best N)
1.  Add all **Compulsory Subjects** to the selection.
2.  Sort all remaining eligible subjects by their **weighted score** in descending order.
3.  Fill the remaining slots (e.g., up to 5 for "Best 5") with the highest-scoring subjects.

---

## 2. Reference Implementations

*   **Python (Ground Truth):** `scripts/utils/calculation_engine.py`
*   **JavaScript (Production):** `js/calculator.js`

## 3. Data Audit Trail
Every calculation result must return an `audit_trail` object containing:
1.  The list of subjects selected (green in UI).
2.  The raw conversion points.
3.  The multipliers applied.
4.  The final weighted score per subject.
