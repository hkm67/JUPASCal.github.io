import type { StudentGrades } from "../types/jupas";

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

export function writeHashState(grades: StudentGrades, pickedCodes: string[]) {
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
  
  const newHash = p.toString();
  // Using replaceState to avoid cluttering browser history every time a grade changes
  window.history.replaceState(null, "", newHash ? `#${newHash}` : window.location.pathname + window.location.search);
}

export function readHashState(): { grades: StudentGrades; pickedCodes: string[] } | null {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  
  try {
    // Check if it's the old bulky JSON hash
    if (hash.startsWith("%7B")) {
      const decoded = JSON.parse(decodeURIComponent(hash));
      return {
        grades: decoded.grades || {},
        pickedCodes: decoded.pickedCodes || []
      };
    }
    
    // Parse the compact hash
    const p = new URLSearchParams(hash);
    const grades: StudentGrades = {};
    let pickedCodes: string[] = [];
    
    let electiveCount = 1;
    
    for (const [key, val] of p.entries()) {
      if (key === "p") {
        pickedCodes = val.split(",");
        continue;
      }
      
      const subject = REVERSE_MAP[key] || key;
      const grade = decodeGrade(val);
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
    return { grades, pickedCodes };
  } catch (e) {
    console.error("Failed to parse hash", e);
    return null;
  }
}
