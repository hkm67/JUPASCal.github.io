import json

def calculate_programme_score(student_grades, programme, year="2025"):
    """
    Calculates the score for a specific programme and returns a detailed breakdown.
    year: "2025" or "2026" (determines which weights/formula to use)
    """
    weights = programme.get(f"subject_weights_{year}", {})
    best_of_pools = programme.get(f"best_of_weights_{year}", [])
    formula_id = programme.get(f"formula_{year}_id")
    conv_table = programme.get("score_conversion_table", {}).get("category_a", {})
    constraints = programme.get("calculation_constraints", [])
    
    breakdown = []
    subject_scores = []
    
    # 1. Process Flat Weights
    for subj, grade in student_grades.items():
        base_points = conv_table.get(str(grade).strip(), 0)
        weight = weights.get(subj, 1.0)
        weighted_points = base_points * weight
        
        subject_scores.append({
            "subject": subj,
            "grade": grade,
            "base_points": base_points,
            "weight": weight,
            "weighted_points": weighted_points,
            "used": False,
            "pool": None
        })

    # 2. Handle Constraints (e.g., compulsory subjects)
    compulsory = []
    for c in constraints:
        if c["type"] == "compulsory_subjects":
            compulsory = c["subjects"]

    # 3. Handle Special Calculation Logic (e.g., Best 5)
    final_score = 0
    selected_subjects = []
    
    if formula_id in ["best5", "best6", "custom"]:
        count = 5 if "5" in str(programme.get(f"formula_{year}")) else 6
        
        # Sort by weighted points descending
        subject_scores.sort(key=lambda x: x["weighted_points"], reverse=True)
        
        # First, pick compulsory
        for s in subject_scores:
            if s["subject"] in compulsory:
                s["used"] = True
                selected_subjects.append(s)
        
        # Then, fill the rest
        for s in subject_scores:
            if not s["used"] and len(selected_subjects) < count:
                # Check for mutual exclusivity (e.g. Math vs M1/M2)
                is_math_conflict = False
                for c in constraints:
                    if c["type"] == "maths_m1m2_as_one":
                        if "Mathematics" in s["subject"] and any("Mathematics" in x["subject"] for x in selected_subjects):
                            is_math_conflict = True
                
                if not is_math_conflict:
                    s["used"] = True
                    selected_subjects.append(s)

    final_score = sum(s["weighted_points"] for s in selected_subjects)
    
    return {
        "final_score": final_score,
        "selected": selected_subjects,
        "all_scores": subject_scores
    }

if __name__ == "__main__":
    # Test JS1041 (CityU Creative Media)
    with open("data/processed/JUPAS_2026_Unified_Data.json") as f:
        data = json.load(f)
    
    js1041 = [x for x in data if x["jupas_code"] == "JS1041"][0]
    grades = {"Chinese Language": "4", "English Language": "5", "Mathematics (Compulsory Part)": "4", "History": "5*", "Geography": "5"}
    
    result = calculate_programme_score(grades, js1041)
    print(f"JS1041 Score: {result['final_score']}")
    print("Breakdown:")
    for s in result['selected']:
        print(f"  {s['subject']}: {s['grade']} ({s['base_points']}) x {s['weight']} = {s['weighted_points']}")
