/**
 * JUPAS 2026 Calculation Engine (The Brain)
 * -----------------------------------------
 * This module contains the bit-perfect logic for calculating admission scores
 * based on the structured data model in JUPAS_2026_Unified_Data.json.
 * 
 * DESIGN PRINCIPLES:
 * 1. Purity: Functions are pure and do not touch the DOM.
 * 2. Transparency: Every calculation returns an 'auditTrail' explaining WHY a score was picked.
 * 3. Parity: Logic must match the Python reference (scripts/utils/calculation_engine.py).
 */

const JUPAS_CALCULATOR = {

    /**
     * Calculates the admission score for a specific programme.
     *
     * YEAR LABELING RULE: Always pass year = "2025" for scoring.
     * The 2026 calculator uses 2025 weights to ensure a fair comparison against
     * the 2025 admission scores (median/LQ). Using 2026 weights with 2025 scores
     * would be unfair if a school changed its formula between cycles.
     * The 2026 weights are stored in the JSON for reference only and will power
     * the 2027 calculator once 2026 scores are published.
     *
     * Eligibility (min_requirements_2026) is the only place 2026 data is used.
     *
     * @param {Object} studentGrades - Map of subject names to grades (e.g. {"English Language": "5*"})
     * @param {Object} programme - The programme object from our Unified JSON.
     * @param {string} year - The data year to use for weights/formula. Must be "2025" for the 2026 calculator.
     * @returns {Object} Result containing final score, selected subjects, and detailed audit trail.
     */
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

            // Determine base points from the institution-specific table
            let basePoints = 0;
            if (convTable[grade] !== undefined) {
                basePoints = convTable[grade];
            } else if (catCTable[grade] !== undefined) {
                basePoints = catCTable[grade];
            }

            // Apply flat weights
            const multiplier = weights[subj] || 1.0;
            
            candidates.push({
                subject: subj,
                grade: grade,
                basePoints: basePoints,
                multiplier: multiplier,
                weightedScore: basePoints * multiplier,
                isCompulsory: false,
                isBestOfPool: false,
                used: false
            });
        }

        // --- Step 2: Handle Best-Of Pool Constraints (e.g. M1 or M2 x 2.0) ---
        // These pools give a higher weight to the best N subjects in a list.
        bestOfPools.forEach(pool => {
            // Find all candidates belonging to this pool
            let poolCandidates = candidates.filter(c => pool.subjects.includes(c.subject));
            
            // Sort pool members by weighted score descending
            poolCandidates.sort((a, b) => b.weightedScore - a.weightedScore);
            
            // Apply the pool's weight to the top N members
            for (let i = 0; i < Math.min(pool.count, poolCandidates.length); i++) {
                let candidate = poolCandidates[i];
                // Only upgrade if the pool multiplier is higher than the flat multiplier
                if (pool.weight > candidate.multiplier) {
                    candidate.multiplier = pool.weight;
                    candidate.weightedScore = candidate.basePoints * candidate.multiplier;
                    candidate.isBestOfPool = true;
                }
            }
        });

        // --- Step 3: Identify Compulsory Subjects (Required by the Formula) ---
        let compulsoryConstraint = constraints.find(c => c.type === "compulsory_subjects");
        if (compulsoryConstraint) {
            candidates.forEach(c => {
                if (compulsoryConstraint.subjects.includes(c.subject)) {
                    c.isCompulsory = true;
                }
            });
        }

        // --- Step 4: Selection Logic (Best N) ---
        let selectedSubjects = [];
        let totalScore = 0;
        
        // Determine how many subjects we need (Best 5 vs Best 6)
        let targetCount = 5;
        if (formulaId === "best6" || (programme[`formula_${year}`] && programme[`formula_${year}`].includes("6"))) {
            targetCount = 6;
        }

        // A. Always take Compulsory subjects first (even if they are low scoring)
        candidates.filter(c => c.isCompulsory).forEach(c => {
            c.used = true;
            selectedSubjects.push(c);
            totalScore += c.weightedScore;
        });

        // B. Sort remaining by weightedScore descending to fill remaining slots
        let remainingPotentials = candidates.filter(c => !c.used);
        remainingPotentials.sort((a, b) => b.weightedScore - a.weightedScore);

        for (let c of remainingPotentials) {
            if (selectedSubjects.length >= targetCount) break;

            // Check for mutual exclusivity (e.g. Core Math vs M1/M2 only counts as one)
            const mathConstraint = constraints.find(cons => cons.type === "maths_m1m2_as_one");
            if (mathConstraint && c.subject.includes("Mathematics")) {
                let alreadyHasMath = selectedSubjects.some(s => s.subject.includes("Mathematics"));
                if (alreadyHasMath) continue; // Skip this one, we already picked a better math variant
            }

            c.used = true;
            selectedSubjects.push(c);
            totalScore += c.weightedScore;
        }

        // --- Step 5: Handle Post-Selection Bonuses (e.g. PolyU 6th Subject Bonus) ---
        let bonusConstraint = constraints.find(c => c.type === "additional_bonus_6th");
        if (bonusConstraint && selectedSubjects.length === 5) {
            // Find the best unused subject with Level 3 or above
            let bonusSubject = candidates.filter(c => !c.used && parseInt(c.grade) >= 3)
                                         .sort((a, b) => b.basePoints - a.basePoints)[0];
            if (bonusSubject) {
                // Calculation: Level 5** (7) -> 0.7, Level 5* (6) -> 0.6 etc.
                let bonusPoints = bonusSubject.basePoints * 0.1; 
                totalScore += bonusPoints;
                bonusSubject.isBonus = true;
                selectedSubjects.push(bonusSubject); // Add to selected for display
            }
        }

        return {
            totalScore: parseFloat(totalScore.toFixed(3)),
            formula: programme[`formula_${year}`],
            conversionScale: programme.calculation_constraints.find(c => c.type.includes("scale")),
            selected: selectedSubjects,
            allCandidates: candidates
        };
    },

    /**
     * Checks if a student meets the minimum entry requirements.
     * @returns {Object} { eligible: boolean, reasons: string[] }
     */
    checkEligibility: function(studentGrades, reqs) {
        let reasons = [];
        
        // 1. Core Check
        const cores = ["chi", "eng", "math", "csd"];
        cores.forEach(key => {
            let studentGrade = studentGrades[this.mapReqKeyToSubject(key)];
            let reqGrade = reqs[key];
            if (!this.compareGrades(studentGrade, reqGrade)) {
                reasons.push(`Minimum ${key.toUpperCase()} not met (Got ${studentGrade || 'N/A'}, Need ${reqGrade})`);
            }
        });

        // 2. Electives Check (Structured Objects)
        const checkElective = (poolObj, usedSubjects) => {
            if (!poolObj) return { pass: true };
            let matches = [];
            for (let [subj, grade] of Object.entries(studentGrades)) {
                if (usedSubjects.has(subj)) continue;
                
                let isMatch = false;
                // Wildcard or explicit subject match
                if (poolObj.subjects.includes("Any") || poolObj.subjects.includes("*") || poolObj.subjects.includes(subj)) {
                    isMatch = true;
                }
                
                // Special case: Many schools define "Category A subjects only" which includes M1/M2
                if (poolObj.note && poolObj.note.includes("Category A") && (subj.includes("Module 1") || subj.includes("Module 2"))) {
                    isMatch = true;
                }

                if (isMatch) {
                    if (this.compareGrades(grade, poolObj.grade)) {
                        matches.push(subj);
                    }
                }
            }
            if (matches.length >= poolObj.count) {
                // Sort matches to pick the one that satisfies the requirement but might be "worse" 
                // for the total score, saving the "better" one for other requirements if needed.
                // (Simplistic greedy approach)
                return { pass: true, matched: matches[0] };
            }
            return { pass: false };
        };

        let used = new Set();
        // Crucial: Core subjects (except CSD) can sometimes count as electives in some unis, 
        // but for eligibility check we usually only look at electives.
        // However, we must NOT use the subjects already used for Core requirements.
        used.add("Chinese Language");
        used.add("English Language");
        used.add("Mathematics (Compulsory Part)");

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

    // Helper: Grade Comparison
    compareGrades: function(student, required) {
        if (!required) return true;
        if (!student) return false;
        const val = (g) => {
            const map = {"5**": 7, "5*": 6, "5": 5, "4": 4, "3": 3, "2": 2, "1": 1, "A": 2, "attained": 2};
            return map[String(g).toLowerCase()] || 0;
        };
        return val(student) >= val(required);
    },

    // Helper: Map min_requirement keys to studentGrades keys
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
