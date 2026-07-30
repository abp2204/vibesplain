import Anthropic from '@anthropic-ai/sdk';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const EFFORT_LEVELS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export function parseEffort(value: string): Effort {
  if (!(EFFORT_LEVELS as readonly string[]).includes(value)) {
    throw new Error(`Unknown effort "${value}". Expected one of: ${EFFORT_LEVELS.join(', ')}.`);
  }
  return value as Effort;
}

export interface GrillRequest {
  system: string;
  user: string;
  /** JSON Schema the response is constrained to. */
  schema: Record<string, unknown>;
  maxTokens?: number;
}

/**
 * The reasoning seam. Passes are written against this interface so the
 * deterministic half of the pipeline (crawl, verify, render, diff) is testable
 * with no API key and no network.
 */
export interface GrillEngine {
  readonly model: string;
  readonly effort: string;
  run<T>(request: GrillRequest): Promise<T>;
}

export interface AnthropicGrillOptions {
  apiKey?: string;
  model?: string;
  effort?: Effort;
  maxTokens?: number;
}

export class AnthropicGrill implements GrillEngine {
  readonly model: string;
  readonly effort: Effort;
  private client: Anthropic;
  private defaultMaxTokens: number;

  constructor(options: AnthropicGrillOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Export it, or pass --dry-run to fetch the web surface without grilling it.'
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = options.model ?? 'claude-opus-5';
    this.effort = options.effort ?? 'high';
    this.defaultMaxTokens = options.maxTokens ?? 32000;
  }

  async run<T>(request: GrillRequest): Promise<T> {
    // Streamed because the web surface can be long and thinking counts against
    // max_tokens on this model; a non-streaming call at this size risks an
    // HTTP timeout.
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: request.maxTokens ?? this.defaultMaxTokens,
      system: request.system,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: this.effort,
        format: { type: 'json_schema', schema: request.schema },
      },
      messages: [{ role: 'user', content: request.user }],
    });

    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      throw new Error('The model declined this request. Nothing was written.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new Error(
        'The model hit max_tokens before finishing. Re-run with a smaller --max-pages or a larger --max-tokens.'
      );
    }

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    if (!text.trim()) {
      throw new Error('The model returned no text content.');
    }

    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new Error(`Model response was not valid JSON: ${(err as Error).message}`);
    }
  }
}
