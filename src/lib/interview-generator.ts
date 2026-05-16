import { callLLMWithJson } from './llm';
import type { JDProfile, ResumeProfile, MatchResult, InterviewQuestions } from '@/types';

const INTERVIEW_PROMPT = `You are a senior interview coach. Based on the JD requirements and the candidate's resume, generate high-probability interview questions.

Return a JSON object with this exact structure:
{
  "questions": [
    {
      "type": "one of: 硬技能考察, 项目深挖, 经历空白, 行为面试, 动机匹配, 压力追问",
      "question": "the interview question",
      "source": "where this question comes from (JD requirement, resume gap, etc.)",
      "difficulty": "easy/medium/hard",
      "risk_level": "low/medium/high",
      "evaluation_point": "what the interviewer is assessing",
      "answer_strategy": "how to structure the answer (e.g., STAR method)",
      "sample_answers": ["2-3 example answers of varying quality"],
      "materials_to_prepare": ["specific data points or stories to prepare"],
      "pitfalls": ["what to avoid in the answer"]
    }
  ]
}

Question Distribution Guidelines:
- 2-3 questions about JD required skills that match resume skills (硬技能考察)
- 2-3 questions deep-diving into resume projects (项目深挖)
- 1-2 questions about gaps where JD asks for skills not in resume (经历空白)
- 1-2 behavioral questions based on JD soft skills (行为面试)
- 1 question about career motivation (动机匹配)
- 1 pressure question about resume risk areas (压力追问)

Rules:
- Base questions on REAL intersections of JD and resume.
- For 经历空白 questions, frame them constructively — ask how the candidate would bridge the gap.
- risk_level should be "high" for questions about missing requirements or resume inconsistencies.
- Provide actionable answer_strategy specific to the question.
- Return ONLY valid JSON, no markdown formatting.`;

export async function generateInterviewQuestions(
  jd: JDProfile,
  resume: ResumeProfile,
  match: MatchResult,
  count: number
): Promise<InterviewQuestions> {
  const prompt = `${INTERVIEW_PROMPT}

Generate exactly ${count} questions.

JD Summary:
- Title: ${jd.job_title}
- Required Skills: ${jd.required_skills.join(', ')}
- Preferred Skills: ${jd.preferred_skills.join(', ')}
- Soft Skills: ${jd.soft_skills.join(', ')}
- Responsibilities: ${jd.responsibilities.join(', ')}
- Experience Required: ${jd.experience_years} years
- Interview Focus: ${jd.interview_focus.join(', ')}

Resume Summary:
- Name: ${resume.candidate_name}
- Current Title: ${resume.target_title}
- Skills: ${resume.skills.join(', ')}
- Experience: ${resume.experience_years} years
- Projects: ${resume.projects.map((p) => `${p.name}: ${p.actions.join(', ')} (Metrics: ${p.metrics.join(', ') || 'N/A'})`).join('\n')}

Match Score: ${match.overall_score}/100
Gaps: ${match.dimensions.filter((d) => d.status === 'missing' || d.status === 'partial').map((d) => `${d.name}: ${d.missing_items.join(', ')}`).join('; ')}`;

  try {
    const result = await callLLMWithJson<InterviewQuestions>(prompt, { maxTokens: 8192 });

    // Ensure we have the right number of questions
    if (!result.questions || !Array.isArray(result.questions)) {
      throw new Error('Invalid interview questions response');
    }

    return {
      questions: result.questions.slice(0, count),
    };
  } catch (error) {
    throw new Error(`面试题生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}
