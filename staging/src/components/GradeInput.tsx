import { memo, useEffect, useRef, useState } from "react";
import { CAT_A_SUBJECTS, CAT_C_GRADES, CAT_C_SUBJECTS, CORE_SUBJECTS, CSD_GRADES, DSE_GRADES, M12_SUBJECT, shortSubjectName } from "../lib/subjects";
import type { StudentGrades } from "../types/jupas";

type Props = {
  grades: StudentGrades;
  onChange: (grades: StudentGrades) => void;
  onReset: () => void;
};

const ELECTIVE_SLOTS = ["elective-1", "elective-2", "elective-3", "elective-4"];

export const GradeInput = memo(({ grades, onChange, onReset }: Props) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  const slotSubjects = ELECTIVE_SLOTS.map((slot) => grades[`${slot}:subject`] || "");

  function setGrade(subject: string, grade: string) {
    const next = { ...grades };
    if (grade) next[subject] = grade;
    else delete next[subject];
    onChange(cleanGradeState(next));
  }

  function setElective(slot: string, subject: string, grade: string) {
    const next = { ...grades };
    const previousSubject = next[`${slot}:subject`];
    if (previousSubject) delete next[previousSubject];
    if (subject) {
      next[`${slot}:subject`] = subject;
      if (grade) next[subject] = grade;
    } else {
      delete next[`${slot}:subject`];
    }
    onChange(cleanGradeState(next));
  }

  function reset() {
    onReset();
    setCollapsed(false);
    if (window.matchMedia?.("(max-width: 920px)").matches) {
      document.querySelector(".grade-panel")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  function finishMobileEntry() {
    setCollapsed(true);
  }

  return (
    <section className={collapsed ? "panel grade-panel mobile-collapsed" : "panel grade-panel"} aria-label="DSE grades">
      <div ref={sentinelRef} aria-hidden="true" className="sticky-sentinel" />
      <div className={isStuck ? "panel-heading is-stuck" : "panel-heading"}>
        <div className="step-title-content">
          <p className="eyebrow">Step 1</p>
          <h2>Input Your DSE Grades</h2>
        </div>
        <div className="grade-actions">
          <button className="ghost-button mobile-collapse-toggle" type="button" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "Edit" : "Done"}
          </button>
        </div>
        <GradeTitleSummary grades={grades} />
      </div>

      <div className="grade-panel-body">
        <h3 className="grade-section-title">Core Subjects</h3>
        <div className="grade-grid">
          {CORE_SUBJECTS.map((subject) => (
            <div className="field" key={subject}>
              <span>{subject}</span>
              <GradeButtons
                value={grades[subject] || ""}
                grades={subject.includes("Citizenship") ? CSD_GRADES.filter(Boolean) : DSE_GRADES.filter(Boolean)}
                onChange={(grade) => setGrade(subject, grade)}
              />
            </div>
          ))}
          <div className="field">
            <span>Mathematics Extended Part</span>
            <GradeButtons
              value={grades[M12_SUBJECT] || ""}
              grades={DSE_GRADES.filter(Boolean)}
              onChange={(grade) => setGrade(M12_SUBJECT, grade)}
            />
          </div>
        </div>

        <hr className="grade-section-divider" />

        <div className="elective-block">
          <h3>Electives</h3>
          {ELECTIVE_SLOTS.map((slot, index) => {
            const subject = grades[`${slot}:subject`] || "";
            return (
              <div className="elective-row" key={slot}>
                <select
                  aria-label={`Elective ${index + 1} subject`}
                  value={subject}
                  onChange={(event) => setElective(slot, event.target.value, subject ? grades[subject] || "" : "")}
                >
                  <option value="">Elective {index + 1}</option>
                  {CAT_A_SUBJECTS.map((option) => (
                    <option key={option} value={option} disabled={slotSubjects.includes(option) && option !== subject}>{option}</option>
                  ))}
                </select>
                <GradeButtons
                  value={subject ? grades[subject] || "" : ""}
                  grades={DSE_GRADES.filter(Boolean)}
                  disabled={!subject}
                  compact
                  onChange={(grade) => setElective(slot, subject, grade)}
                />
              </div>
            );
          })}

          <div className="elective-row">
            <select
              aria-label="Category C language"
              value={grades["cat-c:subject"] || ""}
              onChange={(event) => setElective("cat-c", event.target.value, grades[grades["cat-c:subject"]] || "")}
            >
              <option value="">Category C language</option>
              {CAT_C_SUBJECTS.map((subject) => <option key={subject} value={subject}>{shortSubjectName(subject)}</option>)}
            </select>
            <GradeButtons
              value={grades["cat-c:subject"] ? grades[grades["cat-c:subject"]] || "" : ""}
              grades={CAT_C_GRADES.filter(Boolean)}
              disabled={!grades["cat-c:subject"]}
              compact
              onChange={(grade) => setElective("cat-c", grades["cat-c:subject"], grade)}
            />
          </div>
        </div>
        <div className="grade-footer-actions">
          <button className="grade-reset-button" type="button" onClick={reset}>
            Reset grades
          </button>
          <button className="done-button" type="button" onClick={finishMobileEntry}>
            Done
          </button>
        </div>
      </div>
    </section>
  );
});

const GradeButtons = memo(({
  value,
  grades,
  disabled = false,
  compact = false,
  onChange,
}: {
  value: string;
  grades: string[];
  disabled?: boolean;
  compact?: boolean;
  onChange: (grade: string) => void;
}) => {
  return (
    <div className={compact ? "grade-buttons compact" : "grade-buttons"} role="radiogroup">
      {grades.map((grade) => (
        <button
          key={grade}
          type="button"
          className={value === grade ? "grade-chip active" : "grade-chip"}
          disabled={disabled}
          role="radio"
          aria-checked={value === grade}
          onClick={() => onChange(value === grade ? "" : grade)}
        >
          {grade}
        </button>
      ))}
    </div>
  );
});

function cleanGradeState(grades: StudentGrades) {
  const next = { ...grades };
  for (const [key, value] of Object.entries(next)) {
    if (!value) delete next[key];
  }
  return next;
}

function GradeTitleSummary({ grades }: { grades: StudentGrades }) {
  const items = [
    ["Chi", grades["Chinese Language"]],
    ["Eng", grades["English Language"]],
    ["Math", grades["Mathematics (Compulsory Part)"]],
    ["CSD", grades["Citizenship and Social Development"]],
    ["M1/2", grades[M12_SUBJECT]],
    ["E1", gradeForSlot(grades, "elective-1")],
    ["E2", gradeForSlot(grades, "elective-2")],
    ["E3", gradeForSlot(grades, "elective-3")],
    ["E4", gradeForSlot(grades, "elective-4")],
    ["Lang", gradeForSlot(grades, "cat-c")],
  ];

  return (
    <div className="grade-title-summary" aria-label="Entered grades summary">
      {items.map(([label, grade]) => (
        <span className={grade ? "grade-summary-cell filled" : "grade-summary-cell"} key={label}>
          <b className={String(label).length > 3 ? "compact-label" : undefined}>{label}</b>
          <em>{grade || "-"}</em>
        </span>
      ))}
    </div>
  );
}

function gradeForSlot(grades: StudentGrades, slot: string) {
  const subject = grades[`${slot}:subject`];
  return subject ? grades[subject] : undefined;
}
