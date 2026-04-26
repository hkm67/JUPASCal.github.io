import json
import os
import pandas as pd
import re
from bs4 import BeautifulSoup

"""
JUPAS Data Unification Script (2026 Cycle)
------------------------------------------
This script merges admission data from 10 different institutions into a single
unified JSON file: JUPAS_2026_Unified_Data.json.

CORE LOGIC:
1. Primary Calculation basis is 2025: Since reference scores (UQ/M/LQ) provided
   by universities are based on the 2025 applicant pool, we must use the 
   2025 weightings and formulas to calculate a student's score for comparison.
2. Requirements are 2026: We use the 2026 minimum levels to determine eligibility.
3. Structured Logic: Complex rules (like conditional pools or "best of" weights)
   are parsed into objects to facilitate machine calculation.
"""

# File paths for institution-specific JSONs (extracted via university scrapers)
FILES = {
    "CityU": "Reference(2026)/CityU/CityU_2026_Data.json",
    "CUHK": "Reference(2026)/CUHK/CUHK_2026_Data.json",
    "EdUHK": "Reference(2026)/EdUHK/EdUHK_2026_Data.json",
    "HKBU": "Reference(2026)/HKBU/HKBU_2026_Data.json",
    "HKMU": "Reference(2026)/HKMU/HKMU_2026_Data.json",
    "HKU": "Reference(2026)/HKU/HKU_2026_Data.json",
    "HKUST": "Reference(2026)/HKUST/HKUST_2026_Data.json",
    "LingU": "Reference(2026)/LingU/LingU_2026_Data.json",
    "PolyU": "Reference(2026)/PolyU/PolyU_2026_Data.json",
    "SSSDP": "Reference(2026)/SSSDP/SSSDP_2026_Data.json"
}

# Supplemental: HKUST structured formula data reverse-engineered from official JS calculator
HKUST_JS_EXTRACT = "Reference(2026)/HKUST/HKUST_2026_JS_Extracted.json"

# Supplemental Data Files (PDF extractions or raw API caches)
CUHK_2025_REQ = "Reference(2026)/CUHK/CUHK_PDF_2025_Requirements.json"
CUHK_2026_REQ = "Reference(2026)/CUHK/CUHK_PDF_2026_Requirements.json"
HKU_RAW_API = "Reference(2026)/HKU/hku_raw_api.json"
POLYU_WEIGHTS_2026 = "Reference(2026)/PolyU/PolyU_2026_Weights.json"

OVERVIEW_FILE = "data/raw/2026 JUPAS Program Overview.csv"
OFFER_TABLE_FILE = "data/raw/2026 JUPAS Offer Table.csv"
OUTPUT_FILE = "data/processed/JUPAS_2026_Unified_Data.json"
CUHK_GRADES_FILE = "Reference(2026)/CUHK/cuhk_grades_2025.json"
SUBJECT_MAPPING_FILE = "data/raw/subject_mapping.json"

# Global mapping loaded once from external JSON
with open(SUBJECT_MAPPING_FILE, encoding="utf-8") as f:
    SUBJECT_MAP = json.load(f)

def normalize_subject(name):
    """
    Standardizes all DSE subject names across 10 institutions using an external canonical map.
    Converts Chinese terms, school-specific abbreviations, and variations.
    """
    if not name: return name
    # Clean string: remove bullets, trailing punctuation, and extra whitespace
    # We strip trailing periods and spaces, but NOT parentheses here to avoid breaking core names
    name = str(name).strip().replace("•", "").strip(" .")
    
    # Authoritative Mapping (case-insensitive lookup using external JSON)
    # We strip trailing parenthesis for the lookup key only
    name_clean = name.upper().strip(")")
    if name_clean in SUBJECT_MAP:
        return SUBJECT_MAP[name_clean]
    
    # Handle common abbreviations and prefix 'A' in CUHK
    if name_clean.startswith("A") and name_clean[1:] in SUBJECT_MAP:
        return SUBJECT_MAP[name_clean[1:]]

    # Special case: Category A wildcard string from API
    if "CATEGORY A" in name_clean:
        return "*"

    # Handle mangled internal parentheses
    if "(" in name:
        name_upper = name.upper()
        if "MODULE 1" in name_upper or "M1" in name_upper or "CALCULUS AND STATISTICS" in name_upper: 
            return "Mathematics Extended Part (Module 1)"
        if "MODULE 2" in name_upper or "M2" in name_upper or "ALGEBRA AND CALCULUS" in name_upper: 
            return "Mathematics Extended Part (Module 2)"
        if "COMPULSORY" in name_upper: return "Mathematics (Compulsory Part)"
        
    return name
def parse_hku_min_reqs(html):
    """Extract ENG/CHI/MATH/CSD/E1/E2 levels and specific constraints from HKU API HTML."""
    if not html: return {}
    soup = BeautifulSoup(html, 'html.parser')
    
    # 1. Basic Table
    table = soup.find('table', class_='section-Minimum-Level-Requirement')
    reqs = {}
    if table:
        rows = table.find_all('tr')
        if len(rows) >= 3:
            cells = rows[2].find_all('td')
            labels = ["eng", "chi", "math", "csd", "elect1", "elect2"]
            for i, label in enumerate(labels):
                if i < len(cells):
                    val = cells[i].get_text(strip=True).replace("Level ", "")
                    reqs[label] = val
    
    # 2. Specific Electives Table
    spec_table = soup.find('table', class_='section-Specific-Elective-Subject-Requirement')
    if spec_table:
        td = spec_table.find('td')
        if td:
            reqs["specific_elective_desc"] = td.get_text(strip=True)
            
    return reqs

def parse_hku_extra_info(html):
    """Extract formula, other factors, and repeater policy from HKU HTML."""
    if not html: return {}
    soup = BeautifulSoup(html, 'html.parser')
    results = {}
    for row in soup.find_all('tr'):
        th = row.find('th')
        td = row.find('td')
        if th and td:
            header = th.get_text(strip=True)
            val = clean_raw_string(td.get_text(separator=' ', strip=True))
            if "Scoring Formula" in header:
                results["formula_desc"] = val
            elif "Other Factors" in header:
                results["other_factors"] = val
            elif "Repeaters" in header:
                results["repeater_policy"] = val
    return results

def parse_hku_weights(weight_text):
    """Parse HKU weight piped strings: 'X 1.5: Subj1 / Subj2 | X 2: Subj3'."""
    if not weight_text or weight_text == "–": return {}
    weights = {}
    parts = weight_text.split('|')
    for part in parts:
        m = re.match(r'X\s*([\d.]+):\s*(.+)', part.strip())
        if m:
            weight = float(m.group(1))
            subjects = m.group(2).split('/')
            for s in subjects:
                weights[normalize_subject(s.strip())] = weight
    return weights

def parse_hku_formula_weights(formula_text):
    """Extract explicit HKU formula multipliers such as '1.5 x Chin' or '2 x M1 / M2'."""
    if not formula_text:
        return {}

    weights = {}
    text = str(formula_text)
    alias_map = {
        "chin": ["Chinese Language"],
        "chinese": ["Chinese Language"],
        "eng": ["English Language"],
        "english": ["English Language"],
        "math": ["Mathematics (Compulsory Part)"],
        "maths": ["Mathematics (Compulsory Part)"],
    }

    for match in re.finditer(r'([\d.]+)\s*x\s*(Chin(?:ese)?|Eng(?:lish)?|Maths?)\b', text, re.IGNORECASE):
        weight = float(match.group(1))
        for subject in alias_map[match.group(2).lower()]:
            weights[subject] = weight

    for match in re.finditer(r'(M1\s*/\s*M2)\s*x\s*([\d.]+)', text, re.IGNORECASE):
        weight = float(match.group(2))
        weights["Mathematics Extended Part (Module 1)"] = weight
        weights["Mathematics Extended Part (Module 2)"] = weight

    for match in re.finditer(r'([\d.]+)\s*x\s*(M1\s*/\s*M2)', text, re.IGNORECASE):
        weight = float(match.group(1))
        weights["Mathematics Extended Part (Module 1)"] = weight
        weights["Mathematics Extended Part (Module 2)"] = weight

    return weights

def parse_cuhk_weights(weight_text):
    """
    Parse CUHK weight strings.
    Extracts both flat weights (AENGL:2) and conditional pools (Best(1,[AECON,AINCT]):1.5).
    """
    if not weight_text or weight_text in ["--", ""]: return {}, []
    
    flat_weights = {}
    best_of_weights = []
    
    # regex for Best(N, [Pool]):Multiplier
    for m in re.finditer(r'Best\((\d+)\s*,\s*\[(.*?)\]\)\s*:\s*([\d\.]+)', weight_text):
        count = int(m.group(1))
        subjs = re.findall(r'A([A-Z0-9]+)', m.group(2))
        norm_subjs = [normalize_subject(s) for s in subjs]
        best_of_weights.append({
            "count": count,
            "subjects": norm_subjs,
            "weight": float(m.group(3))
        })
        
    # strip the parsed Best() parts to handle remaining flat weights
    remainder = re.sub(r'Best\(\d+\s*,\s*\[.*?\]\)\s*:\s*[\d\.]+', '', weight_text)
    
    # regex for Code:Multiplier
    for m in re.finditer(r'A([A-Z0-9]+)\s*:\s*([\d\.]+)', remainder):
        subj = normalize_subject(m.group(1))
        flat_weights[subj] = float(m.group(2))
        
    return flat_weights, best_of_weights

def parse_hkust_weights(other_subjects_text):
    """
    Attempt to extract sub-weightings from HKUST's formula text.
    Example: 'Physics (x2), ICT (x1.5), Biology / Chemistry (x1)'
    """
    if not other_subjects_text: return [], {}
    
    best_of = []
    flat = {}
    
    # Extract blocks like 'Weighting: Physics (x2), ICT (x1.5)'
    # We look for (xN.N) patterns
    matches = re.finditer(r'([A-Z0-9\s/]+)\s*\(x\s*([\d.]+)\)', other_subjects_text)
    for m in matches:
        subjs_raw = m.group(1).strip()
        weight = float(m.group(2))
        
        # Split subjects by / or , and strip special notation chars (*, #, ~, ^)
        subjs = [normalize_subject(s.strip().strip("*#~^ \u25c6")) for s in re.split(r'/|,', subjs_raw) if s.strip()]
        
        # If it's a single subject, add to flat weights if multiplier > 1
        if len(subjs) == 1 and weight > 1.0:
            flat[subjs[0]] = weight
        elif len(subjs) > 1:
            best_of.append({
                "count": 1, # Usually "Best from..."
                "subjects": subjs,
                "weight": weight
            })
            
    return best_of, flat

def parse_polyu_weights_string(w_str):
    """Parse PolyU compact string format: 'Subj (W=X, CatY); ...'"""
    if not w_str or w_str in ["", "--", "-"]: return {}
    weights = {}
    parts = w_str.split(';')
    for p in parts:
        # Matches "Subject Name (W=7, CatA)" or similar
        m = re.search(r'^(.*?)\s*\(W=([\d.]+)', p.strip())
        if m:
            subj = normalize_subject(m.group(1).strip())
            weight = float(m.group(2))
            weights[subj] = weight
    return weights

def get_conversion_table(institution, is_medicine=False):
    """
    Returns the grade-to-point conversion table for the institution.
    Standard (Group A): 5**=8.5, 5*=7, 5=5.5, 4=4, 3=3, 2=2, 1=1
    Standard (Group B): 5**=7, 5*=6, 5=5, 4=4, 3=3, 2=2, 1=1
    """
    # Group B institutions or special cases
    if institution in ["LingnanU", "EdUHK", "HKBU", "HKMU", "SSSDP"] or is_medicine:
        table = {
            "5**": 7.0, "5*": 6.0, "5": 5.0, "4": 4.0, "3": 3.0, "2": 2.0, "1": 1.0,
            "attained": 0.0, "A": 0.0
        }
        # Add Category C for these schools if known (standard is A=7, B=6, C=5, D=4, E=3)
        cat_c = {"A": 7.0, "B": 6.0, "C": 5.0, "D": 4.0, "E": 3.0}
    else:
        # Group A: HKU, CUHK, HKUST, PolyU, CityUHK
        table = {
            "5**": 8.5, "5*": 7.0, "5": 5.5, "4": 4.0, "3": 3.0, "2": 2.0, "1": 1.0,
            "attained": 0.0, "A": 0.0
        }
        cat_c = {"A": 5.0, "B": 4.0, "C": 3.0, "D": 2.0, "E": 1.0}
        
    return {"category_a": table, "category_c": cat_c}

def extract_logic_from_formula(formula_text):
    """
    Parses complex formula strings (like CUHK or HKU variants) 
    to extract compulsory subjects, intended 'Best N' count, and dynamic pools.
    Returns: { "compulsory": list, "best_n": int, "bonus": list, "best_of": list }
    """
    if not formula_text: return {"compulsory": [], "best_n": 5, "bonus": [], "best_of": []}
    f = str(formula_text).strip()
    
    compulsory = []
    best_n = 5
    bonus = []
    best_of = []
    
    # 1. Detect CUHK style: AENGL+ACHIN+Best(3)
    # Extract subjects starting with 'A' (e.g. AENGL, ACHIN)
    parts = re.split(r'\+|\s', f)
    for p in parts:
        if p.startswith('A') and "(" not in p: # Avoid catching Best(N) here
            clean_p = re.sub(r'[^A-Z0-9]', '', p[1:])
            if clean_p and clean_p.upper() not in ["BEST"]:
                compulsory.append(normalize_subject(clean_p))
            
    # Extract Best(N)
    m_best = re.search(r'Best\((\d+)\)', f, re.IGNORECASE)
    if m_best:
        best_n = int(m_best.group(1)) + len(compulsory)
        
    # 1.5 Detect CUHK Compulsory Pools in Formula: Best(1, [ABIOL, ACHEM])
    # Note: These are different from weighting pools because they appear in the formula part
    compulsory_pools = []
    # If the Best(N, [Pool]) pattern appears without a trailing multiplier (:X.X), 
    # OR if it's in the formula_text (which usually doesn't have multipliers), it's likely a requirement.
    for m in re.finditer(r'Best\((\d+)\s*,\s*\[(.*?)\]\)', f):
        # Check if it has a multiplier immediately after
        if f[m.end():m.end()+1] != ':':
            count = int(m.group(1))
            subjs = re.findall(r'A([A-Z0-9]+)', m.group(2))
            norm_subjs = [normalize_subject(s) for s in subjs]
            compulsory_pools.append({
                "count": count,
                "subjects": norm_subjs,
                "description": f"Best {count} from {', '.join(norm_subjs)} must be included"
            })
            # Also add to best_n if not already accounted for
            best_n += count

    # 2. Detect CUHK Dynamic Weighting Pools: Best(1, [AECON, AINCT]):1.5
    for m in re.finditer(r'Best\((\d+)\s*,\s*\[(.*?)\]\)\s*:\s*([\d\.]+)', f):
        count = int(m.group(1))
        subjs = re.findall(r'A([A-Z0-9]+)', m.group(2))
        norm_subjs = [normalize_subject(s) for s in subjs]
        best_of.append({
            "count": count,
            "subjects": norm_subjs,
            "weight": float(m.group(3))
        })
    
    # 3. Detect HKU style: Best 5 Subjects + 0.5 x 6th / 0.2 x 6th / 0.2 x 7th
    if "Best 5" in f or "Best(5)" in f: best_n = 5
    if "Best 6" in f or "Best(6)" in f: best_n = 6
    if "Best 7" in f or "Best(7)" in f: best_n = 7
    
    # regex for N.N x 6th/7th
    for m_bonus in re.finditer(r'([\d.]+)\s*x\s*(\d)(?:th|rd)?\s*Best', f, re.IGNORECASE):
        multiplier = float(m_bonus.group(1))
        target_idx = int(m_bonus.group(2))
        bonus.append({
            "type": f"bonus_{target_idx}th", 
            "multiplier": multiplier,
            "description": f"{multiplier} x {target_idx}th Best subject included as bonus"
        })

    # 3.5 Detect HKU Compulsory Cores in Formula
    if re.search(r'\bEng(?:lish)?\b', f, re.IGNORECASE):
        compulsory.append("English Language")
    if re.search(r'\bMaths?\b', f, re.IGNORECASE):
        compulsory.append("Mathematics (Compulsory Part)")
    if re.search(r'\bM1\b|\bM2\b', f, re.IGNORECASE):
        compulsory.append("Mathematics Extended Part (Module 1 or 2)")
    if re.search(r'\bChin(?:ese)?\b', f, re.IGNORECASE):
        compulsory.append("Chinese Language")

    # 4. Detect PolyU style: English & Chinese + Best 3
    if "Chinese & English Languages + Any Best 3" in f:
        compulsory.extend(["Chinese Language", "English Language"])
        best_n = 5

    # 5. Standard 4C+2X / 3C+2X
    if "4C+2X" in f.upper() or "4 CORE" in f.upper():
        compulsory.extend(["Chinese Language", "English Language", "Mathematics (Compulsory Part)", "Citizenship and Social Development"])
        best_n = 6
    elif "3C+2X" in f.upper():
        compulsory.extend(["Chinese Language", "English Language", "Mathematics (Compulsory Part)"])
        best_n = 5

    # Deduplicate compulsory
    compulsory = list(set(compulsory))
    
    return {"compulsory": compulsory, "best_n": best_n, "bonus": bonus, "best_of": best_of, "compulsory_pools": compulsory_pools}

def map_formula_id(formula_text):
    """Standardize formula descriptions into machine-readable IDs."""
    if not formula_text: return "unknown"
    logic = extract_logic_from_formula(formula_text)
    if logic["best_n"] == 5: return "best5"
    if logic["best_n"] == 6: return "best6"
    return "custom"

def clean_raw_string(text):
    """Universal utility to strip bullet points, HTML tags, and fix whitespace in remarks."""
    if not text: return text
    text = str(text)
    text = text.replace("<br />", ", ")
    text = text.replace("<br>", ", ")
    text = text.replace("\n", ", ")
    text = text.replace("•", "")
    
    # Strip stray "a " prefixes (often seen in HKU formula scrapes)
    text = re.sub(r'^a\s+', '', text)
    text = text.replace(" Best", " Best") # keep space normalization
    text = re.sub(r'\s+a\s+Subject', ' Subject', text)
    
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r',\s*,', ',', text)
    text = text.replace(" ,", ",")
    return text.strip(", ")

def estimate_hkbu_score_from_grades(grades, weights, conversion_table):
    """
    Estimate HKBU median/LQ totals from published subject-grade breakdowns.
    HKBU publishes weighted mean, but median/LQ are provided as subject grades,
    so we apply the programme's 2025 weights and sum the best five subjects.
    """
    if not grades:
        return None

    core_names = {
        "Chinese Language",
        "English Language",
        "Mathematics (Compulsory Part)",
        "Mathematics Extended Part (Module 1)",
        "Mathematics Extended Part (Module 2)",
        "Citizenship and Social Development",
    }
    weighted_elective_multipliers = sorted(
        [weight for subject, weight in weights.items() if subject not in core_names],
        reverse=True
    )
    subject_scores = []

    for subject, grade in grades.items():
        base_points = conversion_table.get(str(grade).strip(), 0)
        weight = 1.0

        if subject == "CHIN":
            weight = weights.get("Chinese Language", 1.0)
        elif subject == "ENGL":
            weight = weights.get("English Language", 1.0)
        elif subject == "MATH":
            weight = weights.get("Mathematics (Compulsory Part)", 1.0)
        elif subject == "M1/M2":
            weight = max(
                weights.get("Mathematics Extended Part (Module 1)", 1.0),
                weights.get("Mathematics Extended Part (Module 2)", 1.0),
            )
        elif "Elective" in subject and weighted_elective_multipliers:
            weight = weighted_elective_multipliers.pop(0)

        if base_points:
            subject_scores.append(base_points * weight)

    if not subject_scores:
        return None

    subject_scores.sort(reverse=True)
    return round(sum(subject_scores[:5]), 2)

def build_cuhk_elective(note, text, req_str):
    """
    Transforms string-based requirements (e.g. 'One of the following: Bio, Chem')
    into a structured object for calculation.
    """
    m = re.search(r'>=\s*(\d[A-Za-z*]*)', req_str)
    grade = m.group(1) if m else "3"

    if not note or note == "--":
        if text == "*":
            return {"count": 1, "subjects": ["Any"], "grade": grade, "note": ""}
        # Split on 'or' or '/' if note is empty
        subjs = [normalize_subject(s.strip()) for s in re.split(r' or | / |,', text) if s.strip()]
        return {"count": 1, "subjects": subjs, "grade": grade, "note": ""}

    note_clean = note.replace(" subjects:", ":")
    # Split by comma but respect internal parentheses
    subjs_raw = re.split(r',(?![^\(]*\))', text)
    subjs = [normalize_subject(s.strip()) for s in subjs_raw if s.strip()]
    
    # Check for wildcards in subjects (e.g. Category A subjects only)
    is_cat_a_wildcard = any("Category A" in str(s) for s in subjs)
    if is_cat_a_wildcard:
        subjs = ["*"]
        note_clean = "Category A Subjects Only"

    abbr = {
        "Mathematics (Module 1 or 2)": "M1/M2",
        "Information and Communication Technology": "ICT",
        "Design and Applied Technology": "DAT"
    }
    subjs = [abbr.get(s, s) for s in subjs]

    # Infer required count from text keywords
    count = 1
    if "Two" in note_clean: count = 2
    elif "Three" in note_clean: count = 3

    note_clean = note_clean.replace(":", "").strip()

    # Check for wildcards in subjects (e.g. Category A subjects only)
    is_cat_a_wildcard = any("Category A" in str(s) or s == "*" for s in subjs)
    if is_cat_a_wildcard:
        subjs = ["*"]
        note_clean = "Category A Subjects Only"

    return {
        "count": count,
        "subjects": subjs,
        "grade": grade,
        "note": note_clean
    }

def build_hku_elective_pool(desc, fallback_grade):
    """
    Parses HKU specific requirement strings like:
    'Level 3 or above in one of the following subjects: Biology, or Chemistry'
    """
    if not desc: return None
    
    # Extract grade
    m_grade = re.search(r'Level (\d)', desc)
    grade = m_grade.group(1) if m_grade else fallback_grade
    
    # Extract count (one vs two)
    count = 1
    if "two of the following" in desc.lower():
        count = 2
        
    # Extract subjects
    subjects = ["Any"]
    if ":" in desc:
        subj_part = desc.split(":")[1]
        # Split by comma or 'or' or 'and'
        raw_subjs = re.split(r',| or | and ', subj_part)
        subjects = [normalize_subject(s.strip()) for s in raw_subjs if s.strip()]
    elif "Mathematics Extended Part (Module 1 or 2)" in desc:
        subjects = ["Mathematics Extended Part (Module 1)", "Mathematics Extended Part (Module 2)"]
    elif "Chemistry" in desc and "one of" not in desc.lower():
        subjects = ["Chemistry"]
        
    return {
        "count": count,
        "subjects": subjects,
        "grade": str(grade),
        "note": desc
    }

def build_hkbu_elective(grade, constraint):
    if not grade: return None
    subjs = ["Any"]
    if constraint:
        # Extract subjects like "Biology or Chemistry"
        # "One elective subject must be Biology or Chemistry"
        m = re.search(r'must be (.*)', constraint)
        if m:
            pool = m.group(1)
            subjs = [normalize_subject(s.strip()) for s in re.split(r' or | / ', pool)]
    
    return {
        "count": 1,
        "subjects": subjs,
        "grade": str(grade).strip("#"),
        "note": constraint or ""
    }

def build_generic_elective(grade, constraint=None):
    if not grade: return None
    return {
        "count": 1,
        "subjects": ["Any"],
        "grade": str(grade).strip("#"),
        "note": constraint or ""
    }

def apply_baselines(obj):
    """
    Ensures every programme meets the Universal Minimum University Requirements.
    HKU, CUHK, HKUST, PolyU, CityUHK, HKBU: 332A33
    LingnanU, EdUHK, HKMU, SSSDP: 332A22
    """
    inst = obj["institution"]
    # Group A: 332A33
    if inst in ["HKU", "CUHK", "HKUST", "PolyU", "CityUHK", "HKBU"]:
        b = {"chi": "3", "eng": "3", "math": "2", "csd": "A", "e_grade": "3"}
    # Group B: 332A22
    else:
        b = {"chi": "3", "eng": "3", "math": "2", "csd": "A", "e_grade": "2"}

    reqs = obj["min_requirements_2026"]
    
    # Cores
    reqs["chi"] = str(reqs.get("chi") or b["chi"]).strip("# ")
    reqs["eng"] = str(reqs.get("eng") or b["eng"]).strip("# ")
    reqs["math"] = str(reqs.get("math") or b["math"]).strip("# ")
    
    csd_val = str(reqs.get("csd") or b["csd"]).lower()
    if "attained" in csd_val or "a" in csd_val or "2" in csd_val:
        reqs["csd"] = "A"
    else:
        reqs["csd"] = b["csd"]
    
    # Electives
    if not reqs.get("elect1") or not isinstance(reqs["elect1"], dict):
        current_val = reqs.get("elect1")
        reqs["elect1"] = {"count": 1, "subjects": ["Any"], "grade": str(current_val or b["e_grade"]).strip("# "), "note": "University Baseline" if not current_val else ""}
    
    if not reqs.get("elect2") or not isinstance(reqs["elect2"], dict):
        current_val = reqs.get("elect2")
        reqs["elect2"] = {"count": 1, "subjects": ["Any"], "grade": str(current_val or b["e_grade"]).strip("# "), "note": "University Baseline" if not current_val else ""}
    
    return obj

def unify_data():
    # 1. Pre-load Global Resources
    df_overview = pd.read_csv(OVERVIEW_FILE)
    overview_map = {str(row['JUPAS Catalogue No.']): {
        "name_zh": row['chinese_name'],
        "name_en": row['Programme Full Title'],
        "institution": row['Institution / Scheme']
    } for _, row in df_overview.iterrows()}

    # Load JUPAS Offer Statistics (Application/Offer trends)
    offer_stats_map = {}
    if os.path.exists(OFFER_TABLE_FILE):
        df_offer = pd.read_csv(OFFER_TABLE_FILE)
        # Convert numeric columns to native python types to avoid JSON serialisation errors
        cols_to_fix = ['Year', 'Band A', 'Band B', 'Band C', 'Band D', 'Band E', 'Total']
        for col in cols_to_fix:
            if col in df_offer.columns:
                df_offer[col] = pd.to_numeric(df_offer[col], errors='coerce').fillna(0).astype(int)
        
        # Replace remaining NaN (in non-numeric columns like Type) with empty strings to keep JSON valid
        df_offer = df_offer.where(pd.notnull(df_offer), "")
        
        for code, group in df_offer.groupby('JUPAS'):
            offer_stats_map[str(code)] = group.to_dict('records')
    print(f"Loaded offer statistics for {len(offer_stats_map)} programmes.")

    # Load PolyU structured weights
    polyu_weights_2026 = {}
    if os.path.exists(POLYU_WEIGHTS_2026):
        with open(POLYU_WEIGHTS_2026, encoding='utf-8') as f:
            polyu_weights_2026 = json.load(f)

    cuhk_2025_reqs = {}
    if os.path.exists(CUHK_2025_REQ):
        with open(CUHK_2025_REQ, encoding='utf-8') as f:
            cuhk_2025_reqs = {item['jupas_code']: item for item in json.load(f)}

    cuhk_2026_reqs = {}
    if os.path.exists(CUHK_2026_REQ):
        with open(CUHK_2026_REQ, encoding='utf-8') as f:
            cuhk_2026_reqs = {item['jupas_code']: item for item in json.load(f)}

    cuhk_2025_grades = {}
    if os.path.exists(CUHK_GRADES_FILE):
        with open(CUHK_GRADES_FILE, encoding='utf-8') as f:
            cuhk_2025_grades = json.load(f)

    # Load HKUST JS-extracted structured formula data
    hkust_js_data = {}
    if os.path.exists(HKUST_JS_EXTRACT):
        with open(HKUST_JS_EXTRACT, 'r', encoding='utf-8') as f:
            for entry in json.load(f):
                hkust_js_data[entry['jupas_code']] = entry
        print(f"Loaded HKUST JS extract: {len(hkust_js_data)} entries")

    # Load HKU Raw API for Min Reqs & Extra Info
    hku_req_map = {}
    hku_extra_map = {}
    if os.path.exists(HKU_RAW_API):
        with open(HKU_RAW_API, encoding='utf-8') as f:
            h_data = json.load(f)
            for faculty, progs in h_data['data']['programme'].items():
                for name, p_info in progs.items():
                    code = "JS" + p_info['programme_code']
                    h_html = p_info.get('accordionHTML')
                    hku_req_map[code] = parse_hku_min_reqs(h_html)
                    hku_extra_map[code] = parse_hku_extra_info(h_html)

    unified_map = {}

    # 2. Iterate through institutions
    for school_key, path in FILES.items():
        if not os.path.exists(path): continue
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        
        for entry in data:
            code = entry.get('jupas_code') or entry.get('code')
            if not code: continue
            
            # Logic Pre-check: Does this entry have detailed formula info?
            # Prefer the most detailed formula regardless of order
            raw_f25 = str(entry.get('formula') or entry.get('score_formula') or entry.get('principle') or "")
            logic_check = extract_logic_from_formula(raw_f25)
            
            if code in unified_map:
                existing = unified_map[code]
                existing_logic = extract_logic_from_formula(existing.get('formula_2025'))
                
                # Decision: Should we replace the existing entry with the new one?
                # Case A: New entry has more compulsory subjects
                if len(logic_check["compulsory"]) > len(existing_logic["compulsory"]):
                    pass # Keep new
                # Case B: New entry has dynamic pools and existing doesn't
                elif logic_check["best_of"] and not existing_logic["best_of"]:
                    pass # Keep new
                # Case C: New formula string is longer and existing has no special logic
                elif len(raw_f25) > len(str(existing.get('formula_2025', ''))) and not existing_logic["compulsory"] and not existing_logic["best_of"]:
                    pass # Keep new
                else:
                    continue # Stick with existing
            
            ov = overview_map.get(code, {})
            
            # Base Unified Object Structure
            obj = {
                "jupas_code": code,
                "name_en": ov.get('name_en') or entry.get('name') or entry.get('title'),
                "name_zh": ov.get('name_zh'),
                "institution": ov.get('institution') or school_key,
                "faculty": entry.get('faculty') or entry.get('school'),
                
                "formula_2025": None,
                "formula_2025_id": None,
                "formula_2026": None,
                "formula_2026_id": None,
                
                "subject_weights_2025": {},
                "subject_weights_2026": {},
                "best_of_weights_2025": [],
                "best_of_weights_2026": [],
                "subject_weights_2025_raw": None,
                "subject_weights_2026_raw": None,
                
                "min_requirements_2026": {},
                "calculation_constraints": [], # Machine-readable calculation flags
                "score_conversion_table": {},
                "max_achievable_score": None,
                
                "scores_2025": {"median": None, "lq": None, "uq": None, "mean": None, "expected_score": None},
                "score_grades_2025": {
                    "median": entry.get('score_median_grades') or entry.get('median_grades'),
                    "lq": entry.get('score_lq_grades') or entry.get('lq_grades')
                },
                "offer_statistics": [],
                
                "quota": entry.get('quota'),
                "remarks": " | ".join(filter(lambda x: x and x not in ["", "--", "-"], [entry.get('remarks'), entry.get('other_req'), entry.get('formula_remarks'), entry.get('requirement_remarks')]))
            }

            # 3. School-Specific Mapping & Constraint Detection
            
            if school_key == "CityU":
                obj["formula_2025"] = entry.get('subject_weights_2025', {}).get('subjects_included') or entry.get('score_formula')
                obj["formula_2026"] = entry.get('calc_mode_text') or entry.get('score_formula')
                
                sw2026 = entry.get('subject_weights', {})
                if isinstance(sw2026, str):
                    try:
                        w_list = json.loads(sw2026)
                        obj["subject_weights_2026"] = {normalize_subject(i['subject']): float(i['weight']) for i in w_list}
                    except: pass
                else:
                    obj["subject_weights_2026"] = {normalize_subject(k): float(v) for k, v in sw2026.items()}
                
                # CityU 2025 weights are effectively identical to 2026
                obj["subject_weights_2025"] = obj["subject_weights_2026"].copy()
                
                # Regex extraction of compulsory subjects embedded in "Best 5 (includes ...)" strings
                sf = str(entry.get('score_formula', ''))
                m_comp = re.search(r'\(includes\s*(.*)\)', sf, re.IGNORECASE)
                if m_comp:
                    comp_text = m_comp.group(1).strip(" .")
                    
                    # Check for "and one subject from Bio/Chem/Phys" pattern
                    pool_match = re.search(r'and one subject from (.*)', comp_text, re.IGNORECASE)
                    fixed_text = comp_text
                    if pool_match:
                        pool_raw = pool_match.group(1)
                        pool_subjs = [normalize_subject(s.strip()) for s in re.split(r' / |/|,', pool_raw)]
                        obj["calculation_constraints"].append({
                            "type": "compulsory_subject_pool",
                            "count": 1,
                            "subjects": pool_subjs,
                            "description": f"Formula requires one subject from: {', '.join(pool_subjs)}"
                        })
                        fixed_text = comp_text[:pool_match.start()].strip(" ,")

                    # Handle fixed compulsory subjects
                    subjs = []
                    for s in re.split(r',| and ', fixed_text):
                        if not s.strip(): continue
                        norm_s = normalize_subject(s.strip())
                        if norm_s: subjs.append(norm_s)
                    
                    if subjs:
                        obj["calculation_constraints"].append({
                            "type": "compulsory_subjects",
                            "subjects": subjs,
                            "description": f"Formula includes: {', '.join(subjs)}"
                        })

                # Detect Math + M1/M2 mutual exclusivity
                if entry.get('maths_calc_as_one') == 1 or "only one subject will be included" in sf:
                    obj["calculation_constraints"].append({
                        "type": "maths_m1m2_as_one",
                        "description": "If a student takes both Mathematics and M1/M2, only one subject will be included"
                    })

                # Parse nested JSON requirements from API
                reqs = {"chi": None, "eng": None, "math": None, "csd": "A", "elect1": None, "elect2": None}
                try:
                    basic_reqs = json.loads(entry.get('basic_requirements', '[]'))
                    if isinstance(basic_reqs, list):
                        for br in basic_reqs:
                            subj = normalize_subject(br.get('subject', ''))
                            mg = br.get('min_grade', '')
                            if subj == "Chinese Language": reqs["chi"] = mg
                            elif subj == "English Language": reqs["eng"] = mg
                            elif subj == "Mathematics (Compulsory Part)": reqs["math"] = mg
                            elif subj == "Citizenship and Social Development": reqs["csd"] = mg
                except: pass
                
                try:
                    elect_reqs = json.loads(entry.get('elective_requirements', '[]'))
                    if isinstance(elect_reqs, list):
                        for er in elect_reqs:
                            mg = er.get('min_grade', '')
                            try: count = int(er.get('min_count', '1'))
                            except: count = 1
                            subjs = [normalize_subject(s) for s in er.get('subjects', [])]
                            if not subjs or len(subjs) > 20: subjs = ["Any"]
                            
                            # If count > 1 (e.g. any two electives), we split them into individual entries
                            er_obj = {"count": 1, "subjects": subjs, "grade": mg, "note": er.get('display', '').strip()}
                            for _ in range(count):
                                if not reqs["elect1"]: reqs["elect1"] = er_obj.copy()
                                elif not reqs["elect2"]: reqs["elect2"] = er_obj.copy()
                except: pass
                obj["min_requirements_2026"] = reqs

            elif school_key == "CUHK":
                req25 = cuhk_2025_reqs.get(code, {})
                req26 = cuhk_2026_reqs.get(code, {})
                
                # Formula Logic: Prefer the structured 'formula' string over 'principle'
                f26 = entry.get('formula') if entry.get('formula') and "Best" in str(entry.get('formula')) else entry.get('principle')
                obj["formula_2026"] = f26
                
                # Check for descriptive formula in the main entry itself (sometimes raw API has it)
                raw_f = entry.get('formula')
                f25 = req25.get('principle')
                
                # Logic: If raw_f has A-codes (AENGL etc) and f25 doesn't, use raw_f
                if raw_f and "A" in str(raw_f) and ("+" in str(raw_f) or "Best" in str(raw_f)):
                    if not f25 or "A" not in str(f25):
                        f25 = raw_f

                # Handle fallback if f25 is missing or too vague
                if not f25 or len(str(f25)) < 10 or "(x " in str(f25):
                    f25 = f26
                obj["formula_2025"] = f25
                
                # Use highly structured 2026 API weight strings for 2025 fallback where possible
                flat_weights, best_of_weights = parse_cuhk_weights(entry.get('weight'))
                obj["subject_weights_2026"] = flat_weights
                obj["best_of_weights_2026"] = best_of_weights
                obj["subject_weights_2025"] = obj["subject_weights_2026"].copy()
                obj["best_of_weights_2025"] = obj["best_of_weights_2026"].copy()
                
                obj["subject_weights_2025_raw"] = req25.get('weight')
                obj["subject_weights_2026_raw"] = entry.get('weight_remarks')
                
                # CUHK Manual Overrides for Special Logic (e.g. JS4725)
                if code == "JS4725":
                    # Logic: Best 2 of English, Biology or Chemistry (x 1.5)
                    obj["best_of_weights_2025"].append({
                        "count": 2,
                        "subjects": ["English Language", "Biology", "Chemistry"],
                        "weight": 1.5
                    })
                    obj["best_of_weights_2026"] = obj["best_of_weights_2025"].copy()
                    
                    # Logic: Best of Biology/Chemistry must be included
                    obj["calculation_constraints"].append({
                        "type": "compulsory_subject_pool",
                        "count": 1,
                        "subjects": ["Biology", "Chemistry"],
                        "description": "Best of Biology/Chemistry must be included in the score calculation (i.e. Best of Bio/Chem + Best 4 subjects)"
                    })

                # Detect CUHK "Max Weighted" constraints
                if "maximum of 3 subjects will be weighted heavier" in obj["remarks"]:
                    obj["calculation_constraints"].append({
                        "type": "max_weighted_subjects",
                        "limit": 3,
                        "description": "A maximum of 3 subjects will be weighted heavier in the total score of Best 5 subjects"
                    })
                
                # Detect special M1/M2 half-replacement logic
                if "worst subject is replaced by a new score comprising half" in obj["remarks"]:
                    obj["calculation_constraints"].append({
                        "type": "m1m2_half_replacement",
                        "description": "M1/M2 contributes if higher than worst subject; half original + half M1/M2 score"
                    })
                
                # Detect special Medicine conversion scales
                if "5** = 7 | 5* = 6" in obj["remarks"]:
                    obj["calculation_constraints"].append({
                        "type": "medicine_conversion_scale",
                        "description": "Special conversion scale: 5**=7, 5*=6, 5=5, 4=4, 3=3, 2=2, 1=1"
                    })

                # Build structured requirements from API pools
                req_el = entry.get("req_electives", "")
                parts = req_el.split(";")
                e1_req = parts[0].strip() if len(parts) > 0 else ""
                e2_req = parts[1].strip() if len(parts) > 1 else ""
                
                e1 = build_cuhk_elective(entry.get("subject_1_note"), entry.get("subject_1_text"), e1_req)
                e2 = None
                if e2_req and "None" not in e2_req and e2_req != "*":
                    e2 = build_cuhk_elective(entry.get("subject_2_note"), entry.get("subject_2_text"), e2_req)

                obj["min_requirements_2026"] = {
                    "chi": entry.get('req_chi') or req26.get('req_chi'),
                    "eng": entry.get('req_eng') or req26.get('req_eng'),
                    "math": entry.get('req_math') or req26.get('req_math'),
                    "csd": entry.get('req_csd') or entry.get('req_cs') or req26.get('req_cs') or "A",
                    "elect1": e1, 
                    "elect2": e2
                }

                rem = entry.get('requirement_remarks') or req26.get('remarks')
                if rem and rem not in ["--", ""]:
                    rem_clean = clean_raw_string(re.sub(r'<[^>]+>', ' ', rem).strip())
                    rem_clean = rem_clean.replace(" preferred: ", " preferred:\n")
                    obj["min_requirements_2026"]["conditional_remarks"] = rem_clean
                
                # Merge individual grade breakdowns from PDF extraction
                if code in cuhk_2025_grades:
                    obj["score_grades_2025"]["median"] = cuhk_2025_grades[code].get("median")
                    obj["score_grades_2025"]["lq"] = cuhk_2025_grades[code].get("lq")
                    if cuhk_2025_grades[code].get("uq"):
                        obj["score_grades_2025"]["uq"] = cuhk_2025_grades[code].get("uq")

            elif school_key == "HKU":
                formula_25 = entry.get('formula_25') or entry.get('formula_2025')
                formula_26 = entry.get('formula_2026')
                obj["formula_2025"] = formula_25
                obj["formula_2026"] = formula_26
                
                # Parse Weights from subject_weight field
                sw_text = entry.get('subject_weight')
                obj["subject_weights_2026"] = parse_hku_weights(sw_text)
                obj["subject_weights_2025"] = parse_hku_weights(sw_text)
                
                # Formula often contains multipliers too, e.g. "2 x Eng"
                f_text = str(formula_26)
                obj["subject_weights_2026"].update(parse_hku_formula_weights(formula_26))
                obj["subject_weights_2025"].update(parse_hku_formula_weights(formula_25))

                # Detect Best of pools in HKU formula
                m_best = re.search(r'Best of (.*?) with Weighting([\d.]+)', f_text, re.IGNORECASE)
                if m_best:
                    pool_text = m_best.group(1)
                    weight = float(m_best.group(2))
                    subjs = [normalize_subject(s.strip()) for s in re.split(r' or | / ', pool_text)]
                    obj["best_of_weights_2026"].append({
                        "count": 1,
                        "subjects": subjs,
                        "weight": weight
                    })

                obj["best_of_weights_2025"] = obj["best_of_weights_2026"].copy()
                
                obj["subject_weights_2026_raw"] = sw_text
                obj["subject_weights_2025_raw"] = formula_25 if parse_hku_formula_weights(formula_25) else sw_text 

                # Constraints
                obj["calculation_constraints"].append({
                    "type": "hku_8.5_scale",
                    "description": "HKU standard conversion scale: 5**=8.5, 5*=7, 5=5.5, 4=4, 3=3, 2=2, 1=1"
                })
                
                extra = hku_extra_map.get(code, {})
                if extra.get("other_factors"):
                    obj["calculation_constraints"].append({
                        "type": "consideration_other_factors",
                        "description": extra["other_factors"]
                    })
                if extra.get("repeater_policy"):
                    obj["calculation_constraints"].append({
                        "type": "repeater_combined_results_policy",
                        "description": extra["repeater_policy"]
                    })

                hku_reqs_raw = hku_req_map.get(code, {})
                obj["min_requirements_2026"] = {
                    "chi": hku_reqs_raw.get("chi"),
                    "eng": hku_reqs_raw.get("eng"),
                    "math": hku_reqs_raw.get("math"),
                    "csd": "A" if "Attained" in str(hku_reqs_raw.get("csd", "")) else hku_reqs_raw.get("csd"),
                    "elect1": build_generic_elective(hku_reqs_raw.get("elect1")),
                    "elect2": build_generic_elective(hku_reqs_raw.get("elect2"))
                }
                
                # Check for specific elective requirements (e.g. Medicine needs Bio/Chem)
                spec_desc = hku_reqs_raw.get("specific_elective_desc")
                if spec_desc:
                    pool = build_hku_elective_pool(spec_desc, hku_reqs_raw.get("elect1", "3"))
                    if pool:
                        if pool["count"] == 1:
                            obj["min_requirements_2026"]["elect1"] = pool
                        elif pool["count"] == 2:
                            # Split into two identical pools for simplicity in calculation
                            p1 = pool.copy()
                            p1["count"] = 1
                            obj["min_requirements_2026"]["elect1"] = p1
                            obj["min_requirements_2026"]["elect2"] = p1.copy()

            elif school_key == "HKUST":
                # Use structured data from JS-extracted source (reverse-engineered from official
                # HKUST calculator). Falls back to old scraper data if JS extract is missing.
                js = hkust_js_data.get(code, {})

                formula_text_2025 = entry.get('formula_text_2025')
                formula_text_2026 = js.get('otherSubjects_text') or entry.get('otherSubjects', '')
                obj["formula_2025"] = formula_text_2025 or formula_text_2026
                obj["formula_2026"] = formula_text_2026

                # Subject weights: use structured JS data, normalizing keys to canonical names.
                js_weights = js.get('subject_weights_2026', {})
                if js_weights:
                    obj["subject_weights_2026"] = {normalize_subject(k): v for k, v in js_weights.items()}
                    # HKUST formula is stable across cycles — use same weights for 2025
                    obj["subject_weights_2025"] = obj["subject_weights_2026"].copy()
                else:
                    # Fallback: parse from string fields (old approach)
                    eng_m = float(str(entry.get('engMultiplier', 'x1')).replace('x', ''))
                    sec_m = float(str(entry.get('secondMultiplier', 'x1')).replace('x', ''))
                    sec_subj = entry.get('secondMultiplierSubject')
                    obj["subject_weights_2026"]["English Language"] = eng_m
                    if sec_subj and sec_m != 1.0:
                        obj["subject_weights_2026"][normalize_subject(sec_subj)] = sec_m
                    obj["subject_weights_2025"] = obj["subject_weights_2026"].copy()

                # For "better-of" programmes (JS5312/JS5331/JS5332/JS5822):
                # Option A = plain best-3; Option B = best-1 from Chem/Phys/Econ/M1/M2 x1.5 + best-2.
                # The pool exists in both 2025 and 2026 formulas (formula_text_2025 confirms this).
                # Note: "HA=62.48" in HKUST's PDF is the actual highest observed score in admissions,
                # not the theoretical all-5** maximum (which is ~66.94 with the pool).
                formula_steps = js.get('formula_steps', [])
                is_better_of = js.get('is_better_of', False)
                pool_weight = 1.0  # default if no pool found
                if is_better_of:
                    for step in formula_steps:
                        if step.get('type') == 'better_of':
                            options = step.get('options', [])
                            if len(options) >= 2:
                                option_b = options[1]
                                for case in option_b:
                                    if case.get('type') == 'best_from_pool' and case.get('weights'):
                                        pool_entry = {
                                            "count": 1,
                                            # Normalize subject names to canonical form
                                            "subjects": [normalize_subject(s) for s in case['subject_filter']],
                                            "weight": case['weights'][0]['weight']
                                        }
                                        pool_weight = pool_entry["weight"]
                                        # Pool applies to both 2025 and 2026 formulas
                                        obj["best_of_weights_2026"].append(pool_entry)
                                        obj["best_of_weights_2025"].append(pool_entry.copy())
                            break

                # Store formula_steps as a reference field for future use
                obj["hkust_formula_steps"] = formula_steps

                # Constraints
                bonus_6th = js.get('bonus_6th', {})
                bonus_pct = bonus_6th.get('bonus_percentage', 5)
                bonus_cats = bonus_6th.get('eligible_categories',
                    (entry.get('extra_subject_bonus_category', '') or '').split(','))
                if isinstance(bonus_cats, str):
                    bonus_cats = [c.strip() for c in bonus_cats.split(',') if c.strip()]

                # max_attainable_weighting: sum of all multipliers in the optimal best-N selection.
                # For better-of programmes: explicit weights + 1 pool slot at pool_weight + remaining at 1.0
                subject_num = entry.get('subjectNum', 5)
                explicit_weights = obj["subject_weights_2025"]
                explicit_sum = sum(explicit_weights.values())
                pool_slots = 1 if is_better_of else 0
                remaining_slots = subject_num - len(explicit_weights) - pool_slots
                max_attainable = explicit_sum + pool_slots * pool_weight + remaining_slots * 1.0

                obj["calculation_constraints"].append({
                    "type": "hkust_weighted_best",
                    "subject_count": subject_num,
                    "max_attainable_weighting": round(max_attainable, 4),
                    "bonus_percentage": bonus_pct,
                    "bonus_eligible_categories": bonus_cats,
                    "description": (
                        f"Weighted Best {subject_num} subjects "
                        f"with {bonus_pct}% of max_attainable_weighting bonus for 6th subject."
                    )
                })

                # Requirements: use structured JS data for reliability
                js_reqs = js.get('min_requirements_2026_raw', {})
                if js_reqs:
                    csd_raw = js_reqs.get('csd', 'attained')
                    obj["min_requirements_2026"] = {
                        "chi": js_reqs.get('chinese'),
                        "eng": js_reqs.get('english'),
                        "math": js_reqs.get('maths_core'),
                        "csd": "A" if str(csd_raw).lower() == "attained" else csd_raw,
                        "elect1": {"count": 1, "subjects": ["Any"],
                                   "grade": js_reqs.get('elective_subject_1', '3'), "note": ""},
                        "elect2": {"count": 1, "subjects": ["Any"],
                                   "grade": js_reqs.get('elective_subject_2', '3'), "note": ""}
                    }
                else:
                    # Fallback to old scraper fields
                    obj["min_requirements_2026"] = {
                        "chi": entry.get('req_chin'),
                        "eng": entry.get('req_eng'),
                        "math": entry.get('req_math'),
                        "csd": "A" if str(entry.get('req_csd', '')).lower() == "attained" else entry.get('req_csd'),
                        "elect1": {"count": 1, "subjects": ["Any"], "grade": entry.get('req_e1', "3"), "note": ""},
                        "elect2": {"count": 1, "subjects": ["Any"], "grade": entry.get('req_e2', "3"), "note": ""}
                    }

            elif school_key == "PolyU":
                formula_text = entry.get('calculation_mechanism')
                obj["formula_2025"] = formula_text
                obj["formula_2026"] = formula_text
                
                # Weights 2026 (Prefer structured JSON if available)
                if code in polyu_weights_2026:
                    for w in polyu_weights_2026[code]:
                        s_name = normalize_subject(w.get('Subject Name'))
                        s_val = float(w.get('Subject Weighting', 1.0))
                        obj["subject_weights_2026"][s_name] = s_val
                else:
                    obj["subject_weights_2026"] = parse_polyu_weights_string(entry.get('weights_2026'))
                obj["subject_weights_2026_raw"] = entry.get('weights_2026')

                # Weights 2025
                obj["subject_weights_2025"] = parse_polyu_weights_string(entry.get('weights_2025'))
                if not obj["subject_weights_2025"]:
                    obj["subject_weights_2025"] = obj["subject_weights_2026"].copy()
                obj["subject_weights_2025_raw"] = entry.get('weights_2025')

                # Constraints
                formula_clean = str(formula_text).replace('\xa0', ' ')
                if "additional bonus score for the 6th subject" in formula_clean:
                    obj["calculation_constraints"].append({
                        "type": "additional_bonus_6th",
                        "description": "Additional bonus score for the 6th subject with Level 3 or above"
                    })
                
                if "Chinese & English Languages + Any Best 3 Subjects" in formula_clean:
                    obj["calculation_constraints"].append({
                        "type": "compulsory_subjects",
                        "subjects": ["Chinese Language", "English Language"],
                        "description": "Formula includes: Chinese Language, English Language"
                    })

                # Structured Requirements 2026
                # PolyU reqs are usually standard 332A33 or 332A22, but let's map them
                obj["min_requirements_2026"] = {
                    "chi": entry.get('req_chin'),
                    "eng": entry.get('req_eng'),
                    "math": entry.get('req_math'),
                    "csd": "A" if entry.get('req_csd') == "Attained" else entry.get('req_csd'),
                    "elect1": {"count": 1, "subjects": ["Any"], "grade": entry.get('req_e1', "3"), "note": ""},
                    "elect2": {"count": 1, "subjects": ["Any"], "grade": entry.get('req_e2', "3"), "note": ""}
                }
                
                # Preferred subjects
                pref = entry.get('preferred_subjects')
                if pref and pref not in ["", "-"]:
                    obj["min_requirements_2026"]["conditional_remarks"] = "Preferred subjects: " + pref

            elif school_key == "HKBU":
                obj["formula_2025"] = entry.get('formula')
                obj["formula_2026"] = entry.get('formula')
                
                # Weights 2026
                sw2026 = entry.get('subject_weights', {})
                obj["subject_weights_2026"] = {normalize_subject(k): float(v) for k, v in sw2026.items()}
                obj["subject_weights_2026_raw"] = entry.get('weights_raw')
                
                # Weights 2025
                sw2025 = entry.get('subject_weights_2025')
                if sw2025 and isinstance(sw2025, dict):
                    obj["subject_weights_2025"] = {normalize_subject(k): float(v) for k, v in sw2025.items()}
                else:
                    obj["subject_weights_2025"] = obj["subject_weights_2026"].copy()
                obj["subject_weights_2025_raw"] = entry.get('weights_2025_raw')

                # Structured Requirements 2026
                obj["min_requirements_2026"] = {
                    "chi": entry.get('min_chi'),
                    "eng": entry.get('min_eng'),
                    "math": entry.get('min_math'),
                    "csd": entry.get('min_csd'),
                    "elect1": build_hkbu_elective(entry.get('min_elect1'), entry.get('elect1_constraint')),
                    "elect2": build_hkbu_elective(entry.get('min_elect2'), None)
                }

            elif school_key == "LingU":
                obj["formula_2025"] = entry.get('formula')
                obj["formula_2026"] = entry.get('formula')
                
                sw2026 = entry.get('subject_weights', {})
                obj["subject_weights_2026"] = {normalize_subject(k): float(v) for k, v in sw2026.items()}
                obj["subject_weights_2026_raw"] = entry.get('subject_weights_raw')
                
                sw2025 = entry.get('subject_weights_2025')
                if sw2025 and isinstance(sw2025, dict):
                    obj["subject_weights_2025"] = {normalize_subject(k): float(v) for k, v in sw2025.items()}
                else:
                    obj["subject_weights_2025"] = obj["subject_weights_2026"].copy()
                obj["subject_weights_2025_raw"] = entry.get('subject_weights_2025_raw') or entry.get('subject_weights_raw')

                # LingU Constraints
                obj["calculation_constraints"].append({
                    "type": "lingu_7_scale",
                    "description": "Lingnan standard conversion scale: 5**=7, 5*=6, 5=5, 4=4, 3=3, 2=2, 1=1"
                })
                
                obj["calculation_constraints"].append({
                    "type": "score_breakdown_warning",
                    "description": "The median and lower quartile scores for individual subjects (Chinese, English, Math, Elective 1 and Elective 2) SHOULD NOT be summed up and taken as achieved by a single candidate. Each median and lower quartile score is calculated separately by subject."
                })

                # Flexible Admission Detection
                flex_map = {
                    "JS7123": "Chinese Language", "JS7133": "Chinese Language / Mathematics",
                    "JS7211": "Chinese Language", "JS7212": "Chinese Language", "JS7213": "Chinese Language",
                    "JS7214": "Chinese Language", "JS7215": "Chinese Language", "JS7216": "Chinese Language",
                    "JS7301": "Chinese Language", "JS7302": "Chinese Language", "JS7303": "Chinese Language",
                    "JS7307": "Chinese Language", "JS7503": "Chinese Language", "JS7606": "Chinese Language / Mathematics",
                    "JS7709": "Mathematics", "JS7905": "Chinese Language / Mathematics"
                }
                if code in flex_map:
                    obj["calculation_constraints"].append({
                        "type": "lingu_flexible_admission",
                        "subjects": flex_map[code],
                        "description": f"May be considered even with result in {flex_map[code]} one level below standard, provided they are competitive enough and in Band A."
                    })

                obj["min_requirements_2026"] = {
                    "chi": entry.get('min_chi'),
                    "eng": entry.get('min_eng'),
                    "math": entry.get('min_math'),
                    "csd": entry.get('min_csd'),
                    "elect1": build_generic_elective(entry.get('min_elect1'), entry.get('elect1_constraint')),
                    "elect2": build_generic_elective(entry.get('min_elect2'))
                }

            elif school_key == "EdUHK":
                obj["formula_2025"] = entry.get('formula')
                obj["formula_2026"] = entry.get('formula')
                
                sw2026 = entry.get('subject_weights', {})
                obj["subject_weights_2026"] = {normalize_subject(k): float(v) for k, v in sw2026.items()}
                obj["subject_weights_2026_raw"] = entry.get('subject_weights_raw')
                
                sw2025 = entry.get('subject_weights_2025')
                if sw2025 and isinstance(sw2025, dict):
                    obj["subject_weights_2025"] = {normalize_subject(k): float(v) for k, v in sw2025.items()}
                else:
                    obj["subject_weights_2025"] = obj["subject_weights_2026"].copy()
                obj["subject_weights_2025_raw"] = entry.get('subject_weights_2025_raw') or entry.get('subject_weights_raw')

                obj["min_requirements_2026"] = {
                    "chi": entry.get('min_chi'),
                    "eng": entry.get('min_eng'),
                    "math": entry.get('min_math'),
                    "csd": entry.get('min_csd'),
                    "elect1": build_generic_elective(entry.get('min_elect1'), entry.get('elect1_constraint')),
                    "elect2": build_generic_elective(entry.get('min_elect2'))
                }
                
                # Combine PDF remarks and admission notes for EdUHK
                remarks_list = [entry.get('remarks_pdf'), entry.get('admission_notes')]
                # Filter out None/empty
                valid_remarks = [clean_raw_string(r) for r in remarks_list if r and r not in ["", "--", "-"]]
                if valid_remarks:
                    if obj["remarks"]:
                        obj["remarks"] += " | " + " | ".join(valid_remarks)
                    else:
                        obj["remarks"] = " | ".join(valid_remarks)
            
            elif school_key in ["HKMU", "SSSDP"]:
                obj["formula_2025"] = entry.get('formula')
                obj["formula_2026"] = entry.get('formula')
                
                sw2026 = entry.get('subject_weights', {})
                obj["subject_weights_2026"] = {normalize_subject(k): float(v) for k, v in sw2026.items()}
                obj["subject_weights_2026_raw"] = entry.get('subject_weights_raw')
                
                obj["subject_weights_2025"] = obj["subject_weights_2026"].copy()
                obj["subject_weights_2025_raw"] = entry.get('subject_weights_raw')

                # Flexible Admission Constraint (HKMU / SSSDP HKMU programmes)
                is_hkmu = (school_key == "HKMU") or ("Metropolitan University" in str(entry.get('institution', '')))
                if is_hkmu and code not in ["JS9580", "JSSU40", "JSSU50", "JSSU55"]:
                    obj["calculation_constraints"].append({
                        "type": "hkmu_flexible_admission",
                        "description": "Applicants fail to achieve Level 3 in CHI/ENG may be considered if they have Level 2 in that subject + Level 5* in one other Cat A subject + Band A choice + Pass Interview."
                    })

                obj["min_requirements_2026"] = {
                    "chi": entry.get('min_chi'),
                    "eng": entry.get('min_eng'),
                    "math": entry.get('min_math'),
                    "csd": entry.get('min_csd'),
                    "elect1": build_generic_elective(entry.get('min_elect1')),
                    "elect2": build_generic_elective(entry.get('min_elect2'))
                }

            # 4. Standardize numeric scores
            if school_key == "CityU":
                obj["scores_2025"]["median"] = entry.get('median_score')
                obj["scores_2025"]["lq"] = entry.get('lower_score')
            elif school_key == "CUHK":
                obj["scores_2025"]["expected_score"] = entry.get('expected_score')
                obj["scores_2025"]["median"] = entry.get('score_median_2025')
                obj["scores_2025"]["lq"] = entry.get('score_lq_2025')
                obj["scores_2025"]["uq"] = entry.get('score_uq_2025')
            elif school_key == "HKU":
                obj["scores_2025"]["median"] = entry.get('score_median')
                obj["scores_2025"]["lq"] = entry.get('score_lq')
                obj["scores_2025"]["uq"] = entry.get('score_uq')
            elif school_key == "HKUST":
                obj["scores_2025"]["median"] = entry.get('score_median')
                obj["scores_2025"]["lq"] = entry.get('score_lq')
                obj["max_achievable_score"] = entry.get('score_ha')
                obj["scores_2025"]["expected_score"] = entry.get('expected_score')
            elif school_key == "PolyU":
                obj["scores_2025"]["mean"] = entry.get('score_avg')
                obj["scores_2025"]["median"] = entry.get('score_median')
                obj["scores_2025"]["lq"] = entry.get('score_lq')
            else:
                obj["scores_2025"]["median"] = entry.get('score_median')
                obj["scores_2025"]["lq"] = entry.get('score_lq')
                obj["scores_2025"]["mean"] = entry.get('score_mean')

            for k in obj["scores_2025"]:
                val = obj["scores_2025"][k]
                if val in ["", "-", None, "N/A"]: obj["scores_2025"][k] = None
                else:
                    try: obj["scores_2025"][k] = float(str(val).replace(",", ""))
                    except: obj["scores_2025"][k] = None
            
            # Standardize max_achievable_score
            val = obj["max_achievable_score"]
            if val in ["", "-", None, "N/A"]: obj["max_achievable_score"] = None
            else:
                try: obj["max_achievable_score"] = float(str(val).replace(",", ""))
                except: obj["max_achievable_score"] = None
            
            # Final ID generation and global logic extraction
            logic_25 = extract_logic_from_formula(obj["formula_2025"])
            logic_26 = extract_logic_from_formula(obj["formula_2026"])
            
            obj["formula_2025_id"] = "best5" if logic_25["best_n"] == 5 else "best6" if logic_25["best_n"] == 6 else "custom"
            obj["formula_2026_id"] = "best5" if logic_26["best_n"] == 5 else "best6" if logic_26["best_n"] == 6 else "custom"
            
            # Merge extracted compulsory subjects into constraints
            if logic_25["compulsory"]:
                existing_comp = next((c for c in obj["calculation_constraints"] if c["type"] == "compulsory_subjects"), None)
                if existing_comp:
                    existing_comp["subjects"] = list(set(existing_comp["subjects"] + logic_25["compulsory"]))
                else:
                    obj["calculation_constraints"].append({
                        "type": "compulsory_subjects",
                        "subjects": logic_25["compulsory"],
                        "description": f"Formula requires: {', '.join(logic_25['compulsory'])}"
                    })
            
            # Merge extracted dynamic pools (CUHK style)
            for pool in logic_25["best_of"]:
                obj["best_of_weights_2025"].append(pool)
                # Sync to 2026 if not already overwritten
                if not obj["best_of_weights_2026"]:
                    obj["best_of_weights_2026"] = obj["best_of_weights_2025"].copy()
            
            # Merge extracted compulsory pools (CUHK style)
            for pool in logic_25.get("compulsory_pools", []):
                obj["calculation_constraints"].append({
                    "type": "compulsory_subject_pool",
                    "count": pool["count"],
                    "subjects": pool["subjects"],
                    "description": pool["description"]
                })
            
            # Merge extracted bonuses
            for b in logic_25["bonus"]:
                if b["type"] not in [x["type"] for x in obj["calculation_constraints"]]:
                    obj["calculation_constraints"].append(b)

            if obj["remarks"] and obj["remarks"] not in ["", "--", "-"]:
                if "conditional_remarks" not in obj["min_requirements_2026"]:
                    obj["min_requirements_2026"]["conditional_remarks"] = obj["remarks"]
            
            # Final global string sweep for cleanliness
            obj["formula_2025"] = clean_raw_string(obj["formula_2025"])
            obj["formula_2026"] = clean_raw_string(obj["formula_2026"])
            
            # If raw strings are missing, build them from the dicts for auditability
            if not obj["subject_weights_2026_raw"] and obj["subject_weights_2026"]:
                obj["subject_weights_2026_raw"] = ", ".join([f"{k} (x{v})" for k, v in obj["subject_weights_2026"].items()])
            
            if not obj["subject_weights_2025_raw"] and obj["subject_weights_2025"]:
                obj["subject_weights_2025_raw"] = ", ".join([f"{k} (x{v})" for k, v in obj["subject_weights_2025"].items()])

            obj["subject_weights_2025_raw"] = clean_raw_string(obj["subject_weights_2025_raw"])
            obj["subject_weights_2026_raw"] = clean_raw_string(obj["subject_weights_2026_raw"])
            obj["remarks"] = clean_raw_string(obj["remarks"])
            
            if "conditional_remarks" in obj["min_requirements_2026"]:
                obj["min_requirements_2026"]["conditional_remarks"] = clean_raw_string(obj["min_requirements_2026"]["conditional_remarks"])

            # Assign conversion table
            is_med = (code in ["JS4501", "JS4502"])
            obj["score_conversion_table"] = get_conversion_table(obj["institution"], is_medicine=is_med)

            if school_key == "HKBU":
                conversion_table = obj["score_conversion_table"]["category_a"]
                median_estimate = estimate_hkbu_score_from_grades(
                    obj["score_grades_2025"].get("median"),
                    obj["subject_weights_2025"],
                    conversion_table
                )
                lq_estimate = estimate_hkbu_score_from_grades(
                    obj["score_grades_2025"].get("lq"),
                    obj["subject_weights_2025"],
                    conversion_table
                )
                if median_estimate is not None:
                    obj["scores_2025"]["median"] = median_estimate
                    obj["scores_2025"]["score_type"] = "estimated"
                if lq_estimate is not None:
                    obj["scores_2025"]["lq"] = lq_estimate
                    obj["scores_2025"]["score_type"] = "estimated"

            obj = apply_baselines(obj)
            obj["offer_statistics"] = offer_stats_map.get(code, [])
            unified_map[code] = obj

    # 5. Export Unified Master File
    final_unified = list(unified_map.values())
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(final_unified, f, ensure_ascii=False, indent=2)
    print(f"Unified data for {len(final_unified)} programmes saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    unify_data()
