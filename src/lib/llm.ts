import OpenAI, { type ClientOptions } from 'openai';
import type { z } from 'zod';
import { HttpsProxyAgent } from 'https-proxy-agent';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-chat';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable is not set');
  }

  const proxyUrl = process.env.PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

  const opts: Record<string, unknown> = {
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
    timeout: 120_000,
    maxRetries: 3,
  };

  if (proxyUrl) {
    opts.httpAgent = new HttpsProxyAgent(proxyUrl);
  }

  client = new OpenAI(opts as unknown as ClientOptions);
  return client;
}

export interface LLMConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

const DEFAULT_CONFIG: LLMConfig = {
  model: DEEPSEEK_MODEL,
  maxTokens: 4096,
  temperature: 0.3,
};

export async function callLLM(
  prompt: string,
  config: LLMConfig = {}
): Promise<string> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const cl = getClient();

  try {
    const response = await cl.chat.completions.create({
      model: cfg.model!,
      max_tokens: cfg.maxTokens!,
      temperature: cfg.temperature!,
      messages: [
        ...(cfg.system ? [{ role: 'system' as const, content: cfg.system }] : []),
        { role: 'user', content: prompt },
      ],
    });

    const text = response.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('LLM response is empty');
    }

    return text;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`LLM call failed: ${errorMessage}`);
  }
}

export async function callLLMWithJson<T>(
  prompt: string,
  config: LLMConfig & { schema?: z.ZodType<T> } = {}
): Promise<T> {
  const cfg = {
    ...config,
    system: config.system || 'You are a professional resume optimization assistant. Respond with valid JSON only. Do not wrap the JSON in markdown code blocks or any other formatting. Return ONLY the raw JSON object.',
    temperature: config.temperature ?? 0.1,
  };

  const text = await callLLM(prompt, cfg);

  // Try to parse the response as JSON
  // Handle cases where the model wraps JSON in code blocks
  let cleaned = text.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${cleaned.substring(0, 200)}`);
  }

  // If schema is provided, validate the parsed data
  if (config.schema) {
    const result = config.schema.safeParse(parsed);
    if (!result.success) {
      const details = result.error.errors
        .slice(0, 5)
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      throw new Error(`LLM 返回数据格式异常: ${details}`);
    }
    return result.data;
  }

  return parsed as T;
}
