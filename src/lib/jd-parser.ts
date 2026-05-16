import { callLLMWithJson } from './llm';
import type { JDProfile } from '@/types';

const JD_PARSE_PROMPT = `You are a professional job description analyst. Given a job description, extract structured information.

Analyze the following JD and return a JSON object with this exact structure:
{
  "job_title": "string - the exact job title",
  "required_skills": ["array of strings - technical and domain skills listed as requirements"],
  "preferred_skills": ["array of strings - skills marked as 优先/加分/preferred"],
  "soft_skills": ["array of strings - soft skills like communication, teamwork, leadership"],
  "experience_years": "number - minimum years of experience required (0 if not specified)",
  "industries": ["array of strings - relevant industries mentioned"],
  "business_goals": ["array of strings - business objectives like growth, efficiency, conversion"],
  "responsibilities": ["array of strings - key job responsibilities"],
  "interview_focus": ["array of strings - inferred topics the interview may focus on"]
}

Rules:
- Extract ONLY information present in the JD. Do not invent details.
- For experience_years, parse the numeric value. If "3年以上" -> 3. If not specified -> 0.
- For industries, infer from company description or product context if available.
- For interview_focus, infer from the JD what topics interviewers would probe.
- Return ONLY valid JSON, no markdown formatting.`;

export async function parseJD(jdText: string): Promise<JDProfile> {
  if (!jdText || jdText.trim().length < 20) {
    throw new Error('JD 文本过短，请补充完整的岗位描述');
  }

  const prompt = `${JD_PARSE_PROMPT}\n\nJob Description:\n${jdText}`;

  try {
    const result = await callLLMWithJson<JDProfile>(prompt);
    // Validate required fields
    if (!result.job_title) result.job_title = '未知岗位';
    if (!Array.isArray(result.required_skills)) result.required_skills = [];
    if (!Array.isArray(result.preferred_skills)) result.preferred_skills = [];
    if (!Array.isArray(result.soft_skills)) result.soft_skills = [];
    if (typeof result.experience_years !== 'number') result.experience_years = 0;
    if (!Array.isArray(result.industries)) result.industries = [];
    if (!Array.isArray(result.business_goals)) result.business_goals = [];
    if (!Array.isArray(result.responsibilities)) result.responsibilities = [];
    if (!Array.isArray(result.interview_focus)) result.interview_focus = [];
    return result;
  } catch (error) {
    throw new Error(`JD 解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}
