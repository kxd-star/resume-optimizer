import { callLLMWithJson } from './llm';
import type { JDProfile, ResumeProfile, MatchResult, DimensionScore } from '@/types';

// Default thresholds (configurable via env)
const THRESHOLD_CONSERVATIVE = Number(process.env.THRESHOLD_CONSERVATIVE) || 80;
const THRESHOLD_STANDARD = Number(process.env.THRESHOLD_STANDARD) || 60;

function intersectScore(items: string[], targets: string[]): number {
  if (targets.length === 0) return 50;
  if (items.length === 0) return 0;
  const lowerItems = items.map((s) => s.toLowerCase());
  const lowerTargets = targets.map((s) => s.toLowerCase());
  const matches = lowerTargets.filter((t) => lowerItems.some((i) => i.includes(t) || t.includes(i)));
  return Math.round((matches.length / targets.length) * 100);
}

function keywordMatch(jdSkills: string[], resumeSkills: string[]): DimensionScore {
  const matched = jdSkills.filter((js) =>
    resumeSkills.some((rs) => rs.toLowerCase().includes(js.toLowerCase()) || js.toLowerCase().includes(rs.toLowerCase()))
  );
  const missing = jdSkills.filter((js) => !matched.includes(js));
  const score = jdSkills.length > 0 ? Math.round((matched.length / jdSkills.length) * 100) : 50;

  const status = score >= 75 ? 'matched' : score >= 45 ? 'partial' : 'missing';

  return {
    key: 'hard_skills',
    name: '硬技能匹配',
    score,
    status,
    matched_items: matched,
    missing_items: missing,
    explanation:
      matched.length > 0
        ? `简历匹配了 ${matched.length}/${jdSkills.length} 项硬技能要求${missing.length > 0 ? `，缺少: ${missing.join('、')}` : ''}。`
        : '简历中未检测到 JD 要求的硬技能关键词。',
  };
}

function projectMatch(jd: JDProfile, resume: ResumeProfile): DimensionScore {
  const allActions = resume.projects.flatMap((p) => p.actions);
  const allMetrics = resume.projects.flatMap((p) => p.metrics);

  // Check how many responsibilities are covered by project actions
  const matchedRespons = jd.responsibilities.filter((resp) =>
    allActions.some((a) => a.toLowerCase().includes(resp.toLowerCase()) || resp.toLowerCase().includes(a.toLowerCase()))
  );

  const hasMetrics = allMetrics.length > 0;
  const score = jd.responsibilities.length > 0
    ? Math.round((matchedRespons.length / jd.responsibilities.length) * 60) + (hasMetrics ? 20 : 0) + (resume.projects.length > 0 ? 20 : 0)
    : resume.projects.length > 0 ? 60 : 0;

  // Cap at 100
  const finalScore = Math.min(score, 100);
  const status = finalScore >= 75 ? 'matched' : finalScore >= 45 ? 'partial' : 'missing';

  return {
    key: 'projects',
    name: '项目经历匹配',
    score: finalScore,
    status,
    matched_items: matchedRespons,
    missing_items: jd.responsibilities.filter((r) => !matchedRespons.includes(r)),
    explanation:
      resume.projects.length > 0
        ? `简历包含 ${resume.projects.length} 个项目经历，覆盖 ${matchedRespons.length}/${jd.responsibilities.length} 项核心职责。${hasMetrics ? '有量化成果，加分。' : '缺少量化指标，建议补充。'}`
        : '简历未检测到项目经历。',
  };
}

function industryMatch(jd: JDProfile, resume: ResumeProfile): DimensionScore {
  const score = intersectScore(resume.industries, jd.industries);
  const matched = jd.industries.filter((ind) =>
    resume.industries.some((ri) => ri.toLowerCase().includes(ind.toLowerCase()) || ind.toLowerCase().includes(ri.toLowerCase()))
  );
  const missing = jd.industries.filter((ind) => !matched.includes(ind));
  const status = score >= 75 ? 'matched' : score >= 45 ? 'partial' : 'missing';

  return {
    key: 'industry',
    name: '行业背景匹配',
    score,
    status,
    matched_items: matched,
    missing_items: missing,
    explanation:
      matched.length > 0
        ? `简历有 ${matched.join('、')} 相关行业经验。`
        : '简历未体现 JD 要求的行业背景。',
  };
}

function softSkillMatch(jd: JDProfile, resume: ResumeProfile): DimensionScore {
  const allText = [
    resume.projects.flatMap((p) => p.actions).join(' '),
    ...resume.skills,
    ...resume.risk_items,
  ].join(' ').toLowerCase();

  const matched = jd.soft_skills.filter((ss) => {
    const keywords: Record<string, string[]> = {
      '沟通': ['沟通', '协作', '协调', 'stakeholder'],
      '协作': ['协作', '合作', '跨部门', '团队'],
      '管理': ['管理', 'leadership', '带领', '带队'],
      '抗压': ['抗压', '压力', '快速迭代', '快节奏'],
      '结果导向': ['结果', '目标', 'kpi', 'okr', '交付'],
      '表达': ['表达', '汇报', '汇报', '演讲', 'presentation'],
      '主动': ['主动', '推动', '驱动', 'ownership'],
    };
    for (const [key, kws] of Object.entries(keywords)) {
      if (ss.toLowerCase().includes(key)) {
        return kws.some((kw) => allText.includes(kw));
      }
    }
    return allText.includes(ss.toLowerCase());
  });

  const missing = jd.soft_skills.filter((ss) => !matched.includes(ss));
  const score = jd.soft_skills.length > 0 ? Math.round((matched.length / jd.soft_skills.length) * 100) : 50;
  const status = score >= 75 ? 'matched' : score >= 45 ? 'partial' : 'missing';

  return {
    key: 'soft_skills',
    name: '软性素质匹配',
    score,
    status,
    matched_items: matched,
    missing_items: missing,
    explanation:
      matched.length > 0
        ? `简历体现了 ${matched.join('、')} 等软性能力。`
        : '简历未充分体现 JD 要求的软性素质。',
  };
}

function qualityMatch(resume: ResumeProfile): DimensionScore {
  const metricCount = resume.metrics.length;
  const projectCount = resume.projects.length;
  const hasDetails = resume.projects.some((p) => p.actions.length > 1);

  let score = 0;
  if (metricCount >= 3) score += 40;
  else if (metricCount >= 1) score += 25;
  else score += 10;

  if (projectCount >= 3) score += 30;
  else if (projectCount >= 1) score += 20;
  else score += 0;

  if (hasDetails) score += 30;
  else score += 15;

  const finalScore = Math.min(score, 100);
  const status = finalScore >= 75 ? 'matched' : finalScore >= 45 ? 'partial' : 'missing';

  return {
    key: 'quality',
    name: '量化成果与表达质量',
    score: finalScore,
    status,
    matched_items: metricCount > 0 ? [`${metricCount} 个量化指标`] : [],
    missing_items: metricCount === 0 ? ['缺少量化指标'] : [],
    explanation:
      metricCount > 0
        ? `简历包含 ${metricCount} 个量化指标，表达清晰度良好。`
        : '简历缺少量化成果指标，建议补充具体数据。',
  };
}

function recommendMode(overallScore: number): { mode: 'conservative' | 'standard' | 'aggressive'; reason: string } {
  if (overallScore >= THRESHOLD_CONSERVATIVE) {
    return {
      mode: 'conservative',
      reason: `当前匹配度 ${overallScore}%，简历整体与岗位匹配度较高，建议选择保守版，仅优化措辞和表达。`,
    };
  }
  if (overallScore >= THRESHOLD_STANDARD) {
    return {
      mode: 'standard',
      reason: `当前匹配度 ${overallScore}%，已有一定匹配基础，建议选择标准版，重组经历并突出 JD 关键词。`,
    };
  }
  return {
    mode: 'aggressive',
    reason: `当前匹配度 ${overallScore}%，与岗位要求差距较大，建议选择冲刺版，强化可迁移能力和成果表达。`,
  };
}

export async function calculateMatch(jd: JDProfile, resume: ResumeProfile): Promise<MatchResult> {
  // Rule-based dimension scoring
  const dimensions = [
    keywordMatch(jd.required_skills, resume.skills),
    projectMatch(jd, resume),
    industryMatch(jd, resume),
    softSkillMatch(jd, resume),
    qualityMatch(resume),
  ];

  // Weighted overall score (from PRD: 35%, 25%, 15%, 10%, 15%)
  const weights: Record<string, number> = {
    hard_skills: 0.35,
    projects: 0.25,
    industry: 0.15,
    soft_skills: 0.10,
    quality: 0.15,
  };

  let overallScore = 0;
  for (const dim of dimensions) {
    overallScore += dim.score * (weights[dim.key] || 0);
  }
  overallScore = Math.round(overallScore);

  const { mode, reason } = recommendMode(overallScore);

  return {
    overall_score: overallScore,
    dimensions,
    recommend_mode: mode,
    recommend_reason: reason,
  };
}
