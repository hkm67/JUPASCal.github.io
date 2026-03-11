/**
 * JUPAS 2026 Calculation Engine (The Brain)
 * -----------------------------------------
 * This module contains the bit-perfect logic for calculating admission scores
 * based on the structured data model in JUPAS_2026_Unified_Data.json.
 */

const JUPAS_CALCULATOR = {

    calculateScore: function(studentGrades, programme, year = "2025") {
        if (!programme || !programme.score_conversion_table) {
            console.error("Invalid programme data:", programme);
            return { totalScore: 0, selected: [], allCandidates: [] };
        }
        
        const weights = programme[`subject_weights_${year}`] || {};
        const bestOfPools = programme[`best_of_weights_${year}`] || [];
        const formulaId = programme[`formula_${year}_id`];
        const constraints = programme.calculation_constraints || [];
        const convTable = (programme.score_conversion_table && programme.score_conversion_table.category_a) || {};
        const catCTable = (programme.score_conversion_table && programme.score_conversion_table.category_c) || {};

        // --- Step 1: Pre-process all student subjects into a list of potentials ---
        let candidates = [];
        
        for (let [subj, grade] of Object.entries(studentGrades)) {
            if (!grade) continue;

            let basePoints = 0;
            if (convTable[grade] !== undefined) {
                basePoints = convTable[grade];
            } else if (catCTable[grade] !== undefined) {
                basePoints = catCTable[grade];
            }

            const multiplier = weights[subj] || 1.0;
            
            candidates.push({
                subject: subj,
                grade: grade,
                basePoints: basePoints,
                multiplier: multiplier,
                weightedScore: basePoints * multiplier,
                isCompulsory: false,
                isBestOfPool: false,
                used: false,
                isBonus: false
            });
        }

        // --- Step 2: Handle Best-Of Pool Constraints (e.g. M1 or M2 x 2.0) ---
        bestOfPools.forEach(pool => {
            let poolCandidates = candidates.filter(c => pool.subjects.includes(c.subject));
            poolCandidates.sort((a, b) => b.weightedScore - a.weightedScore);
            for (let i = 0; i < Math.min(pool.count, poolCandidates.length); i++) {
                let candidate = poolCandidates[i];
                if (pool.weight > candidate.multiplier) {
                    candidate.multiplier = pool.weight;
                    candidate.weightedScore = candidate.basePoints * candidate.multiplier;
                    candidate.isBestOfPool = true;
                }
            }
        });

        // --- Step 3: Handle Max Weighted Subjects Constraint (e.g. CUHK Science) ---
        const maxWeightedConstraint = constraints.find(c => c.type === "max_weighted_subjects");
        if (maxWeightedConstraint) {
            // Rule: Only the top N subjects with multipliers > 1.0 retain their weights.
            // Sort ALL candidates by multiplier descending
            candidates.sort((a, b) => b.multiplier - a.multiplier);
            let weightedCount = 0;
            candidates.forEach(c => {
                if (c.multiplier > 1.0) {
                    if (weightedCount < maxWeightedConstraint.limit) {
                        weightedCount++;
                    } else {
                        // Cap at 1.0 if we exceeded the university limit for bonus weights
                        c.multiplier = 1.0;
                        c.weightedScore = c.basePoints * c.multiplier;
                        c.isBestOfPool = false;
                    }
                }
            });
        }

        // --- Step 4: Identify Compulsory Subjects ---
        let compulsoryConstraint = constraints.find(c => c.type === "compulsory_subjects");
        if (compulsoryConstraint) {
            candidates.forEach(c => {
                if (compulsoryConstraint.subjects.includes(c.subject)) {
                    c.isCompulsory = true;
                }
            });
        }

        // --- Step 5: Selection Logic (Best N) ---
        let selectedSubjects = [];
        let totalScore = 0;
        let targetCount = 5;
        if (formulaId === "best6" || (programme[`formula_${year}`] && programme[`formula_${year}`].includes("6"))) {
            targetCount = 6;
        }

        // A. Pick Compulsory
        candidates.filter(c => c.isCompulsory).forEach(c => {
            c.used = true;
            selectedSubjects.push(c);
            totalScore += c.weightedScore;
        });

        // B. Pick Best of remaining
        let remainingPotentials = candidates.filter(c => !c.used);
        remainingPotentials.sort((a, b) => b.weightedScore - a.weightedScore);

        for (let c of remainingPotentials) {
            if (selectedSubjects.length >= targetCount) break;
            const mathConstraint = constraints.find(cons => cons.type === "maths_m1m2_as_one");
            if (mathConstraint && c.subject.includes("Mathematics")) {
                let alreadyHasMath = selectedSubjects.some(s => s.subject.includes("Mathematics"));
                if (alreadyHasMath) continue;
            }
            c.used = true;
            selectedSubjects.push(c);
            totalScore += c.weightedScore;
        }

        // --- Step 6: Post-Selection Bonuses ---
        let bonusConstraint = constraints.find(c => c.type === "additional_bonus_6th");
        if (bonusConstraint && selectedSubjects.length === 5) {
            let bonusSubject = candidates.filter(c => !c.used && parseInt(c.grade) >= 3)
                                         .sort((a, b) => b.basePoints - a.basePoints)[0];
            if (bonusSubject) {
                let bonusPoints = bonusSubject.basePoints * 0.1; 
                totalScore += bonusPoints;
                bonusSubject.isBonus = true;
                selectedSubjects.push(bonusSubject);
            }
        }

        return {
            totalScore: parseFloat(totalScore.toFixed(3)),
            formula: programme[`formula_${year}`],
            selected: selectedSubjects,
            allCandidates: candidates,
            score_type: programme.scores_2025.score_type || "actual"
        };
    },

    checkEligibility: function(studentGrades, reqs) {
        let reasons = [];
        const cores = ["chi", "eng", "math", "csd"];
        cores.forEach(key => {
            let studentGrade = studentGrades[this.mapReqKeyToSubject(key)];
            let reqGrade = reqs[key];
            if (!this.compareGrades(studentGrade, reqGrade)) {
                reasons.push(`Minimum ${key.toUpperCase()} not met (Got ${studentGrade || 'N/A'}, Need ${reqGrade})`);
            }
        });

        const checkElective = (poolObj, usedSubjects) => {
            if (!poolObj) return { pass: true };
            let matches = [];
            for (let [subj, grade] of Object.entries(studentGrades)) {
                if (usedSubjects.has(subj)) continue;
                
                let isMatch = false;
                // Wildcard match
                if (poolObj.subjects.includes("Any") || poolObj.subjects.includes("*") || poolObj.subjects.includes(subj)) {
                    isMatch = true;
                }
                
                // Fallback for "Category A" strings or Module 1/2
                if (!isMatch && poolObj.note && poolObj.note.includes("Category A")) {
                    if (subj.includes("Module 1") || subj.includes("Module 2")) isMatch = true;
                }

                if (isMatch) {
                    if (this.compareGrades(grade, poolObj.grade)) {
                        matches.push(subj);
                    }
                }
            }
            if (matches.length >= poolObj.count) {
                return { pass: true, matched: matches[0] };
            }
            return { pass: false };
        };

        let used = new Set(["Chinese Language", "English Language", "Mathematics (Compulsory Part)"]);
        let e1 = checkElective(reqs.elect1, used);
        if (!e1.pass) {
            reasons.push(`Elective 1 requirement not met: ${reqs.elect1.note || reqs.elect1.subjects.join('/')} at Level ${reqs.elect1.grade}`);
        } else if (e1.matched) {
            used.add(e1.matched);
        }

        let e2 = checkElective(reqs.elect2, used);
        if (!e2.pass) {
            reasons.push(`Elective 2 requirement not met: ${reqs.elect2.note || reqs.elect2.subjects.join('/')} at Level ${reqs.elect2.grade}`);
        }

        return {
            eligible: reasons.length === 0,
            reasons: reasons
        };
    },

    compareGrades: function(student, required) {
        if (!required) return true;
        if (!student) return false;
        const val = (g) => {
            const map = {"5**": 7, "5*": 6, "5": 5, "4": 4, "3": 3, "2": 2, "1": 1, "A": 2, "attained": 2};
            return map[String(g).toLowerCase()] || 0;
        };
        return val(student) >= val(required);
    },

    mapReqKeyToSubject: function(key) {
        const map = {
            "chi": "Chinese Language",
            "eng": "English Language",
            "math": "Mathematics (Compulsory Part)",
            "csd": "Citizenship and Social Development"
        };
        return map[key];
    }
};
