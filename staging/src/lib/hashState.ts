import type { StudentGrades } from "../types/jupas";
import { CAT_A_SUBJECTS, CAT_C_SUBJECTS, CORE_SUBJECTS, M12_SUBJECT } from "./subjects";

const MAX_HASH_LENGTH = 4096;
const MAX_SUBJECT_LENGTH = 180;
const MAX_GRADE_LENGTH = 8;
const MAX_PICKED_PROGRAMMES = 20;
const VALID_GRADES = new Set(["5**", "5*", "5", "4", "3", "2", "1", "A", "B", "C", "D", "E", "U"]);
const PROGRAMME_CODE_PATTERN = /^JS\d{4}$/;
const SLOT_SUBJECT_PATTERN = /^(elective-[1-4]|cat-c):subject$/;
const VALID_SUBJECTS = new Set([...CORE_SUBJECTS, M12_SUBJECT, ...CAT_A_SUBJECTS, ...CAT_C_SUBJECTS]);

export type HashState = {
  grades: StudentGrades;
  pickedCodes: string[];
  sharing: boolean;
};

// Map long subject names to short keys for the URL
const SUBJECT_MAP: Record<string, string> = {
  "Chinese Language": "chi",
  "English Language": "eng",
  "Mathematics (Compulsory Part)": "math",
  "Citizenship and Social Development": "csd",
  "Mathematics Extended Part (Module 1 or 2)": "m12",
  "Mathematics Extended Part (Module 1)": "m1",
  "Mathematics Extended Part (Module 2)": "m2",
  "Biology": "bio",
  "Chemistry": "chem",
  "Physics": "phy",
  "Economics": "econ",
  "Geography": "geog",
  "History": "hist",
  "Chinese History": "chist",
  "Information and Communication Technology": "ict",
  "Business, Accounting and Financial Studies": "bafs",
  "Design and Applied Technology": "dat",
  "Health Management and Social Care": "hmsc",
  "Tourism and Hospitality Studies": "ths",
  "Chinese Literature": "clit",
  "Literature in English": "elit",
  "Technology and Living (Food Science and Technology)": "tl",
  "Visual Arts": "va",
  "Music": "music",
  "Physical Education": "pe",
  "Ethics and Religious Studies": "ers",
  "Integrated Science": "is",
  "Combined Science: Biology + Chemistry": "cs-bc",
  "Combined Science: Biology + Physics": "cs-bp",
  "Combined Science: Physics + Chemistry": "cs-pc",
  "French: Advanced Diploma of French Language Studies / Diploma of French Language Studies": "fr",
  "German: Goethe-Certificate": "de",
  "Japanese: Japanese-Language Proficiency Test": "jp",
  "Korean: Test of Proficiency in Korean II": "kr",
  "Spanish: Diploma of Spanish as a Foreign Language": "es",
  "Urdu: Urdu (International)": "ur",
};

// Create a reverse map for parsing
const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SUBJECT_MAP).map(([k, v]) => [v, k])
);

function encodeGrade(grade: string): string {
  // Convert 5** to 5s, 5* to 5s, so it's URL friendly without encoding
  if (grade === "5**") return "5ss";
  if (grade === "5*") return "5s";
  return grade.toLowerCase();
}

function decodeGrade(grade: string): string {
  if (grade === "5ss") return "5**";
  if (grade === "5s") return "5*";
  return grade.toUpperCase();
}

function sanitizeGrade(grade: unknown): string | undefined {
  if (typeof grade !== "string" || grade.length > MAX_GRADE_LENGTH) return undefined;
  const decoded = decodeGrade(grade.trim());
  return VALID_GRADES.has(decoded) ? decoded : undefined;
}

function sanitizeSubject(subject: unknown): string | undefined {
  if (typeof subject !== "string") return undefined;
  const trimmed = subject.trim();
  if (!trimmed || trimmed.length > MAX_SUBJECT_LENGTH) return undefined;
  return trimmed;
}

function sanitizeSelectedSubject(subject: unknown): string | undefined {
  const sanitized = sanitizeSubject(subject);
  return sanitized && VALID_SUBJECTS.has(sanitized) ? sanitized : undefined;
}

function sanitizePickedCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) return [];
  return codes
    .filter((code): code is string => typeof code === "string")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => PROGRAMME_CODE_PATTERN.test(code))
    .slice(0, MAX_PICKED_PROGRAMMES);
}

export function sanitizeGrades(rawGrades: unknown): StudentGrades {
  if (!rawGrades || typeof rawGrades !== "object" || Array.isArray(rawGrades)) return {};
  const grades: StudentGrades = {};
  for (const [rawSubject, rawGrade] of Object.entries(rawGrades)) {
    const subject = sanitizeSubject(rawSubject);
    if (subject && SLOT_SUBJECT_PATTERN.test(subject)) {
      const selectedSubject = sanitizeSelectedSubject(rawGrade);
      if (selectedSubject) grades[subject] = selectedSubject;
      continue;
    }
    const grade = sanitizeGrade(rawGrade);
    if (subject && grade) grades[subject] = grade;
  }
  return grades;
}

function stateToParams(grades: StudentGrades, pickedCodes: string[], sharing = false): URLSearchParams {
  const p = new URLSearchParams();

  // Add core and specific subjects
  for (const [subject, grade] of Object.entries(grades)) {
    if (!grade || subject.includes(":subject")) continue; // Skip slot mappings for hash

    const key = SUBJECT_MAP[subject] || subject;
    p.set(key, encodeGrade(grade));
  }

  if (pickedCodes.length > 0) {
    p.set("p", pickedCodes.join(","));
  }

  if (sharing) p.set("sharing", "true");
  return p;
}

export function writeHashState(grades: StudentGrades, pickedCodes: string[]) {
  const p = stateToParams(grades, pickedCodes);
  const newHash = p.toString();
  // Using replaceState to avoid cluttering browser history every time a grade changes
  window.history.replaceState(null, "", newHash ? `#${newHash}` : window.location.pathname + window.location.search);
}

export function buildShareUrl(grades: StudentGrades, pickedCodes: string[]): string {
  const p = stateToParams(grades, pickedCodes, true);
  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const hash = p.toString();
  return hash ? `${base}#${hash}` : base;
}

export function buildEditUrlFromCurrentHash(): string {
  const hash = window.location.hash.slice(1);
  const p = new URLSearchParams(hash);
  p.delete("sharing");
  const nextHash = p.toString();
  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  return nextHash ? `${base}#${nextHash}` : base;
}

export function readHashState(): HashState | null {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  if (hash.length > MAX_HASH_LENGTH) return null;
  
  try {
    // Check if it's the old bulky JSON hash
    if (hash.startsWith("%7B")) {
      const decoded = JSON.parse(decodeURIComponent(hash));
      return {
        grades: sanitizeGrades(decoded?.grades),
        pickedCodes: sanitizePickedCodes(decoded?.pickedCodes),
        sharing: decoded?.sharing === true
      };
    }
    
    // Parse the compact hash
    const p = new URLSearchParams(hash);
    const grades: StudentGrades = {};
    let pickedCodes: string[] = [];
    const sharing = p.get("sharing") === "true";
    
    let electiveCount = 1;
    
    for (const [key, val] of p.entries()) {
      if (key === "p") {
        pickedCodes = sanitizePickedCodes(val.split(","));
        continue;
      }
      if (key === "sharing") continue;
      
      const subject = sanitizeSubject(REVERSE_MAP[key] || key);
      const grade = sanitizeGrade(val);
      if (!subject || !grade) continue;
      grades[subject] = grade;
      
      // Try to intelligently assign to elective slots if it's not a core subject
      if (!["Chinese Language", "English Language", "Mathematics (Compulsory Part)", "Citizenship and Social Development", "Mathematics Extended Part (Module 1)", "Mathematics Extended Part (Module 2)", "Mathematics Extended Part (Module 1 or 2)"].includes(subject)) {
        if (electiveCount <= 4) {
           grades[`elective-${electiveCount}:subject`] = subject;
           electiveCount++;
        } else if (!grades["cat-c:subject"]) {
           grades["cat-c:subject"] = subject;
        }
      }
    }
    
    if (Object.keys(grades).length === 0 && pickedCodes.length === 0) return null;
    return { grades, pickedCodes, sharing };
  } catch (e) {
    console.error("Failed to parse hash", e);
    return null;
  }
}
