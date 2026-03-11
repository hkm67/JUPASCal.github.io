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

    init: async function() {
        console.log("Initializing JUPAS UI...");
        const listContainer = document.getElementById('programme-list');
        
        try {
            const response = await fetch('data/processed/JUPAS_2026_Unified_Data.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.allProgrammes = await response.json();
            
            this.renderSubjectInputs();
            this.setupEventListeners();
            this.updateSearch(""); 
            console.log("JUPAS UI Initialized.");
        } catch (error) {
            console.error("Initialization Error:", error);
            listContainer.innerHTML = `<div class="error-msg">Error loading data.</div>`;
        }
    },

    renderSubjectInputs: function() {
        const container = document.getElementById('subject-inputs');
        let html = "<h3>Input Your DSE Grades</h3>";
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
        searchInput.addEventListener('input', (e) => this.updateSearch(e.target.value));
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
            return (p.jupas_code || "").toLowerCase().includes(q) || 
                   (p.name_en || "").toLowerCase().includes(q) ||
                   (p.institution || "").toLowerCase().includes(q);
        });
        const displayList = q ? filtered : filtered.slice(0, 50);
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
    },

    performCalculation: function() {
        if (!this.selectedProgramme) return;
        const grades = {};
        document.querySelectorAll('select[data-subject]').forEach(el => { if (el.value) grades[el.dataset.subject] = el.value; });
        for (let i = 1; i <= 4; i++) {
            const name = document.getElementById(`e${i}-name`).value;
            const grade = document.getElementById(`e${i}-grade`).value;
            if (name && grade) grades[name] = grade;
        }
        const eligibility = JUPAS_CALCULATOR.checkEligibility(grades, this.selectedProgramme.min_requirements_2026);
        const result = JUPAS_CALCULATOR.calculateScore(grades, this.selectedProgramme, "2025");
        this.renderResult(eligibility, result);
    },

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
                <div class="score-label">Your Estimated Score</div>
                <div class="score-value">${result.totalScore}</div>
                <div class="score-note">Calculated using 2025 formula</div>
            </div>
            <div class="historical-scores">
                <p><b>Median:</b> ${p.scores_2025.median || 'N/A'} | <b>LQ:</b> ${p.scores_2025.lq || 'N/A'}</p>
            </div>
            <h3>Calculation Breakdown</h3>
            <table class="audit-table">
                <thead><tr><th>Subject</th><th>Grade</th><th>Points</th><th>Weight</th><th>Final</th></tr></thead>
                <tbody>`;
        const sorted = [...result.allCandidates].sort((a,b) => (b.used === a.used) ? 0 : b.used ? 1 : -1);
        sorted.forEach(c => {
            html += `<tr class="${c.used ? 'selected-subject' : 'unused'}">
                <td>${c.subject} ${c.isCompulsory ? '<small>(Compulsory)</small>' : ''}</td>
                <td>${c.grade}</td><td>${c.basePoints}</td><td>x${c.multiplier}</td><td>${c.weightedScore.toFixed(2)}</td>
            </tr>`;
        });
        html += `</tbody></table>
            <p class="formula-text"><b>Formula:</b> ${result.formula}</p>
        </div>`;
        container.innerHTML = html;
    }
};

window.addEventListener('DOMContentLoaded', () => JUPAS_UI.init());
