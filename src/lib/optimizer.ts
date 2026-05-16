import { callLLMWithJson } from './llm';
import type { JDProfile, ResumeProfile, MatchResult, ResumeDiagnosis, OptimizedResume, RewriteMode } from '@/types';

const OPTIMIZER_PROMPT_TEMPLATE = `You are a professional resume writer specializing in ATS-optimized resumes.

Given the original resume, JD analysis, and match results, rewrite the resume to better align with the target position.

Return a JSON object with this exact structure:
{
  "version": "the rewrite mode used",
  "optimized_resume": "the complete rewritten resume text",
  "changes": [
    {
      "before": "original text segment",
      "after": "rewritten text segment",
      "reason": "why this change was made",
      "needs_confirmation": ["items the user needs to verify"]
    }
  ],
  "placeholders": ["list of placeholders like [X%] that need user input"],
  "risk_warnings": ["list of potential risks in the rewrite"]
}

Rewrite Mode Guidelines:

CONSERVATIVE mode:
- Polish wording only
- Keep all original structure and emphasis
- Fix grammar and clarity issues
- Do NOT change the focus of any bullet point

STANDARD mode:
- Reorganize experience to highlight JD-relevant skills
- Strengthen action verbs (负责 -> 主导/推动)
- Add context to achievements
- Keep original facts intact

AGGRESSIVE (冲刺) mode:
- Strongly align with JD keywords and requirements
- Emphasize transferable skills
- Restructure content to highlight JD-relevant experience first
- Maximize keyword density for ATS

CRITICAL RULES - Anti-hallucination:
1. NEVER add company names, schools, certifications not in the original resume
2. NEVER fabricate specific numbers or metrics — use [placeholder] format
3. NEVER upgrade "participated" to "led" without evidence in the original text
4. NEVER claim individual credit for team achievements
5. ALWAYS mark uncertain information with [brackets] and include in needs_confirmation
6. If the original has no metrics, suggest adding them as [待补充]
7. Keep all original factual claims intact — only improve expression

Format the optimized_resume as a clean, well-structured plain text resume ready for ATS parsing.`;

export async function optimizeResume(
  originalResume: string,
  jd: JDProfile,
  resume: ResumeProfile,
  match: MatchResult,
  diagnosis: ResumeDiagnosis,
  mode: RewriteMode
): Promise<OptimizedResume> {
  const modeLabel = mode === 'conservative' ? 'CONSERVATIVE' : mode === 'standard' ? 'STANDARD' : 'AGGRESSIVE';

  const prompt = `${OPTIMIZER_PROMPT_TEMPLATE}

Rewrite Mode: ${modeLabel}

Original Resume:
${originalResume}

JD Analysis:
- Title: ${jd.job_title}
- Required Skills: ${jd.required_skills.join(', ')}
- Preferred Skills: ${jd.preferred_skills.join(', ')}
- Responsibilities: ${jd.responsibilities.join(', ')}
- Soft Skills: ${jd.soft_skills.join(', ')}
- Business Goals: ${jd.business_goals.join(', ')}
- Industries: ${jd.industries.join(', ')}

Current Match Score: ${match.overall_score}/100
Recommended Mode: ${match.recommend_mode}

Diagnosis Highlights:
- Matched: ${diagnosis.matched.slice(0, 3).join('; ')}
- Missing: ${diagnosis.missing.slice(0, 3).join('; ')}
- Risk Items: ${diagnosis.risk_items.filter((r) => r.risk_level === 'high').map((r) => r.issue).join('; ')}`;

  try {
    const result = await callLLMWithJson<{
      version: string;
      optimized_resume: string;
      changes: { before: string; after: string; reason: string; needs_confirmation: string[] }[];
      placeholders: string[];
      risk_warnings: string[];
    }>(prompt);

    return {
      version: mode,
      optimized_resume: result.optimized_resume || '',
      changes: result.changes || [],
      placeholders: result.placeholders || [],
      risk_warnings: result.risk_warnings || [],
    };
  } catch (error) {
    throw new Error(`简历优化失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}
