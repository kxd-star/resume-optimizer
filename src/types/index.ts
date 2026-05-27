// ============ JD Profile ============
export interface JDProfile {
  job_title: string;
  raw_job_title?: string;
  role_family?: JobRoleFamily;
  required_skills: string[];
  preferred_skills: string[];
  soft_skills: string[];
  experience_years: number;
  industries: string[];
  business_goals: string[];
  responsibilities: string[];
  interview_focus: string[];
  requirement_categories?: JDRequirementCategories;
}

export type JobRoleFamily =
  | 'ai_product_operations'
  | 'product_operations'
  | 'solution'
  | 'product_manager'
  | 'data'
  | 'sales'
  | 'engineering'
  | 'general';

export interface JDRequirementCategories {
  must_have_capabilities: string[];
  work_activities: string[];
  deliverables: string[];
  soft_skills: string[];
  bonus_points: string[];
}

// ============ Resume Profile ============
export interface Project {
  name: string;
  role: string;
  actions: string[];
  metrics: string[];
  source_text: string;
}

export interface ResumeProfile {
  candidate_name: string;
  target_title: string;
  skills: string[];
  industries: string[];
  capabilities?: string[];
  evidence_units?: EvidenceUnit[];
  experience_years: number;
  projects: Project[];
  education: string[];
  metrics: string[];
  risk_items: string[];
}

export interface EvidenceUnit {
  id: string;
  evidence: string;
  source_project: string;
  capabilities: string[];
  metrics: string[];
  strength: 'strong' | 'medium' | 'weak';
}

// ============ Match Result ============
export interface DimensionScore {
  key: string;
  name: string;
  score: number;
  status: 'matched' | 'partial' | 'missing';
  matched_items: string[];
  missing_items: string[];
  explanation: string;
}

export interface MatchResult {
  overall_score: number;
  dimensions: DimensionScore[];
  role_family?: JobRoleFamily;
  fit_summary?: string;
  requirement_matches?: RequirementEvidenceMatch[];
  recommend_mode: RewriteMode;
  recommend_reason: string;
}

export interface RequirementEvidenceMatch {
  requirement: string;
  category: keyof JDRequirementCategories | 'other';
  status: 'strong' | 'transferable' | 'insufficient';
  score: number;
  rule_score?: number;
  semantic_score?: number;
  semantic_status?: 'strong' | 'transferable' | 'insufficient';
  semantic_evidence_ids?: string[];
  semantic_explanation?: string;
  semantic_confidence?: number;
  evidence: string[];
  gap: string;
  rewrite_guidance: 'direct' | 'conservative' | 'suggest_only';
}

// ============ Resume Diagnosis ============
export interface RiskItem {
  type: string;
  source: string;
  issue: string;
  suggestion: string;
  risk_level: 'low' | 'medium' | 'high';
}

export interface RewriteSuggestion {
  before: string;
  after: string;
  reason: string;
}

export interface ResumeDiagnosis {
  matched: string[];
  partial: string[];
  missing: string[];
  risk_items: RiskItem[];
  rewrite_suggestions: RewriteSuggestion[];
}

// ============ Change Record ============
export interface ChangeRecord {
  before: string;
  after: string;
  reason: string;
  needs_confirmation: string[];
}

export interface OptimizedResume {
  version: RewriteMode;
  optimized_resume: string;
  changes: ChangeRecord[];
  placeholders: string[];
  risk_warnings: string[];
}

// ============ Interview Question ============
export interface InterviewQuestion {
  type: string;
  question: string;
  source: string;
  difficulty: 'easy' | 'medium' | 'hard';
  risk_level: 'low' | 'medium' | 'high';
  evaluation_point: string;
  answer_strategy: string;
  sample_answers: string[];
  materials_to_prepare: string[];
  pitfalls: string[];
}

export interface InterviewQuestions {
  questions: InterviewQuestion[];
}

// ============ Analysis ============
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
export type RewriteMode = 'conservative' | 'standard' | 'aggressive';
export type ProgressStep =
  | 'jd_parsing'
  | 'resume_parsing'
  | 'matching'
  | 'diagnosis'
  | 'optimization'
  | 'interview_questions'
  | 'done'
  | 'failed';

export const ProgressStepLabels: Record<ProgressStep, string> = {
  jd_parsing: '正在解析岗位要求...',
  resume_parsing: '正在解析简历...',
  matching: '正在评估匹配度...',
  diagnosis: '正在诊断简历...',
  optimization: '正在生成优化版本...',
  interview_questions: '正在生成面试押题...',
  done: '分析完成',
  failed: '分析失败',
};

export const ProgressStepPercent: Record<ProgressStep, number> = {
  jd_parsing: 15,
  resume_parsing: 30,
  matching: 45,
  diagnosis: 55,
  optimization: 75,
  interview_questions: 90,
  done: 100,
  failed: 100,
};

// ============ API Types ============
export interface CreateAnalysisRequest {
  jd_text: string;
  resume_text: string;
  rewrite_mode?: RewriteMode;
  question_count?: number;
  client_session_id?: string;
}

export interface CreateAnalysisResponse {
  task_id: string;
  status: TaskStatus;
}

export interface TaskStatusResponse {
  task_id: string;
  status: TaskStatus;
  progress_step?: ProgressStep;
  progress_percent?: number;
  message?: string;
  result?: AnalysisResult;
  error?: string;
}

export interface UpdateMatchRequest {
  edited_resume_text: string;
}

export interface UpdateMatchResponse {
  old_score: number;
  new_score: number;
  delta: number;
  changed_dimensions: {
    key: string;
    old_score: number;
    new_score: number;
    reason: string;
  }[];
  new_matched_keywords: string[];
  remaining_missing_keywords: string[];
}

export interface ExportRequest {
  type: 'resume_ats' | 'resume_pretty' | 'interview_questions';
}

export interface ExportResponse {
  file_url: string;
}

// ============ Full Analysis Result ============
export interface AnalysisResult {
  jd_profile: JDProfile;
  resume_profile: ResumeProfile;
  match_result: MatchResult;
  diagnosis: ResumeDiagnosis;
  optimized_resume: OptimizedResume;
  interview_questions: InterviewQuestions;
}

// ============ Config ============
export interface RewriteModeThresholds {
  conservative_min: number;
  standard_min: number;
}

// ============ History ============
export interface HistoryItem {
  task_id: string;
  client_session_id: string;
  job_title: string;
  overall_score: number;
  jd_text: string;
  created_at: string;
  status: TaskStatus;
}
