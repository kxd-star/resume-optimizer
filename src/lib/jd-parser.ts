import { callLLMWithJson } from './llm';
import { JDProfileSchema } from './validation-schema';
import type { JDProfile, JobRoleFamily, JDRequirementCategories } from '@/types';

const JD_PARSE_PROMPT = `You are a senior recruiting analyst. Parse the JD into structured fields for resume matching.

Return a JSON object with this exact structure:
{
  "job_title": "string - prefer the exact title appearing in the JD heading; do not infer a different title",
  "raw_job_title": "string - original title text if present",
  "role_family": "one of: ai_product_operations, product_operations, solution, product_manager, data, sales, engineering, general",
  "required_skills": ["hard skills or domain skills only; do NOT include responsibilities or soft skills"],
  "preferred_skills": ["skills/background marked as preferred/plus"],
  "soft_skills": ["soft skills such as communication, ownership, structured thinking"],
  "experience_years": "number - minimum years required, 0 if not specified",
  "industries": ["industries or product domains mentioned or strongly implied"],
  "business_goals": ["business goals such as adoption, growth, efficiency, conversion"],
  "responsibilities": ["main job responsibilities"],
  "interview_focus": ["likely interview focus areas"],
  "requirement_categories": {
    "must_have_capabilities": ["core capabilities the candidate must demonstrate"],
    "work_activities": ["activities the role performs, e.g. research, GTM, POC support"],
    "deliverables": ["expected outputs, e.g. best practices, training docs, white papers"],
    "soft_skills": ["soft skills"],
    "bonus_points": ["nice-to-have backgrounds/tools"]
  }
}

Rules:
- Extract only information grounded in the JD.
- The job title is critical. If the JD says "产品运营专家-AI产品", keep that meaning. Do NOT rewrite it as "AI解决方案专家".
- Separate product operations roles from solution roles.
- Separate requirement types: skills, work activities, deliverables, and soft skills.
- For experience_years, parse "3年以上" as 3. If not specified, return 0.
- Return ONLY valid JSON, no markdown.`;

function extractExplicitJobTitle(jdText: string): string | undefined {
  const lines = jdText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  const patterns = [
    /(?:岗位|职位|职务|招聘岗位|岗位名称)\s*[:：]\s*([^\n|，。；;]{2,50})/i,
    /^([^\n]{2,50}(?:产品运营|运营专家|产品经理|解决方案|算法|数据|销售|专家|经理)[^\n]{0,20})$/,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) return match[1].replace(/[|｜].*$/, '').trim();
    }
  }
  return undefined;
}

function inferRoleFamily(title: string, jdText: string): JobRoleFamily {
  const text = `${title}\n${jdText}`.toLowerCase();
  if (/ai|大模型|agent|llm|智能/.test(text) && /产品运营|运营专家|pmm|gtm|用户运营|产品推广/i.test(text)) {
    return 'ai_product_operations';
  }
  if (/产品运营|运营专家|pmm|gtm|用户运营|产品推广/i.test(text)) return 'product_operations';
  if (/解决方案|售前|方案专家|solution/i.test(text)) return 'solution';
  if (/产品经理|product manager|prd/i.test(text)) return 'product_manager';
  if (/数据分析|数据科学|bi|data/i.test(text)) return 'data';
  if (/销售|客户经理|商务|account/i.test(text)) return 'sales';
  if (/工程师|开发|算法|研发|架构/i.test(text)) return 'engineering';
  return 'general';
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function buildFallbackCategories(result: JDProfile): JDRequirementCategories {
  const all = unique([
    ...result.required_skills,
    ...result.responsibilities,
    ...result.soft_skills,
    ...result.preferred_skills,
  ]);
  const deliverableWords = /白皮书|案例|最佳实践|培训|材料|内容|文档|报告|样板间|demo|解决方案/i;
  const activityWords = /调研|访谈|挖掘|推广|gtm|运营|poc|共创|推进|迭代|反馈|转化|增长/i;
  const softWords = /沟通|协作|推动|表达|判断|整合|抗压|owner|ownership/i;

  return {
    must_have_capabilities: unique(result.required_skills.filter((item) => !deliverableWords.test(item) && !activityWords.test(item) && !softWords.test(item))),
    work_activities: unique(all.filter((item) => activityWords.test(item))),
    deliverables: unique(all.filter((item) => deliverableWords.test(item))),
    soft_skills: unique(result.soft_skills.length ? result.soft_skills : all.filter((item) => softWords.test(item))),
    bonus_points: unique(result.preferred_skills),
  };
}

export async function parseJD(jdText: string): Promise<JDProfile> {
  if (!jdText || jdText.trim().length < 20) {
    throw new Error('JD 文本过短，请补充完整的岗位描述。');
  }

  const prompt = `${JD_PARSE_PROMPT}\n\nJob Description:\n${jdText}`;

  try {
    const parsed = await callLLMWithJson(prompt, { schema: JDProfileSchema }) as unknown as JDProfile;
    const explicitTitle = extractExplicitJobTitle(jdText);
    if (explicitTitle) {
      parsed.raw_job_title = explicitTitle;
      parsed.job_title = explicitTitle;
    }
    parsed.role_family = inferRoleFamily(parsed.job_title, jdText);
    parsed.requirement_categories = {
      ...buildFallbackCategories(parsed),
      ...(parsed.requirement_categories || {}),
    };
    return parsed;
  } catch (error) {
    throw new Error(`JD 解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}
