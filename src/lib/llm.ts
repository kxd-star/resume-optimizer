import OpenAI from 'openai';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-chat';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable is not set');
  }

  client = new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
    timeout: 60_000,
    maxRetries: 2,
  });
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
  config: LLMConfig = {}
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

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${cleaned.substring(0, 200)}`);
  }
}
