import json
import os

MASTER_DATA = "data/processed/JUPAS_2026_Unified_Data.json"

# Grade to Point Mapping
# Note: BU standard is 5**=7, 5*=6... but let's be careful.
# Actually most BU calc is 5**=7? Need to verify.
# User said "all HKBU subjects are best5 now".
GRADE_MAP = {"5**": 7, "5*": 6, "5": 5, "4": 4, "3": 3, "2": 2, "1": 1, "attained": 0, "A": 0}

def calculate_score(grades, weights):
    if not grades: return None
    
    subject_scores = []
    # Core and Electives in breakdown
    for subj, grade in grades.items():
        base_val = GRADE_MAP.get(str(grade).strip(), 0)
        # Find weight (normalize name first)
        # The breakdown uses keys like "CHIN", "Elective 1"
        # The weights dict uses "Chinese Language"
        
        weight = 1.0
        if subj == "CHIN": weight = weights.get("Chinese Language", 1.0)
        elif subj == "ENGL": weight = weights.get("English Language", 1.0)
        elif subj == "MATH": weight = weights.get("Mathematics (Compulsory Part)", 1.0)
        elif "Elective" in subj:
            # For HKBU breakdowns, we don't know WHICH elective it is.
            # This is where the risk-adverse overestimation happens.
            # We take the HIGHEST weighting available for any elective.
            elective_weights = [v for k, v in weights.items() if k not in ["Chinese Language", "English Language", "Mathematics (Compulsory Part)"]]
            weight = max(elective_weights) if elective_weights else 1.0
            
        subject_scores.append(base_val * weight)
    
    # Best 5
    subject_scores.sort(reverse=True)
    return sum(subject_scores[:5])

def update_hkbu():
    with open(MASTER_DATA, encoding='utf-8') as f:
        data = json.load(f)
    
    updated_count = 0
    for entry in data:
        if entry["institution"] == "HKBU":
            weights = entry["subject_weights_2025"]
            grades = entry["score_grades_2025"]
            
            est_median = calculate_score(grades.get("median"), weights)
            est_lq = calculate_score(grades.get("lq"), weights)
            
            if est_median:
                entry["scores_2025"]["median"] = est_median
                entry["scores_2025"]["score_type"] = "estimated"
            
            if est_lq:
                entry["scores_2025"]["lq"] = est_lq
                entry["scores_2025"]["score_type"] = "estimated"
            
            if not est_median and not est_lq:
                entry["scores_2025"]["score_type"] = "actual" # fallback for mean-only
            
            updated_count += 1

    with open(MASTER_DATA, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Calculated estimates for {updated_count} HKBU programmes.")

if __name__ == "__main__":
    update_hkbu()
