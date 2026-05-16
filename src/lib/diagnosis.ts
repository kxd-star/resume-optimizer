import { callLLMWithJson } from './llm';
import type { JDProfile, ResumeProfile, MatchResult, ResumeDiagnosis, RiskItem } from '@/types';

function generateRuleBasedRiskItems(resume: ResumeProfile): RiskItem[] {
  const risks: RiskItem[] = [];

  for (const project of resume.projects) {
    if (project.metrics.length === 0) {
      risks.push({
        type: 'missing_metric',
        source: project.name || project.source_text.substring(0, 50),
        issue: '项目缺少量化结果指标',
        suggestion: '补充效率提升、转化率、成本下降等数据。如果没有精确数据，可注明数据范围或待补充。',
        risk_level: 'medium',
      });
    }
    const vagueVerbs = ['负责', '参与', '协助', '帮忙'];
    for (const action of project.actions) {
      if (vagueVerbs.some((v) => action.includes(v))) {
        risks.push({
          type: 'vague_expression',
          source: action,
          issue: `使用了"${vagueVerbs.find((v) => action.includes(v))}"等模糊动词`,
          suggestion: `建议改为"主导""推动""交付"等更强动作的词汇，突出个人贡献。`,
          risk_level: 'low',
        });
        break;
      }
    }
  }

  if (resume.metrics.length === 0) {
    risks.push({
      type: 'no_metrics',
      source: '整体简历',
      issue: '整份简历缺少任何量化数据',
      suggestion: '尽可能为每个项目补充至少一个量化指标，如规模、效率提升、用户数等。',
      risk_level: 'high',
    });
  }

  return risks;
}

const DIAGNOSIS_LLM_PROMPT = `You are a professional resume diagnostic analyst. Based on the JD requirements, resume profile, and match result, generate a comprehensive resume diagnosis.

Return a JSON object with this exact structure:
{
  "matched": ["list of aspects where the resume meets JD requirements"],
  "partial": ["list of aspects where the resume partially meets requirements"],
  "missing": ["list of aspects that are missing from the resume"],
  "rewrite_suggestions": [
    {
      "before": "original text from resume",
      "after": "suggested improved version",
      "reason": "why this change is recommended"
    }
  ]
}

Rules:
- matched, partial, missing should be specific and actionable.
- rewrite_suggestions should focus on improving expression, not fabricating experience.
- Do NOT suggest fabricating metrics or experience.
- If there are no specific rewrite suggestions, provide general improvement suggestions.
- Return ONLY valid JSON, no markdown formatting.`;

export async function generateDiagnosis(
  jd: JDProfile,
  resume: ResumeProfile,
  match: MatchResult
): Promise<ResumeDiagnosis> {
  const ruleRisks = generateRuleBasedRiskItems(resume);

  // Build matched/partial/missing from dimension data
  const matched: string[] = [];
  const partial: string[] = [];
  const missing: string[] = [];

  for (const dim of match.dimensions) {
    if (dim.status === 'matched') {
      matched.push(`${dim.name}: ${dim.matched_items.join('、')}`);
    } else if (dim.status === 'partial') {
      partial.push(`${dim.name}: ${dim.explanation}`);
    } else {
      missing.push(`${dim.name}: ${dim.missing_items.join('、') || dim.explanation}`);
    }
  }

  // Use LLM for rewrite suggestions
  const prompt = `${DIAGNOSIS_LLM_PROMPT}

JD:
- Title: ${jd.job_title}
- Required Skills: ${jd.required_skills.join(', ')}
- Responsibilities: ${jd.responsibilities.join(', ')}
- Soft Skills: ${jd.soft_skills.join(', ')}

Resume:
- Name: ${resume.candidate_name}
- Title: ${resume.target_title}
- Skills: ${resume.skills.join(', ')}
- Projects: ${resume.projects.map((p) => p.source_text).join('\n')}
- Metrics: ${resume.metrics.join(', ')}

Match Score: ${match.overall_score}/100`;

  try {
    const llmResult = await callLLMWithJson<{
      matched: string[];
      partial: string[];
      missing: string[];
      rewrite_suggestions: { before: string; after: string; reason: string }[];
    }>(prompt);

    return {
      matched: [...new Set([...matched, ...(llmResult.matched || [])])],
      partial: [...new Set([...partial, ...(llmResult.partial || [])])],
      missing: [...new Set([...missing, ...(llmResult.missing || [])])],
      risk_items: ruleRisks,
      rewrite_suggestions: llmResult.rewrite_suggestions || [],
    };
  } catch {
    // Fallback to rule-based only if LLM fails
    return {
      matched,
      partial,
      missing,
      risk_items: ruleRisks,
      rewrite_suggestions: [],
    };
  }
}
