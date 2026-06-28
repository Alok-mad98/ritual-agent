import type { ChatMessage, LLMResponse, Env } from './types.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const CAPACITY_ERROR_PATTERNS = [
  'Capacity temporarily exceeded',
  'rate limit',
  'rate_limit',
  'Too Many Requests',
  '429',
  '3040',
];

function isCapacityError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return CAPACITY_ERROR_PATTERNS.some(p => msg.includes(p));
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class LLMClient {
  private model: string;
  private aiBinding: Ai | null;
  private accountId: string;
  private apiKey: string;
  private lastCallTime: number = 0;
  private minCallIntervalMs: number = 1000;

  constructor(env: Partial<Env>) {
    this.model = env.GLM_MODEL || '@cf/zai-org/glm-5.2';
    this.aiBinding = (env as { AI?: Ai }).AI || null;
    this.accountId = env.CLOUDFLARE_ACCOUNT_ID || '';
    this.apiKey = env.CLOUDFLARE_API_KEY || '';
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.minCallIntervalMs) {
      await sleep(this.minCallIntervalMs - elapsed);
    }
    this.lastCallTime = Date.now();
  }

  async chat(messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse> {
    let lastErr: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await this.rateLimit();

        if (this.aiBinding) {
          return await this.chatViaBinding(messages, options);
        }
        return await this.chatViaApi(messages, options);
      } catch (err) {
        lastErr = err;

        if (isCapacityError(err)) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[LLM] Capacity/rate limit hit (attempt ${attempt + 1}/${MAX_RETRIES}). Retrying in ${delay}ms...`);
          await sleep(delay);
          this.minCallIntervalMs = Math.min(this.minCallIntervalMs * 1.5, 5000);
          continue;
        }

        throw err;
      }
    }

    throw lastErr;
  }

  private async chatViaBinding(messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse> {
    const response = await this.aiBinding!.run(this.model as unknown as string, {
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
    } as Record<string, unknown>);

    let text = '';
    if (typeof response === 'string') {
      text = response;
    } else {
      const r = response as {
        response?: string;
        content?: string;
        reasoning_content?: string;
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      };
      const choiceMsg = r.choices?.[0]?.message;
      text = choiceMsg?.content || choiceMsg?.reasoning_content ||
             r.response || r.content || r.reasoning_content || '';
    }

    return { text, raw: response };
  }

  private async chatViaApi(messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/v1/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      if (resp.status === 429 || errText.includes('Capacity')) {
        throw new Error(`Cloudflare AI capacity exceeded (${resp.status}): ${errText}`);
      }
      throw new Error(`Cloudflare AI API error ${resp.status}: ${errText}`);
    }

    const data = await resp.json() as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const message = data.choices?.[0]?.message;
    const text = message?.content || message?.reasoning_content || '';
    return {
      text,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
      raw: data,
    };
  }

  async simple(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: ChatMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    const resp = await this.chat(messages);
    return resp.text;
  }
}
