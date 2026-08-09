/**
 * Deterministic ML v2 mock provider.
 *
 * One generated customer population per run; every aggregate
 * (summary KPIs, matrix, top priority) is DERIVED from those rows with the
 * same formulas the real prediction runner will use
 * (docs/ML-V2-OUTPUT-CONTRACT.md §5), so numbers agree across pages.
 * Served by lib/mlApi.ts while NEXT_PUBLIC_ML_USE_MOCK === "1".
 */

import type { PredictDataSource, PredictImportDone } from "@/lib/api";
import type {
  ChurnFactor,
  LifecycleStage,
  ModelPerfEntry,
  MonthlyUsagePoint,
  OutputsPage,
  OutputsQuery,
  PaymentEvent,
  PredictionOutput,
  PredictionRun,
  ProfileSnapshot,
  RiskLevel,
  RunInsight,
  RunSummary,
  TrainingRun,
  UrgencyLevel,
  ValueTier,
} from "@/lib/ml-api";
import { TOP_PRIORITY_LIMIT } from "@/lib/ml-api";

// ── Seeded PRNG (mulberry32) — stable across reloads ───────────

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// ── Thresholds / config (mirror of OUTPUT-CONTRACT §5) ─────────

const XLSX_EXTENSION_RE = /\.xlsx$/i;
const RISK_THRESHOLDS = { critical: 0.85, high: 0.6, medium: 0.3 };
const MODEL_VERSIONS = {
  churn: "churn_v3",
  clv: "clv_v2",
  credit: "credit_v2",
};

function riskLevel(p: number): RiskLevel {
  if (p >= RISK_THRESHOLDS.critical) {
    return "critical";
  }
  if (p >= RISK_THRESHOLDS.high) {
    return "high";
  }
  if (p >= RISK_THRESHOLDS.medium) {
    return "medium";
  }
  return "low";
}

function urgencyLevel(days: number | null): UrgencyLevel | null {
  if (days === null) {
    return null;
  }
  if (days <= 14) {
    return "critical";
  }
  if (days <= 30) {
    return "warning";
  }
  if (days <= 90) {
    return "monitor";
  }
  return "stable";
}

// ── Runs ────────────────────────────────────────────────────────

const BASE_RUNS: PredictionRun[] = [
  {
    created_at: "2026-06-02T03:10:00+07:00",
    created_by: "aphisit",
    created_by_name: "aphisit",
    cutoff_date: "2026-06-01",
    error_message: null,
    finished_at: "2026-06-02T03:14:21+07:00",
    id: "run-2026-06",
    name: "June 2026 — monthly scoring",
    predict_source_id: "psrc-2026-06",
    predict_source_name: "predict-export-2026-06",
    progress: null,
    status: "completed",
    total_customers: 1284,
  },
  {
    created_at: "2026-05-02T02:55:00+07:00",
    created_by: "aphisit",
    created_by_name: "aphisit",
    cutoff_date: "2026-05-01",
    error_message: null,
    finished_at: "2026-05-02T02:59:03+07:00",
    id: "run-2026-05",
    name: "May 2026 — monthly scoring",
    predict_source_id: "psrc-2026-05",
    predict_source_name: "predict-export-2026-05",
    progress: null,
    status: "completed",
    total_customers: 1241,
  },
  {
    created_at: "2026-04-03T10:02:00+07:00",
    created_by: "aphisit",
    created_by_name: "aphisit",
    cutoff_date: "2026-04-01",
    error_message:
      "Gate 2 failed: predict_clean_usage has 213 rows with invalid channel",
    finished_at: null,
    id: "run-2026-04-fail",
    name: "April 2026 — rerun test",
    predict_source_id: "psrc-2026-04",
    predict_source_name: "predict-export-2026-04",
    progress: null,
    status: "failed",
    total_customers: null,
  },
];

const SOURCE_MANIFEST = {
  clean: {
    customers: 1284,
    payments: 6411,
    usage: 37_409,
  },
  raw: {
    backend_payment: 6420,
    email_usage_api: 4330,
    email_usage_bc: 5128,
    email_usage_otp: 2984,
    sms_usage_api: 7421,
    sms_usage_bc: 9384,
    sms_usage_otp: 8162,
    users_user_profile: 1284,
  },
  skipped: {
    customers_no_acc_id: 0,
    payments_no_acc_id: 6,
    payments_no_date: 3,
    usage_no_acc_id: 0,
  },
  warnings: [],
};

const BASE_PREDICT_SOURCES: PredictDataSource[] = [
  {
    clean_manifest: SOURCE_MANIFEST,
    cleaned_at: "2026-06-02T03:07:00+07:00",
    client_label: "1Moby demo",
    created_at: "2026-06-02T03:05:00+07:00",
    created_by: "demo",
    created_by_name: "aphisit",
    error_message: null,
    file_checksum_sha256: "demo-psrc-2026-06",
    file_size_bytes: 2_840_112,
    id: "psrc-2026-06",
    import_status: "ready",
    imported_at: "2026-06-02T03:05:00+07:00",
    imported_by: "demo",
    importer_email: null,
    importer_name: "aphisit",
    name: "predict-export-2026-06",
    notes: "Demo source generated from ML v2 output contract",
    original_filename: "predict-export-2026-06.xlsx",
    sheet_manifest: SOURCE_MANIFEST.raw,
  },
  {
    clean_manifest: SOURCE_MANIFEST,
    cleaned_at: "2026-05-02T02:51:00+07:00",
    client_label: "1Moby demo",
    created_at: "2026-05-02T02:49:00+07:00",
    created_by: "demo",
    created_by_name: "aphisit",
    error_message: null,
    file_checksum_sha256: "demo-psrc-2026-05",
    file_size_bytes: 2_716_448,
    id: "psrc-2026-05",
    import_status: "ready",
    imported_at: "2026-05-02T02:49:00+07:00",
    imported_by: "demo",
    importer_email: null,
    importer_name: "aphisit",
    name: "predict-export-2026-05",
    notes: "Demo source generated from ML v2 output contract",
    original_filename: "predict-export-2026-05.xlsx",
    sheet_manifest: SOURCE_MANIFEST.raw,
  },
];

// Session-local additions from mockCreatePredictionRun (not persisted).
const sessionRuns: PredictionRun[] = [];
const baseRunOverrides = new Map<string, PredictionRun>();
const deletedRunIds = new Set<string>();
const sessionSources: PredictDataSource[] = [];

export function mockPredictDataSources(): PredictDataSource[] {
  return [...sessionSources, ...BASE_PREDICT_SOURCES];
}

export function mockPredictDataSource(id: string): PredictDataSource {
  const source = mockPredictDataSources().find((s) => s.id === id);
  if (!source) {
    throw new Error("Predict data source not found");
  }
  return source;
}

export function mockUploadPredictDataFile(
  file: File,
  name?: string,
  clientLabel?: string,
  notes?: string
): PredictImportDone {
  const sourceId = `psrc-local-${sessionSources.length + 1}`;
  const source: PredictDataSource = {
    clean_manifest: SOURCE_MANIFEST,
    cleaned_at: new Date().toISOString(),
    client_label: clientLabel?.trim() || null,
    created_at: new Date().toISOString(),
    created_by: "demo",
    created_by_name: "you",
    error_message: null,
    file_checksum_sha256: `demo-${sourceId}`,
    file_size_bytes: file.size,
    id: sourceId,
    import_status: "ready",
    imported_at: new Date().toISOString(),
    imported_by: "demo",
    importer_email: null,
    importer_name: "you",
    name: name?.trim() || file.name.replace(XLSX_EXTENSION_RE, ""),
    notes:
      notes?.trim() || "Demo import; no file was sent to the prediction API",
    original_filename: file.name,
    sheet_manifest: SOURCE_MANIFEST.raw,
  };
  sessionSources.unshift(source);
  return {
    clean_manifest: SOURCE_MANIFEST,
    file_checksum_sha256: source.file_checksum_sha256,
    import_status: source.import_status,
    sheet_manifest: SOURCE_MANIFEST.raw,
    source_id: source.id,
  };
}

export function mockPredictionRuns(): PredictionRun[] {
  const baseRuns = BASE_RUNS.map(
    (run) => baseRunOverrides.get(run.id) ?? run
  ).filter((run) => !deletedRunIds.has(run.id));
  return [
    ...sessionRuns.filter((run) => !deletedRunIds.has(run.id)),
    ...baseRuns,
  ];
}

export function mockCreatePredictionRun(input: {
  predict_source_id: string;
  name: string;
  cutoff_date?: string;
}): PredictionRun {
  const source = mockPredictDataSources().find(
    (s) => s.id === input.predict_source_id
  );
  const cutoffDate =
    input.cutoff_date ??
    mockPredictSuggestedCutoff(input.predict_source_id).suggested_cutoff;
  const run: PredictionRun = {
    created_at: new Date().toISOString(),
    created_by: "you",
    created_by_name: "you",
    cutoff_date: cutoffDate,
    error_message: null,
    finished_at: null,
    id: `run-local-${sessionRuns.length + 1}`,
    name: input.name,
    predict_source_id: input.predict_source_id,
    predict_source_name: source?.name ?? input.predict_source_id,
    progress: { pct: 35, step: "Building features" },
    status: "in_progress",
    total_customers: null,
  };
  sessionRuns.unshift(run);
  // Demo: complete the run after a short delay.
  setTimeout(() => {
    run.status = "completed";
    run.progress = null;
    run.total_customers = 1284;
    run.finished_at = new Date().toISOString();
  }, 6000);
  return run;
}

/** Same shape as GET /predict-data-sources/:id/suggested-cutoff. */
export function mockPredictSuggestedCutoff(_sourceId: string): {
  suggested_cutoff: string;
  latest_data_date: string;
} {
  const latest = new Date();
  latest.setDate(latest.getDate() - 1); // simulate data through yesterday
  const cutoff = new Date(latest);
  cutoff.setDate(cutoff.getDate() + 1); // cutoff = 1 day after latest data = today
  return {
    latest_data_date: latest.toISOString().slice(0, 10),
    suggested_cutoff: cutoff.toISOString().slice(0, 10),
  };
}

/** Same shape as GET /train-data-sources/:id/suggested-cutoff (Gate 3). */
export function mockTrainSuggestedCutoff(_sourceId: string): {
  suggested_cutoff: string;
  latest_data_date: string;
  horizon_days: number;
} {
  const horizonDays = 180;
  const latest = new Date();
  const cutoff = new Date(latest);
  cutoff.setDate(cutoff.getDate() - horizonDays);
  return {
    horizon_days: horizonDays,
    latest_data_date: latest.toISOString().slice(0, 10),
    suggested_cutoff: cutoff.toISOString().slice(0, 10),
  };
}

export function mockDeletePredictionRun(id: string): void {
  const i = sessionRuns.findIndex((r) => r.id === id);
  if (i >= 0) {
    sessionRuns.splice(i, 1);
  } else {
    deletedRunIds.add(id);
    baseRunOverrides.delete(id);
  }
  populationCache.delete(id);
}

export function mockRetryPredictionRun(id: string): PredictionRun {
  const run = mockPredictionRuns().find((r) => r.id === id);
  if (!run) {
    throw new Error("Run not found");
  }
  const rerun: PredictionRun = {
    ...run,
    error_message: null,
    finished_at: null,
    progress: { pct: 10, step: "Re-running gates" },
    status: "in_progress",
  };
  const sessionIndex = sessionRuns.findIndex((r) => r.id === id);
  if (sessionIndex >= 0) {
    sessionRuns[sessionIndex] = rerun;
  } else {
    baseRunOverrides.set(id, rerun);
  }
  populationCache.delete(id);
  setTimeout(() => {
    rerun.status = "completed";
    rerun.progress = null;
    rerun.total_customers = 1284;
    rerun.finished_at = new Date().toISOString();
  }, 6000);
  return rerun;
}

// ── Customer population (per run, cached) ──────────────────────

const POPULATION = 1284;
const FEATURE_POOL: { feature: string; label: string }[] = [
  { feature: "days_since_last_usage", label: "ไม่มียอดใช้งานล่าสุด" },
  { feature: "usage_decay_ratio", label: "ยอดใช้งาน 90 วันหดตัว" },
  { feature: "payment_overdue_ratio", label: "เลยรอบจ่ายปกติ" },
  { feature: "payment_count_180d", label: "จำนวนการจ่าย 180 วัน" },
  { feature: "usage_consistency_ratio", label: "ความสม่ำเสมอการใช้งาน" },
  { feature: "total_revenue_180d", label: "รายได้ 180 วันล่าสุด" },
  { feature: "customer_age_days", label: "อายุลูกค้า" },
];

function runSeed(runId: string): number {
  let h = 2_166_136_261;
  for (const c of runId) {
    h = Math.imul(h ^ c.charCodeAt(0), 16_777_619);
  }
  return h >>> 0;
}

function buildCustomer(
  runId: string,
  cutoff: string,
  accId: number
): PredictionOutput {
  const r = rng(runSeed(runId) ^ (accId * 2_654_435_761));
  const cutoffDate = new Date(cutoff);

  // lifecycle mix ~ Paid 40% / Free 26% / Churned 19.5% / Ghost 14.5%
  const roll = r();
  const stage: LifecycleStage =
    roll < 0.4
      ? "Active Paid"
      : roll < 0.66
        ? "Active Free"
        : roll < 0.855
          ? "Churned"
          : "Ghost";
  const everPaid =
    stage === "Active Paid" || (stage === "Churned" && r() < 0.55);
  const subStage =
    stage === "Churned" ? (everPaid ? "Churned Paid" : "Churned Free") : stage;

  const isActive = stage === "Active Paid" || stage === "Active Free";
  const hasHistory = stage !== "Ghost";

  // descriptive facts
  const ageDays = Math.floor(120 + r() * 2400);
  const lastActivity = hasHistory
    ? isActive
      ? Math.floor(r() * 60)
      : Math.floor(181 + r() * 360)
    : null;
  const nPurchases = everPaid ? Math.floor(1 + r() * 24) : 0;
  const avgTicket = everPaid
    ? Math.round((800 + r() * 9000) * 100) / 100
    : null;
  const totalRevenue =
    everPaid && avgTicket ? Math.round(nPurchases * avgTicket * 100) / 100 : 0;
  const usageTrendRoll = r();
  const usageTrend = hasHistory
    ? usageTrendRoll < 0.25
      ? "increasing"
      : usageTrendRoll < 0.6
        ? "stable"
        : "declining"
    : "no_usage";

  // churn model — Active Paid only
  let churnP: number | null = null;
  let factors: ChurnFactor[] | null = null;
  if (stage === "Active Paid") {
    const base =
      usageTrend === "declining" ? 0.45 : usageTrend === "stable" ? 0.22 : 0.1;
    churnP = Math.min(0.98, Math.max(0.02, base + (r() - 0.35) * 0.55));
    churnP = Math.round(churnP * 10_000) / 10_000;
    const nf = 5;
    const shuffled = [...FEATURE_POOL].sort(() => r() - 0.5).slice(0, nf);
    factors = shuffled
      .map((f, i) => ({
        direction: (i < 2 ? churnP! >= 0.5 : r() < 0.5)
          ? ("up" as const)
          : ("down" as const),
        feature: f.feature,
        impact: Math.round((0.3 - i * 0.05 + r() * 0.05) * 1000) / 1000,
        value: Math.round(r() * 120),
      }))
      .sort((a, b) => b.impact - a.impact);
  }

  // clv model — active only
  let clv: number | null = null;
  let pAlive: number | null = null;
  if (isActive) {
    const scale =
      stage === "Active Paid"
        ? totalRevenue / Math.max(ageDays / 180, 1)
        : r() * 1500;
    clv = Math.round(Math.max(0, scale * (0.4 + r() * 1.4)) * 100) / 100;
    pAlive =
      Math.round((isActive ? 0.55 + r() * 0.44 : r() * 0.4) * 10_000) / 10_000;
  }

  // credit model — has history
  let credit30: number | null = null;
  let credit90: number | null = null;
  let interval: PredictionOutput["credit_forecast_interval"] = null;
  let daysUntilTopup: number | null = null;
  const creditSms = Math.round(r() * 60_000);
  const creditEmail = Math.round(r() * 30_000);
  if (hasHistory && isActive) {
    credit30 = Math.round(r() * 45_000);
    credit90 = Math.round(credit30 * (2.4 + r() * 1.2));
    interval = {
      p10_30d: Math.round(credit30 * 0.55),
      p10_90d: Math.round(credit90 * 0.5),
      p90_30d: Math.round(credit30 * 1.65),
      p90_90d: Math.round(credit90 * 1.7),
    };
    const dailyBurn = credit30 / 30;
    daysUntilTopup =
      dailyBurn > 0
        ? Math.min(365, Math.floor((creditSms + creditEmail) / dailyBurn))
        : null;
  }
  const urgency = isActive ? urgencyLevel(daysUntilTopup) : null;

  // derived business (contract §5)
  const revenueAtRisk =
    churnP !== null && clv !== null
      ? Math.round(churnP * clv * 100) / 100
      : null;

  const snapshot: ProfileSnapshot = {
    api_usage_share: 0.35,
    bc_usage_share: 0.4,
    credit_email: creditEmail,
    credit_sms: creditSms,
    customer_age_days: ageDays,
    email_usage_share: 0.45,
    expire_email: new Date(
      cutoffDate.getTime() + Math.floor(r() * 300) * 86_400_000
    )
      .toISOString()
      .slice(0, 10),
    expire_sms: new Date(
      cutoffDate.getTime() + Math.floor(r() * 300) * 86_400_000
    )
      .toISOString()
      .slice(0, 10),
    join_date: new Date(cutoffDate.getTime() - ageDays * 86_400_000)
      .toISOString()
      .slice(0, 10),
    last_access:
      lastActivity === null
        ? null
        : new Date(
            cutoffDate.getTime() - lastActivity * 86_400_000
          ).toISOString(),
    last_send:
      lastActivity === null
        ? null
        : new Date(
            cutoffDate.getTime() - (lastActivity + 2) * 86_400_000
          ).toISOString(),
    otp_usage_share: 0.25,
    sms_usage_share: 0.55,
    status_email: r() < 0.7 ? "active" : "inactive",
    status_sms: r() < 0.8 ? "active" : "suspended",
    usage_total_180d: hasHistory ? Math.round(r() * 250_000) : 0,
  };

  const notEligible = (reason: string) => ({
    eligible: false,
    reason,
    status: "not_eligible" as const,
  });
  const predicted = {
    eligible: true,
    reason: null,
    status: "predicted" as const,
  };

  const eligibility = {
    churn:
      stage === "Active Paid"
        ? predicted
        : stage === "Active Free"
          ? notEligible("ลูกค้าไม่เคยจ่ายเงิน — ไม่เข้านิยาม churn")
          : stage === "Churned"
            ? notEligible("churn ไปแล้ว (สถานะที่เกิดขึ้นจริง)")
            : notEligible("ไม่มีประวัติการใช้งาน"),
    clv: isActive
      ? predicted
      : notEligible("ลูกค้าไม่ active ใน 180 วันก่อน cutoff"),
    credit:
      isActive && hasHistory
        ? predicted
        : notEligible("ไม่มีประวัติการใช้งานเพียงพอ"),
  };

  return {
    acc_id: accId,
    ai_explanation: null,
    ai_status: "not_requested",
    avg_transaction_value: avgTicket,
    churn_factors: factors,
    churn_probability: churnP,
    churn_risk_level: churnP === null ? null : riskLevel(churnP),
    credit_forecast_interval: interval,
    credit_urgency_level: urgency,
    customer_value_tier: "none", // assigned after population percentiles below
    days_since_last_activity: lastActivity,
    estimated_days_until_topup: daysUntilTopup,
    ever_paid: everPaid,
    lifecycle_stage: stage,
    model_eligibility: eligibility,
    model_versions: MODEL_VERSIONS,
    n_purchases: nPurchases,
    needs_review: false,
    output_status: stage === "Active Paid" ? "predicted" : "partial",
    p_alive: pAlive,
    predicted_clv_6m: clv,
    predicted_credit_usage_30d: credit30,
    predicted_credit_usage_90d: credit90,
    prediction_run_id: runId,
    priority_rank: null,
    priority_score: 0, // assigned below
    profile_snapshot: snapshot,
    revenue_at_risk: revenueAtRisk,
    segment: null,
    sub_stage: subStage,
    total_revenue: totalRevenue,
    usage_trend: usageTrend,
  };
}

const SEGMENT_ORDER = [
  "High-Value At-Risk",
  "Mid-Value At-Risk",
  "High-Value Stable",
  "Emerging",
  "Stable",
  "Low-Value Watch",
  "Low-Value At-Risk",
  "Lapsed",
  "Dormant",
  "Ghost",
] as const;
const RETENTION_SEGMENTS = new Set([
  "High-Value At-Risk",
  "Mid-Value At-Risk",
  "Low-Value At-Risk",
  "Low-Value Watch",
]);

function assignDerived(rows: PredictionOutput[]): void {
  // value tier: percentile of CLV among active (contract §3.5)
  const active = rows.filter(
    (c) => c.predicted_clv_6m !== null && c.predicted_clv_6m > 0
  );
  const sorted = [...active].sort(
    (a, b) => (b.predicted_clv_6m ?? 0) - (a.predicted_clv_6m ?? 0)
  );
  sorted.forEach((c, i) => {
    const pct = i / Math.max(sorted.length - 1, 1);
    c.customer_value_tier = pct < 0.1 ? "high" : pct < 0.5 ? "mid" : "low";
  });

  // priority score: rank by expected money at risk (revenue_at_risk = churn ×
  // CLV); priority_score is a log rescale of it to 0..100 (contract §5.2). No
  // text reason — the number is the only priority signal; the AI explanation
  // produces any human-readable "why".
  const vars = rows.map((c) => Math.max(0, c.revenue_at_risk ?? 0));
  const logged = vars.map((v) => Math.log1p(v));
  const lo = Math.min(...logged);
  const hi = Math.max(...logged);
  rows.forEach((c, i) => {
    c.priority_score =
      hi - lo < 1e-9
        ? 0
        : Math.round(((100 * (logged[i] - lo)) / (hi - lo)) * 100) / 100;
  });

  // segment: mirrors runner.py _apply_segments() — first-match rules
  rows.forEach((c) => {
    const stage = c.lifecycle_stage;
    const tier = c.customer_value_tier;
    const risk = c.churn_risk_level;
    const pAlive = c.p_alive;
    const valuable = tier === "high" || tier === "mid";
    const atRisk =
      risk === "high" ||
      risk === "critical" ||
      (pAlive !== null && pAlive < 0.2);
    const watch =
      !atRisk && (risk === "medium" || (pAlive !== null && pAlive < 0.5));
    const growing = c.usage_trend === "increasing";

    if (stage === "Ghost") {
      c.segment = "Ghost";
    } else if (stage === "Churned" && c.sub_stage === "Churned Paid") {
      c.segment = "Lapsed";
    } else if (stage === "Churned") {
      c.segment = "Dormant";
    } else if (valuable && atRisk) {
      c.segment = "High-Value At-Risk";
    } else if (valuable && watch) {
      c.segment = "Mid-Value At-Risk";
    } else if (valuable) {
      c.segment = "High-Value Stable";
    } else if (atRisk) {
      c.segment = "Low-Value At-Risk";
    } else if (watch) {
      c.segment = "Low-Value Watch";
    } else if (growing) {
      c.segment = "Emerging";
    } else {
      c.segment = "Stable";
    }
  });

  // priority_rank: global rank by (segment order, -money) where money =
  // revenue_at_risk for RETENTION segments, else predicted_clv_6m
  const ranked = [...rows].sort((a, b) => {
    const segA = SEGMENT_ORDER.indexOf(
      (a.segment ?? "Maintain") as (typeof SEGMENT_ORDER)[number]
    );
    const segB = SEGMENT_ORDER.indexOf(
      (b.segment ?? "Maintain") as (typeof SEGMENT_ORDER)[number]
    );
    if (segA !== segB) {
      return segA - segB;
    }
    const moneyA = RETENTION_SEGMENTS.has(a.segment ?? "")
      ? (a.revenue_at_risk ?? 0)
      : (a.predicted_clv_6m ?? 0);
    const moneyB = RETENTION_SEGMENTS.has(b.segment ?? "")
      ? (b.revenue_at_risk ?? 0)
      : (b.predicted_clv_6m ?? 0);
    return moneyB - moneyA;
  });
  ranked.forEach((c, i) => {
    c.priority_rank = i + 1;
  });
}

const populationCache = new Map<string, PredictionOutput[]>();

function population(runId: string): PredictionOutput[] {
  const cached = populationCache.get(runId);
  if (cached) {
    return cached;
  }
  const run = mockPredictionRuns().find((x) => x.id === runId) ?? BASE_RUNS[0];
  const rows: PredictionOutput[] = [];
  for (let i = 0; i < POPULATION; i += 1) {
    rows.push(buildCustomer(run.id, run.cutoff_date, 10_001 + i * 7));
  }
  assignDerived(rows);
  populationCache.set(runId, rows);
  return rows;
}

// ── Summary (derived from the same rows — spec §4) ─────────────

export function mockRunSummary(runId: string): RunSummary {
  const run = mockPredictionRuns().find((x) => x.id === runId);
  if (!run) {
    throw new Error("Run not found");
  }
  if (run.status !== "completed") {
    throw new Error("Run is not completed yet");
  }
  const rows = population(runId);

  const count = (f: (c: PredictionOutput) => boolean) => rows.filter(f).length;
  const paid = rows.filter((c) => c.lifecycle_stage === "Active Paid");

  const byRisk: Record<RiskLevel, number> = {
    critical: 0,
    high: 0,
    low: 0,
    medium: 0,
  };
  for (const c of paid) {
    if (c.churn_risk_level) {
      byRisk[c.churn_risk_level] += 1;
    }
  }

  const matrix: RunSummary["value_risk_matrix"] = [];
  for (const tier of ["high", "mid", "low"] as ValueTier[]) {
    for (const risk of ["low", "medium", "high", "critical"] as RiskLevel[]) {
      const cell = paid.filter(
        (c) => c.customer_value_tier === tier && c.churn_risk_level === risk
      );
      matrix.push({
        clv_sum: Math.round(
          cell.reduce((s, c) => s + (c.predicted_clv_6m ?? 0), 0)
        ),
        count: cell.length,
        risk_level: risk,
        value_tier: tier,
      });
    }
  }

  const byUrgency: Record<UrgencyLevel, number> = {
    critical: 0,
    monitor: 0,
    stable: 0,
    warning: 0,
  };
  for (const c of rows) {
    if (c.credit_urgency_level) {
      byUrgency[c.credit_urgency_level] += 1;
    }
  }

  // 12 months of "actual" revenue ending at cutoff
  const r = rng(runSeed(runId) ^ 0x5e_ed);
  const cutoff = new Date(run.cutoff_date);
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(cutoff.getFullYear(), cutoff.getMonth() - 12 + i, 1);
    const amount = Math.round(820_000 + r() * 380_000 + i * 9000);
    return {
      amount,
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      n_payments: Math.round(amount / 4200),
    };
  });

  const topPriority = [...rows]
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, TOP_PRIORITY_LIMIT)
    .map((c) => ({
      acc_id: c.acc_id,
      churn_probability: c.churn_probability,
      lifecycle_stage: c.lifecycle_stage,
      predicted_clv_6m: c.predicted_clv_6m,
      priority_score: c.priority_score,
    }));

  return {
    churn: {
      by_risk: byRisk,
      eligible_count: paid.length,
      thresholds: RISK_THRESHOLDS,
    },
    credit: {
      by_urgency: byUrgency,
      demand_30d: Math.round(
        rows
          .filter(
            (c) =>
              c.lifecycle_stage === "Active Paid" ||
              c.lifecycle_stage === "Active Free"
          )
          .reduce((s, c) => s + (c.predicted_credit_usage_30d ?? 0), 0)
      ),
      topup_due_7d: count(
        (c) =>
          c.estimated_days_until_topup !== null &&
          c.estimated_days_until_topup <= 7
      ),
    },
    lifecycle: {
      active_free: count((c) => c.lifecycle_stage === "Active Free"),
      active_paid: paid.length,
      churned: count((c) => c.lifecycle_stage === "Churned"),
      ghost: count((c) => c.lifecycle_stage === "Ghost"),
    },
    model_versions: MODEL_VERSIONS,
    revenue: {
      expected_at_risk: Math.round(
        paid.reduce((s, c) => s + (c.revenue_at_risk ?? 0), 0)
      ),
      high_risk_exposure: Math.round(
        paid
          .filter(
            (c) =>
              c.churn_risk_level === "high" || c.churn_risk_level === "critical"
          )
          .reduce((s, c) => s + (c.predicted_clv_6m ?? 0), 0)
      ),
      monthly_actual: monthly,
    },
    run: {
      cutoff_date: run.cutoff_date,
      finished_at: run.finished_at,
      id: run.id,
      name: run.name,
      status: run.status,
      total_customers: rows.length,
    },
    top_priority: topPriority,
    value_risk_matrix: matrix,
  };
}

// ── Outputs table ───────────────────────────────────────────────

export function mockRunOutputs(runId: string, q: OutputsQuery): OutputsPage {
  let rows = [...population(runId)];

  if (q.search) {
    rows = rows.filter((c) => String(c.acc_id).includes(q.search!));
  }
  if (q.lifecycle_stage) {
    rows = rows.filter((c) => c.lifecycle_stage === q.lifecycle_stage);
  }
  if (q.churn_risk_level) {
    rows = rows.filter((c) => c.churn_risk_level === q.churn_risk_level);
  }
  if (q.customer_value_tier) {
    rows = rows.filter((c) => c.customer_value_tier === q.customer_value_tier);
  }
  if (q.credit_urgency_level) {
    rows = rows.filter(
      (c) => c.credit_urgency_level === q.credit_urgency_level
    );
  }
  if (q.ever_paid === "true" || q.ever_paid === "false") {
    rows = rows.filter((c) => c.ever_paid === (q.ever_paid === "true"));
  }
  if (q.segment) {
    rows = rows.filter((c) => c.segment === q.segment);
  }
  if (q.needs_review === "true" || q.needs_review === "false") {
    rows = rows.filter((c) => c.needs_review === (q.needs_review === "true"));
  }

  const [sortKey, sortDir] = (q.sort ?? "priority_score:desc").split(":");
  const dir = sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[sortKey as keyof PredictionOutput];
    const bv = b[sortKey as keyof PredictionOutput];
    if (av === null || av === undefined) {
      return 1;
    }
    if (bv === null || bv === undefined) {
      return -1;
    }
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  const page = q.page ?? 1;
  const pageSize = q.page_size ?? 8;
  return {
    data: rows.slice((page - 1) * pageSize, page * pageSize),
    page,
    page_size: pageSize,
    total: rows.length,
  };
}

export function mockRunOutput(runId: string, accId: number): PredictionOutput {
  const row = population(runId).find((c) => c.acc_id === accId);
  if (!row) {
    throw new Error(`Customer ${accId} not found in run ${runId}`);
  }
  return row;
}

export function mockGenerateCustomerAiExplanation(
  runId: string,
  accId: number,
  options: { force?: boolean } = {}
) {
  const row = mockRunOutput(runId, accId);
  if (row.ai_status === "completed" && row.ai_explanation && !options.force) {
    throw new Error("AI explanation already exists");
  }

  const recentUsage = mockUsageMonthly(runId, accId)
    .filter((point) => point.total > 0)
    .slice(-3)
    .map((point) => `${point.month}: ${point.total.toLocaleString()}`)
    .join(", ");

  const explanation = [
    `account ${accId} (${row.lifecycle_stage})`,
    recentUsage ? `usage ล่าสุด ${recentUsage}` : "ไม่พบ usage ก่อน cutoff",
    row.churn_probability === null
      ? "ML ไม่ประเมิน churn"
      : `ML churn ${(row.churn_probability * 100).toFixed(1)}%`,
    row.revenue_at_risk === null
      ? null
      : `revenue at risk ฿${Math.round(row.revenue_at_risk).toLocaleString()}`,
  ]
    .filter(Boolean)
    .join(" — ");

  row.ai_status = "completed";
  row.ai_explanation = explanation;

  return {
    acc_id: accId,
    ai_explanation: explanation,
    ai_generated_at: new Date().toISOString(),
    ai_model: "mock_ai_v1",
    ai_status: "completed" as const,
  };
}

// ── Run-level AI base summary ───────────────────────────────────

const mockInsightCache = new Map<string, RunInsight>();

export function mockRunInsight(runId: string): RunInsight {
  return (
    mockInsightCache.get(runId) ?? {
      ai_generated_at: null,
      ai_model: null,
      ai_status: "not_requested",
      ai_summary: null,
      run_id: runId,
    }
  );
}

export function mockGenerateRunInsight(
  runId: string,
  options: { force?: boolean } = {}
): RunInsight {
  const existing = mockInsightCache.get(runId);
  if (existing?.ai_summary && !options.force) {
    throw new Error("Run insight already exists");
  }
  const s = mockRunSummary(runId);
  const total = s.run.total_customers;
  const highCrit = s.churn.by_risk.high + s.churn.by_risk.critical;
  const summary = [
    "## ภาพรวมฐานลูกค้า",
    `ฐานลูกค้าทั้งหมด ${total.toLocaleString()} ราย — Active Paid ${s.lifecycle.active_paid.toLocaleString()}, Active Free ${s.lifecycle.active_free.toLocaleString()}, Churned ${s.lifecycle.churned.toLocaleString()}, Ghost ${s.lifecycle.ghost.toLocaleString()}`,
    "",
    "## ความเสี่ยง churn",
    `- กลุ่มที่ประเมินได้ ${s.churn.eligible_count.toLocaleString()} ราย, high+critical รวม ${highCrit.toLocaleString()} ราย`,
    "",
    "## มูลค่าและรายได้ที่เกี่ยวข้อง",
    `- revenue at risk รวม ฿${Math.round(s.revenue.expected_at_risk).toLocaleString()}, exposure กลุ่มเสี่ยงสูง ฿${Math.round(s.revenue.high_risk_exposure).toLocaleString()}`,
    "",
    "## ข้อสังเกต",
    "ไม่มี",
  ].join("\n");

  const result: RunInsight = {
    ai_generated_at: new Date().toISOString(),
    ai_model: "mock_ai_v1",
    ai_status: "completed",
    ai_summary: summary,
    run_id: runId,
  };
  mockInsightCache.set(runId, result);
  return result;
}

// ── Per-customer time series ────────────────────────────────────

export function mockUsageMonthly(
  runId: string,
  accId: number
): MonthlyUsagePoint[] {
  const c = mockRunOutput(runId, accId);
  const run = mockPredictionRuns().find((x) => x.id === runId)!;
  const r = rng(runSeed(runId) ^ accId ^ 0xa_11_ce);
  const cutoff = new Date(run.cutoff_date);
  const trendFactor =
    c.usage_trend === "increasing"
      ? 1.08
      : c.usage_trend === "declining"
        ? 0.88
        : 1.0;
  let base = c.profile_snapshot.usage_total_180d / 6 || 0;
  if (c.lifecycle_stage === "Ghost") {
    base = 0;
  }

  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(cutoff.getFullYear(), cutoff.getMonth() - 12 + i, 1);
    const inactive = c.lifecycle_stage === "Churned" && i >= 7;
    const total =
      inactive || base === 0
        ? 0
        : Math.max(
            0,
            Math.round(base * trendFactor ** (i - 6) * (0.75 + r() * 0.5))
          );
    const sms = Math.round(total * c.profile_snapshot.sms_usage_share);
    return {
      api: Math.round(total * c.profile_snapshot.api_usage_share),
      bc: Math.round(total * c.profile_snapshot.bc_usage_share),
      email: total - sms,
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      otp: Math.round(total * c.profile_snapshot.otp_usage_share),
      sms,
      total,
    };
  });
}

export function mockPayments(runId: string, accId: number): PaymentEvent[] {
  const c = mockRunOutput(runId, accId);
  if (!c.ever_paid || c.n_purchases === 0) {
    return [];
  }
  const run = mockPredictionRuns().find((x) => x.id === runId)!;
  const r = rng(runSeed(runId) ^ accId ^ 0x9_a7);
  const cutoffMs = new Date(run.cutoff_date).getTime();
  const spanDays = Math.min(c.profile_snapshot.customer_age_days, 720);
  const events: PaymentEvent[] = [];
  for (let i = 0; i < c.n_purchases; i += 1) {
    const daysAgo = Math.floor((i / c.n_purchases) * spanDays + r() * 25);
    const amount =
      Math.round((c.avg_transaction_value ?? 1000) * (0.7 + r() * 0.6) * 100) /
      100;
    events.push({
      amount,
      credit_add: Math.round(amount * (8 + r() * 4)),
      credit_type: r() < 0.7 ? "sms" : "email",
      payment_date: new Date(cutoffMs - daysAgo * 86_400_000)
        .toISOString()
        .slice(0, 10),
    });
  }
  return events.sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1));
}

// ── Model performance (written at training time — spec §2.4) ───

const MODEL_PERF: ModelPerfEntry[] = [
  {
    algorithm: "Deterministic rules (features.py)",
    baselines: [],
    cutoff_date: null,
    dataset_rows: null,
    feature_set: null,
    method: "Rule-based classification",
    model_type: "lifecycle",
    notes:
      "ไม่ใช่โมเดล ML — กติกาแบ่ง Ghost / Churned / Active Free / Active Paid จากข้อมูลจริง",
    primary_metric: { name: "Rule coverage", value: "100%" },
    splits: [],
    trained_at: null,
    version: null,
  },
  {
    algorithm: "LightGBM + isotonic calibration",
    baselines: [
      {
        metrics: {
          f1: 0.512,
          lift_at_top10pct: 1.84,
          pr_auc: 0.447,
          recall_at_top10pct: 0.262,
        },
        name: "recency_rule_90d",
      },
      {
        metrics: {
          f1: 0.547,
          lift_at_top10pct: 2.12,
          pr_auc: 0.489,
          recall_at_top10pct: 0.301,
        },
        name: "rfm_quartile",
      },
      {
        metrics: {
          f1: 0.601,
          lift_at_top10pct: 2.41,
          pr_auc: 0.541,
          recall_at_top10pct: 0.343,
        },
        name: "logistic_regression",
      },
    ],
    calibration: {
      ece: 0.034,
      prob_pred: [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95],
      prob_true: [0.04, 0.13, 0.24, 0.37, 0.44, 0.57, 0.63, 0.77, 0.83, 0.91],
    },
    confusion: { fn: 109, fp: 149, threshold: 0.6, tn: 1306, tp: 318 },
    cutoff_date: "2025-12-01",
    dataset_rows: 9412,
    feature_set: "churn_A_safe_history v1 (24 features)",
    lift_table: [
      { decile: 1, lift: 3.12, share_of_churners: 0.452 },
      { decile: 2, lift: 2.31, share_of_churners: 0.224 },
      { decile: 3, lift: 1.62, share_of_churners: 0.118 },
      { decile: 4, lift: 1.21, share_of_churners: 0.077 },
      { decile: 5, lift: 0.84, share_of_churners: 0.051 },
    ],
    method: "Binary classification (calibrated probability)",
    model_type: "churn",
    primary_metric: {
      baseline: 0.541,
      baseline_name: "logistic_regression",
      name: "PR-AUC",
      value: 0.712,
    },
    splits: [
      {
        metrics: {
          brier: 0.118,
          ece: 0.028,
          f1: 0.724,
          lift_at_top10pct: 3.31,
          pr_auc: 0.731,
          precision: 0.692,
          recall: 0.759,
          recall_at_top10pct: 0.471,
          roc_auc: 0.861,
        },
        split: "validation",
      },
      {
        metrics: {
          brier: 0.124,
          ece: 0.034,
          f1: 0.711,
          lift_at_top10pct: 3.12,
          pr_auc: 0.712,
          precision: 0.681,
          recall: 0.744,
          recall_at_top10pct: 0.452,
          roc_auc: 0.848,
        },
        split: "test",
      },
      {
        metrics: {
          brier: 0.129,
          ece: 0.039,
          f1: 0.698,
          lift_at_top10pct: 2.98,
          pr_auc: 0.694,
          precision: 0.667,
          recall: 0.732,
          recall_at_top10pct: 0.438,
          roc_auc: 0.839,
        },
        split: "backtest_avg",
      },
    ],
    thresholds: RISK_THRESHOLDS,
    trained_at: "2026-06-03T11:20:00+07:00",
    version: "churn_v3",
  },
  {
    algorithm: "BG-NBD + Gamma-Gamma (champion) vs LGBM Tweedie",
    baselines: [
      {
        metrics: { mae: 1612, spearman: 0.318, top_decile_capture: 0.281 },
        name: "segment_mean",
      },
      {
        metrics: { mae: 1437, spearman: 0.41, top_decile_capture: 0.352 },
        name: "revenue_180d_carryover",
      },
    ],
    cutoff_date: "2025-12-01",
    dataset_rows: 8120,
    feature_set: "clv_A_safe_history v1",
    method: "Regression + ranking",
    model_type: "clv",
    primary_metric: {
      baseline: 0.41,
      baseline_name: "revenue_180d_carryover",
      name: "Spearman",
      value: 0.57,
    },
    splits: [
      {
        metrics: {
          mae: 1129,
          rmse: 4310,
          smape: 0.309,
          spearman: 0.588,
          top_decile_capture: 0.461,
        },
        split: "validation",
      },
      {
        metrics: {
          mae: 1181,
          rmse: 4488,
          smape: 0.318,
          spearman: 0.57,
          top_decile_capture: 0.44,
        },
        split: "test",
      },
      {
        metrics: {
          mae: 1224,
          rmse: 4632,
          smape: 0.327,
          spearman: 0.553,
          top_decile_capture: 0.428,
        },
        split: "backtest_avg",
      },
    ],
    trained_at: "2026-06-03T11:42:00+07:00",
    version: "clv_v2",
  },
  {
    algorithm: "LightGBM quantile (p10/p25/p50/p75/p90)",
    baselines: [
      {
        metrics: { mae_30d: 3415, smape_30d: 0.41 },
        name: "last_30d_carryover",
      },
      { metrics: { mae_30d: 2987, smape_30d: 0.365 }, name: "moving_avg_90d" },
    ],
    cutoff_date: "2025-12-01",
    dataset_rows: 10_874,
    feature_set: "credit_A_safe_history v1",
    method: "Quantile forecasting",
    model_type: "credit",
    primary_metric: { name: "Coverage p10–p90", value: 0.79 },
    splits: [
      {
        metrics: {
          coverage_p10_p90: 0.804,
          mae_30d: 2110,
          mae_90d: 2298,
          smape_30d: 0.271,
          smape_90d: 0.326,
          urgent_precision: 0.701,
          urgent_recall: 0.748,
        },
        split: "validation",
      },
      {
        metrics: {
          coverage_p10_p90: 0.79,
          mae_30d: 2204,
          mae_90d: 2380,
          smape_30d: 0.284,
          smape_90d: 0.337,
          urgent_precision: 0.688,
          urgent_recall: 0.73,
        },
        split: "test",
      },
    ],
    trained_at: "2026-06-03T12:05:00+07:00",
    version: "credit_v2",
  },
];

export function mockModelPerformance(): ModelPerfEntry[] {
  return MODEL_PERF;
}

// ── Training runs ───────────────────────────────────────────────

const TRAINING_RUNS: TrainingRun[] = [
  {
    created_by: "aphisit",
    created_by_name: "aphisit",
    cutoff_date: "2025-12-01",
    dataset_name: "train-export-2025-q4",
    error_message: null,
    finished_at: "2026-06-03T12:05:00+07:00",
    horizon_days: 180,
    id: "train-2026-06-03",
    progress: null,
    results: [
      {
        baseline_name: "logistic_regression",
        baseline_value: 0.541,
        calibration_ece: 0.034,
        leakage_passed: true,
        model_type: "churn",
        new_version: "churn_v3",
        primary_metric_name: "PR-AUC",
        primary_metric_value: 0.712,
        promote_reason:
          "ชนะ baseline ทุก cutoff และชนะ champion เดิม (v2: 0.683)",
        promoted: true,
      },
      {
        baseline_name: "revenue_180d_carryover",
        baseline_value: 0.41,
        calibration_ece: null,
        leakage_passed: true,
        model_type: "clv",
        new_version: "clv_v2",
        primary_metric_name: "Spearman",
        primary_metric_value: 0.57,
        promote_reason: "ชนะ baseline ทุก backtest cutoff",
        promoted: true,
      },
      {
        baseline_name: "last_30d_carryover",
        baseline_value: 0.0,
        calibration_ece: null,
        leakage_passed: true,
        model_type: "credit",
        new_version: "credit_v2",
        primary_metric_name: "Coverage p10–p90",
        primary_metric_value: 0.79,
        promote_reason: "coverage อยู่ในช่วงเป้า 75–85% และ MAE ชนะ baseline",
        promoted: true,
      },
    ],
    started_at: "2026-06-03T11:02:00+07:00",
    status: "completed",
  },
];

const sessionTrainingRuns: TrainingRun[] = [];
let trainRunCounter = 0;

export function mockTrainingRuns(): TrainingRun[] {
  return [...sessionTrainingRuns, ...TRAINING_RUNS];
}

export function mockCreateTrainingRun(input: {
  train_source_id: string;
  dataset_name: string;
  cutoff_date?: string;
  horizon_days?: number;
}): TrainingRun {
  const cutoffDate =
    input.cutoff_date ??
    mockTrainSuggestedCutoff(input.train_source_id).suggested_cutoff;
  trainRunCounter += 1;
  const run: TrainingRun = {
    created_by: "you",
    created_by_name: "you",
    cutoff_date: cutoffDate,
    dataset_name: input.dataset_name,
    error_message: null,
    finished_at: null,
    horizon_days: input.horizon_days ?? 180,
    id: `train-local-${trainRunCounter}`,
    progress: { pct: 5, phase: "Quality gates" },
    results: null,
    started_at: new Date().toISOString(),
    status: "in_progress",
  };
  sessionTrainingRuns.unshift(run);
  return run;
}
