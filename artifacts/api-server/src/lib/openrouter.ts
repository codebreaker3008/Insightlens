import OpenAI from "openai";

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY must be set.");
}

export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://signalos.app",
    "X-Title": "SignalOS",
  },
});

export const MODELS = [
  "deepseek/deepseek-v3.2",
  "qwen/qwen3-max",
  "meta-llama/llama-3.3-70b-instruct",
  "google/gemini-2.5-flash",
] as const;

export async function chatWithFallback(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const errors: string[] = [];

  for (const model of MODELS) {
    try {
      const response = await openrouter.chat.completions.create({
        model,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 8192,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("Empty response from model");

      return content;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${model}: ${msg}`);
    }
  }

  throw new Error(`All models failed: ${errors.join("; ")}`);
}
