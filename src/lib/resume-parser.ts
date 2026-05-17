import { callLLMWithJson } from './llm';
import { ResumeProfileSchema } from './validation-schema';
import type { EvidenceUnit, ResumeProfile } from '@/types';

const RESUME_PARSE_PROMPT = `You are a senior resume analyst. Extract structured information and evidence units for JD matching.

Return a JSON object with this exact structure:
{
  "candidate_name": "candidate name",
  "target_title": "target or current role title",
  "skills": ["technical/domain/product skills mentioned"],
  "industries": ["industries/product domains evidenced by the resume"],
  "capabilities": ["capabilities evidenced by projects, e.g. AI产品运营, GTM, 客户调研, POC支持"],
  "experience_years": "number - total years of work experience",
  "projects": [
    {
      "name": "project/work item name",
      "role": "candidate role",
      "actions": ["specific actions taken"],
      "metrics": ["quantified results or concrete outputs"],
      "source_text": "original source text"
    }
  ],
  "evidence_units": [
    {
      "id": "short id",
      "evidence": "specific resume evidence, grounded in source text",
      "source_project": "project name",
      "capabilities": ["capabilities proven by this evidence"],
      "metrics": ["metrics in this evidence"],
      "strength": "strong/medium/weak"
    }
  ],
  "education": ["education entries"],
  "metrics": ["all numbers/percentages found"],
  "risk_items": ["potential issues such as vague metrics or unclear dates"]
}

Rules:
- Extract only information present in the resume.
- Evidence units are more important than generic skills. Each unit should be concrete enough to support a JD requirement.
- Infer industries from products and customers when strongly evidenced, e.g. Agent/MaaS -> AI/云计算, BI多租户 -> SaaS/企业服务, POC/签单/客户案例 -> TOB.
- Do not invent results or metrics.
- Return ONLY valid JSON, no markdown.`;

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function inferCapabilities(text: string): string[] {
  const rules: [RegExp, string][] = [
    [/ai|大模型|agent|skill|llm|智能/i, 'AI产品落地'],
    [/产品运营|pmm|gtm|产品推广|上市|营销资料|培训|赋能/i, '产品运营/PMM/GTM'],
    [/客户调研|客户反馈|走访|访谈|调研|竞品分析|需求/i, '用户/客户调研'],
    [/场景|痛点|诉求|解决方案|方案/i, '场景挖掘与方案包装'],
    [/poc|共建|共创|标杆|案例|最佳实践|demo/i, 'POC/标杆案例/最佳实践'],
    [/数据|分析|指标|转化|成本|效率|看板|大盘/i, '数据分析与量化经营'],
    [/跨团队|协作|推进|沟通|产研|区域|客户成功|技术支持/i, '跨团队项目推动'],
    [/云|maas|finops|资源|成本治理/i, '云计算/FinOps'],
    [/销售|签单|回款|客户经理|商务/i, '商业化/销售支持'],
  ];
  return rules.filter(([pattern]) => pattern.test(text)).map(([, capability]) => capability);
}

function inferIndustries(text: string, current: string[]): string[] {
  const inferred: string[] = [...current];
  const rules: [RegExp, string][] = [
    [/ai|大模型|agent|llm|智能/i, 'AI'],
    [/saas|多租户|平台|软件|bi/i, 'SaaS'],
    [/tob|客户|企业|标杆|poc|签单|客户成功/i, 'TOB/企业服务'],
    [/云|maas|finops|资源|成本治理/i, '云计算'],
    [/数据|bi|经营分析|报表|看板/i, '数据分析'],
  ];
  for (const [pattern, label] of rules) {
    if (pattern.test(text)) inferred.push(label);
  }
  return unique(inferred);
}

function buildEvidenceUnits(profile: ResumeProfile): EvidenceUnit[] {
  const existing = profile.evidence_units || [];
  if (existing.length > 0) return existing;

  return profile.projects.map((project, index) => {
    const source = project.source_text || [project.name, ...project.actions, ...project.metrics].join('；');
    const capabilities = unique([...inferCapabilities(source), ...project.actions.flatMap(inferCapabilities)]);
    return {
      id: `ev_${index + 1}`,
      evidence: source.length > 260 ? `${source.slice(0, 260)}...` : source,
      source_project: project.name || `项目 ${index + 1}`,
      capabilities,
      metrics: project.metrics || [],
      strength: capabilities.length >= 3 || project.metrics.length > 0 ? 'strong' : capabilities.length > 0 ? 'medium' : 'weak',
    };
  });
}

export async function parseResume(resumeText: string): Promise<ResumeProfile> {
  if (!resumeText || resumeText.trim().length < 20) {
    throw new Error('简历文本过短，请补充完整的工作经历和技能。');
  }

  const prompt = `${RESUME_PARSE_PROMPT}\n\nResume:\n${resumeText}`;

  try {
    const parsed = await callLLMWithJson(prompt, { schema: ResumeProfileSchema }) as unknown as ResumeProfile;
    const allText = `${resumeText}\n${parsed.projects.map((p) => p.source_text).join('\n')}\n${parsed.skills.join(' ')}`;
    parsed.industries = inferIndustries(allText, parsed.industries || []);
    parsed.capabilities = unique([...(parsed.capabilities || []), ...inferCapabilities(allText)]);
    parsed.evidence_units = buildEvidenceUnits(parsed);
    return parsed;
  } catch (error) {
    throw new Error(`简历解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}
