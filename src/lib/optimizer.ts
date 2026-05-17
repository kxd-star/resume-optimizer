import { callLLMWithJson } from './llm';
import { OptimizedResumeSchema } from './validation-schema';
import { verifyOptimizedResume, formatFactCheckWarning } from './fact-check';
import type { JDProfile, ResumeProfile, MatchResult, ResumeDiagnosis, OptimizedResume, RewriteMode } from '@/types';

const OPTIMIZER_PROMPT_TEMPLATE = `You are a senior resume strategist. Rewrite the resume for the target JD using evidence-bounded language.

Return JSON:
{
  "version": "conservative/standard/aggressive",
  "optimized_resume": "complete plain-text ATS-friendly resume",
  "changes": [
    {
      "before": "original text segment",
      "after": "rewritten text segment",
      "reason": "why this change was made",
      "needs_confirmation": ["items the user must verify"]
    }
  ],
  "placeholders": ["placeholders such as [请确认具体数据]"],
  "risk_warnings": ["risks in the rewrite"]
}

Evidence boundary rules:
- If a requirement has guidance=direct, you may write it directly.
- If guidance=conservative, use safer language such as "支持/参与/沉淀/可迁移到/形成经验", not a stronger claim.
- If guidance=suggest_only, do NOT write it into resume body. Put it in risk_warnings or needs_confirmation only.
- Do not add deep interview, questionnaire research, white paper, sample room, or joint POC ownership unless supported by evidence.
- Do not invent numbers. If a number is needed, use [请补充真实数据].
- Keep the target role title exactly as parsed from the JD.

Role positioning:
- For AI product operations roles, optimize toward: AI产品运营、PMM/GTM、用户/客户场景挖掘、产品反馈闭环、案例/最佳实践沉淀、数据分析和跨团队推动.
- Do not over-transform a product operations resume into a solution architect/sales solution resume.`;

export async function optimizeResume(
  originalResume: string,
  jd: JDProfile,
  resume: ResumeProfile,
  match: MatchResult,
  diagnosis: ResumeDiagnosis,
  mode: RewriteMode
): Promise<OptimizedResume> {
  const modeLabel = mode === 'conservative' ? 'CONSERVATIVE' : mode === 'standard' ? 'STANDARD' : 'AGGRESSIVE';
  const evidenceMatrix = (match.requirement_matches || [])
    .map((item) => `- ${item.requirement} | ${item.status} | guidance=${item.rewrite_guidance} | evidence=${item.evidence.slice(0, 2).join(' || ')} | gap=${item.gap}`)
    .join('\n');

  const prompt = `${OPTIMIZER_PROMPT_TEMPLATE}

Rewrite Mode: ${modeLabel}

Target JD:
- Exact title: ${jd.job_title}
- Role family: ${jd.role_family || 'general'}
- Required skills: ${jd.required_skills.join(', ')}
- Responsibilities: ${jd.responsibilities.join(', ')}
- Deliverables: ${jd.requirement_categories?.deliverables?.join(', ') || ''}
- Work activities: ${jd.requirement_categories?.work_activities?.join(', ') || ''}

Match summary:
- Score: ${match.overall_score}/100
- Fit summary: ${match.fit_summary || ''}
- Recommendation: ${match.recommend_reason}

Requirement-to-evidence matrix:
${evidenceMatrix}

Diagnosis:
- Strong evidence: ${diagnosis.matched.slice(0, 6).join('; ')}
- Transferable evidence: ${diagnosis.partial.slice(0, 6).join('; ')}
- Evidence gaps: ${diagnosis.missing.slice(0, 6).join('; ')}

Original Resume:
${originalResume}`;

  try {
    const result = await callLLMWithJson(prompt, { maxTokens: 8192, schema: OptimizedResumeSchema });
    const fcIssues = verifyOptimizedResume(originalResume, result.optimized_resume || '');
    const fcMsg = formatFactCheckWarning(fcIssues);

    return {
      version: mode,
      optimized_resume: result.optimized_resume || '',
      changes: (result.changes || []).map((change) => ({
        ...change,
        needs_confirmation: change.needs_confirmation || [],
      })),
      placeholders: result.placeholders || [],
      risk_warnings: [
        ...(result.risk_warnings || []),
        ...(fcMsg ? [fcMsg] : []),
      ],
    };
  } catch (error) {
    throw new Error(`简历优化失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}
