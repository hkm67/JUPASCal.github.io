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
    "CityU": "../../Reference(2026)/CityU/CityU_2026_Data.json",
    "CUHK": "../../Reference(2026)/CUHK/CUHK_2026_Data.json",
    "EdUHK": "../../Reference(2026)/EdUHK/EdUHK_2026_Data.json",
    "HKBU": "../../Reference(2026)/HKBU/HKBU_2026_Data.json",
    "HKMU": "../../Reference(2026)/HKMU/HKMU_2026_Data.json",
    "HKU": "../../Reference(2026)/HKU/HKU_2026_Data.json",
    "HKUST": "../../Reference(2026)/HKUST/HKUST_2026_Data.json",
    "LingU": "../../Reference(2026)/LingU/LingU_2026_Data.json",
    "PolyU": "../../Reference(2026)/PolyU/PolyU_2026_Data.json",
    "SSSDP": "../../Reference(2026)/SSSDP/SSSDP_2026_Data.json"
}

# Supplemental Data Files (PDF extractions or raw API caches)
CUHK_2025_REQ = "../../Reference(2026)/CUHK/CUHK_PDF_2025_Requirements.json"
CUHK_2026_REQ = "../../Reference(2026)/CUHK/CUHK_PDF_2026_Requirements.json"
HKU_RAW_API = "../../Reference(2026)/HKU/hku_raw_api.json"
POLYU_WEIGHTS_2026 = "../../Reference(2026)/PolyU/PolyU_2026_Weights.json"

OVERVIEW_FILE = "../../data/raw/2026 JUPAS Program Overview.xlsx"
OUTPUT_FILE = "../../data/processed/JUPAS_2026_Unified_Data.json"
CUHK_GRADES_FILE = "../../Reference(2026)/CUHK/cuhk_grades_2025.json"
SUBJECT_MAPPING_FILE = "../../data/raw/subject_mapping.json"

# Global mapping loaded once from external JSON
_mapping_path = os.path.join(os.path.dirname(__file__), SUBJECT_MAPPING_FILE)
with open(_mapping_path, encoding="utf-8") as f:
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
        if "MODULE 1" in name_upper or "M1" in name_upper: return "Mathematics Extended Part (Module 1)"
        if "MODULE 2" in name_upper or "M2" in name_upper: return "Mathematics Extended Part (Module 2)"
        if "COMPULSORY" in name_upper: return "Mathematics (Compulsory Part)"
        
    return name
def parse_hku_min_reqs(html):
    """Extract ENG/CHI/MATH/CSD/E1/E2 levels from HKU API HTML tables."""
    if not html: return {}
    soup = BeautifulSoup(html, 'html.parser')
    table = soup.find('table', class_='section-Minimum-Level-Requirement')
    if not table: return {}
    
    rows = table.find_all('tr')
    if len(rows) < 3: return {}
    
    cells = rows[2].find_all('td')
    reqs = {}
    labels = ["eng", "chi", "math", "csd", "elect1", "elect2"]
    for i, label in enumerate(labels):
        if i < len(cells):
            val = cells[i].get_text(strip=True).replace("Level ", "")
            reqs[label] = val
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
    if institution in ["LingnanU", "EdUHK", "HKMU", "SSSDP"] or is_medicine:
        table = {
            "5**": 7.0, "5*": 6.0, "5": 5.0, "4": 4.0, "3": 3.0, "2": 2.0, "1": 1.0,
            "attained": 0.0, "A": 0.0
        }
        # Add Category C for these schools if known (standard is A=7, B=6, C=5, D=4, E=3)
        cat_c = {"A": 7.0, "B": 6.0, "C": 5.0, "D": 4.0, "E": 3.0}
    else:
        # Group A: HKU, CUHK, HKUST, PolyU, CityUHK, HKBU
        table = {
            "5**": 8.5, "5*": 7.0, "5": 5.5, "4": 4.0, "3": 3.0, "2": 2.0, "1": 1.0,
            "attained": 0.0, "A": 0.0
        }
        cat_c = {"A": 5.0, "B": 4.0, "C": 3.0, "D": 2.0, "E": 1.0}
        
    return {"category_a": table, "category_c": cat_c}

def map_formula_id(formula_text):
    """Standardize formula descriptions into machine-readable IDs (best5, 4c2x, etc.)."""
    if not formula_text: return "unknown"
    f = str(formula_text).lower()
    if "best 5" in f or "best(5)" in f: return "best5"
    if "best 6" in f or "best(6)" in f: return "best6"
    if "4 core + best 2" in f or "4c+2x" in f or "4c2x" in f or "4 core + 2 elective" in f: return "4c2x"
    if "3 core + best 2" in f or "3c+2x" in f or "3c2x" in f or "3 core + 2 elective" in f: return "3c2x"
    if "any best 5" in f: return "best5"
    if "any best 6" in f: return "best6"
    return "custom"

def clean_raw_string(text):
    """Universal utility to strip bullet points, HTML tags, and fix whitespace in remarks."""
    if not text: return text
    text = str(text)
    text = text.replace("<br />", ", ")
    text = text.replace("<br>", ", ")
    text = text.replace("\n", ", ")
    text = text.replace("•", "")
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r',\s*,', ',', text)
    text = text.replace(" ,", ",")
    return text.strip(", ")

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
    df_overview = pd.read_excel(OVERVIEW_FILE)
    overview_map = {str(row['JUPAS Catalogue No.']): {
        "name_zh": row['chinese_name'],
        "name_en": row['Programme Full Title'],
        "institution": row['Institution / Scheme']
    } for _, row in df_overview.iterrows()}

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

    unified = []
    seen_codes = set()

    # 2. Iterate through institutions
    for school_key, path in FILES.items():
        if not os.path.exists(path): continue
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        
        for entry in data:
            code = entry.get('jupas_code') or entry.get('code')
            if not code or code in seen_codes: continue
            seen_codes.add(code)
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
                    subjs = []
                    for s in re.split(r',(?![^\(]*\))', comp_text):
                        subjs.append(normalize_subject(s.strip()))
                    
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
                
                obj["formula_2026"] = entry.get('formula') or entry.get('principle')
                obj["formula_2025"] = req25.get('principle')
                
                # Handle cases where the 2025 PDF parser captured weightings into the formula field
                if obj["formula_2025"] and ("(x " in obj["formula_2025"] or "•" in obj["formula_2025"]):
                    obj["formula_2025"] = obj["formula_2026"]
                if not obj["formula_2025"]:
                    obj["formula_2025"] = obj["formula_2026"]
                
                # Use highly structured 2026 API weight strings for 2025 fallback where possible
                flat_weights, best_of_weights = parse_cuhk_weights(entry.get('weight'))
                obj["subject_weights_2026"] = flat_weights
                obj["best_of_weights_2026"] = best_of_weights
                obj["subject_weights_2025"] = obj["subject_weights_2026"].copy()
                obj["best_of_weights_2025"] = obj["best_of_weights_2026"].copy()
                
                obj["subject_weights_2025_raw"] = req25.get('weight')
                obj["subject_weights_2026_raw"] = entry.get('weight_remarks')
                
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
                
                # Formula often contains multipliers too, e.g. "2 x Eng"
                f_text = str(formula_26)
                if "2 x Eng" in f_text: obj["subject_weights_2026"]["English Language"] = 2.0
                elif "1.5 x Eng" in f_text: obj["subject_weights_2026"]["English Language"] = 1.5
                
                if "2 x Math" in f_text: obj["subject_weights_2026"]["Mathematics (Compulsory Part)"] = 2.0
                elif "1.5 x Math" in f_text: obj["subject_weights_2026"]["Mathematics (Compulsory Part)"] = 1.5

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

                obj["subject_weights_2025"] = obj["subject_weights_2026"].copy()
                obj["best_of_weights_2025"] = obj["best_of_weights_2026"].copy()
                
                obj["subject_weights_2026_raw"] = sw_text
                obj["subject_weights_2025_raw"] = sw_text 

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

            elif school_key == "HKUST":
                formula_text_2025 = entry.get('formula_text_2025')
                formula_text_2026 = entry.get('otherSubjects')
                obj["formula_2025"] = formula_text_2025 or formula_text_2026
                obj["formula_2026"] = formula_text_2026
                
                # Eng Multiplier
                eng_m = float(str(entry.get('engMultiplier', 'x1')).replace('x',''))
                obj["subject_weights_2026"]["English Language"] = eng_m
                
                # Second Multiplier
                sec_m = float(str(entry.get('secondMultiplier', 'x1')).replace('x',''))
                sec_subj = entry.get('secondMultiplierSubject')
                if sec_subj and sec_m != 1.0:
                    obj["subject_weights_2026"][normalize_subject(sec_subj)] = sec_m
                
                # Parse sub-weightings from formula text
                best_of_26, flat_26 = parse_hkust_weights(formula_text_2026)
                obj["subject_weights_2026"].update(flat_26)
                obj["best_of_weights_2026"] = best_of_26
                
                best_of_25, flat_25 = parse_hkust_weights(formula_text_2025)
                if best_of_25 or flat_25:
                    obj["subject_weights_2025"] = flat_25
                    obj["best_of_weights_2025"] = best_of_25
                    # Don't forget core multipliers
                    obj["subject_weights_2025"]["English Language"] = eng_m
                    if sec_subj and sec_m != 1.0:
                        obj["subject_weights_2025"][normalize_subject(sec_subj)] = sec_m
                else:
                    obj["subject_weights_2025"] = obj["subject_weights_2026"].copy()
                    obj["best_of_weights_2025"] = obj["best_of_weights_2026"].copy()
                
                # Constraints
                obj["calculation_constraints"].append({
                    "type": "hkust_weighted_best",
                    "subject_count": entry.get('subjectNum', 5),
                    "max_weighting_cap": entry.get('max_attainable_weighting'),
                    "bonus_categories": entry.get('extra_subject_bonus_category'),
                    "bonus_scale": {
                        "Category A": {"8.5": 0.05, "7.0": 0.0412, "5.5": 0.0324, "4.0": 0.0235, "3.0": 0.0176},
                        "Category B": {"4.0": 0.0235, "3.0": 0.0176},
                        "Category C": {"8.5": 0.05, "7.0": 0.0412, "5.5": 0.0324, "4.0": 0.0235, "3.0": 0.0176}
                    },
                    "description": f"Weighted Best {entry.get('subjectNum', 5)} subjects with max weighting cap of {entry.get('max_attainable_weighting')} and 6th subject bonus."
                })

                # Structured Requirements 2026
                obj["min_requirements_2026"] = {
                    "chi": entry.get('req_chin'),
                    "eng": entry.get('req_eng'),
                    "math": entry.get('req_math'),
                    "csd": "A" if str(entry.get('req_csd')).lower() == "attained" else entry.get('req_csd'),
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
            
            # Final ID generation and global remark merging
            obj["formula_2025_id"] = map_formula_id(obj["formula_2025"])
            obj["formula_2026_id"] = map_formula_id(obj["formula_2026"])
            
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

            obj = apply_baselines(obj)
            unified.append(obj)

    # 5. Export Unified Master File
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(unified, f, ensure_ascii=False, indent=2)
    print(f"Unified data for {len(unified)} programmes saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    unify_data()
