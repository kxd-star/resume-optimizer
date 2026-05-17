import { callLLMWithJson } from './llm';
import { InterviewQuestionsSchema } from './validation-schema';
import type { JDProfile, ResumeProfile, MatchResult, InterviewQuestions } from '@/types';

const INTERVIEW_PROMPT = `You are a senior interview coach. Generate high-probability interview questions from JD requirements and resume evidence.

Return JSON:
{
  "questions": [
    {
      "type": "硬技能考察/项目深挖/经历空白/行为面试/动机匹配/压力追问",
      "question": "question",
      "source": "JD requirement + resume evidence/gap",
      "difficulty": "easy/medium/hard",
      "risk_level": "low/medium/high",
      "evaluation_point": "what interviewer evaluates",
      "answer_strategy": "answer strategy",
      "sample_answers": ["safe sample answer templates"],
      "materials_to_prepare": ["materials/data to prepare"],
      "pitfalls": ["what to avoid"]
    }
  ]
}

Rules:
- Base every question on the requirement-to-evidence matrix.
- Do NOT invent metrics in sample answers. Use [请补充真实数据] when data is missing.
- For evidence gaps, frame constructively: how to bridge or explain the gap.
- For transferable evidence, say it is transferable; do not pretend it is direct experience.
- For AI product operations roles, focus on AI产品运营、GTM、用户/客户场景、产品反馈闭环、案例沉淀、数据分析、跨团队推动.
- Return ONLY valid JSON.`;

export async function generateInterviewQuestions(
  jd: JDProfile,
  resume: ResumeProfile,
  match: MatchResult,
  count: number
): Promise<InterviewQuestions> {
  const evidenceMatrix = (match.requirement_matches || [])
    .map((item) => `- ${item.requirement} | ${item.status} | evidence=${item.evidence.slice(0, 2).join(' || ')} | gap=${item.gap}`)
    .join('\n');

  const prompt = `${INTERVIEW_PROMPT}

Generate exactly ${count} questions.

JD:
- Title: ${jd.job_title}
- Role family: ${jd.role_family || 'general'}
- Required skills: ${jd.required_skills.join(', ')}
- Responsibilities: ${jd.responsibilities.join(', ')}
- Interview focus: ${jd.interview_focus.join(', ')}

Resume:
- Name: ${resume.candidate_name}
- Current title: ${resume.target_title}
- Skills: ${resume.skills.join(', ')}
- Capabilities: ${(resume.capabilities || []).join(', ')}
- Experience: ${resume.experience_years} years
- Projects: ${resume.projects.map((p) => `${p.name}: ${p.actions.join(', ')} (Metrics: ${p.metrics.join(', ') || 'N/A'})`).join('\n')}

Match score: ${match.overall_score}/100
Fit summary: ${match.fit_summary || ''}

Requirement-to-evidence matrix:
${evidenceMatrix}`;

  try {
    const result = await callLLMWithJson(prompt, { maxTokens: 8192, schema: InterviewQuestionsSchema });
    if (!result.questions || !Array.isArray(result.questions)) {
      throw new Error('Invalid interview questions response');
    }
    return {
      questions: result.questions.slice(0, count).map((question) => ({
        ...question,
        sample_answers: question.sample_answers || [],
        materials_to_prepare: question.materials_to_prepare || [],
        pitfalls: question.pitfalls || [],
      })),
    };
  } catch (error) {
    throw new Error(`面试题生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}
