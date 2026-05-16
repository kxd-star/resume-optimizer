import { callLLMWithJson } from './llm';
import type { ResumeProfile } from '@/types';

const RESUME_PARSE_PROMPT = `You are a professional resume analyst. Given a resume text, extract structured information.

Analyze the following resume and return a JSON object with this exact structure:
{
  "candidate_name": "string - candidate name extracted from resume",
  "target_title": "string - target position or current position title",
  "skills": ["array of strings - all technical and domain skills mentioned"],
  "industries": ["array of strings - industries the candidate has worked in"],
  "experience_years": "number - total years of work experience (0 if not clear)",
  "projects": [
    {
      "name": "project or work item name",
      "role": "candidate's role in this project",
      "actions": ["specific actions taken"],
      "metrics": ["quantified results if any"],
      "source_text": "original text from resume for this project"
    }
  ],
  "education": ["array of strings - education entries"],
  "metrics": ["array of strings - any numbers/percentages found"],
  "risk_items": ["array of strings - potential issues like missing dates, vague descriptions"]
}

Rules:
- Extract ONLY information present in the resume. Do not invent details.
- If the resume mentions quantified metrics, include them in the metrics array.
- For projects, try to identify 1-5 major projects or work experiences.
- If source_text is too long, summarize it while preserving key information.
- Note any risk_items such as: career gaps, vague descriptions, lack of metrics.
- Return ONLY valid JSON, no markdown formatting.`;

export async function parseResume(resumeText: string): Promise<ResumeProfile> {
  if (!resumeText || resumeText.trim().length < 20) {
    throw new Error('简历文本过短，请补充完整的工作经历和技能');
  }

  const prompt = `${RESUME_PARSE_PROMPT}\n\nResume:\n${resumeText}`;

  try {
    const result = await callLLMWithJson<ResumeProfile>(prompt);
    // Validate required fields
    if (!result.candidate_name) result.candidate_name = '未知';
    if (!result.target_title) result.target_title = '未知';
    if (!Array.isArray(result.skills)) result.skills = [];
    if (!Array.isArray(result.industries)) result.industries = [];
    if (typeof result.experience_years !== 'number') result.experience_years = 0;
    if (!Array.isArray(result.projects)) result.projects = [];
    if (!Array.isArray(result.education)) result.education = [];
    if (!Array.isArray(result.metrics)) result.metrics = [];
    if (!Array.isArray(result.risk_items)) result.risk_items = [];
    return result;
  } catch (error) {
    throw new Error(`简历解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}
