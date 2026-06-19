import OpenAI from "openai";

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY must be set.");
}

export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://insightlens.app",
    "X-Title": "InsightLens",
  },
});

export const MODELS = [
  "deepseek/deepseek-v3.2",
  "qwen/qwen3-max",
  "meta-llama/llama-3.3-70b-instruct",
  "google/gemini-2.5-flash",
] as const;

function stripThinkingTags(text: string): string {
  // Remove <think>...</think> blocks emitted by reasoning models (Qwen3, DeepSeek R1, etc.)
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
}

export async function chatWithFallback(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {},
): Promise<string> {
  const errors: string[] = [];

  for (const model of MODELS) {
    try {
      const createOptions: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 8192,
      };

      // Enable JSON mode for models that support it
      if (options.jsonMode) {
        createOptions.response_format = { type: "json_object" };
      }

      const response = await openrouter.chat.completions.create(createOptions);

      const raw = response.choices[0]?.message?.content;
      if (!raw) throw new Error("Empty response from model");

      return stripThinkingTags(raw);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${model}: ${msg}`);
    }
  }

  throw new Error(`All models failed: ${errors.join("; ")}`);
}
