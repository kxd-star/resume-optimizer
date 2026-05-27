import { createHash } from 'crypto';
import { z } from 'zod';
import { callLLMWithJson } from './llm';
import type { EvidenceUnit, JDProfile, RequirementEvidenceMatch, ResumeProfile } from '@/types';

const SemanticRequirementMatchSchema = z.object({
  requirement_id: z.string().optional(),
  requirement: z.string().min(1),
  category: z.string().optional(),
  semantic_score: z.number().min(0).max(100),
  status: z.enum(['strong', 'transferable', 'insufficient']),
  evidence_ids: z.array(z.string()).default([]),
  explanation: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0.7),
});

const SemanticMatchResponseSchema = z.object({
  matches: z.array(SemanticRequirementMatchSchema).default([]),
});

export type SemanticRequirementMatch = z.infer<typeof SemanticRequirementMatchSchema>;

const SEMANTIC_MATCH_PROMPT = `You are a senior hiring and resume matching analyst.

Evaluate semantic fit between JD requirements and resume evidence units.

Return JSON only:
{
  "matches": [
    {
      "requirement_id": "req_1",
      "requirement": "exact requirement text",
      "category": "same category when provided",
      "semantic_score": 0,
      "status": "strong/transferable/insufficient",
      "evidence_ids": ["ev_1"],
      "explanation": "one concise Chinese sentence explaining why it matches or what gap remains",
      "confidence": 0.8
    }
  ]
}

Rules:
- Use only the provided evidence units. Do not infer experience that is not grounded in evidence.
- evidence_ids must be IDs from the evidence list. If no evidence supports the requirement, return an empty array.
- requirement_id must be copied exactly from the provided requirement item.
- strong means the resume has direct or clearly equivalent evidence.
- transferable means the resume has adjacent evidence that can be safely reframed without inventing facts.
- insufficient means evidence is weak, missing, or only aspirational.
- If evidence_ids is empty, status must be insufficient and semantic_score must be 40 or below.
- The explanation should help the candidate understand the gap or the exact evidence connection.
- Return one match for each requirement.`;

const SEMANTIC_MATCH_CACHE_LIMIT = 50;
const semanticMatchCache = new Map<string, Map<string, SemanticRequirementMatch>>();

function debugLog(message: string, extra?: Record<string, unknown>): void {
  if (process.env.SEMANTIC_MATCHING_DEBUG === 'true') {
    console.log(`[semantic-matcher] ${message}`, extra || '');
  }
}

function warnLog(message: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`[semantic-matcher] ${message}: ${detail}`);
}

function compactText(text: string, maxLength = 420): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
}

export function semanticMatchId(index: number): string {
  return `req_${index + 1}`;
}

function buildPrompt(
  jd: JDProfile,
  resume: ResumeProfile,
  ruleMatches: RequirementEvidenceMatch[],
  evidenceUnits: EvidenceUnit[]
): string {
  const requirements = ruleMatches.map((match, index) => ({
    requirement_id: semanticMatchId(index),
    requirement: match.requirement,
    category: match.category,
    rule_score: match.score,
    rule_status: match.status,
  }));

  const evidence = evidenceUnits.map((unit) => ({
    id: unit.id,
    source_project: unit.source_project,
    strength: unit.strength,
    capabilities: unit.capabilities.slice(0, 8),
    metrics: unit.metrics.slice(0, 6),
    evidence: compactText(unit.evidence),
  }));

  return `${SEMANTIC_MATCH_PROMPT}

JD context:
${JSON.stringify({
  job_title: jd.job_title,
  role_family: jd.role_family || 'general',
  industries: jd.industries || [],
  business_goals: jd.business_goals || [],
}, null, 2)}

Resume context:
${JSON.stringify({
  target_title: resume.target_title,
  industries: resume.industries || [],
  capabilities: resume.capabilities || [],
  experience_years: resume.experience_years || 0,
}, null, 2)}

Requirements:
${JSON.stringify(requirements, null, 2)}

Evidence units:
${JSON.stringify(evidence, null, 2)}`;
}

function normalizeKey(requirement: string, category?: string): string {
  return `${category || ''}:${requirement}`.toLowerCase().replace(/\s+/g, '');
}

function cacheKey(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex');
}

function rememberCache(key: string, value: Map<string, SemanticRequirementMatch>): void {
  if (semanticMatchCache.size >= SEMANTIC_MATCH_CACHE_LIMIT) {
    const oldest = semanticMatchCache.keys().next().value;
    if (oldest) semanticMatchCache.delete(oldest);
  }
  semanticMatchCache.set(key, new Map(value));
}

export async function generateSemanticRequirementMatches(
  jd: JDProfile,
  resume: ResumeProfile,
  ruleMatches: RequirementEvidenceMatch[],
  evidenceUnits: EvidenceUnit[]
): Promise<Map<string, SemanticRequirementMatch>> {
  const enabled = process.env.SEMANTIC_MATCHING_ENABLED !== 'false';
  if (!enabled || ruleMatches.length === 0 || evidenceUnits.length === 0) {
    return new Map();
  }

  const prompt = buildPrompt(jd, resume, ruleMatches, evidenceUnits);
  const key = cacheKey(prompt);
  const cached = semanticMatchCache.get(key);
  if (cached) {
    debugLog('cache hit', { key, matches: cached.size });
    return new Map(cached);
  }

  try {
    debugLog('request semantic matches', {
      key,
      requirements: ruleMatches.length,
      evidence_units: evidenceUnits.length,
    });

    const result = await callLLMWithJson(prompt, {
      maxTokens: 8192,
      temperature: 0.1,
      schema: SemanticMatchResponseSchema,
    });

    const evidenceIds = new Set(evidenceUnits.map((unit) => unit.id));
    const byKey = new Map<string, SemanticRequirementMatch>();

    for (const item of result.matches || []) {
      const safeEvidenceIds = (item.evidence_ids || []).filter((id) => evidenceIds.has(id));
      const hasEvidence = safeEvidenceIds.length > 0;
      const safeItem: SemanticRequirementMatch = {
        requirement_id: item.requirement_id,
        requirement: item.requirement,
        category: item.category,
        evidence_ids: safeEvidenceIds,
        status: hasEvidence ? item.status : 'insufficient',
        semantic_score: hasEvidence ? item.semantic_score : Math.min(item.semantic_score, 40),
        explanation: item.explanation || '',
        confidence: item.confidence ?? 0.7,
      };
      if (item.requirement_id) byKey.set(item.requirement_id, safeItem);
      byKey.set(normalizeKey(item.requirement, item.category), safeItem);
    }

    debugLog('received semantic matches', { key, matches: byKey.size });
    rememberCache(key, byKey);
    return byKey;
  } catch (error) {
    warnLog('failed, falling back to rule-only matching', error);
    return new Map();
  }
}

export function semanticMatchKey(requirement: string, category?: string): string {
  return normalizeKey(requirement, category);
}
