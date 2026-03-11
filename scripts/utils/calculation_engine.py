import json
import re

def calculate_programme_score(student_grades, programme, year="2025"):
    """
    Calculates the score for a specific programme and returns a detailed breakdown.
    year: "2025" or "2026" (determines which weights/formula to use)
    """
    weights = programme.get(f"subject_weights_{year}", {})
    best_of_pools = programme.get(f"best_of_weights_{year}", [])
    formula_id = programme.get(f"formula_{year}_id")
    conv_table = programme.get("score_conversion_table", {}).get("category_a", {})
    cat_c_table = programme.get("score_conversion_table", {}).get("category_c", {})
    constraints = programme.get("calculation_constraints", [])
    
    subject_scores = []
    
    # 1. Process Flat Weights
    for subj, grade in student_grades.items():
        base_points = conv_table.get(str(grade).strip(), cat_c_table.get(str(grade).strip(), 0))
        weight = weights.get(subj, 1.0)
        
        subject_scores.append({
            "subject": subj,
            "grade": grade,
            "base_points": base_points,
            "weight": weight,
            "weighted_points": base_points * weight,
            "used": False,
            "is_best_of": False
        })

    # 2. Handle Best-Of Pools (e.g. M1 or M2 x 2.0)
    for pool in best_of_pools:
        pool_cands = [s for s in subject_scores if s["subject"] in pool["subjects"]]
        pool_cands.sort(key=lambda x: x["weighted_points"], reverse=True)
        for i in range(min(pool["count"], len(pool_cands))):
            cand = pool_cands[i]
            if pool["weight"] > cand["weight"]:
                cand["weight"] = pool["weight"]
                cand["weighted_points"] = cand["base_points"] * cand["weight"]
                cand["is_best_of"] = True

    # 3. Handle Max Weighted Subjects Constraint (e.g. CUHK Science)
    for c in constraints:
        if c["type"] == "max_weighted_subjects":
            subject_scores.sort(key=lambda x: x["weight"], reverse=True)
            weighted_count = 0
            for s in subject_scores:
                if s["weight"] > 1.0:
                    if weighted_count < c["limit"]:
                        weighted_count += 1
                    else:
                        s["weight"] = 1.0
                        s["weighted_points"] = s["base_points"]
                        s["is_best_of"] = False

    # 4. Handle Compulsory Subjects
    compulsory = []
    for c in constraints:
        if c["type"] == "compulsory_subjects":
            compulsory = c["subjects"]

    # 5. Selection Logic (Best N)
    selected_subjects = []
    target_count = 5 if "5" in str(programme.get(f"formula_{year}")) else 6
    if formula_id == "best6": target_count = 6

    # A. Compulsory first
    for s in subject_scores:
        if s["subject"] in compulsory:
            s["used"] = True
            selected_subjects.append(s)
    
    # B. Fill remaining with best weighted scores
    remaining = [s for s in subject_scores if not s["used"]]
    remaining.sort(key=lambda x: x["weighted_points"], reverse=True)

    for s in remaining:
        if len(selected_subjects) >= target_count: break
        
        # Mutual Exclusivity Check
        is_conflict = False
        for c in constraints:
            if c["type"] == "maths_m1m2_as_one" and "Mathematics" in s["subject"]:
                if any("Mathematics" in x["subject"] for x in selected_subjects):
                    is_conflict = True
        
        if not is_conflict:
            s["used"] = True
            selected_subjects.append(s)

    # 6. Post-Selection Bonus (PolyU 6th subject)
    for c in constraints:
        if c["type"] == "additional_bonus_6th" and len(selected_subjects) == 5:
            bonus_cand = sorted([s for s in subject_scores if not s["used"] and s["base_points"] >= 3], key=lambda x: x["base_points"], reverse=True)
            if bonus_cand:
                bc = bonus_cand[0]
                bc.update({"used": True, "is_bonus": True, "weighted_points": bc["base_points"] * 0.1})
                selected_subjects.append(bc)

    final_score = sum(s["weighted_points"] for s in selected_subjects)
    
    return {
        "final_score": final_score,
        "selected": selected_subjects,
        "all_scores": subject_scores
    }

if __name__ == "__main__":
    with open("data/processed/JUPAS_2026_Unified_Data.json") as f:
        data = json.load(f)
    
    # Test JS4601 (CUHK Science)
    js4601 = [x for x in data if x["jupas_code"] == "JS4601"][0]
    grades = {
        "Chinese Language": "5**", 
        "English Language": "5*", 
        "Mathematics (Compulsory Part)": "5*", 
        "Mathematics Extended Part (Module 1)": "3", 
        "Biology": "5*",
        "Citizenship and Social Development": "A"
    }
    
    result = calculate_programme_score(grades, js4601)
    print(f"JS4601 Score: {result['final_score']}")
    for s in result['selected']:
        print(f"  {s['subject']}: {s['grade']} ({s['base_points']}) x {s['weight']} = {s['weighted_points']}")
