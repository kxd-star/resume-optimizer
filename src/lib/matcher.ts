import type {
  DimensionScore,
  EvidenceUnit,
  JDProfile,
  JDRequirementCategories,
  JobRoleFamily,
  MatchResult,
  RequirementEvidenceMatch,
  ResumeProfile,
} from '@/types';

const THRESHOLD_CONSERVATIVE = Number(process.env.THRESHOLD_CONSERVATIVE) || 80;
const THRESHOLD_STANDARD = Number(process.env.THRESHOLD_STANDARD) || 60;

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '');
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const normalized = normalize(text);
  const english = normalized.match(/[a-z0-9+#.]+/g) || [];
  tokens.push(...english);
  const chinese = normalized.match(/[\u4e00-\u9fa5]+/g) || [];
  for (const chunk of chinese) {
    if (chunk.length <= 4) tokens.push(chunk);
    for (let i = 0; i < chunk.length - 1; i += 1) tokens.push(chunk.slice(i, i + 2));
  }
  return unique(tokens);
}

function containsAny(text: string, words: string[]): boolean {
  const n = normalize(text);
  return words.some((word) => n.includes(normalize(word)));
}

const synonymGroups: string[][] = [
  ['产品运营', 'PMM', 'GTM', '产品推广', '上市', '运营'],
  ['AI产品', 'AI', '大模型', 'Agent', 'Skill', 'MaaS', 'LLM', '智能'],
  ['客户调研', '用户调研', '客户反馈', '现场调研', '竞品分析', '需求挖掘', '场景挖掘', '诉求'],
  ['解决方案', '方案包装', '场景方案', '生产场景解决方案', '能力封装'],
  ['共创', '共建', '联合', '标杆客户', '种子客户'],
  ['POC', '验证', '试点', 'Demo', '打单'],
  ['样板间', '标杆案例', '最佳实践', '实践系列', '案例', '营销资料包'],
  ['白皮书', '研究报告', '内容资产', '最佳实践文档', '行业研究'],
  ['跨团队', '资源整合', '协作', '沟通推进', '产研', '客户成功', '技术支持'],
  ['数据分析', '经营分析', 'BI', '指标', '看板', '大盘'],
  ['云计算', '云', 'FinOps', '成本治理', '成本优化', 'MaaS'],
  ['SaaS', '多租户', '企业服务', 'TOB', 'B端'],
];

function expandTerms(text: string): string[] {
  const hits: string[] = [];
  for (const group of synonymGroups) {
    if (containsAny(text, group)) hits.push(...group);
  }
  return unique([...tokenize(text), ...hits.map(normalize)]);
}

function scoreTextMatch(requirement: string, evidence: string): number {
  const reqTokens = expandTerms(requirement);
  const evTokens = expandTerms(evidence);
  if (reqTokens.length === 0) return 0;
  const directHit = containsAny(evidence, [requirement]) ? 1 : 0;
  const hitCount = reqTokens.filter((token) => evTokens.some((ev) => ev.includes(token) || token.includes(ev))).length;
  return Math.min(1, Math.max(directHit, hitCount / reqTokens.length));
}

function getRequirementCategories(jd: JDProfile): JDRequirementCategories {
  return jd.requirement_categories || {
    must_have_capabilities: jd.required_skills,
    work_activities: jd.responsibilities,
    deliverables: [],
    soft_skills: jd.soft_skills,
    bonus_points: jd.preferred_skills,
  };
}

function allEvidence(resume: ResumeProfile): EvidenceUnit[] {
  const units = resume.evidence_units || [];
  if (units.length > 0) return units;
  return resume.projects.map((project, index) => ({
    id: `ev_${index + 1}`,
    evidence: project.source_text || [project.name, ...project.actions, ...project.metrics].join('；'),
    source_project: project.name || `项目 ${index + 1}`,
    capabilities: project.actions,
    metrics: project.metrics,
    strength: project.metrics.length > 0 ? 'strong' : 'medium',
  }));
}

function matchRequirement(
  requirement: string,
  category: keyof JDRequirementCategories,
  evidenceUnits: EvidenceUnit[]
): RequirementEvidenceMatch {
  const scored = evidenceUnits
    .map((unit) => {
      const text = `${unit.evidence} ${unit.capabilities.join(' ')} ${unit.metrics.join(' ')}`;
      return { unit, score: scoreTextMatch(requirement, text) };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const evidence = scored
    .filter((item) => item.score >= 0.22)
    .slice(0, 3)
    .map((item) => `${item.unit.source_project}: ${item.unit.evidence}`);

  let status: RequirementEvidenceMatch['status'];
  let rewriteGuidance: RequirementEvidenceMatch['rewrite_guidance'];
  let gap: string;
  let score: number;

  if (best && best.score >= 0.5) {
    status = 'strong';
    rewriteGuidance = 'direct';
    gap = '简历已有明确证据，可在优化版中直接强化表达。';
    score = Math.round(Math.min(100, best.score * 100));
  } else if (best && best.score >= 0.22) {
    status = 'transferable';
    rewriteGuidance = 'conservative';
    gap = '简历有相邻或可迁移证据，建议保守改写，避免直接升级为未验证经历。';
    score = Math.round(Math.min(78, 45 + best.score * 70));
  } else {
    status = 'insufficient';
    rewriteGuidance = 'suggest_only';
    gap = '简历中未找到足够证据，不建议直接写入正文，可作为补充建议或面试准备点。';
    score = 25;
  }

  return {
    requirement,
    category,
    status,
    score,
    evidence,
    gap,
    rewrite_guidance: rewriteGuidance,
  };
}

function buildRequirementMatches(jd: JDProfile, resume: ResumeProfile): RequirementEvidenceMatch[] {
  const categories = getRequirementCategories(jd);
  const evidenceUnits = allEvidence(resume);
  const matches: RequirementEvidenceMatch[] = [];

  (Object.keys(categories) as (keyof JDRequirementCategories)[]).forEach((category) => {
    for (const requirement of categories[category] || []) {
      if (!requirement || requirement.length < 2) continue;
      matches.push(matchRequirement(requirement, category, evidenceUnits));
    }
  });

  const seen = new Set<string>();
  return matches.filter((item) => {
    const key = `${item.category}:${item.requirement}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreGroup(matches: RequirementEvidenceMatch[], categories: (keyof JDRequirementCategories)[]): number {
  const group = matches.filter((item) => item.category !== 'other' && categories.includes(item.category));
  if (group.length === 0) return 60;
  const sum = group.reduce((acc, item) => acc + item.score, 0);
  return Math.round(sum / group.length);
}

function statusFor(score: number): DimensionScore['status'] {
  if (score >= 75) return 'matched';
  if (score >= 45) return 'partial';
  return 'missing';
}

function dimensionFromMatches(
  key: string,
  name: string,
  score: number,
  matches: RequirementEvidenceMatch[]
): DimensionScore {
  const strong = matches.filter((item) => item.status === 'strong').map((item) => item.requirement);
  const transferable = matches.filter((item) => item.status === 'transferable').map((item) => item.requirement);
  const insufficient = matches.filter((item) => item.status === 'insufficient').map((item) => item.requirement);
  return {
    key,
    name,
    score,
    status: statusFor(score),
    matched_items: [...strong, ...transferable],
    missing_items: insufficient,
    explanation: `强证据 ${strong.length} 项，可迁移证据 ${transferable.length} 项，证据不足 ${insufficient.length} 项。`,
  };
}

function industryScore(jd: JDProfile, resume: ResumeProfile): DimensionScore {
  const jdIndustries = jd.industries || [];
  const resumeIndustries = resume.industries || [];
  const resumeText = `${resumeIndustries.join(' ')} ${(resume.capabilities || []).join(' ')} ${resume.projects.map((p) => p.source_text).join(' ')}`;
  const matched = jdIndustries.filter((industry) => scoreTextMatch(industry, resumeText) >= 0.22);
  const missing = jdIndustries.filter((industry) => !matched.includes(industry));
  const score = jdIndustries.length ? Math.round((matched.length / jdIndustries.length) * 100) : 70;
  return {
    key: 'industry',
    name: '行业与产品背景',
    score,
    status: statusFor(score),
    matched_items: matched,
    missing_items: missing,
    explanation: matched.length
      ? `简历体现 ${matched.join('、')} 等相关背景。`
      : '简历未充分体现 JD 要求的行业或产品背景。',
  };
}

function experienceScore(jd: JDProfile, resume: ResumeProfile): DimensionScore {
  const required = jd.experience_years || 0;
  const actual = resume.experience_years || 0;
  const score = required === 0 ? 70 : actual >= required ? 100 : actual === 0 ? 30 : Math.round(Math.min(70, (actual / required) * 70));
  return {
    key: 'experience_years',
    name: '工作年限匹配',
    score,
    status: statusFor(score),
    matched_items: actual && (!required || actual >= required) ? [`简历 ${actual} 年${required ? ` ≥ JD 要求 ${required} 年` : ''}`] : [],
    missing_items: required && actual < required ? [`JD 要求 ${required} 年，简历识别 ${actual || 0} 年`] : [],
    explanation: required ? `JD 要求约 ${required} 年经验，简历识别约 ${actual || 0} 年。` : 'JD 未明确年限要求。',
  };
}

function qualityScore(resume: ResumeProfile): DimensionScore {
  const metricCount = resume.metrics.length;
  const projectCount = resume.projects.length;
  const score = Math.min(100, (metricCount >= 8 ? 45 : metricCount >= 3 ? 35 : metricCount >= 1 ? 22 : 8) + Math.min(projectCount * 10, 35) + 15);
  return {
    key: 'quality',
    name: '量化成果与表达质量',
    score,
    status: statusFor(score),
    matched_items: metricCount > 0 ? [`${metricCount} 个量化指标`] : [],
    missing_items: metricCount === 0 ? ['缺少量化指标'] : [],
    explanation: metricCount > 0 ? `简历包含 ${metricCount} 个量化指标，结果表达基础较好。` : '简历缺少量化成果指标。',
  };
}

function buildDimensions(jd: JDProfile, resume: ResumeProfile, matches: RequirementEvidenceMatch[]): DimensionScore[] {
  const role = jd.role_family || 'general';
  if (role === 'ai_product_operations' || role === 'product_operations') {
    return [
      dimensionFromMatches(
        'ai_product_ops',
        role === 'ai_product_operations' ? 'AI 产品运营经验' : '产品运营经验',
        scoreGroup(matches, ['must_have_capabilities']),
        matches.filter((item) => item.category === 'must_have_capabilities')
      ),
      dimensionFromMatches(
        'work_activities',
        '运营动作与 GTM 闭环',
        scoreGroup(matches, ['work_activities']),
        matches.filter((item) => item.category === 'work_activities')
      ),
      dimensionFromMatches(
        'deliverables',
        '内容资产与案例沉淀',
        scoreGroup(matches, ['deliverables']),
        matches.filter((item) => item.category === 'deliverables')
      ),
      industryScore(jd, resume),
      dimensionFromMatches(
        'soft_skills',
        '跨团队推动与结构化能力',
        scoreGroup(matches, ['soft_skills']),
        matches.filter((item) => item.category === 'soft_skills')
      ),
      qualityScore(resume),
      experienceScore(jd, resume),
    ];
  }

  return [
    dimensionFromMatches(
      'capabilities',
      '核心能力匹配',
      scoreGroup(matches, ['must_have_capabilities', 'work_activities']),
      matches.filter((item) => item.category === 'must_have_capabilities' || item.category === 'work_activities')
    ),
    dimensionFromMatches(
      'deliverables',
      '交付物匹配',
      scoreGroup(matches, ['deliverables']),
      matches.filter((item) => item.category === 'deliverables')
    ),
    industryScore(jd, resume),
    dimensionFromMatches(
      'soft_skills',
      '软性素质匹配',
      scoreGroup(matches, ['soft_skills']),
      matches.filter((item) => item.category === 'soft_skills')
    ),
    qualityScore(resume),
    experienceScore(jd, resume),
  ];
}

function weightsFor(role: JobRoleFamily | undefined, dimensions: DimensionScore[]): Record<string, number> {
  if (role === 'ai_product_operations' || role === 'product_operations') {
    return {
      ai_product_ops: 0.24,
      work_activities: 0.22,
      deliverables: 0.14,
      industry: 0.12,
      soft_skills: 0.1,
      quality: 0.12,
      experience_years: 0.06,
    };
  }
  const equal = 1 / dimensions.length;
  return Object.fromEntries(dimensions.map((dim) => [dim.key, equal]));
}

function recommendMode(overallScore: number): { mode: 'conservative' | 'standard' | 'aggressive'; reason: string } {
  if (overallScore >= THRESHOLD_CONSERVATIVE) {
    return {
      mode: 'conservative',
      reason: `当前匹配度 ${overallScore}%，简历与岗位相关度较高，建议选择保守版，主要优化表达和结构。`,
    };
  }
  if (overallScore >= THRESHOLD_STANDARD) {
    return {
      mode: 'standard',
      reason: `当前匹配度 ${overallScore}%，已有较强相关基础，建议选择标准版，突出岗位证据和表达重点。`,
    };
  }
  return {
    mode: 'aggressive',
    reason: `当前匹配度 ${overallScore}%，存在明显表达或证据缺口，建议选择冲刺版，但无证据内容只能作为补充建议。`,
  };
}

function fitSummary(jd: JDProfile, matches: RequirementEvidenceMatch[]): string {
  const strong = matches.filter((item) => item.status === 'strong').length;
  const transferable = matches.filter((item) => item.status === 'transferable').length;
  const insufficient = matches.filter((item) => item.status === 'insufficient').length;
  if (jd.role_family === 'ai_product_operations') {
    return `候选人与「${jd.job_title}」属于同一 AI 产品运营/PMM 方向，已有 ${strong} 项强证据、${transferable} 项可迁移证据、${insufficient} 项证据不足。重点不是补经历，而是把平台运营语言改成 AI 产品运营、GTM、场景落地和反馈闭环语言。`;
  }
  return `候选人与「${jd.job_title}」已有 ${strong} 项强证据、${transferable} 项可迁移证据、${insufficient} 项证据不足。`;
}

export async function calculateMatch(jd: JDProfile, resume: ResumeProfile): Promise<MatchResult> {
  const requirementMatches = buildRequirementMatches(jd, resume);
  const dimensions = buildDimensions(jd, resume, requirementMatches);
  const weights = weightsFor(jd.role_family, dimensions);

  let overallScore = 0;
  for (const dim of dimensions) {
    overallScore += dim.score * (weights[dim.key] || 0);
  }
  overallScore = Math.round(Math.min(100, Math.max(0, overallScore)));

  const { mode, reason } = recommendMode(overallScore);

  return {
    overall_score: overallScore,
    dimensions,
    role_family: jd.role_family,
    fit_summary: fitSummary(jd, requirementMatches),
    requirement_matches: requirementMatches,
    recommend_mode: mode,
    recommend_reason: reason,
  };
}
