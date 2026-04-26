import type {
  CalculationResult,
  CandidateScore,
  Constraint,
  EligibilityDetail,
  EligibilityResult,
  MinRequirements,
  Programme,
  RequirementPool,
  StudentGrades,
} from "../types/jupas";

function normalizeSubjectKey(name: string) {
  if (!name) return name;
  const n = name.toUpperCase();
  if (n === "MATHEMATICS COMPULSORY PART" || n === "MATHEMATICS" || n === "MATHEMATICS (COMPULSORY PART)") {
    return "Mathematics (Compulsory Part)";
  }
  if ((n.includes("MODULE 1") || n.includes("CALCULUS AND STATISTICS") || n.includes("M1")) && (n.includes("EXTENDED") || n.includes("PART"))) {
    return "Mathematics Extended Part (Module 1)";
  }
  if ((n.includes("MODULE 2") || n.includes("ALGEBRA AND CALCULUS") || n.includes("M2")) && (n.includes("EXTENDED") || n.includes("PART"))) {
    return "Mathematics Extended Part (Module 2)";
  }
  return name;
}

function includesM12Aware(subjects: string[] = [], candidate: string) {
  if (subjects.includes(candidate)) return true;
  return candidate === "Mathematics Extended Part (Module 1 or 2)"
    && (subjects.includes("Mathematics Extended Part (Module 1)") || subjects.includes("Mathematics Extended Part (Module 2)"));
}

export function calculateScore(studentGrades: StudentGrades, programme: Programme, year: "2025" | "2026" = "2025"): CalculationResult {
  if (!programme?.score_conversion_table) {
    return { totalScore: 0, selected: [], allCandidates: [], score_type: "actual" };
  }

  const rawWeights = programme[`subject_weights_${year}`] || {};
  const weights: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawWeights)) {
    weights[normalizeSubjectKey(key)] = value;
  }

  const bestOfPools = (programme[`best_of_weights_${year}`] || []).map((pool) => ({
    ...pool,
    subjects: pool.subjects.map(normalizeSubjectKey),
  }));
  const formulaId = programme[`formula_${year}_id`];
  const constraints = programme.calculation_constraints || [];
  const convTable = programme.score_conversion_table.category_a || {};
  const catCTable = programme.score_conversion_table.category_c || {};
  const candidates: CandidateScore[] = [];

  for (const [subject, grade] of Object.entries(studentGrades)) {
    if (!grade || grade === "U") continue;
    const basePoints = convTable[grade] ?? catCTable[grade] ?? 0;
    let multiplier = weights[subject] || 1;
    if (subject === "Mathematics Extended Part (Module 1 or 2)") {
      multiplier = weights["Mathematics Extended Part (Module 1)"] || weights["Mathematics Extended Part (Module 2)"] || 1;
    }
    candidates.push({
      subject,
      grade,
      basePoints,
      multiplier,
      weightedScore: basePoints * multiplier,
      isCompulsory: false,
      isBestOfPool: false,
      used: false,
      isBonus: false,
    });
  }

  for (const pool of bestOfPools) {
    const poolCandidates = candidates
      .filter((candidate) => includesM12Aware(pool.subjects, candidate.subject))
      .sort((a, b) => b.weightedScore - a.weightedScore);
    for (let index = 0; index < Math.min(pool.count, poolCandidates.length); index++) {
      const candidate = poolCandidates[index];
      if (pool.weight > candidate.multiplier) {
        candidate.multiplier = pool.weight;
        candidate.weightedScore = candidate.basePoints * candidate.multiplier;
        candidate.isBestOfPool = true;
      }
    }
  }

  const maxWeightedConstraint = constraints.find((constraint) => constraint.type === "max_weighted_subjects");
  if (maxWeightedConstraint) {
    candidates.sort((a, b) => b.multiplier - a.multiplier);
    let weightedCount = 0;
    for (const candidate of candidates) {
      if (candidate.multiplier > 1) {
        if (weightedCount < Number(maxWeightedConstraint.limit || 0)) {
          weightedCount++;
        } else {
          candidate.multiplier = 1;
          candidate.weightedScore = candidate.basePoints;
          candidate.isBestOfPool = false;
        }
      }
    }
  }

  const compulsoryConstraint = constraints.find((constraint) => constraint.type === "compulsory_subjects");
  if (compulsoryConstraint?.subjects) {
    for (const candidate of candidates) {
      candidate.isCompulsory = includesM12Aware(compulsoryConstraint.subjects, candidate.subject);
    }
  }

  const compulsoryPools = constraints.filter((constraint) => constraint.type === "compulsory_subject_pool");
  const selectedSubjects: CandidateScore[] = [];
  let totalScore = 0;
  let targetCount = getTargetCount(programme, year, constraints);

  for (const candidate of candidates.filter((candidate) => candidate.isCompulsory)) {
    candidate.used = true;
    selectedSubjects.push(candidate);
    totalScore += candidate.weightedScore;
  }

  for (const pool of compulsoryPools) {
    const poolCandidates = candidates
      .filter((candidate) => !candidate.used && includesM12Aware(pool.subjects || [], candidate.subject))
      .sort((a, b) => b.weightedScore - a.weightedScore);
    for (let index = 0; index < Math.min(Number(pool.count || 0), poolCandidates.length); index++) {
      if (selectedSubjects.length >= targetCount) break;
      const candidate = poolCandidates[index];
      candidate.used = true;
      selectedSubjects.push(candidate);
      totalScore += candidate.weightedScore;
    }
  }

  const remainingPotentials = candidates.filter((candidate) => !candidate.used).sort((a, b) => b.weightedScore - a.weightedScore);
  for (const candidate of remainingPotentials) {
    if (selectedSubjects.length >= targetCount) break;
    const mathConstraint = constraints.find((constraint) => constraint.type === "maths_m1m2_as_one");
    if (mathConstraint && candidate.subject.includes("Mathematics") && selectedSubjects.some((subject) => subject.subject.includes("Mathematics"))) {
      continue;
    }
    candidate.used = true;
    selectedSubjects.push(candidate);
    totalScore += candidate.weightedScore;
  }

  let bonusCandidates = candidates.filter((candidate) => !candidate.used).sort((a, b) => b.weightedScore - a.weightedScore);
  const bonus6 = getBonusConstraint(constraints, "bonus_6th");
  if (bonus6 && selectedSubjects.length === 5) {
    let eligible = bonusCandidates;
    if (bonus6.polyu_style) {
      const gradeToVal: Record<string, number> = { "5**": 7, "5*": 6, "5": 5, "4": 4, "3": 3, "2": 2, "1": 1 };
      eligible = eligible.filter((candidate) => (gradeToVal[candidate.grade] || 0) >= 3);
    }
    const bonusSubject = eligible[0];
    if (bonusSubject) {
      const bonusPoints = bonusSubject.weightedScore * Number(bonus6.multiplier || 0);
      totalScore += bonusPoints;
      bonusSubject.used = true;
      bonusSubject.isBonus = true;
      bonusSubject.weightedScore = bonusPoints;
      bonusSubject.bonusValue = `+${bonus6.multiplier}x`;
      selectedSubjects.push(bonusSubject);
      bonusCandidates = bonusCandidates.filter((candidate) => candidate !== bonusSubject);
    }
  }

  const bonus7 = getBonusConstraint(constraints, "bonus_7th");
  if (bonus7 && selectedSubjects.length === 6) {
    const bonusSubject = bonusCandidates[0];
    if (bonusSubject) {
      const bonusPoints = bonusSubject.weightedScore * Number(bonus7.multiplier || 0);
      totalScore += bonusPoints;
      bonusSubject.used = true;
      bonusSubject.isBonus = true;
      bonusSubject.weightedScore = bonusPoints;
      bonusSubject.bonusValue = `+${bonus7.multiplier}x`;
      selectedSubjects.push(bonusSubject);
    }
  }

  const ustBonusConstraint = constraints.find((constraint) => constraint.type === "hkust_weighted_best");
  if (ustBonusConstraint && selectedSubjects.length === ustBonusConstraint.subject_count) {
    const bonusSubject = candidates.filter((candidate) => !candidate.used).sort((a, b) => b.basePoints - a.basePoints)[0];
    if (bonusSubject) {
      const bonusRate = Number(ustBonusConstraint.max_attainable_weighting || 5) * (Number(ustBonusConstraint.bonus_percentage || 5) / 100);
      const bonusPoints = bonusRate * bonusSubject.basePoints;
      totalScore += bonusPoints;
      bonusSubject.weightedScore = bonusPoints;
      bonusSubject.used = true;
      bonusSubject.isBonus = true;
      bonusSubject.bonusValue = `+${((bonusSubject.basePoints / 8.5) * Number(ustBonusConstraint.bonus_percentage || 5)).toFixed(2)}% of total`;
      selectedSubjects.push(bonusSubject);
    }
  }

  const halfReplaceConstraint = constraints.find((constraint) => constraint.type === "m1m2_half_replacement");
  if (halfReplaceConstraint) {
    const unusedM12 = candidates
      .filter((candidate) => !candidate.used && (candidate.subject.includes("Module 1") || candidate.subject.includes("Module 2") || candidate.subject === "Mathematics Extended Part (Module 1 or 2)"))
      .sort((a, b) => b.weightedScore - a.weightedScore)[0];
    if (unusedM12) {
      const worstSubject = selectedSubjects.filter((subject) => !subject.isCompulsory && !subject.isBonus).sort((a, b) => a.weightedScore - b.weightedScore)[0];
      if (worstSubject) {
        const originalWorstScore = worstSubject.weightedScore;
        const halfReplacementScore = originalWorstScore / 2 + unusedM12.weightedScore / 2;
        if (halfReplacementScore > originalWorstScore) {
          totalScore = totalScore - originalWorstScore + halfReplacementScore;
          worstSubject.weightedScore = originalWorstScore / 2;
          worstSubject.bonusValue = "50% counted";
          unusedM12.used = true;
          unusedM12.weightedScore = unusedM12.weightedScore / 2;
          unusedM12.isBonus = true;
          unusedM12.bonusValue = "50% replacement";
          selectedSubjects.push(unusedM12);
        }
      }
    }
  }

  return {
    totalScore: Number(totalScore.toFixed(3)),
    formula: programme[`formula_${year}`],
    selected: selectedSubjects,
    allCandidates: candidates,
    score_type: programme.scores_2025?.score_type || "actual",
  };
}

function getTargetCount(programme: Programme, year: "2025" | "2026", constraints: Constraint[]) {
  const formulaId = programme[`formula_${year}_id`];
  const hasBonus6 = constraints.some((constraint) => constraint.type === "bonus_6th" || constraint.type === "additional_bonus_6th");
  if (formulaId === "best6") return 6;
  if (formulaId === "best5" || hasBonus6) return 5;
  const formula = programme[`formula_${year}`] || "";
  if (formula.includes("Best 6") || formula.includes("3 Core + 3 Elective") || formula.includes("4 Core + 2 Elective")) return 6;
  return 5;
}

function getBonusConstraint(constraints: Constraint[], type: string): (Constraint & { polyu_style?: boolean }) | undefined {
  const constraint = constraints.find((item) => item.type === type);
  if (!constraint && type === "bonus_6th" && constraints.some((item) => item.type === "additional_bonus_6th")) {
    return { type, multiplier: 0.1, polyu_style: true };
  }
  return constraint;
}

export function checkEligibility(studentGrades: StudentGrades, reqs: MinRequirements, programme: Programme): EligibilityResult {
  const details: EligibilityDetail[] = [];
  let eligible = true;
  for (const key of ["chi", "eng", "math", "csd"] as const) {
    const studentGrade = studentGrades[mapReqKeyToSubject(key)];
    const reqGrade = reqs?.[key];
    const pass = compareGrades(studentGrade, reqGrade, programme);
    if (!pass) eligible = false;
    details.push({ label: key.toUpperCase(), pass, got: studentGrade || "N/A", need: reqGrade });
  }

  const used = new Set(["Chinese Language", "English Language", "Mathematics (Compulsory Part)"]);
  const elective1 = checkElective(studentGrades, reqs?.elect1, used, programme);
  details.push({ label: "Elective 1", pass: elective1.pass, got: elective1.got, need: elective1.need, note: reqs?.elect1?.note || reqs?.elect1?.subjects.join("/") || "" });
  if (!elective1.pass) eligible = false;
  if (elective1.matched) used.add(elective1.matched);

  const elective2 = checkElective(studentGrades, reqs?.elect2, used, programme);
  details.push({ label: "Elective 2", pass: elective2.pass, got: elective2.got, need: elective2.need, note: reqs?.elect2?.note || reqs?.elect2?.subjects.join("/") || "" });
  if (!elective2.pass) eligible = false;

  return { eligible, details };
}

function checkElective(studentGrades: StudentGrades, poolObj: RequirementPool | undefined, usedSubjects: Set<string>, programme: Programme) {
  if (!poolObj) return { pass: true, got: "N/A", need: "N/A" };
  const matches: Array<{ subject: string; grade: string }> = [];
  for (const [subject, grade] of Object.entries(studentGrades)) {
    if (usedSubjects.has(subject)) continue;
    let isMatch = poolObj.subjects.includes("Any") || poolObj.subjects.includes("*") || includesM12Aware(poolObj.subjects, subject);
    if (!isMatch && poolObj.note?.includes("Category A") && (subject.includes("Module 1") || subject.includes("Module 2"))) {
      isMatch = true;
    }
    if (isMatch && compareGrades(grade, poolObj.grade, programme)) {
      matches.push({ subject, grade });
    }
  }
  if (matches.length >= poolObj.count) return { pass: true, matched: matches[0].subject, got: matches[0].grade, need: poolObj.grade };
  return { pass: false, got: "None", need: poolObj.grade };
}

function compareGrades(student: string | undefined, required: string | undefined, programme: Programme) {
  if (!required) return true;
  if (!student) return false;
  const convTable = programme.score_conversion_table.category_a || {};
  const catCTable = programme.score_conversion_table.category_c || {};
  const val = (grade: string) => {
    const normalized = String(grade).toUpperCase();
    if (convTable[normalized] !== undefined) return convTable[normalized];
    if (catCTable[normalized] !== undefined) return catCTable[normalized];
    if (normalized === "A" || normalized === "ATTAINED") return 2;
    return Number.parseFloat(normalized) || 0;
  };
  return val(student) >= val(required);
}

function mapReqKeyToSubject(key: "chi" | "eng" | "math" | "csd") {
  return {
    chi: "Chinese Language",
    eng: "English Language",
    math: "Mathematics (Compulsory Part)",
    csd: "Citizenship and Social Development",
  }[key];
}
