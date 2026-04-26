import { calculateScore, checkEligibility } from "./calculator";
import type { BenchmarkBand, BenchmarkComparison, BenchmarkKey, Programme, ProgrammeResult, StudentGrades } from "../types/jupas";

export type SortKey = "benchmark" | "code" | "institution" | "eligibility" | "score" | "lq" | "median" | "uq";

export type Filters = {
  query: string;
  institutions: string[];
  eligibleOnly: boolean;
  band: BenchmarkBand | "all";
};

export function buildProgrammeResult(programme: Programme, grades: StudentGrades): ProgrammeResult {
  const calculation = calculateScore(grades, programme, hasHistoricalScores(programme) ? "2025" : "2026");
  const eligibility = checkEligibility(grades, programme.min_requirements_2026, programme);
  const comparisons = buildComparisons(calculation.totalScore, programme);
  const band = getBenchmarkBand(calculation.totalScore, programme);
  return {
    programme,
    calculation,
    eligibility,
    comparisons,
    band,
    hasScoreData: comparisons.length > 0,
  };
}

export function filterResults(results: ProgrammeResult[], filters: Filters) {
  const query = filters.query.trim().toLowerCase();
  return results.filter((result) => {
    const programme = result.programme;
    if (filters.institutions.length > 0 && !filters.institutions.includes(programme.institution)) return false;
    if (filters.eligibleOnly && !result.eligibility.eligible) return false;
    if (filters.band !== "all" && result.band !== filters.band) return false;
    if (!query) return true;
    const haystack = [
      programme.jupas_code,
      programme.name_en,
      programme.name_zh || "",
      programme.institution,
      programme.faculty || "",
      programme.remarks || "",
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

export function sortResults(results: ProgrammeResult[], sortKey: SortKey, direction: "asc" | "desc") {
  const sorted = [...results].sort((a, b) => {
    const multiplier = direction === "asc" ? 1 : -1;
    if (sortKey === "benchmark") {
      const value = benchmarkRank(a) - benchmarkRank(b) || deltaFor(a, "median") - deltaFor(b, "median") || deltaFor(a, "lq") - deltaFor(b, "lq");
      return multiplier * value;
    }
    if (sortKey === "score") return multiplier * (a.calculation.totalScore - b.calculation.totalScore);
    if (sortKey === "eligibility") return multiplier * (Number(a.eligibility.eligible) - Number(b.eligibility.eligible));
    if (sortKey === "lq" || sortKey === "median" || sortKey === "uq") return multiplier * (deltaFor(a, sortKey) - deltaFor(b, sortKey));
    const left = sortKey === "code" ? a.programme.jupas_code : a.programme.institution;
    const right = sortKey === "code" ? b.programme.jupas_code : b.programme.institution;
    return multiplier * left.localeCompare(right);
  });
  return sorted;
}

export function buildComparisons(totalScore: number, programme: Programme): BenchmarkComparison[] {
  const labels: Record<BenchmarkKey, string> = { uq: "UQ", median: "Median", lq: "LQ", mean: "Mean" };
  return (["uq", "median", "lq", "mean"] as BenchmarkKey[]).flatMap((key) => {
    const score = programme.scores_2025?.[key];
    if (!score || !totalScore) return [];
    return [{
      key,
      label: labels[key],
      score,
      delta: totalScore - score,
      percent: ((totalScore - score) / score) * 100,
    }];
  });
}

export function getBenchmarkBand(totalScore: number, programme: Programme): BenchmarkBand {
  const scores = programme.scores_2025 || {};
  if (!totalScore || (!scores.uq && !scores.median && !scores.lq)) return "no-score";
  if (scores.uq && totalScore >= scores.uq) return "above-uq";
  if (scores.median && totalScore >= scores.median) return "above-median";
  if (scores.lq && totalScore >= scores.lq) return "above-lq";
  return "below-lq";
}

export function bandLabel(band: BenchmarkBand) {
  return {
    "above-uq": "Above UQ",
    "above-median": "Above median",
    "above-lq": "Above LQ",
    "below-lq": "Below LQ",
    "no-score": "No score data",
  }[band];
}

export function benchmarkRank(result: ProgrammeResult) {
  return {
    "above-uq": 4,
    "above-median": 3,
    "above-lq": 2,
    "below-lq": 1,
    "no-score": 0,
  }[result.band];
}

export function deltaFor(result: ProgrammeResult, key: BenchmarkKey) {
  return result.comparisons.find((comparison) => comparison.key === key)?.delta ?? Number.NEGATIVE_INFINITY;
}

export function formatDelta(value?: number) {
  if (value === undefined || value === Number.NEGATIVE_INFINITY) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function formatPercent(value?: number) {
  if (value === undefined || value === Number.NEGATIVE_INFINITY) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function hasHistoricalScores(programme: Programme) {
  const scores = programme.scores_2025 || {};
  return Boolean(scores.uq || scores.median || scores.lq || scores.mean);
}
