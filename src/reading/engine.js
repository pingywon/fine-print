import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ReadingSchema, trimToLimits } from "./schema.js";
import { SYSTEM_PROMPT, PROMPT_VERSION, userMessage } from "./prompt.js";

export const MODEL = "claude-opus-5-5";

export class EngineError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function engineReady(env) {
  return Boolean(env.ANTHROPIC_API_KEY) && env.LIVE_READING !== "off";
}

export function makeClient(env) {
  const defaultHeaders = {};
  if (env.ANTHROPIC_WORKSPACE_ID) defaultHeaders["anthropic-workspace-id"] = env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, defaultHeaders, maxRetries: 1, timeout: 120_000 });
}

export async function readDocument(text, { env, client = makeClient(env) }) {
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ReadingSchema) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage(text) }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new EngineError("busy", "The reader is busy. Try again in a minute.", 503);
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new EngineError("engine_off", "Live reading is paused.", 503);
    }
    if (err instanceof Anthropic.BadRequestError) throw new EngineError("bad_request", "That document could not be read.", 400);
    if (err instanceof Anthropic.APIError) throw new EngineError("upstream", "The reader had a problem. Try again.", 502);
    throw new EngineError("upstream", "The reader could not be reached. Try again.", 502);
  }

  if (response.stop_reason === "refusal") {
    throw new EngineError("refused", "This document could not be read.", 422);
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new EngineError("incomplete", "The reading came back incomplete. Try a shorter document.", 502);
  }

  return {
    reading: trimToLimits(response.parsed_output),
    meta: {
      model: response.model,
      prompt: PROMPT_VERSION,
      input_tokens: response.usage?.input_tokens ?? null,
      output_tokens: response.usage?.output_tokens ?? null,
    },
  };
}
