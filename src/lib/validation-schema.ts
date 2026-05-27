import { z } from 'zod';

// ============ JD Profile ============
export const JDProfileSchema = z.object({
  job_title: z.string().min(1),
  raw_job_title: z.string().optional(),
  role_family: z.enum([
    'ai_product_operations',
    'product_operations',
    'solution',
    'product_manager',
    'data',
    'sales',
    'engineering',
    'general',
  ]).optional(),
  required_skills: z.array(z.string()).default([]),
  preferred_skills: z.array(z.string()).default([]),
  soft_skills: z.array(z.string()).default([]),
  experience_years: z.number().min(0).default(0),
  industries: z.array(z.string()).default([]),
  business_goals: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  interview_focus: z.array(z.string()).default([]),
  requirement_categories: z.object({
    must_have_capabilities: z.array(z.string()).default([]),
    work_activities: z.array(z.string()).default([]),
    deliverables: z.array(z.string()).default([]),
    soft_skills: z.array(z.string()).default([]),
    bonus_points: z.array(z.string()).default([]),
  }).optional(),
});

// ============ Resume Profile ============
export const ProjectSchema = z.object({
  name: z.string().default(''),
  role: z.string().default(''),
  actions: z.array(z.string()).default([]),
  metrics: z.array(z.string()).default([]),
  source_text: z.string().default(''),
});

export const ResumeProfileSchema = z.object({
  candidate_name: z.string().default(''),
  target_title: z.string().default(''),
  skills: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]).optional(),
  evidence_units: z.array(z.object({
    id: z.string(),
    evidence: z.string(),
    source_project: z.string(),
    capabilities: z.array(z.string()).default([]),
    metrics: z.array(z.string()).default([]),
    strength: z.enum(['strong', 'medium', 'weak']).default('medium'),
  })).default([]).optional(),
  experience_years: z.number().min(0).default(0),
  projects: z.array(ProjectSchema).default([]),
  education: z.array(z.string()).default([]),
  metrics: z.array(z.string()).default([]),
  risk_items: z.array(z.string()).default([]),
});

// ============ Match Result ============
export const DimensionScoreSchema = z.object({
  key: z.string(),
  name: z.string(),
  score: z.number().min(0).max(100),
  status: z.enum(['matched', 'partial', 'missing']),
  matched_items: z.array(z.string()).default([]),
  missing_items: z.array(z.string()).default([]),
  explanation: z.string().default(''),
});

export const MatchResultSchema = z.object({
  overall_score: z.number().min(0).max(100),
  dimensions: z.array(DimensionScoreSchema).default([]),
  role_family: z.string().optional(),
  fit_summary: z.string().default('').optional(),
  requirement_matches: z.array(z.object({
    requirement: z.string(),
    category: z.string(),
    status: z.enum(['strong', 'transferable', 'insufficient']),
    score: z.number().min(0).max(100),
    rule_score: z.number().min(0).max(100).optional(),
    semantic_score: z.number().min(0).max(100).optional(),
    semantic_status: z.enum(['strong', 'transferable', 'insufficient']).optional(),
    semantic_evidence_ids: z.array(z.string()).default([]).optional(),
    semantic_explanation: z.string().default('').optional(),
    semantic_confidence: z.number().min(0).max(1).optional(),
    evidence: z.array(z.string()).default([]),
    gap: z.string().default(''),
    rewrite_guidance: z.enum(['direct', 'conservative', 'suggest_only']),
  })).default([]).optional(),
  recommend_mode: z.enum(['conservative', 'standard', 'aggressive']),
  recommend_reason: z.string().default(''),
});

// ============ Diagnosis ============
export const RiskItemSchema = z.object({
  type: z.string(),
  source: z.string(),
  issue: z.string(),
  suggestion: z.string(),
  risk_level: z.enum(['low', 'medium', 'high']),
});

export const RewriteSuggestionSchema = z.object({
  before: z.string(),
  after: z.string(),
  reason: z.string(),
});

export const ResumeDiagnosisSchema = z.object({
  matched: z.array(z.string()).default([]),
  partial: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
  risk_items: z.array(RiskItemSchema).default([]),
  rewrite_suggestions: z.array(RewriteSuggestionSchema).default([]),
});

// ============ Optimized Resume ============
export const ChangeRecordSchema = z.object({
  before: z.string(),
  after: z.string(),
  reason: z.string(),
  needs_confirmation: z.array(z.string()).default([]),
});

export const OptimizedResumeSchema = z.object({
  version: z.enum(['conservative', 'standard', 'aggressive']),
  optimized_resume: z.string().default(''),
  changes: z.array(ChangeRecordSchema).default([]),
  placeholders: z.array(z.string()).default([]),
  risk_warnings: z.array(z.string()).default([]),
});

// ============ Interview Questions ============
export const InterviewQuestionSchema = z.object({
  type: z.string(),
  question: z.string(),
  source: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  risk_level: z.enum(['low', 'medium', 'high']),
  evaluation_point: z.string(),
  answer_strategy: z.string(),
  sample_answers: z.array(z.string()).default([]),
  materials_to_prepare: z.array(z.string()).default([]),
  pitfalls: z.array(z.string()).default([]),
});

export const InterviewQuestionsSchema = z.object({
  questions: z.array(InterviewQuestionSchema).default([]),
});

// Generic JSON parse + validate wrapper
export function safeParseJson<T>(json: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return { ok: true, data: result.data };
    }
    return { ok: false, error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') };
  } catch {
    return { ok: false, error: 'JSON 格式错误' };
  }
}
