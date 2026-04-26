/**
 * JUPAS 2026 Calculation Engine (The Brain)
 * -----------------------------------------
 * This module contains the bit-perfect logic for calculating admission scores
 * based on the structured data model in JUPAS_2026_Unified_Data.json.
 */

const JUPAS_CALCULATOR = {

    // Normalize institution-specific subject name variants to canonical UI names.
    normalizeSubjectKey: function(name) {
        if (!name) return name;
        const n = name.toUpperCase();
        
        // Math Compulsory
        if (n === 'MATHEMATICS COMPULSORY PART' || n === 'MATHEMATICS' || n === 'MATHEMATICS (COMPULSORY PART)') return 'Mathematics (Compulsory Part)';
        
        // M1
        if ((n.includes('MODULE 1') || n.includes('CALCULUS AND STATISTICS') || n.includes('M1')) && (n.includes('EXTENDED') || n.includes('PART'))) {
            return 'Mathematics Extended Part (Module 1)';
        }
        
        // M2
        if ((n.includes('MODULE 2') || n.includes('ALGEBRA AND CALCULUS') || n.includes('M2')) && (n.includes('EXTENDED') || n.includes('PART'))) {
            return 'Mathematics Extended Part (Module 2)';
        }
        
        return name;
    },

    calculateScore: function(studentGrades, programme, year = "2025") {
        if (!programme || !programme.score_conversion_table) {
            console.error("Invalid programme data:", programme);
            return { totalScore: 0, selected: [], allCandidates: [] };
        }

        // Normalize weight keys so HKUST name variants map to canonical student grade keys
        const rawWeights = programme[`subject_weights_${year}`] || {};
        const weights = {};
        for (const [k, v] of Object.entries(rawWeights)) {
            weights[this.normalizeSubjectKey(k)] = v;
        }

        // Normalize subject lists inside best-of pools for the same reason
        const bestOfPools = (programme[`best_of_weights_${year}`] || []).map(pool => ({
            ...pool,
            subjects: pool.subjects.map(s => this.normalizeSubjectKey(s))
        }));
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

            // M1/2 Interchangeability for weights
            let multiplier = weights[subj] || 1.0;
            if (subj === "Mathematics Extended Part (Module 1 or 2)") {
                multiplier = weights["Mathematics Extended Part (Module 1)"] || 
                             weights["Mathematics Extended Part (Module 2)"] || 1.0;
            }
            
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
            // Pool subject matching with M1/2 awareness
            let poolCandidates = candidates.filter(c => {
                if (pool.subjects.includes(c.subject)) return true;
                if (c.subject === "Mathematics Extended Part (Module 1 or 2)") {
                    return pool.subjects.includes("Mathematics Extended Part (Module 1)") || 
                           pool.subjects.includes("Mathematics Extended Part (Module 2)");
                }
                return false;
            });
            
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
                } else if (c.subject === "Mathematics Extended Part (Module 1 or 2)") {
                    if (compulsoryConstraint.subjects.includes("Mathematics Extended Part (Module 1)") || 
                        compulsoryConstraint.subjects.includes("Mathematics Extended Part (Module 2)")) {
                        c.isCompulsory = true;
                    }
                }
            });
        }
        
        let compulsoryPools = constraints.filter(c => c.type === "compulsory_subject_pool");

        let selectedSubjects = [];
        let totalScore = 0;
        let targetCount = 5;
        const hasBonus6 = constraints.some(c => c.type === "bonus_6th" || c.type === "additional_bonus_6th");

        if (formulaId === "best6") {
            targetCount = 6;
        } else if (formulaId === "best5") {
            targetCount = 5;
        } else if (hasBonus6) {
            targetCount = 5;
        } else if (programme[`formula_${year}`]) {
            const fText = programme[`formula_${year}`];
            if (fText.includes("Best 6") || fText.includes("3 Core + 3 Elective") || fText.includes("4 Core + 2 Elective")) {
                targetCount = 6;
            } else if (fText.includes("Best 5") || fText.includes("3 Core + 2 Elective")) {
                targetCount = 5;
            } else if (fText.includes("6") && !fText.includes("5")) {
                targetCount = 6;
            }
        }

        candidates.filter(c => c.isCompulsory).forEach(c => {
            c.used = true;
            selectedSubjects.push(c);
            totalScore += c.weightedScore;
        });

        compulsoryPools.forEach(pool => {
            let poolCandidates = candidates.filter(c => {
                if (c.used) return false;
                if (pool.subjects.includes(c.subject)) return true;
                if (c.subject === "Mathematics Extended Part (Module 1 or 2)") {
                    return pool.subjects.includes("Mathematics Extended Part (Module 1)") || 
                           pool.subjects.includes("Mathematics Extended Part (Module 2)");
                }
                return false;
            });
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

        // --- Step 6: Post-Selection Bonuses (HKU/PolyU style) ---
        // These are multiplier-based bonuses for the next best subjects.
        
        // Potential bonus candidates are those NOT used in Best-N
        let bonusCandidates = candidates.filter(c => !c.used).sort((a, b) => b.weightedScore - a.weightedScore);

        const applyBonus = (type, targetCount) => {
            const bConstraint = constraints.find(c => c.type === type);
            if (!bConstraint && type === "bonus_6th" && constraints.some(c => c.type === "additional_bonus_6th")) {
                // PolyU fallback
                return { multiplier: 0.1, polyu_style: true };
            }
            return bConstraint;
        };

        // 6th Subject Bonus
        const b6 = applyBonus("bonus_6th", 5);
        if (b6 && selectedSubjects.length === 5) {
            let eligible = bonusCandidates;
            if (b6.polyu_style) {
                const gradeToVal = {"5**": 7, "5*": 6, "5": 5, "4": 4, "3": 3, "2": 2, "1": 1};
                eligible = eligible.filter(c => gradeToVal[c.grade] >= 3);
            }
            let bonusSubject = eligible[0];
            if (bonusSubject) {
                let bonusPoints = bonusSubject.weightedScore * b6.multiplier;
                totalScore += bonusPoints;
                bonusSubject.used = true;
                bonusSubject.isBonus = true;
                bonusSubject.weightedScore = bonusPoints;
                bonusSubject.bonusValue = `+${b6.multiplier}x`;
                selectedSubjects.push(bonusSubject);
                // Remove from further bonus consideration
                bonusCandidates = bonusCandidates.filter(c => c !== bonusSubject);
            }
        }

        // 7th Subject Bonus
        const b7 = applyBonus("bonus_7th", 6);
        if (b7 && selectedSubjects.length === 6) {
            let bonusSubject = bonusCandidates[0];
            if (bonusSubject) {
                let bonusPoints = bonusSubject.weightedScore * b7.multiplier;
                totalScore += bonusPoints;
                bonusSubject.used = true;
                bonusSubject.isBonus = true;
                bonusSubject.weightedScore = bonusPoints;
                bonusSubject.bonusValue = `+${b7.multiplier}x`;
                selectedSubjects.push(bonusSubject);
                bonusCandidates = bonusCandidates.filter(c => c !== bonusSubject);
            }
        }

        // B. HKUST style bonus (HKUST style is separate from multiplier style)
        let ustBonusConstraint = constraints.find(c => c.type === "hkust_weighted_best");
        if (ustBonusConstraint && selectedSubjects.length === ustBonusConstraint.subject_count) {
            let bonusSubject = candidates.filter(c => !c.used).sort((a, b) => b.basePoints - a.basePoints)[0];
            if (bonusSubject) {
                const maxW = ustBonusConstraint.max_attainable_weighting || 5;
                const bonusPct = (ustBonusConstraint.bonus_percentage || 5) / 100;
                const bonusRate = maxW * bonusPct;
                const bonusPoints = bonusRate * bonusSubject.basePoints;
                totalScore += bonusPoints;

                const maxGrade = 8.5;
                const displayPct = ((bonusSubject.basePoints / maxGrade) * (ustBonusConstraint.bonus_percentage || 5)).toFixed(2);
                bonusSubject.weightedScore = bonusPoints;
                bonusSubject.used = true;
                bonusSubject.isBonus = true;
                bonusSubject.bonusValue = `+${displayPct}% of total`;
                selectedSubjects.push(bonusSubject);
            }
        }

        // C. CUHK style M1/M2 half-replacement logic
        const halfReplaceConstraint = constraints.find(c => c.type === "m1m2_half_replacement");
        if (halfReplaceConstraint) {
            // Find best M1/M2 that was NOT used in the Best-N selection
            const unusedM12 = candidates.filter(c => !c.used && (
                c.subject.includes("Module 1") || 
                c.subject.includes("Module 2") || 
                c.subject === "Mathematics Extended Part (Module 1 or 2)"
            )).sort((a, b) => b.weightedScore - a.weightedScore)[0];

            if (unusedM12) {
                // Find worst non-compulsory subject currently in the selection
                const usedNonCompulsory = selectedSubjects.filter(s => !s.isCompulsory && !s.isBonus).sort((a, b) => a.weightedScore - b.weightedScore);
                const worstSubject = usedNonCompulsory[0];

                if (worstSubject) {
                    const originalWorstScore = worstSubject.weightedScore;
                    const halfReplacementScore = (originalWorstScore / 2) + (unusedM12.weightedScore / 2);

                    if (halfReplacementScore > originalWorstScore) {
                        // Apply replacement
                        totalScore = totalScore - originalWorstScore + halfReplacementScore;
                        
                        // Update audit data
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
            totalScore: parseFloat(totalScore.toFixed(3)),
            formula: programme[`formula_${year}`],
            selected: selectedSubjects,
            allCandidates: candidates,
            score_type: programme.scores_2025.score_type || "actual"
        };
    },

    checkEligibility: function(studentGrades, reqs, programme) {
        let details = [];
        let eligible = true;
        const cores = ["chi", "eng", "math", "csd"];
        cores.forEach(key => {
            let studentGrade = studentGrades[this.mapReqKeyToSubject(key)];
            let reqGrade = reqs[key];
            let pass = this.compareGrades(studentGrade, reqGrade, programme);
            if (!pass) eligible = false;
            details.push({ label: key.toUpperCase(), pass: pass, got: studentGrade || 'N/A', need: reqGrade });
        });

        const checkElective = (poolObj, usedSubjects) => {
            if (!poolObj) return { pass: true, got: 'N/A', need: 'N/A' };
            let matches = [];
            for (let [subj, grade] of Object.entries(studentGrades)) {
                if (usedSubjects.has(subj)) continue;
                let isMatch = false;
                
                // M1/2 awareness in eligibility check
                if (poolObj.subjects.includes("Any") || poolObj.subjects.includes("*") || poolObj.subjects.includes(subj)) {
                    isMatch = true;
                } else if (subj === "Mathematics Extended Part (Module 1 or 2)") {
                    if (poolObj.subjects.includes("Mathematics Extended Part (Module 1)") || 
                        poolObj.subjects.includes("Mathematics Extended Part (Module 2)")) {
                        isMatch = true;
                    }
                }
                
                if (!isMatch && (poolObj.note && poolObj.note.includes("Category A"))) {
                    if (subj.includes("Module 1") || subj.includes("Module 2")) isMatch = true;
                }
                if (isMatch) { if (this.compareGrades(grade, poolObj.grade, programme)) matches.push({ subj, grade }); }
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

    compareGrades: function(student, required, programme) {
        if (!required) return true;
        if (!student) return false;
        
        const convTable = (programme && programme.score_conversion_table && programme.score_conversion_table.category_a) || {};
        const catCTable = (programme && programme.score_conversion_table && programme.score_conversion_table.category_c) || {};

        const val = (g) => {
            if (!g) return 0;
            const s = String(g).toUpperCase();
            if (convTable[s] !== undefined) return convTable[s];
            if (catCTable[s] !== undefined) return catCTable[s];
            
            // Fallbacks for special cases (Attained, Level 2 for CSD etc)
            if (s === 'A' || s === 'ATTAINED') return 2; // Baseline for most pass requirements
            return parseFloat(s) || 0;
        };
        return val(student) >= val(required);
    },

    mapReqKeyToSubject: function(key) {
        const map = { "chi": "Chinese Language", "eng": "English Language", "math": "Mathematics (Compulsory Part)", "csd": "Citizenship and Social Development" };
        return map[key];
    }
};
