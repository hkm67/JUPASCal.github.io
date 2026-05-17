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
const CAT_C_SET = new Set<string>(CAT_C_SUBJECTS);

// Compressed-format prefix. Plain tight URLSearchParams hashes have no prefix
// and look like `chi=5**&eng=5*&p=1001,2002&...`. We pick whichever is shorter.
const COMPRESSED_PREFIX = "a=";

export type HashState = {
  grades: StudentGrades;
  pickedCodes: (string | null)[];
  sharing: boolean;
  showScores?: boolean;
};

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

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SUBJECT_MAP).map(([k, v]) => [v, k])
);

// Single-char grade encoding. `5**`/`5*` get bumped to `7`/`6` so the codes
// stay one URL-safe char without `*` (which some receivers re-encode).
const GRADE_TO_CHAR: Record<string, string> = {
  "5**": "7", "5*": "6", "5": "5", "4": "4", "3": "3", "2": "2", "1": "1",
  "A": "A", "B": "B", "C": "C", "D": "D", "E": "E", "U": "U",
};
const CHAR_TO_GRADE: Record<string, string> = Object.fromEntries(
  Object.entries(GRADE_TO_CHAR).map(([k, v]) => [v, k])
);

function sanitizeGrade(grade: unknown): string | undefined {
  if (typeof grade !== "string" || grade.length > MAX_GRADE_LENGTH) return undefined;
  const upper = grade.trim().toUpperCase();
  return VALID_GRADES.has(upper) ? upper : undefined;
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

function sanitizePickedCodes(codes: unknown): (string | null)[] {
  if (!Array.isArray(codes)) return [];
  const sanitized = codes
    .map((code) => {
      if (typeof code !== "string") return null;
      const trimmed = code.trim().toUpperCase();
      return PROGRAMME_CODE_PATTERN.test(trimmed) ? trimmed : null;
    })
    .slice(0, MAX_PICKED_PROGRAMMES);

  let lastNonNull = -1;
  for (let i = sanitized.length - 1; i >= 0; i--) {
    if (sanitized[i] !== null) {
      lastNonNull = i;
      break;
    }
  }
  return sanitized.slice(0, lastNonNull + 1);
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

// --- base64url helpers (no padding) ---

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- tight URLSearchParams-style wire ---

function buildTightHash(state: HashState): string {
  // We omit `elective-N:subject` / `cat-c:subject` entries from the wire; the
  // decoder reinfers them by Cat-C set membership + encounter order, matching
  // the legacy behavior. Saves ~5 chars per elective slot.
  const p = new URLSearchParams();
  for (const [subject, value] of Object.entries(state.grades)) {
    if (!value) continue;
    if (SLOT_SUBJECT_PATTERN.test(subject)) continue;
    const key = SUBJECT_MAP[subject] || subject;
    const gradeChar = GRADE_TO_CHAR[value] || value;
    p.set(key, gradeChar);
  }
  if (state.pickedCodes.length) {
    const trimmed = state.pickedCodes.map((c) => (c ? c.replace(/^JS/, "") : ""));
    while (trimmed.length && !trimmed[trimmed.length - 1]) trimmed.pop();
    if (trimmed.length) p.set("p", trimmed.join(","));
  }
  if (state.sharing) p.set("s", "1");
  if (state.showScores) p.set("v", "1");
  // URLSearchParams.toString() percent-encodes commas (`%2C`). Commas are
  // valid in URL fragments and survive round-tripping, so we restore them to
  // shave ~2 chars per pick. `,` would otherwise eat 3 chars (`%2C`).
  return p.toString().replace(/%2C/g, ",");
}

function parseHashState(hash: string): HashState | null {
  if (!hash || hash.length > MAX_HASH_LENGTH) return null;

  // Legacy: raw JSON in hash, URL-encoded.
  if (hash.startsWith("%7B")) {
    try {
      const decoded = JSON.parse(decodeURIComponent(hash));
      const state: HashState = {
        grades: sanitizeGrades(decoded?.grades),
        pickedCodes: sanitizePickedCodes(decoded?.pickedCodes),
        sharing: decoded?.sharing === true,
        showScores: decoded?.showScores === true,
      };
      if (Object.keys(state.grades).length === 0 && state.pickedCodes.length === 0) return null;
      return state;
    } catch {
      return null;
    }
  }

  // Both old URLSearchParams (e.g. `chi=5ss&p=JS1001,JS2002&sharing=true`) and
  // the new tight format share this parser. Differences are accepted leniently
  // — we coerce JS-prefixed/unprefixed codes, multi-char/single-char grades,
  // and explicit/inferred slot subjects.
  try {
    const p = new URLSearchParams(hash);
    const grades: StudentGrades = {};
    let pickedCodes: (string | null)[] = [];
    const sharing = p.get("s") === "1" || p.get("sharing") === "true";
    const showScores = p.get("v") === "1" || p.get("showscore") === "1";
    const nonCoreSubjects: string[] = [];

    const CORE_SUBJECT_NAMES = new Set([
      "Chinese Language",
      "English Language",
      "Mathematics (Compulsory Part)",
      "Citizenship and Social Development",
      "Mathematics Extended Part (Module 1)",
      "Mathematics Extended Part (Module 2)",
      "Mathematics Extended Part (Module 1 or 2)",
    ]);

    for (const [key, val] of p.entries()) {
      if (key === "p") {
        const codes = val.split(",").map((c) => {
          const trimmed = c.trim().toUpperCase();
          if (!trimmed) return null;
          return trimmed.startsWith("JS") ? trimmed : `JS${trimmed}`;
        });
        pickedCodes = sanitizePickedCodes(codes);
        continue;
      }
      if (key === "s" || key === "v" || key === "sharing" || key === "showscore") continue;

      const subject = sanitizeSubject(REVERSE_MAP[key] || key);
      if (!subject) continue;

      // Grade decoding: try single-char, then legacy `5ss`/`5s`, then raw.
      let rawGrade: string | undefined;
      if (CHAR_TO_GRADE[val]) rawGrade = CHAR_TO_GRADE[val];
      else if (val === "5ss") rawGrade = "5**";
      else if (val === "5s") rawGrade = "5*";
      else rawGrade = val;
      const grade = sanitizeGrade(rawGrade);
      if (!grade) continue;

      grades[subject] = grade;
      if (!CORE_SUBJECT_NAMES.has(subject)) nonCoreSubjects.push(subject);
    }

    // Reinfer slot subjects: Cat-C subjects go to cat-c:subject, the rest fill
    // elective-1..4 in encounter order.
    let electiveCount = 1;
    for (const subject of nonCoreSubjects) {
      if (CAT_C_SET.has(subject)) {
        if (!grades["cat-c:subject"]) grades["cat-c:subject"] = subject;
        continue;
      }
      if (electiveCount > 4) continue;
      const slot = `elective-${electiveCount}:subject`;
      if (!grades[slot]) {
        grades[slot] = subject;
        electiveCount++;
      }
    }

    if (Object.keys(grades).length === 0 && pickedCodes.length === 0) return null;
    return { grades, pickedCodes, sharing, showScores };
  } catch {
    return null;
  }
}

// --- compression pipeline ---

async function compress(input: string): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(input));
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

async function decompress(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(bytes as unknown as BufferSource);
  writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(buf);
}

async function encodeHash(state: HashState): Promise<string> {
  const tight = buildTightHash(state);
  if (!tight) return "";
  try {
    const compressed = COMPRESSED_PREFIX + bytesToBase64Url(await compress(tight));
    return compressed.length < tight.length ? compressed : tight;
  } catch {
    return tight;
  }
}

async function decodeHash(hash: string): Promise<HashState | null> {
  if (!hash) return null;
  if (hash.length > MAX_HASH_LENGTH) return null;
  if (hash.startsWith(COMPRESSED_PREFIX) && !hash.includes("&")) {
    try {
      const bytes = base64UrlToBytes(hash.slice(COMPRESSED_PREFIX.length));
      const tight = await decompress(bytes);
      return parseHashState(tight);
    } catch (e) {
      console.error("Failed to decode compressed hash", e);
      return null;
    }
  }
  return parseHashState(hash);
}

// --- module-level cache + sync read ---

let cachedState: HashState | null = null;
let cachedHash: string | null = null;

export async function preloadHashState(): Promise<HashState | null> {
  const hash = window.location.hash.slice(1);
  cachedHash = hash;
  cachedState = await decodeHash(hash);
  return cachedState;
}

export function readHashState(): HashState | null {
  const current = window.location.hash.slice(1);
  if (current !== cachedHash) {
    if (!current) {
      cachedHash = "";
      cachedState = null;
      return null;
    }
    // Plain tight URLSearchParams hashes decode synchronously. Compressed
    // hashes can't; fall back to the last cached value until the next preload
    // or write cycle hydrates the cache. In practice the compressed branch
    // here is unreachable because hash writes always go through scheduleWrite.
    if (!(current.startsWith(COMPRESSED_PREFIX) && !current.includes("&"))) {
      cachedHash = current;
      cachedState = parseHashState(current);
    }
  }
  return cachedState;
}

// --- writers ---
// Serialized async write — each call bumps a version counter so a rapid
// sequence of grade edits doesn't produce out-of-order URLs.

let writeVersion = 0;
let writeChain: Promise<void> = Promise.resolve();

function scheduleWrite(state: HashState | null) {
  const myVersion = ++writeVersion;
  writeChain = writeChain.then(async () => {
    if (myVersion !== writeVersion) return;
    let hash = "";
    if (state) {
      try {
        hash = await encodeHash(state);
      } catch (e) {
        console.error("Failed to encode hash", e);
        return;
      }
    }
    if (myVersion !== writeVersion) return;
    cachedHash = hash;
    cachedState = state;
    const url = hash ? `#${hash}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, "", url);
  });
}

export function writeHashState(grades: StudentGrades, pickedCodes: (string | null)[]) {
  const hasContent = Object.keys(grades).length > 0 || pickedCodes.some(Boolean);
  if (!hasContent) {
    scheduleWrite(null);
    return;
  }
  scheduleWrite({ grades, pickedCodes, sharing: false, showScores: false });
}

export async function buildShareUrl(
  grades: StudentGrades,
  pickedCodes: (string | null)[],
  showScores = false,
): Promise<string> {
  const hash = await encodeHash({ grades, pickedCodes, sharing: true, showScores });
  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  return hash ? `${base}#${hash}` : base;
}

export function setShowScoresInHash(showScores: boolean) {
  const current = cachedState;
  if (!current) return;
  scheduleWrite({ ...current, showScores });
}

export async function buildEditUrlFromCurrentHash(): Promise<string> {
  const current = cachedState;
  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  if (!current) return base;
  const hash = await encodeHash({ ...current, sharing: false, showScores: false });
  return hash ? `${base}#${hash}` : base;
}
