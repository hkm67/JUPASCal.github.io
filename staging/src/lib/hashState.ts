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

// Format-discriminating prefixes for the hash payload:
//   #b=…  → binary v1 (bit-packed, base64url) — primary writer output
//   #a=…  → deflate-raw compressed tight v2 (kept for backwards read compat)
//   else  → tight v2 URLSearchParams (`chi=7&p=1234,5678&s=1`) or pre-v2
//           legacy (`chi=5ss&p=JS1234,JS5678&sharing=true`) — both read by
//           parseHashState. New writes never produce these formats.
const BINARY_PREFIX = "b=";
const COMPRESSED_PREFIX = "a=";

// Binary format constants. Layout (v1):
//   [4 bits version=1]
//   [5 bits subject count N] then N × ([6 bits subject ID][4 bits grade ID])
//   [5 bits pick count M]    then M × ([1 bit present][14 bits JS code])
//   [1 bit sharing][1 bit showScores]
// SUBJECT_ID_LIST is APPEND-ONLY: the index is the binary ID, so reordering
// or deleting entries would break every previously-shared URL. New subjects
// always go at the end.
const BINARY_VERSION = 1;
const SUBJECT_ID_LIST: readonly string[] = [
  "Chinese Language",
  "English Language",
  "Mathematics (Compulsory Part)",
  "Citizenship and Social Development",
  "Mathematics Extended Part (Module 1 or 2)",
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
  "French: Advanced Diploma of French Language Studies / Diploma of French Language Studies",
  "German: Goethe-Certificate",
  "Japanese: Japanese-Language Proficiency Test",
  "Korean: Test of Proficiency in Korean II",
  "Spanish: Diploma of Spanish as a Foreign Language",
  "Urdu: Urdu (International)",
];
const SUBJECT_TO_ID: Record<string, number> = {};
SUBJECT_ID_LIST.forEach((s, i) => { SUBJECT_TO_ID[s] = i; });

const GRADE_TO_ID: Record<string, number> = {
  "5**": 0, "5*": 1, "5": 2, "4": 3, "3": 4, "2": 5, "1": 6, "U": 7,
  "A": 8, "B": 9, "C": 10, "D": 11, "E": 12,
};
const ID_TO_GRADE: Record<number, string> = {};
for (const [g, i] of Object.entries(GRADE_TO_ID)) ID_TO_GRADE[i] = g;

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

// --- bit packer / unpacker for the binary v1 format ---

class BitWriter {
  private bytes: number[] = [];
  private cur = 0;
  private bitsInCur = 0;
  write(value: number, bits: number): void {
    for (let i = bits - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | ((value >> i) & 1);
      this.bitsInCur++;
      if (this.bitsInCur === 8) {
        this.bytes.push(this.cur);
        this.cur = 0;
        this.bitsInCur = 0;
      }
    }
  }
  finish(): Uint8Array {
    if (this.bitsInCur > 0) {
      this.bytes.push(this.cur << (8 - this.bitsInCur));
    }
    return new Uint8Array(this.bytes);
  }
}

class BitReader {
  private pos = 0;
  constructor(private readonly bytes: Uint8Array) {}
  read(bits: number): number {
    let value = 0;
    for (let i = 0; i < bits; i++) {
      const byteIdx = this.pos >> 3;
      const bitIdx = 7 - (this.pos & 7);
      const bit = byteIdx < this.bytes.length ? (this.bytes[byteIdx] >> bitIdx) & 1 : 0;
      value = (value << 1) | bit;
      this.pos++;
    }
    return value;
  }
}

function encodeBinary(state: HashState): string {
  const w = new BitWriter();
  w.write(BINARY_VERSION, 4);

  // Subjects with grades. Skip slot-mapping entries (elective-N:subject /
  // cat-c:subject) — they're recoverable on read.
  const subjects: Array<[number, number]> = [];
  for (const [subject, grade] of Object.entries(state.grades)) {
    if (subject.includes(":subject")) continue;
    const sid = SUBJECT_TO_ID[subject];
    const gid = GRADE_TO_ID[grade];
    if (sid === undefined || gid === undefined) continue;
    subjects.push([sid, gid]);
  }
  // 5 bits = max 31 entries; SUBJECT_ID_LIST has 36 so cap at 31. In practice
  // a candidate has 4 cores + up to 4 electives + 1 M1/M2 + 1 Cat-C ≈ 10.
  if (subjects.length > 31) subjects.length = 31;
  w.write(subjects.length, 5);
  for (const [sid, gid] of subjects) {
    w.write(sid, 6);
    w.write(gid, 4);
  }

  // Picks — preserve sparse-array order with a present bit.
  const picks = state.pickedCodes.slice(0, MAX_PICKED_PROGRAMMES);
  w.write(picks.length, 5);
  for (const code of picks) {
    if (code && PROGRAMME_CODE_PATTERN.test(code)) {
      w.write(1, 1);
      w.write(parseInt(code.slice(2), 10) & 0x3FFF, 14);
    } else {
      w.write(0, 15);
    }
  }

  w.write(state.sharing ? 1 : 0, 1);
  w.write(state.showScores ? 1 : 0, 1);

  return BINARY_PREFIX + bytesToBase64Url(w.finish());
}

function decodeBinary(payload: string): HashState | null {
  try {
    const bytes = base64UrlToBytes(payload);
    if (bytes.length === 0) return null;
    const r = new BitReader(bytes);
    const version = r.read(4);
    if (version !== BINARY_VERSION) return null;

    const rawGrades: Record<string, unknown> = {};
    const n = r.read(5);
    for (let i = 0; i < n; i++) {
      const sid = r.read(6);
      const gid = r.read(4);
      const subject = SUBJECT_ID_LIST[sid];
      const grade = ID_TO_GRADE[gid];
      if (subject && grade) rawGrades[subject] = grade;
    }
    const grades = reassignElectiveSlots(sanitizeGrades(rawGrades));

    const m = r.read(5);
    const rawPicks: (string | null)[] = [];
    for (let i = 0; i < m; i++) {
      const present = r.read(1);
      const code = r.read(14);
      rawPicks.push(present === 1 && code > 0 ? `JS${String(code).padStart(4, "0")}` : null);
    }
    const pickedCodes = sanitizePickedCodes(rawPicks);

    const sharing = r.read(1) === 1;
    const showScores = r.read(1) === 1;

    if (Object.keys(grades).length === 0 && pickedCodes.length === 0) return null;
    return { grades, pickedCodes, sharing, showScores };
  } catch (e) {
    console.error("Failed to decode binary hash", e);
    return null;
  }
}

// Reassign elective-1..4 / cat-c slot subjects from the order non-core
// subjects appear in `grades`. Used by both binary and parseHashState
// decode paths.
function reassignElectiveSlots(grades: StudentGrades): StudentGrades {
  const CORE = new Set([
    "Chinese Language",
    "English Language",
    "Mathematics (Compulsory Part)",
    "Citizenship and Social Development",
    "Mathematics Extended Part (Module 1)",
    "Mathematics Extended Part (Module 2)",
    "Mathematics Extended Part (Module 1 or 2)",
  ]);
  let electiveCount = 1;
  for (const subject of Object.keys(grades)) {
    if (CORE.has(subject) || subject.includes(":subject")) continue;
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
  return grades;
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
  // Binary is the primary format — wins on length for any state with more
  // than 1-2 subjects, and is uniform/opaque. Tight stays as the fallback
  // for the degenerate case where binary would somehow be larger.
  const tight = buildTightHash(state);
  const binary = encodeBinary(state);
  if (!tight && !binary.startsWith(BINARY_PREFIX + "A")) return binary || "";
  if (!tight) return binary;
  return binary.length <= tight.length ? binary : tight;
}

async function decodeHash(hash: string): Promise<HashState | null> {
  if (!hash) return null;
  if (hash.length > MAX_HASH_LENGTH) return null;
  if (hash.startsWith(BINARY_PREFIX) && !hash.includes("&")) {
    return decodeBinary(hash.slice(BINARY_PREFIX.length));
  }
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
    // Binary v1 (#b=…) and plain tight URLSearchParams hashes both decode
    // synchronously. Compressed (#a=…) needs DecompressionStream so it can't;
    // for that case we fall back to the last cached value until the next
    // preload or write hydrates the cache. In practice the compressed branch
    // is unreachable because new writes never emit it.
    if (current.startsWith(BINARY_PREFIX) && !current.includes("&")) {
      cachedHash = current;
      cachedState = decodeBinary(current.slice(BINARY_PREFIX.length));
    } else if (!(current.startsWith(COMPRESSED_PREFIX) && !current.includes("&"))) {
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
