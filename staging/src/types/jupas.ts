export type Grade = "5**" | "5*" | "5" | "4" | "3" | "2" | "1" | "A" | "B" | "C" | "D" | "E" | "U" | "";

export type StudentGrades = Record<string, string>;

export type RequirementPool = {
  count: number;
  subjects: string[];
  grade: string;
  note?: string;
};

export type MinRequirements = {
  chi?: string;
  eng?: string;
  math?: string;
  csd?: string;
  elect1?: RequirementPool;
  elect2?: RequirementPool;
  conditional_remarks?: string;
};

export type BestOfPool = {
  count: number;
  subjects: string[];
  weight: number;
  [key: string]: unknown;
};

export type Constraint = {
  type: string;
  description?: string;
  subjects?: string[];
  count?: number;
  limit?: number;
  multiplier?: number;
  subject_count?: number;
  max_attainable_weighting?: number;
  bonus_percentage?: number;
  [key: string]: unknown;
};

export type Scores2025 = {
  median?: number | null;
  lq?: number | null;
  uq?: number | null;
  mean?: number | null;
  expected_score?: number | null;
  score_type?: "actual" | "estimated" | string;
};

export type ScoreConversionTable = {
  category_a?: Record<string, number>;
  category_c?: Record<string, number>;
};

export type OfferStatistic = {
  Year: number;
  Type: "Application" | "Offer" | string;
  School?: string;
  JUPAS?: string;
  Quota?: number;
  Total?: number;
  "Band A"?: number;
  "Band B"?: number;
  "Band C"?: number;
  "Band D"?: number;
  "Band E"?: number;
};

export type Programme = {
  jupas_code: string;
  name_en: string;
  name_zh?: string | null;
  institution: string;
  faculty?: string | null;
  formula_2025?: string | null;
  formula_2025_id?: string | null;
  formula_2026?: string | null;
  formula_2026_id?: string | null;
  subject_weights_2025?: Record<string, number>;
  subject_weights_2026?: Record<string, number>;
  best_of_weights_2025?: BestOfPool[];
  best_of_weights_2026?: BestOfPool[];
  min_requirements_2026: MinRequirements;
  calculation_constraints?: Constraint[];
  score_conversion_table: ScoreConversionTable;
  max_achievable_score?: number | null;
  scores_2025: Scores2025;
  score_grades_2025?: Record<string, Record<string, string> | null>;
  offer_statistics?: OfferStatistic[];
  quota?: number | null;
  remarks?: string | null;
};

export type CandidateScore = {
  subject: string;
  grade: string;
  basePoints: number;
  multiplier: number;
  weightedScore: number;
  isCompulsory: boolean;
  isBestOfPool: boolean;
  used: boolean;
  isBonus: boolean;
  bonusValue?: string;
};

export type CalculationResult = {
  totalScore: number;
  formula?: string | null;
  selected: CandidateScore[];
  allCandidates: CandidateScore[];
  score_type: string;
};

export type EligibilityDetail = {
  label: string;
  pass: boolean;
  got: string;
  need?: string;
  note?: string;
};

export type EligibilityResult = {
  eligible: boolean;
  details: EligibilityDetail[];
};

export type BenchmarkKey = "uq" | "median" | "lq" | "mean";

export type BenchmarkComparison = {
  key: BenchmarkKey;
  label: string;
  score: number;
  delta: number;
  percent: number;
};

export type BenchmarkBand = "above-uq" | "above-median" | "above-lq" | "below-lq" | "no-score";

export type ProgrammeResult = {
  programme: Programme;
  calculation: CalculationResult;
  eligibility: EligibilityResult;
  comparisons: BenchmarkComparison[];
  band: BenchmarkBand;
  hasScoreData: boolean;
};
