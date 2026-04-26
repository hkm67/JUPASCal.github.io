export const CORE_SUBJECTS = [
  "Chinese Language",
  "English Language",
  "Mathematics (Compulsory Part)",
  "Citizenship and Social Development",
];

export const M12_SUBJECT = "Mathematics Extended Part (Module 1 or 2)";

export const CAT_A_SUBJECTS = [
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
  "Tourism and Hospitality Studies",
  "Chinese Literature",
  "Literature in English",
  "Technology and Living (Food Science and Technology)",
  "Visual Arts",
  "Music",
  "Physical Education",
  "Ethics and Religious Studies",
  "Integrated Science",
  "Combined Science: Biology + Chemistry",
  "Combined Science: Biology + Physics",
  "Combined Science: Physics + Chemistry",
];

export const CAT_C_SUBJECTS = [
  "French: Advanced Diploma of French Language Studies / Diploma of French Language Studies",
  "German: Goethe-Certificate",
  "Japanese: Japanese-Language Proficiency Test",
  "Korean: Test of Proficiency in Korean II",
  "Spanish: Diploma of Spanish as a Foreign Language",
  "Urdu: Urdu (International)",
];

export const DSE_GRADES = ["", "5**", "5*", "5", "4", "3", "2", "1", "U"];
export const CSD_GRADES = ["", "A", "U"];
export const CAT_C_GRADES = ["", "A", "B", "C", "D", "E", "U"];

export function shortSubjectName(subject: string) {
  return subject
    .replace("Mathematics (Compulsory Part)", "Math")
    .replace("Mathematics Extended Part (Module 1 or 2)", "M1/M2")
    .replace("Mathematics Extended Part (Module 1)", "M1")
    .replace("Mathematics Extended Part (Module 2)", "M2")
    .replace("Citizenship and Social Development", "CSD")
    .replace("Business, Accounting and Financial Studies", "BAFS")
    .replace("Information and Communication Technology", "ICT");
}
