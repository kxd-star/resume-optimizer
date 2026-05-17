import { callLLMWithJson } from './llm';
import { ResumeDiagnosisSchema } from './validation-schema';
import type { JDProfile, MatchResult, ResumeDiagnosis, ResumeProfile, RiskItem } from '@/types';

function generateRuleBasedRiskItems(resume: ResumeProfile): RiskItem[] {
  const risks: RiskItem[] = [];

  for (const project of resume.projects) {
    if (project.metrics.length === 0) {
      risks.push({
        type: 'missing_metric',
        source: project.name || project.source_text.substring(0, 50),
        issue: '项目缺少量化结果指标',
        suggestion: '补充效率提升、转化率、成本下降、客户数量、交付周期等数据；没有精确数据时使用待确认占位符。',
        risk_level: 'medium',
      });
    }
  }

  const vague = resume.projects
    .flatMap((project) => project.actions)
    .filter((action) => /负责|参与|协助|配合/.test(action))
    .slice(0, 3);

  for (const action of vague) {
    risks.push({
      type: 'vague_expression',
      source: action,
      issue: '存在偏职责描述的表达',
      suggestion: '建议补充目标、动作、协作对象和结果，但不要把参与经历直接升级为主导。',
      risk_level: 'low',
    });
  }

  if (resume.metrics.length === 0) {
    risks.push({
      type: 'no_metrics',
      source: '整体简历',
      issue: '整份简历缺少量化数据',
      suggestion: '至少为核心项目补充一个结果指标或业务影响。',
      risk_level: 'high',
    });
  }

  return risks;
}

const REWRITE_SUGGESTION_PROMPT = `You are a resume diagnosis assistant. Generate rewrite suggestions only.

Return JSON:
{
  "matched": [],
  "partial": [],
  "missing": [],
  "rewrite_suggestions": [
    {"before": "original text", "after": "safer rewritten text", "reason": "why"}
  ]
}

Rules:
- Do not classify matched/missing; leave matched/partial/missing as empty arrays. The system handles classification.
- Suggestions must be evidence-bounded.
- If a JD term is not directly evidenced, use conservative wording such as "可沉淀为", "支持", "参与", "形成可复用经验"; do not directly claim it.
- Do not add new metrics, deep interviews, surveys, white papers, or POC ownership unless present in source text.
- Return ONLY valid JSON.`;

function dedupeByRequirement(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.split('：')[0].trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function generateDiagnosis(
  jd: JDProfile,
  resume: ResumeProfile,
  match: MatchResult
): Promise<ResumeDiagnosis> {
  const ruleRisks = generateRuleBasedRiskItems(resume);
  const requirementMatches = match.requirement_matches || [];

  const matched = dedupeByRequirement(requirementMatches
    .filter((item) => item.status === 'strong')
    .map((item) => `${item.requirement}：已有明确证据。${item.evidence[0] || ''}`));

  const partial = dedupeByRequirement(requirementMatches
    .filter((item) => item.status === 'transferable')
    .map((item) => `${item.requirement}：有可迁移证据，建议保守改写。${item.evidence[0] || item.gap}`));

  const missing = dedupeByRequirement(requirementMatches
    .filter((item) => item.status === 'insufficient')
    .map((item) => `${item.requirement}：证据不足，不建议直接写入简历正文。${item.gap}`));

  const prompt = `${REWRITE_SUGGESTION_PROMPT}

Job title: ${jd.job_title}
Role family: ${jd.role_family || 'general'}

Resume projects:
${resume.projects.map((p) => `- ${p.name}: ${p.source_text}`).join('\n')}

Requirement evidence matches:
${requirementMatches.map((m) => `- ${m.requirement} | ${m.status} | guidance=${m.rewrite_guidance} | evidence=${m.evidence.slice(0, 2).join(' || ')}`).join('\n')}`;

  try {
    const llmResult = await callLLMWithJson(prompt, { schema: ResumeDiagnosisSchema });

    return {
      matched,
      partial,
      missing,
      risk_items: ruleRisks,
      rewrite_suggestions: llmResult.rewrite_suggestions || [],
    };
  } catch {
    return {
      matched,
      partial,
      missing,
      risk_items: ruleRisks,
      rewrite_suggestions: [],
    };
  }
}
