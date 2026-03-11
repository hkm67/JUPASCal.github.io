import json
import os

SCRIPT_PATH = "scripts/utils/unify_2026_data.py"

with open(SCRIPT_PATH, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if 'OVERVIEW_FILE = "../../data/raw/2026 JUPAS Program Overview.xlsx"' in line:
        new_lines.append(line)
        new_lines.append('OUTPUT_FILE = "../../data/processed/JUPAS_2026_Unified_Data.json"\n')
        new_lines.append('CUHK_GRADES_FILE = "../../Reference(2026)/CUHK/cuhk_grades_2025.json"\n')
        new_lines.append('SUBJECT_MAPPING_FILE = "../../data/raw/subject_mapping.json"\n')
        new_lines.append('\n')
        new_lines.append('# Global mapping loaded once from external JSON\n')
        new_lines.append('_mapping_path = os.path.join(os.path.dirname(__file__), SUBJECT_MAPPING_FILE)\n')
        new_lines.append('with open(_mapping_path, encoding="utf-8") as f:\n')
        new_lines.append('    SUBJECT_MAP = json.load(f)\n')
        continue
    
    if 'def normalize_subject(name):' in line:
        new_lines.append(line)
        new_lines.append('    """\n')
        new_lines.append('    Standardizes all DSE subject names across 10 institutions using an external canonical map.\n')
        new_lines.append('    Converts Chinese terms, school-specific abbreviations, and variations.\n')
        new_lines.append('    """\n')
        new_lines.append('    if not name: return name\n')
        new_lines.append('    # Clean string: remove bullets, trailing punctuation, and extra whitespace\n')
        new_lines.append('    name = str(name).strip().replace("•", "").strip(" .)")\n')
        new_lines.append('    \n')
        new_lines.append('    # Authoritative Mapping (case-insensitive lookup using external JSON)\n')
        new_lines.append('    name_clean = name.upper()\n')
        new_lines.append('    if name_clean in SUBJECT_MAP:\n')
        new_lines.append('        return SUBJECT_MAP[name_clean]\n')
        new_lines.append('    \n')
        new_lines.append('    # Secondary check: institution-specific prefix cleaning (CUHK "A" prefix)\n')
        new_lines.append('    if name_clean.startswith("A") and name_clean[1:] in SUBJECT_MAP:\n')
        new_lines.append('        return SUBJECT_MAP[name_clean[1:]]\n')
        new_lines.append('        \n')
        new_lines.append('    return name\n')
        skip = True
        continue
    
    if skip:
        if line.startswith('def '):
            skip = False
            new_lines.append(line)
        continue
    
    # Skip the old redundant paths
    if 'OUTPUT_FILE = ' in line or 'CUHK_GRADES_FILE = ' in line:
        continue
        
    new_lines.append(line)

with open(SCRIPT_PATH, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print("unify_2026_data.py patched successfully.")
