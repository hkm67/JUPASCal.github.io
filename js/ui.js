/**
 * JUPAS 2026 UI Controller
 * ------------------------
 * Manages data fetching, DOM generation, search filtering,
 * state persistence via Hash Fragment (#), and results presentation.
 */

const JUPAS_UI = {
    allProgrammes: [],
    selectedProgramme: null,
    
    // Canonical mapping for normalization
    subjectMap: {
        "CHIN": "Chinese Language", "ENGL": "English Language", "MATH": "Mathematics (Compulsory Part)",
        "CSD":  "Citizenship and Social Development", "M1": "Mathematics Extended Part (Module 1)",
        "M2": "Mathematics Extended Part (Module 2)", "M1/M2": "Mathematics Extended Part (Module 1 or 2)",
        "BIO": "Biology", "BIOL": "Biology", "CHEM": "Chemistry", "PHYS": "Physics", "ECON": "Economics",
        "GEOG": "Geography", "HIST": "History", "ICT": "Information and Communication Technology",
        "BAFS": "Business, Accounting and Financial Studies", "BBA":  "Business, Accounting and Financial Studies",
        "VART": "Visual Arts", "MUSC": "Music", "PE": "Physical Education", 
        "TLFS": "Technology and Living (Food Science and Technology)"
    },

    coreSubjects: ["Chinese Language", "English Language", "Mathematics (Compulsory Part)", "Citizenship and Social Development"],
    
    // Categorized Elective Pools
    catA_Pool: [
        "Biology", "Chemistry", "Physics", "Economics", "Geography", "History", "Chinese History",
        "Information and Communication Technology", "Business, Accounting and Financial Studies",
        "Design and Applied Technology", "Health Management and Social Care", "Tourism and Hospitality Studies",
        "Chinese Literature", "Literature in English", "Technology and Living (Food Science and Technology)",
        "Visual Arts", "Music", "Physical Education", "Ethics and Religious Studies"
    ],

    catC_Pool: ["French", "German", "Hindi", "Japanese", "Spanish", "Urdu"],

    gradesOptions: ["5**", "5*", "5", "4", "3", "2", "1", "U"],
    catCGrades: ["A", "B", "C", "D", "E", "U"],

    init: async function() {
        console.log("Initializing JUPAS UI...");
        const listContainer = document.getElementById('programme-list');
        
        try {
            console.log("Fetching unified data...");
            const response = await fetch('data/processed/JUPAS_2026_Unified_Data.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.allProgrammes = await response.json();
            console.log(`Loaded ${this.allProgrammes.length} programmes.`);
            
            console.log("Rendering subject inputs...");
            this.renderSubjectInputs();
            
            console.log("Setting up event listeners...");
            this.setupEventListeners();
            
            if (window.location.hash) {
                console.log("Loading state from hash...");
                try { this.loadStateFromHash(); } catch(e) { console.error("Hash Load Error:", e); }
            } else {
                console.log("Loading grades from storage...");
                try { this.loadGradesFromStorage(); } catch(e) { console.error("Storage Load Error:", e); }
            }

            console.log("Updating search...");
            const savedSearch = localStorage.getItem('jupas_search_query');
            if (savedSearch) {
                const searchEl = document.getElementById('search-input');
                if (searchEl) searchEl.value = savedSearch;
            }
            this.updateSearch(savedSearch || ""); 

            this.setAccordion('grade-accordion', true);
            this.setAccordion('prog-accordion', false);

            console.log("JUPAS UI Initialized Successfully.");
        } catch (error) {
            console.error("Critical Initialization Error:", error);
            listContainer.innerHTML = `<div class="error-msg">Error loading data: ${error.message}</div>`;
        }
    },

    toggleAccordion: function(id) {
        const el = document.getElementById(id);
        el.classList.toggle('collapsed');
    },

    setAccordion: function(id, isOpen) {
        const el = document.getElementById(id);
        if (isOpen) el.classList.remove('collapsed');
        else el.classList.add('collapsed');
    },

    renderSubjectInputs: function() {
        const container = document.getElementById('subject-inputs');
        let html = "";

        // Cores
        this.coreSubjects.forEach(s => html += this.createSubjectRow(s, s === "Citizenship and Social Development"));

        // Electives
        html += "<h4 style='margin-top:20px;'>Electives</h4>";
        html += this.createM12Slot();                                         // M1/2 (fixed)
        const ordinals = ['1st', '2nd', '3rd', '4th'];
        for (let i = 1; i <= 4; i++) html += this.createElectiveSlot(i, this.catA_Pool, false, `${ordinals[i-1]} Elective`);
        html += this.createElectiveSlot(5, this.catC_Pool, true, 'Cat C Language');
        html += this.createCatBSlot();                                        // Cat B placeholder

        container.innerHTML = html;
        this.updateElectiveExclusivity();
    },

    createSubjectRow: function(name, isCSD) {
        const options = isCSD ? ["A", "U"] : this.gradesOptions;
        let selectHtml = `<select data-subject="${name}" class="grade-input"><option value="">--</option>`;
        options.forEach(o => selectHtml += `<option value="${o}">${o}</option>`);
        selectHtml += "</select>";
        return `<div class="input-row"><label>${name}</label>${selectHtml}</div>`;
    },

    createM12Slot: function() {
        let gradeSelect = `<select class="grade-input" id="m12-grade" data-subject="Mathematics Extended Part (Module 1 or 2)"><option value="">--</option>`;
        this.gradesOptions.forEach(o => gradeSelect += `<option value="${o}">${o}</option>`);
        gradeSelect += "</select>";
        return `<div class="input-row"><label>Mathematics Extended Part (M1/2)</label>${gradeSelect}</div>`;
    },

    createCatBSlot: function() {
        return `<div class="input-row elective-row cat-b-placeholder">
            <select class="subject-select" disabled><option>Applied Learning (Cat B)</option></select>
            <select class="grade-input" disabled><option>--</option></select>
        </div>`;
    },

    createElectiveSlot: function(index, pool, isCatC = false, placeholder = 'Pick Subject') {
        let subjSelect = `<select class="subject-select" id="e${index}-name"><option value="">${placeholder}</option>`;
        pool.forEach(s => subjSelect += `<option value="${s}">${s}</option>`);
        subjSelect += "</select>";
        
        const grades = isCatC ? this.catCGrades : this.gradesOptions;
        let gradeSelect = `<select class="grade-input" id="e${index}-grade"><option value="">--</option>`;
        grades.forEach(o => gradeSelect += `<option value="${o}">${o}</option>`);
        gradeSelect += "</select>";
        
        return `<div class="input-row elective-row">${subjSelect}${gradeSelect}</div>`;
    },

    setupEventListeners: function() {
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (e) => {
            localStorage.setItem('jupas_search_query', e.target.value);
            this.updateSearch(e.target.value);
        });

        const resetBtn = document.getElementById('reset-button');
        if (resetBtn) resetBtn.addEventListener('click', () => {
            if (confirm("Reset all grades? This cannot be undone.")) {
                this.resetGrades();
            }
        });

        const saveBtn = document.getElementById('save-button');
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveGradesToStorage());

        const confirmGradesBtn = document.getElementById('confirm-grades-button');
        if (confirmGradesBtn) {
            confirmGradesBtn.addEventListener('click', () => {
                this.setAccordion('grade-accordion', false);
                this.setAccordion('prog-accordion', true);
            });
        }

        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('grade-input') || e.target.classList.contains('subject-select')) {
                if (e.target.classList.contains('subject-select')) {
                    this.updateElectiveExclusivity();
                }
                this.syncStateToHash(); 
                if (this.selectedProgramme) this.performCalculation();
            }
        });
    },

    updateElectiveExclusivity: function() {
        // Enforce exclusivity across all 4 Cat A slots
        const selected = [];
        for (let i = 1; i <= 4; i++) {
            const el = document.getElementById(`e${i}-name`);
            if (el && el.value) selected.push(el.value);
        }

        for (let i = 1; i <= 4; i++) {
            const select = document.getElementById(`e${i}-name`);
            if (!select) continue;
            const currentVal = select.value;
            
            Array.from(select.options).forEach(opt => {
                if (!opt.value) return;
                if (selected.includes(opt.value) && opt.value !== currentVal) {
                    opt.disabled = true;
                    opt.style.display = 'none';
                } else {
                    opt.disabled = false;
                    opt.style.display = 'block';
                }
            });
        }
    },

    syncStateToHash: function() {
        let params = new URLSearchParams();
        const coreShort = {
            "Chinese Language": "chi", 
            "English Language": "eng", 
            "Mathematics (Compulsory Part)": "math", 
            "Citizenship and Social Development": "csd",
            "Mathematics Extended Part (Module 1 or 2)": "m12"
        };
        
        // Cores + M12
        document.querySelectorAll('select[data-subject]').forEach(el => {
            if (el.value) params.set(coreShort[el.dataset.subject], el.value);
        });
        
        // Electives 1-5 (Cat A ×4 + Cat C); e6 (Cat B) is a placeholder, not persisted
        for (let i = 1; i <= 5; i++) {
            const nameEl = document.getElementById(`e${i}-name`);
            const gradeEl = document.getElementById(`e${i}-grade`);
            if (nameEl && gradeEl && nameEl.value && gradeEl.value) {
                params.set(`e${i}`, `${nameEl.value}:${gradeEl.value}`);
            }
        }
        const newHash = params.toString();
        history.replaceState(null, null, newHash ? "#" + newHash : " ");
    },

    loadStateFromHash: function() {
        const hash = window.location.hash.substring(1);
        if (!hash) return;
        const params = new URLSearchParams(hash);
        const coreLong = {
            "chi": "Chinese Language", 
            "eng": "English Language", 
            "math": "Mathematics (Compulsory Part)", 
            "csd": "Citizenship and Social Development",
            "m12": "Mathematics Extended Part (Module 1 or 2)"
        };
        
        Object.keys(coreLong).forEach(short => {
            const val = params.get(short);
            if (val) {
                const el = document.querySelector(`select[data-subject="${coreLong[short]}"]`);
                if (el) el.value = val;
            }
        });
        
        for (let i = 1; i <= 5; i++) {
            const val = params.get(`e${i}`);
            if (val && val.includes(':')) {
                const [name, grade] = val.split(':');
                const nameEl = document.getElementById(`e${i}-name`);
                const gradeEl = document.getElementById(`e${i}-grade`);
                if (nameEl) nameEl.value = name;
                if (gradeEl) gradeEl.value = grade;
            }
        }
        this.updateElectiveExclusivity();

    },

    saveGradesToStorage: function() {
        const grades = this.getGradesFromUI_Flattened();
        localStorage.setItem('jupas_student_grades_explicit', JSON.stringify(grades));
        this.showToast("Grades successfully saved to browser!");
    },

    loadGradesFromStorage: function() {
        const saved = localStorage.getItem('jupas_student_grades_explicit');
        if (!saved) return;
        try {
            const data = JSON.parse(saved);
            this.applyGradesToUI(data);
        } catch (e) { console.error("Failed to parse saved grades."); }
    },

    applyGradesToUI: function(data) {
        // Handle both old and new formats
        const grades = data.cores || data; 
        document.querySelectorAll('select[data-subject]').forEach(el => {
            if (grades[el.dataset.subject]) el.value = grades[el.dataset.subject];
        });
        
        for (let [name, grade] of Object.entries(grades)) {
            // Cat A (e1-e4): restore into first available empty slot
            if (this.catA_Pool.includes(name)) {
                for (let i = 1; i <= 4; i++) {
                    const nameEl = document.getElementById(`e${i}-name`);
                    const gradeEl = document.getElementById(`e${i}-grade`);
                    if (nameEl && !nameEl.value) { nameEl.value = name; gradeEl.value = grade; break; }
                }
            }
            // Cat C (e5)
            if (this.catC_Pool.includes(name)) {
                const e5Name = document.getElementById('e5-name');
                const e5Grade = document.getElementById('e5-grade');
                if (e5Name) { e5Name.value = name; e5Grade.value = grade; }
            }
        }
        
        this.updateElectiveExclusivity();
    },

    resetGrades: function() {
        localStorage.removeItem('jupas_student_grades_explicit');
        document.querySelectorAll('select.grade-input, select.subject-select').forEach(el => el.value = "");
        history.replaceState(null, null, " ");
        if (this.selectedProgramme) this.performCalculation();
        this.updateElectiveExclusivity();
    },

    updateSearch: function(query) {
        const list = document.getElementById('programme-list');
        const q = (query || "").toLowerCase();
        const filtered = this.allProgrammes.filter(p => {
            return (p.jupas_code || "").toLowerCase().includes(q) || 
                   (p.name_en || "").toLowerCase().includes(q) ||
                   (p.institution || "").toLowerCase().includes(q);
        });
        const displayList = q ? filtered : filtered.slice(0, 100);
        let html = "";
        displayList.forEach(p => {
            html += `<div class="programme-item ${this.selectedProgramme && this.selectedProgramme.jupas_code === p.jupas_code ? 'active' : ''}" 
                             onclick="JUPAS_UI.selectProgramme('${p.jupas_code}')">
                <span class="code">${p.jupas_code}</span>
                <span class="name">${p.name_en}</span>
                <span class="inst">${p.institution}</span>
            </div>`;
        });
        list.innerHTML = html;
    },

    selectProgramme: function(code) {
        this.selectedProgramme = this.allProgrammes.find(p => p.jupas_code === code);
        this.performCalculation();
        this.updateSearch(document.getElementById('search-input').value);
        this.setAccordion('prog-accordion', false);
        this.setAccordion('grade-accordion', false);
    },

    performCalculation: function() {
        if (!this.selectedProgramme) return;
        const grades = this.getGradesFromUI_Flattened();
        const isNew = !this.selectedProgramme.scores_2025.median && !this.selectedProgramme.scores_2025.lq && !this.selectedProgramme.scores_2025.mean;
        const calcYear = isNew ? "2026" : "2025";
        const eligibility = JUPAS_CALCULATOR.checkEligibility(grades, this.selectedProgramme.min_requirements_2026, this.selectedProgramme);
        const result = JUPAS_CALCULATOR.calculateScore(grades, this.selectedProgramme, calcYear);
        this.renderResult(eligibility, result, isNew);
    },

    getGradesFromUI_Flattened: function() {
        const grades = {};
        // Cores + M1/2
        document.querySelectorAll('select[data-subject]').forEach(el => { if (el.value) grades[el.dataset.subject] = el.value; });
        // Cat A (e1-e4) + Cat C (e5); e6 Cat B is a placeholder, skipped
        for (let i = 1; i <= 5; i++) {
            const nameEl = document.getElementById(`e${i}-name`);
            const gradeEl = document.getElementById(`e${i}-grade`);
            if (nameEl && gradeEl && nameEl.value && gradeEl.value) {
                grades[nameEl.value] = gradeEl.value;
            }
        }
        return grades;
    },

    renderResult: function(eligibility, result, isNewProgramme) {
        const container = document.getElementById('result-display');
        const p = this.selectedProgramme;

        const getCompCells = (histScore) => {
            if (!histScore || !result.totalScore) return "<td>-</td><td>-</td>";
            const diff = result.totalScore - histScore;
            const pctChange = ((result.totalScore - histScore) / histScore * 100).toFixed(1);
            const className = diff >= 0 ? "pos" : "neg";
            return `<td class="comp-cell ${className}">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}</td><td class="comp-cell ${className}">${diff >= 0 ? '+' : ''}${pctChange}%</td>`;
        };

        const generateHistoricalLogicGrid = (gradeBreakdown, title) => {
            if (!gradeBreakdown || Object.keys(gradeBreakdown).length === 0) return "";
            const mappedBreakdown = {};
            const weights = p.subject_weights_2025 || {};
            const core_names = ["Chinese Language", "English Language", "Mathematics (Compulsory Part)", 
                          "Mathematics Extended Part (Module 1)", "Mathematics Extended Part (Module 2)",
                          "Mathematics Extended Part (Module 1 or 2)",
                          "Citizenship and Social Development"];
            const electiveMultipliers = Object.keys(weights).filter(k => !core_names.includes(k)).map(k => ({name: k, w: weights[k]})).sort((a,b) => b.w - a.w);

            for (let [key, grade] of Object.entries(gradeBreakdown)) {
                const upperKey = key.toUpperCase();
                if (this.subjectMap[upperKey]) mappedBreakdown[this.subjectMap[upperKey]] = grade;
                else if (key.includes("Elective")) {
                    if (electiveMultipliers.length > 0) {
                        const em = electiveMultipliers.shift();
                        mappedBreakdown[em.name] = grade;
                    } else mappedBreakdown[key] = grade;
                } else mappedBreakdown[key] = grade;
            }

            const histResult = JUPAS_CALCULATOR.calculateScore(mappedBreakdown, p, "2025");
            const subjects = histResult.allCandidates;

            return `
                <div class="logic-group historical">
                    <h4>${title} Logic Breakdown</h4>
                    <div class="logic-table-wrapper">
                        <table class="logic-grid">
                            <tr class="labels-row"><th class="row-label"></th>${subjects.map(s => `<th>${this.getShortName(s.subject)}</th>`).join('')}</tr>
                            <tr class="grades-row"><td class="row-label">Grade</td>${subjects.map(s => `<td>${s.grade}</td>`).join('')}</tr>
                            <tr class="weights-row"><td class="row-label">Weight</td>${subjects.map(s => `<td>${s.multiplier}</td>`).join('')}</tr>
                            <tr class="points-row"><td class="row-label">Score</td>${subjects.map(s => `<td class="${s.used ? 'selected' : ''}">${s.weightedScore.toFixed(2)}</td>`).join('')}</tr>
                        </table>
                    </div>
                </div>`;
        };

        const calcYear = isNewProgramme ? "2026" : "2025";
        const wInfo = p[`subject_weights_${calcYear}`];
        const pools = p[`best_of_weights_${calcYear}`] || [];
        
        let weightInfo = `<div class="weighting-reference">
            <h4>Formula & Weights (${calcYear} Cycle)</h4>
            <p class="formula-main"><b>Formula:</b> ${p[`formula_${calcYear}`]}</p>
            <div class="weights-list">
                ${Object.entries(wInfo).map(([name, w]) => `<span><b>${this.getShortName(name)}</b>: x${w}</span>`).join('')}
                ${pools.map(pool => `<span><b>${pool.subjects.map(s => this.getShortName(s)).join('/')}</b>: x${pool.weight}</span>`).join('')}
            </div>
        </div>`;

        let html = `
            <div class="result-card">
                ${isNewProgramme ? '<div class="new-badge">NEW PROGRAMME (2026 ENTRY)</div>' : ''}
                <div class="card-header">
                    <h2>[${p.jupas_code}] ${p.name_en}</h2>
                    <button class="btn-share" onclick="JUPAS_UI.shareLink()">Share Result</button>
                </div>
                
                <details class="eligibility-dropdown ${eligibility.eligible ? 'pass' : 'fail'}">
                    <summary>${eligibility.eligible ? '✓ ELIGIBLE' : '✗ NOT ELIGIBLE'} (View Details)</summary>
                    <div class="eligibility-content">
                        <table class="elig-table">
                            <thead><tr><th>Requirement</th><th>Required</th><th>Your Grade</th><th>Status</th></tr></thead>
                            <tbody>
                                ${eligibility.details.map(d => `
                                    <tr>
                                        <td>${d.label} ${d.note ? `<br><small>${d.note}</small>` : ''}</td>
                                        <td>${d.need}</td>
                                        <td>${d.got}</td>
                                        <td class="${d.pass ? 'pass-text' : 'fail-text'}">${d.pass ? 'OK' : 'FAIL'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </details>

                <div class="score-box">
                    <div class="score-label">Your Estimated Score</div>
                    <div class="score-value">${result.totalScore}</div>
                    <div class="score-note">Based on ${calcYear} scoring logic</div>
                </div>

                ${weightInfo}

                ${!isNewProgramme ? `
                <div class="historical-section">
                    <h3>2025 Historical Comparison</h3>
                    <table class="historical-table">
                        <thead><tr><th>Position</th><th>2025 Score</th><th>Diff</th><th>%</th></tr></thead>
                        <tbody>
                            ${p.scores_2025.uq ? `<tr><td>UQ</td><td>${p.scores_2025.uq}</td>${getCompCells(p.scores_2025.uq)}</tr>` : ''}
                            ${p.scores_2025.median ? `<tr><td>Median</td><td>${p.scores_2025.median}</td>${getCompCells(p.scores_2025.median)}</tr>` : ''}
                            ${p.scores_2025.mean ? `<tr><td>Average (Mean)</td><td>${p.scores_2025.mean}</td>${getCompCells(p.scores_2025.mean)}</tr>` : ''}
                            ${p.scores_2025.lq ? `<tr><td>LQ</td><td>${p.scores_2025.lq}</td>${getCompCells(p.scores_2025.lq)}</tr>` : ''}
                        </tbody>
                    </table>
                    
                    <details class="analysis-audit-dropdown">
                        <summary>View Benchmarking Breakdown (UQ/Median/LQ Analysis)</summary>
                        <div class="analysis-content">
                            ${generateHistoricalLogicGrid(p.score_grades_2025.uq, "UQ")}
                            ${generateHistoricalLogicGrid(p.score_grades_2025.median, "Median")}
                            ${generateHistoricalLogicGrid(p.score_grades_2025.lq, "LQ")}
                            ${p.scores_2025.score_type === "estimated" ? `<p class="warning">Note: HKBU benchmarks are estimated from grade breakdowns.</p>` : ''}
                        </div>
                    </details>
                </div>` : '<div class="no-historical">No 2025 historical data available.</div>'}

                ${p.offer_statistics && p.offer_statistics.length > 0 ? `
                <div class="stats-section">
                    <h3>Competition & Offer Trends</h3>
                    <div class="stats-table-wrapper">
                        <table class="stats-table">
                            <thead>
                                <tr>
                                    <th>Year</th>
                                    <th>Quota</th>
                                    <th>Band A Apps</th>
                                    <th>Ratio (1:N)</th>
                                    <th>Band A Offers</th>
                                    <th>Offer %</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(() => {
                                    const years = [...new Set(p.offer_statistics.map(s => s.Year))].sort((a,b) => b - a).slice(0, 3);
                                    return years.map(y => {
                                        const app = p.offer_statistics.find(s => s.Year === y && s.Type === "Application");
                                        const off = p.offer_statistics.find(s => s.Year === y && s.Type === "Offer");
                                        if (!app && !off) return "";
                                        const quota = app ? app.Quota : (off ? off.Quota : 0);
                                        const bandAApps = app ? app["Band A"] : 0;
                                        const bandAOffs = off ? off["Band A"] : 0;
                                        const ratio = quota > 0 ? (bandAApps / quota).toFixed(1) : "-";
                                        const offPct = bandAApps > 0 ? (bandAOffs / bandAApps * 100).toFixed(1) : "-";
                                        return `
                                            <tr>
                                                <td>${y}</td>
                                                <td>${quota || "-"}</td>
                                                <td>${bandAApps}</td>
                                                <td>${ratio}</td>
                                                <td>${bandAOffs}</td>
                                                <td>${offPct}%</td>
                                            </tr>`;
                                    }).join('');
                                })()}
                            </tbody>
                        </table>
                    </div>
                    <p class="stats-note"><small>* Ratio = Band A Applicants per Quota place. Offer % = Band A Offers / Band A Applicants.</small></p>
                </div>` : ''}

                <h3>Your Calculation Detail</h3>
                <table class="audit-table">
                    <thead><tr><th>Subject</th><th>Grade</th><th>Pts</th><th>W</th><th>Final</th></tr></thead>
                    <tbody>
                        ${result.allCandidates.sort((a,b) => (b.used === a.used) ? 0 : b.used ? 1 : -1).map(c => {
                            let label = this.getShortName(c.subject);
                            if (c.isCompulsory) label += ' <small>(C)</small>';
                            
                            let multiplierText = `x${c.multiplier}`;
                            let finalPoints = c.weightedScore;

                            // Special handling for bonus display
                            if (c.isBonus) {
                                if (c.bonusValue && c.bonusValue.includes('x')) {
                                    // HKU/PolyU style multiplier bonus
                                    const m = parseFloat(c.bonusValue.replace('+', '').replace('x', ''));
                                    multiplierText = `x${m}`;
                                } else if (c.bonusValue && c.bonusValue.includes('%')) {
                                    // HKUST style percentage bonus
                                    multiplierText = `<small class="bonus-label">${c.bonusValue}</small>`;
                                }
                            }

                            return `
                                <tr class="${c.used ? 'selected-subject' : 'unused'}">
                                    <td>${label}</td>
                                    <td>${c.grade}</td><td>${c.basePoints}</td><td>${multiplierText}</td><td>${finalPoints.toFixed(2)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                ${result.selected.some(c => c.isBonus && c.bonusValue && c.bonusValue.includes('of total')) ? `
                <p class="bonus-note"><small>* HKUST 6th subject bonus is added directly to the total score. The % shown reflects grade attainment (subject pts ÷ 8.5 × 5%) — it is <em>not</em> a percentage of the subject's own points.</small></p>
                ` : ''}
            </div>`;
        container.innerHTML = html;
    },

    shareLink: function() {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            this.showToast("Link copied to clipboard!");
        });
    },

    showToast: function(msg) {
        let toast = document.createElement("div");
        toast.className = "toast-msg";
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    getShortName: function(fullName) {
        const map = {
            "Chinese Language": "CHI", "English Language": "ENG", "Mathematics (Compulsory Part)": "MATH",
            "Citizenship and Social Development": "CSD", "Mathematics Extended Part (Module 1)": "M1",
            "Mathematics Extended Part (Module 2)": "M2", 
            "Mathematics Extended Part (Module 1 or 2)": "M1/2",
            "Information and Communication Technology": "ICT",
            "Business, Accounting and Financial Studies": "BAFS", "Biology": "Bio", "Chemistry": "Chem", "Physics": "Phys"
        };
        if (map[fullName]) return map[fullName];
        if (fullName.includes("Elective")) return fullName;
        return fullName.substring(0, 6);
    }
};

window.addEventListener('DOMContentLoaded', () => JUPAS_UI.init());
window.JUPAS_UI = JUPAS_UI; 
