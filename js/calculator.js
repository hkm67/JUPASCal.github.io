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

        const maxWeightedConstraint = constraints.find(c => c.type === "max_weighted_subjects");
        if (maxWeightedConstraint) {
            candidates.sort((a, b) => b.multiplier - a.multiplier);
            let weightedCount = 0;
            candidates.forEach(c => {
                if (c.multiplier > 1.0) {
                    if (weightedCount < maxWeightedConstraint.limit) {
                        weightedCount++;
                    } else {
                        c.multiplier = 1.0;
                        c.weightedScore = c.basePoints * c.multiplier;
                        c.isBestOfPool = false;
                    }
                }
            });
        }

        let compulsoryConstraint = constraints.find(c => c.type === "compulsory_subjects");
        if (compulsoryConstraint) {
            candidates.forEach(c => {
                if (compulsoryConstraint.subjects.includes(c.subject)) {
                    c.isCompulsory = true;
                }
            });
        }
        
        let compulsoryPools = constraints.filter(c => c.type === "compulsory_subject_pool");

        let selectedSubjects = [];
        let totalScore = 0;
        let targetCount = 5;
        if (formulaId === "best6" || (programme[`formula_${year}`] && programme[`formula_${year}`].includes("6"))) {
            targetCount = 6;
        }

        candidates.filter(c => c.isCompulsory).forEach(c => {
            c.used = true;
            selectedSubjects.push(c);
            totalScore += c.weightedScore;
        });

        compulsoryPools.forEach(pool => {
            let poolCandidates = candidates.filter(c => !c.used && pool.subjects.includes(c.subject));
            poolCandidates.sort((a, b) => b.weightedScore - a.weightedScore);
            for (let i = 0; i < Math.min(pool.count, poolCandidates.length); i++) {
                if (selectedSubjects.length >= targetCount) break;
                let c = poolCandidates[i];
                c.used = true;
                selectedSubjects.push(c);
                totalScore += c.weightedScore;
            }
        });

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
        
        // A. Multiplier-based 6th subject bonus (HKU/PolyU style)
        // HKU uses 0.5x or 0.2x. PolyU uses 0.1x.
        let mBonus = constraints.find(c => c.type === "bonus_6th");
        if (!mBonus) {
            // Check legacy PolyU flag
            if (constraints.find(c => c.type === "additional_bonus_6th")) {
                mBonus = { type: "bonus_6th", multiplier: 0.1, polyu_style: true };
            }
        }

        if (mBonus && selectedSubjects.length === 5) {
            let bonusSubject = candidates.filter(c => !c.used);
            // PolyU requires Level 3+
            if (mBonus.polyu_style) {
                bonusSubject = bonusSubject.filter(c => parseInt(c.grade) >= 3);
            }
            bonusSubject = bonusSubject.sort((a, b) => b.basePoints - a.basePoints)[0];
            
            if (bonusSubject) {
                // For HKU, weighted subjects usually mean the bonus is also weighted
                // But the formula says "0.5 x 6th Best Subject"
                // Most reliable is 0.5 x weighted points if weights exist, or 0.5 x raw
                let bonusPoints = (bonusSubject.weightedScore || bonusSubject.basePoints) * mBonus.multiplier;
                totalScore += bonusPoints;
                bonusSubject.isBonus = true;
                bonusSubject.bonusValue = `+${mBonus.multiplier}x`;
                selectedSubjects.push(bonusSubject);
            }
        }

        // B. HKUST style (% of Highest Attainable Score)
        let ustBonusConstraint = constraints.find(c => c.type === "hkust_weighted_best");
        if (ustBonusConstraint && selectedSubjects.length === ustBonusConstraint.subject_count) {
            let bonusSubject = candidates.filter(c => !c.used).sort((a, b) => b.basePoints - a.basePoints)[0];
            if (bonusSubject && ustBonusConstraint.bonus_scale[bonusSubject.grade]) {
                let bonusPercent = ustBonusConstraint.bonus_scale[bonusSubject.grade];
                // Formula: Bonus = % x Highest Attainable Score
                // Default fallback if max_achievable_score missing is current total
                let haScore = programme.max_achievable_score || totalScore; 
                let bonusPoints = haScore * bonusPercent;
                totalScore += bonusPoints;
                bonusSubject.isBonus = true;
                bonusSubject.bonusValue = `+${(bonusPercent * 100).toFixed(2)}%`;
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
        let details = [];
        let eligible = true;
        const cores = ["chi", "eng", "math", "csd"];
        cores.forEach(key => {
            let studentGrade = studentGrades[this.mapReqKeyToSubject(key)];
            let reqGrade = reqs[key];
            let pass = this.compareGrades(studentGrade, reqGrade);
            if (!pass) eligible = false;
            details.push({ label: key.toUpperCase(), pass: pass, got: studentGrade || 'N/A', need: reqGrade });
        });

        const checkElective = (poolObj, usedSubjects) => {
            if (!poolObj) return { pass: true, got: 'N/A', need: 'N/A' };
            let matches = [];
            for (let [subj, grade] of Object.entries(studentGrades)) {
                if (usedSubjects.has(subj)) continue;
                let isMatch = false;
                if (poolObj.subjects.includes("Any") || poolObj.subjects.includes("*") || poolObj.subjects.includes(subj)) isMatch = true;
                if (!isMatch && (poolObj.note && poolObj.note.includes("Category A"))) {
                    if (subj.includes("Module 1") || subj.includes("Module 2")) isMatch = true;
                }
                if (isMatch) { if (this.compareGrades(grade, poolObj.grade)) matches.push({ subj, grade }); }
            }
            if (matches.length >= poolObj.count) return { pass: true, matched: matches[0].subj, got: matches[0].grade, need: poolObj.grade };
            return { pass: false, got: 'None', need: poolObj.grade };
        };

        let used = new Set(["Chinese Language", "English Language", "Mathematics (Compulsory Part)"]);
        let e1 = checkElective(reqs.elect1, used);
        details.push({ label: "Elective 1", pass: e1.pass, got: e1.got, need: e1.need, note: reqs.elect1 ? (reqs.elect1.note || reqs.elect1.subjects.join('/')) : "" });
        if (!e1.pass) eligible = false; else if (e1.matched) used.add(e1.matched);
        let e2 = checkElective(reqs.elect2, used);
        details.push({ label: "Elective 2", pass: e2.pass, got: e2.got, need: e2.need, note: reqs.elect2 ? (reqs.elect2.note || reqs.elect2.subjects.join('/')) : "" });
        if (!e2.pass) eligible = false;
        return { eligible: eligible, details: details };
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
        const map = { "chi": "Chinese Language", "eng": "English Language", "math": "Mathematics (Compulsory Part)", "csd": "Citizenship and Social Development" };
        return map[key];
    }
};
