import { callLLMWithJson } from './llm';
import type { JDProfile, ResumeProfile, MatchResult, DimensionScore } from '@/types';

const THRESHOLD_CONSERVATIVE = Number(process.env.THRESHOLD_CONSERVATIVE) || 80;
const THRESHOLD_STANDARD = Number(process.env.THRESHOLD_STANDARD) || 60;

// Tokenize Chinese + English text into meaningful matching units
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // Extract Chinese bigrams (2-char segments)
  const chineseChars = text.match(/[一-鿿]+/g) || [];
  for (const chunk of chineseChars) {
    if (chunk.length <= 4) tokens.push(chunk);
    for (let i = 0; i < chunk.length - 1; i++) {
      tokens.push(chunk.slice(i, i + 2));
    }
  }
  // Extract English words
  const englishWords = text.match(/[a-zA-Z]+/g) || [];
  tokens.push(...englishWords.map((w) => w.toLowerCase()));
  // Extract numbers
  const numbers = text.match(/\d+/g) || [];
  tokens.push(...numbers);
  return [...new Set(tokens)];
}

// Score: how well do source tokens cover target tokens
function tokenMatchScore(source: string[], target: string): number {
  const targetTokens = tokenize(target);
  if (targetTokens.length === 0) return 0;
  const hit = targetTokens.filter((t) => source.some((s) => s.includes(t) || t.includes(s)));
  return hit.length / targetTokens.length;
}

function matchSkills(jdSkills: string[], resumeSkills: string[]): DimensionScore {
  const resumeTokens = resumeSkills.flatMap(tokenize);
  const matched = jdSkills.filter((js) => tokenMatchScore(resumeTokens, js) >= 0.5);
  const partial = jdSkills.filter((js) => {
    const score = tokenMatchScore(resumeTokens, js);
    return score > 0 && score < 0.5;
  });
  const missing = jdSkills.filter((js) => tokenMatchScore(resumeTokens, js) === 0);

  const score = jdSkills.length > 0
    ? Math.round((matched.length / jdSkills.length) * 70 + (partial.length / jdSkills.length) * 30)
    : 50;

  const status = score >= 70 ? 'matched' : score >= 40 ? 'partial' : 'missing';

  return {
    key: 'hard_skills',
    name: '硬技能匹配',
    score: Math.min(score, 100),
    status,
    matched_items: [...matched, ...partial],
    missing_items: missing,
    explanation:
      matched.length > 0
        ? `简历匹配了 ${matched.length}/${jdSkills.length} 项硬技能${partial.length > 0 ? `（含 ${partial.length} 项部分匹配）` : ''}${missing.length > 0 ? `，缺少: ${missing.join('、')}` : ''}。`
        : '简历中未检测到 JD 要求的硬技能关键词。',
  };
}

function matchProjects(jd: JDProfile, resume: ResumeProfile): DimensionScore {
  const allActions = resume.projects.flatMap((p) => p.actions);
  const allMetrics = resume.projects.flatMap((p) => p.metrics);
  const actionTokens = allActions.flatMap(tokenize);

  const matched = jd.responsibilities.filter((r) => tokenMatchScore(actionTokens, r) >= 0.4);
  const hasMetrics = allMetrics.length > 0;

  const baseScore = jd.responsibilities.length > 0
    ? Math.round((matched.length / jd.responsibilities.length) * 60)
    : 40;
  const metricBonus = hasMetrics ? 20 : 0;
  const projectBonus = resume.projects.length > 0 ? Math.min(resume.projects.length * 7, 20) : 0;

  const score = Math.min(baseScore + metricBonus + projectBonus, 100);
  const status = score >= 70 ? 'matched' : score >= 40 ? 'partial' : 'missing';

  return {
    key: 'projects',
    name: '项目经历匹配',
    score,
    status,
    matched_items: matched,
    missing_items: jd.responsibilities.filter((r) => !matched.includes(r)),
    explanation:
      resume.projects.length > 0
        ? `简历包含 ${resume.projects.length} 个项目经历，覆盖 ${matched.length}/${jd.responsibilities.length} 项核心职责。${hasMetrics ? '有量化成果，加分。' : '缺少量化指标，建议补充。'}`
        : '简历未检测到项目经历。',
  };
}

function matchIndustry(jd: JDProfile, resume: ResumeProfile): DimensionScore {
  const resumeTokens = resume.industries.flatMap(tokenize);
  const matched = jd.industries.filter((ind) => tokenMatchScore(resumeTokens, ind) >= 0.4);
  const missing = jd.industries.filter((ind) => !matched.includes(ind));

  const score = jd.industries.length > 0
    ? Math.round((matched.length / jd.industries.length) * 100)
    : 50;
  const status = score >= 70 ? 'matched' : score >= 40 ? 'partial' : 'missing';

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

function matchSoftSkills(jd: JDProfile, resume: ResumeProfile): DimensionScore {
  const allText = [
    ...resume.projects.flatMap((p) => p.actions),
    ...resume.skills,
  ].join(' ');
  const allTokens = tokenize(allText);

  const keywordMap: Record<string, string[]> = {
    '沟通': ['沟通', '协作', '协调', 'stakeholder', '跨部门'],
    '协作': ['协作', '合作', '跨部门', '团队', '配合'],
    '管理': ['管理', 'leadership', '带领', '带队', '统筹'],
    '抗压': ['抗压', '压力', '快速迭代', '快节奏', 'ddl'],
    '结果导向': ['结果', '目标', 'kpi', 'okr', '交付', 'roi'],
    '表达': ['表达', '汇报', '演讲', 'presentation', '宣讲'],
    '主动': ['主动', '推动', '驱动', 'ownership', 'owner'],
    '分析': ['分析', '数据分析', '调研', '研究', '洞察'],
    '创新': ['创新', '0-1', '从0到1', '新模式'],
  };

  const matched = jd.soft_skills.filter((ss) => {
    for (const [key, kws] of Object.entries(keywordMap)) {
      if (ss.includes(key)) {
        return kws.some((kw) => tokenMatchScore(allTokens, kw) >= 0.5);
      }
    }
    return tokenMatchScore(allTokens, ss) >= 0.3;
  });

  const missing = jd.soft_skills.filter((ss) => !matched.includes(ss));
  const score = jd.soft_skills.length > 0
    ? Math.round((matched.length / jd.soft_skills.length) * 100)
    : 50;
  const status = score >= 70 ? 'matched' : score >= 40 ? 'partial' : 'missing';

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

function matchExperienceYears(jd: JDProfile, resume: ResumeProfile): DimensionScore {
  const required = jd.experience_years || 0;
  const actual = resume.experience_years || 0;

  let score: number;
  let matched: string[];
  let missing: string[];
  let explanation: string;

  if (required === 0) {
    score = 50;
    matched = ['JD 未明确要求年限'];
    missing = [];
    explanation = 'JD 未设定明确年限要求。';
  } else if (actual === 0) {
    score = 0;
    matched = [];
    missing = [`要求 ${required} 年，简历未提取到年限信息`];
    explanation = '未能从简历中提取到工作年限信息。';
  } else if (actual >= required) {
    score = 100;
    matched = [`简历 ${actual} 年 ≥ JD 要求 ${required} 年`];
    missing = [];
    explanation = `简历 ${actual} 年经验满足 JD ${required} 年要求。`;
  } else if (actual >= required * 0.7) {
    score = 60;
    matched = [`简历 ${actual} 年，接近要求 ${required} 年`];
    missing = [`差 ${(required - actual).toFixed(1)} 年`];
    explanation = `简历 ${actual} 年经验接近 JD ${required} 年要求，可通过其他优势弥补。`;
  } else {
    score = Math.round((actual / required) * 30);
    matched = [];
    missing = [`要求 ${required} 年，简历仅 ${actual} 年`];
    explanation = `简历 ${actual} 年经验与 JD ${required} 年要求差距较大。`;
  }

  const status = score >= 70 ? 'matched' : score >= 40 ? 'partial' : 'missing';

  return {
    key: 'experience_years',
    name: '工作年限匹配',
    score,
    status,
    matched_items: matched,
    missing_items: missing,
    explanation,
  };
}

function matchQuality(resume: ResumeProfile): DimensionScore {
  const metricCount = resume.metrics.length;
  const projectCount = resume.projects.length;
  const hasDetails = resume.projects.some((p) => p.actions.length > 1);
  const hasRiskItems = resume.risk_items.length > 0;

  const metricScore = metricCount >= 3 ? 40 : metricCount >= 1 ? 25 : 10;
  const projectScore = projectCount >= 3 ? 30 : projectCount >= 1 ? 20 : 0;
  const detailScore = hasDetails ? 30 : 15;
  const riskPenalty = hasRiskItems ? -10 : 0;

  const score = Math.min(Math.max(metricScore + projectScore + detailScore + riskPenalty, 0), 100);
  const status = score >= 70 ? 'matched' : score >= 40 ? 'partial' : 'missing';

  return {
    key: 'quality',
    name: '量化成果与表达质量',
    score,
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
  const dimensions = [
    matchSkills(jd.required_skills, resume.skills),
    matchProjects(jd, resume),
    matchIndustry(jd, resume),
    matchSoftSkills(jd, resume),
    matchExperienceYears(jd, resume),
    matchQuality(resume),
  ];

  const weights: Record<string, number> = {
    hard_skills: 0.30,
    projects: 0.20,
    industry: 0.10,
    soft_skills: 0.10,
    experience_years: 0.15,
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
