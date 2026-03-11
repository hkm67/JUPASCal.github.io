/**
 * JUPAS 2026 UI Controller
 * ------------------------
 * Manages data fetching, DOM generation, search filtering,
 * and presenting calculation results.
 */

const JUPAS_UI = {
    allProgrammes: [],
    selectedProgramme: null,
    
    // Canonical subject list for input generation
    coreSubjects: [
        "Chinese Language",
        "English Language",
        "Mathematics (Compulsory Part)",
        "Citizenship and Social Development"
    ],
    
    electivePool: [
        "Mathematics Extended Part (Module 1)",
        "Mathematics Extended Part (Module 2)",
        "Biology",
        "Chemistry",
        "Physics",
        "Economics",
        "Geography",
        "History",
        "Chinese History",
        "Information and Communication Technology",
        "Business, Accounting and Financial Studies",
        "Design and Applied Technology",
        "Health Management and Social Care",
        "Technology and Living",
        "Tourism and Hospitality Studies",
        "Visual Arts",
        "Music",
        "Physical Education",
        "Combined Science (Biology + Chemistry)",
        "Combined Science (Biology + Physics)",
        "Combined Science (Chemistry + Physics)",
        "Integrated Science",
        "Chinese Literature",
        "Literature in English",
        "Ethics and Religious Studies"
    ],

    gradesOptions: ["5**", "5*", "5", "4", "3", "2", "1", "U"],

    /**
     * Initializes the application.
     */
    init: async function() {
        console.log("Initializing JUPAS UI...");
        const listContainer = document.getElementById('programme-list');
        
        try {
            const response = await fetch('data/processed/JUPAS_2026_Unified_Data.json');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.allProgrammes = await response.json();
            
            if (!this.allProgrammes || this.allProgrammes.length === 0) {
                throw new Error("Dataset is empty.");
            }
            
            this.renderSubjectInputs();
            this.setupEventListeners();
            this.updateSearch(""); 
            
            console.log("JUPAS UI Initialized with", this.allProgrammes.length, "programmes.");
        } catch (error) {
            console.error("Initialization Error:", error);
            listContainer.innerHTML = `<div class="error-msg">
                <p><b>Error loading admission data:</b></p>
                <code>${error.message}</code>
                <p>If you are opening this file locally, please use a local web server (e.g., Live Server in VS Code or 'python -m http.server').</p>
            </div>`;
        }
    },

    /**
     * Generates the grade input form.
     */
    renderSubjectInputs: function() {
        const container = document.getElementById('subject-inputs');
        let html = "<h3>Input Your DSE Grades</h3>";

        // Render Cores
        this.coreSubjects.forEach(s => {
            html += this.createSubjectRow(s, s === "Citizenship and Social Development");
        });

        // Render Elective Slots (Max 4 for calculator)
        html += "<h4 style='margin-top:20px;'>Electives</h4>";
        for (let i = 1; i <= 4; i++) {
            html += this.createElectiveSlot(i);
        }

        container.innerHTML = html;
    },

    createSubjectRow: function(name, isCSD) {
        const options = isCSD ? ["Attained", "Unattained"] : this.gradesOptions;
        let selectHtml = `<select data-subject="${name}" class="grade-input"><option value="">--</option>`;
        options.forEach(o => selectHtml += `<option value="${o}">${o}</option>`);
        selectHtml += "</select>";

        return `<div class="input-row">
            <label>${name}</label>
            ${selectHtml}
        </div>`;
    },

    createElectiveSlot: function(index) {
        let subjSelect = `<select class="subject-select" id="e${index}-name"><option value="">(Pick Subject)</option>`;
        this.electivePool.forEach(s => subjSelect += `<option value="${s}">${s}</option>`);
        subjSelect += "</select>";

        let gradeSelect = `<select class="grade-input" id="e${index}-grade"><option value="">--</option>`;
        this.gradesOptions.forEach(o => gradeSelect += `<option value="${o}">${o}</option>`);
        gradeSelect += "</select>";

        return `<div class="input-row elective-row">
            ${subjSelect}
            ${gradeSelect}
        </div>`;
    },

    /**
     * Set up search and interaction listeners.
     */
    setupEventListeners: function() {
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (e) => this.updateSearch(e.target.value));

        // Global listener for grade changes to trigger re-calculation
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('grade-input') || e.target.classList.contains('subject-select')) {
                if (this.selectedProgramme) this.performCalculation();
            }
        });
    },

    updateSearch: function(query) {
        const list = document.getElementById('programme-list');
        const q = (query || "").toLowerCase();
        
        const filtered = this.allProgrammes.filter(p => {
            const code = (p.jupas_code || "").toLowerCase();
            const name_en = (p.name_en || "").toLowerCase();
            const name_zh = (p.name_zh || "").toLowerCase();
            const inst = (p.institution || "").toLowerCase();
            
            return code.includes(q) || 
                   name_en.includes(q) ||
                   name_zh.includes(q) ||
                   inst.includes(q);
        });

        // Limit results only if searching, otherwise show a reasonable initial list
        const displayList = q ? filtered : filtered.slice(0, 100);

        let html = "";
        if (displayList.length === 0) {
            html = "<div class='no-results'>No programmes found matching your search.</div>";
        } else {
            displayList.forEach(p => {
                html += `<div class="programme-item ${this.selectedProgramme && this.selectedProgramme.jupas_code === p.jupas_code ? 'active' : ''}" 
                             onclick="JUPAS_UI.selectProgramme('${p.jupas_code}')">
                    <span class="code">${p.jupas_code}</span>
                    <span class="name">${p.name_en}</span>
                    <span class="inst">${p.institution}</span>
                </div>`;
            });
        }
        list.innerHTML = html;
    },

    selectProgramme: function(code) {
        this.selectedProgramme = this.allProgrammes.find(p => p.jupas_code === code);
        this.performCalculation();
        
        // Highlight active
        document.querySelectorAll('.programme-item').forEach(el => el.classList.remove('active'));
        // (Visual feedback implementation)
    },

    /**
     * Collects inputs and runs the calculator.
     */
    performCalculation: function() {
        if (!this.selectedProgramme) return;

        const grades = {};
        // Get Cores
        document.querySelectorAll('select[data-subject]').forEach(el => {
            if (el.value) grades[el.dataset.subject] = el.value;
        });
        // Get Electives
        for (let i = 1; i <= 4; i++) {
            const name = document.getElementById(`e${i}-name`).value;
            const grade = document.getElementById(`e${i}-grade`).value;
            if (name && grade) grades[name] = grade;
        }

        const eligibility = JUPAS_CALCULATOR.checkEligibility(grades, this.selectedProgramme.min_requirements_2026);
        const result = JUPAS_CALCULATOR.calculateScore(grades, this.selectedProgramme);

        this.renderResult(eligibility, result);
    },

    /**
     * Generates the detailed "Excel-style" audit trail in the UI.
     */
    renderResult: function(eligibility, result) {
        const container = document.getElementById('result-display');
        const p = this.selectedProgramme;

        let html = `<div class="result-card">
            <h2>[${p.jupas_code}] ${p.name_en}</h2>
            <div class="eligibility ${eligibility.eligible ? 'pass' : 'fail'}">
                ${eligibility.eligible ? '✓ ELIGIBLE' : '✗ NOT ELIGIBLE'}
                ${!eligibility.eligible ? `<ul class="reasons"><li>${eligibility.reasons.join('</li><li>')}</li></ul>` : ''}
            </div>

            <div class="score-box">
                <div class="score-label">Estimated 2025 Weighted Score</div>
                <div class="score-value">${result.totalScore}</div>
            </div>

            <div class="historical-scores">
                <p><b>Median:</b> ${p.scores_2025.median || 'N/A'} | <b>LQ:</b> ${p.scores_2025.lq || 'N/A'}</p>
                ${p.scores_2025.score_type === "estimated" ? `<p class="warning">Note: HKBU Median/LQ are estimated based on grade breakdowns.</p>` : ''}
            </div>

            <h3>Calculation Breakdown</h3>
            <table class="audit-table">
                <thead>
                    <tr><th>Subject</th><th>Grade</th><th>Points</th><th>Weight</th><th>Final</th></tr>
                </thead>
                <tbody>`;

        // Sort candidates so used ones are on top (green)
        const sorted = [...result.allCandidates].sort((a,b) => (b.used === a.used) ? 0 : b.used ? 1 : -1);

        sorted.forEach(c => {
            html += `<tr class="${c.used ? 'selected-subject' : 'unused'}">
                <td>${c.subject} ${c.isCompulsory ? '<small>(Compulsory)</small>' : ''}</td>
                <td>${c.grade}</td>
                <td>${c.basePoints}</td>
                <td>x${c.multiplier}</td>
                <td>${c.weightedScore.toFixed(2)}</td>
            </tr>`;
        });

        html += `</tbody></table>
            <p class="formula-text"><b>Formula Applied:</b> ${result.formula}</p>
        </div>`;

        container.innerHTML = html;
    }
};

// Start the app
window.addEventListener('DOMContentLoaded', () => JUPAS_UI.init());
