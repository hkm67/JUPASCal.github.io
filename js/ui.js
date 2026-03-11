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
    
    electivePool: [
        "Mathematics Extended Part (Module 1)", "Mathematics Extended Part (Module 2)", "Biology", "Chemistry", 
        "Physics", "Economics", "Geography", "History", "Chinese History", "Information and Communication Technology",
        "Business, Accounting and Financial Studies", "Design and Applied Technology", "Health Management and Social Care",
        "Tourism and Hospitality Studies", "Visual Arts", "Music", "Physical Education", "Chinese Literature", 
        "Literature in English", "Ethics and Religious Studies"
    ],

    gradesOptions: ["5**", "5*", "5", "4", "3", "2", "1", "U"],

    init: async function() {
        console.log("Initializing JUPAS UI...");
        const listContainer = document.getElementById('programme-list');
        
        try {
            const response = await fetch('data/processed/JUPAS_2026_Unified_Data.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.allProgrammes = await response.json();
            
            this.renderSubjectInputs();
            this.setupEventListeners();
            
            // Restore state
            if (window.location.hash) {
                this.loadStateFromHash();
            } else {
                this.loadGradesFromStorage();
            }

            const savedSearch = localStorage.getItem('jupas_search_query');
            if (savedSearch) document.getElementById('search-input').value = savedSearch;
            
            this.updateSearch(savedSearch || ""); 

            // Initial view: Open Grade Input, Collapse Programme Selection
            this.setAccordion('grade-accordion', true);
            this.setAccordion('prog-accordion', false);

            console.log("JUPAS UI Initialized.");
        } catch (error) {
            console.error("Initialization Error:", error);
            listContainer.innerHTML = `<div class="error-msg">Error loading data.</div>`;
        }
    },

    /**
     * Accordion Logic
     */
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
        this.coreSubjects.forEach(s => html += this.createSubjectRow(s, s === "Citizenship and Social Development"));
        html += "<h4 style='margin-top:20px;'>Electives</h4>";
        for (let i = 1; i <= 4; i++) html += this.createElectiveSlot(i);
        container.innerHTML = html;
    },

    createSubjectRow: function(name, isCSD) {
        const options = isCSD ? ["A", "U"] : this.gradesOptions;
        let selectHtml = `<select data-subject="${name}" class="grade-input"><option value="">--</option>`;
        options.forEach(o => selectHtml += `<option value="${o}">${o}</option>`);
        selectHtml += "</select>";
        return `<div class="input-row"><label>${name}</label>${selectHtml}</div>`;
    },

    createElectiveSlot: function(index) {
        let subjSelect = `<select class="subject-select" id="e${index}-name"><option value="">(Pick Subject)</option>`;
        this.electivePool.forEach(s => subjSelect += `<option value="${s}">${s}</option>`);
        subjSelect += "</select>";
        let gradeSelect = `<select class="grade-input" id="e${index}-grade"><option value="">--</option>`;
        this.gradesOptions.forEach(o => gradeSelect += `<option value="${o}">${o}</option>`);
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

        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('grade-input') || e.target.classList.contains('subject-select')) {
                this.syncStateToHash(); 
                if (this.selectedProgramme) this.performCalculation();
            }
        });
    },

    syncStateToHash: function() {
        let params = new URLSearchParams();
        const coreShort = {"Chinese Language": "chi", "English Language": "eng", "Mathematics (Compulsory Part)": "math", "Citizenship and Social Development": "csd"};
        document.querySelectorAll('select[data-subject]').forEach(el => {
            if (el.value) params.set(coreShort[el.dataset.subject], el.value);
        });
        for (let i = 1; i <= 4; i++) {
            const name = document.getElementById(`e${i}-name`).value;
            const grade = document.getElementById(`e${i}-grade`).value;
            if (name && grade) params.set(`e${i}`, `${name}:${grade}`);
        }
        const newHash = params.toString();
        history.replaceState(null, null, newHash ? "#" + newHash : " ");
    },

    loadStateFromHash: function() {
        const hash = window.location.hash.substring(1);
        if (!hash) return;
        const params = new URLSearchParams(hash);
        const coreLong = {"chi": "Chinese Language", "eng": "English Language", "math": "Mathematics (Compulsory Part)", "csd": "Citizenship and Social Development"};
        Object.keys(coreLong).forEach(short => {
            const val = params.get(short);
            if (val) {
                const el = document.querySelector(`select[data-subject="${coreLong[short]}"]`);
                if (el) el.value = val;
            }
        });
        for (let i = 1; i <= 4; i++) {
            const val = params.get(`e${i}`);
            if (val && val.includes(':')) {
                const [name, grade] = val.split(':');
                const nameEl = document.getElementById(`e${i}-name`);
                const gradeEl = document.getElementById(`e${i}-grade`);
                if (nameEl) nameEl.value = name;
                if (gradeEl) gradeEl.value = grade;
            }
        }
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
        // Handle both old structured format and new flat format if needed
        const cores = data.cores || data; 
        document.querySelectorAll('select[data-subject]').forEach(el => {
            if (cores[el.dataset.subject]) el.value = cores[el.dataset.subject];
        });
        const electives = data.electives || [];
        if (electives.length > 0) {
            electives.forEach((e, i) => {
                const idx = i + 1;
                const nameEl = document.getElementById(`e${idx}-name`);
                const gradeEl = document.getElementById(`e${idx}-grade`);
                if (nameEl && e.name) nameEl.value = e.name;
                if (gradeEl && e.grade) gradeEl.value = e.grade;
            });
        }
    },

    resetGrades: function() {
        localStorage.removeItem('jupas_student_grades_explicit');
        document.querySelectorAll('select.grade-input, select.subject-select').forEach(el => el.value = "");
        history.replaceState(null, null, " ");
        if (this.selectedProgramme) this.performCalculation();
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
        
        // Collapse Programme Selection and Grade Input after selection
        this.setAccordion('prog-accordion', false);
        this.setAccordion('grade-accordion', false);
    },

    performCalculation: function() {
        if (!this.selectedProgramme) return;
        const grades = this.getGradesFromUI_Flattened();
        const eligibility = JUPAS_CALCULATOR.checkEligibility(grades, this.selectedProgramme.min_requirements_2026);
        const result = JUPAS_CALCULATOR.calculateScore(grades, this.selectedProgramme, "2025");
        this.renderResult(eligibility, result);
    },

    getGradesFromUI_Flattened: function() {
        const grades = {};
        document.querySelectorAll('select[data-subject]').forEach(el => { if (el.value) grades[el.dataset.subject] = el.value; });
        for (let i = 1; i <= 4; i++) {
            const name = document.getElementById(`e${i}-name`).value;
            const grade = document.getElementById(`e${i}-grade`).value;
            if (name && grade) grades[name] = grade;
        }
        return grades;
    },

    renderResult: function(eligibility, result) {
        const container = document.getElementById('result-display');
        const p = this.selectedProgramme;

        const formatComp = (histScore) => {
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
                          "Citizenship and Social Development"];
            const electiveMultipliers = Object.keys(weights)
                .filter(k => !core_names.includes(k))
                .map(k => ({name: k, w: weights[k]}))
                .sort((a,b) => b.w - a.w);

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
                    <h4>${title} Analysis</h4>
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

        const w25 = p.subject_weights_2025;
        let weightInfo = `<div class="weighting-reference">
            <h4>Formula & Weights</h4>
            <p class="formula-main"><b>Formula:</b> ${p.formula_2025}</p>
            <div class="weights-list">
                ${Object.entries(w25).map(([name, w]) => `<span><b>${this.getShortName(name)}</b>: x${w}</span>`).join('')}
            </div>
        </div>`;

        let html = `
            <div class="result-card">
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
                    <div class="score-note">Based on 2025 scoring logic</div>
                </div>

                ${weightInfo}

                <div class="historical-scores">
                    <h3>2025 Historical Comparison</h3>
                    <table class="historical-table">
                        <thead><tr><th>Position</th><th>2025 Score</th><th>Diff</th><th>%</th></tr></thead>
                        <tbody>
                            <tr><td>UQ</td><td>${p.scores_2025.uq || 'N/A'}</td>${formatComp(p.scores_2025.uq)}</tr>
                            <tr><td>Median</td><td>${p.scores_2025.median || 'N/A'}</td>${formatComp(p.scores_2025.median)}</tr>
                            <tr><td>LQ</td><td>${p.scores_2025.lq || 'N/A'}</td>${formatComp(p.scores_2025.lq)}</tr>
                            <tr><td>Mean</td><td>${p.scores_2025.mean || 'N/A'}</td>${formatComp(p.scores_2025.mean)}</tr>
                        </tbody>
                    </table>
                    ${generateHistoricalLogicGrid(p.score_grades_2025.uq, "UQ")}
                    ${generateHistoricalLogicGrid(p.score_grades_2025.median, "Median")}
                    ${generateHistoricalLogicGrid(p.score_grades_2025.lq, "LQ")}
                </div>

                <h3>Your Calculation Detail</h3>
                <table class="audit-table">
                    <thead><tr><th>Subject</th><th>Grade</th><th>Points</th><th>Weight</th><th>Final</th></tr></thead>
                    <tbody>
                        ${result.allCandidates.sort((a,b) => (b.used === a.used) ? 0 : b.used ? 1 : -1).map(c => `
                            <tr class="${c.used ? 'selected-subject' : 'unused'}">
                                <td>${c.subject} ${c.isCompulsory ? '<small>(Compulsory)</small>' : ''}</td>
                                <td>${c.grade}</td><td>${c.basePoints}</td><td>x${c.multiplier}</td><td>${c.weightedScore.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
        container.innerHTML = html;
    },

    shareLink: function() {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            this.showToast("Link with your grades copied to clipboard!");
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
            "Mathematics Extended Part (Module 2)": "M2", "Information and Communication Technology": "ICT",
            "Business, Accounting and Financial Studies": "BAFS", "Biology": "Bio", "Chemistry": "Chem", "Physics": "Phys"
        };
        if (map[fullName]) return map[fullName];
        if (fullName.includes("Elective")) return fullName;
        return fullName.substring(0, 6);
    }
};

window.addEventListener('DOMContentLoaded', () => JUPAS_UI.init());
window.JUPAS_UI = JUPAS_UI; 
