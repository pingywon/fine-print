import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { readDocument, EngineError, MODEL, engineReady } from "../src/reading/engine.js";
import { styleProblems } from "../src/reading/style.js";

const reading = {
  readable: true, kind_of_document: "Lease", title: "T", parties: [], summary: "S",
  key_terms: [], push_back: Array.from({ length: 9 }, (_, i) => ({ title: `p${i}`, why: "w", ask: "a", quote: "q" })),
  good_to_know: [], dates: [], before_you_sign: [], email: { subject: "s", body: "b" },
};

function fakeClient(result) {
  const calls = [];
  return {
    calls,
    beta: { messages: { parse: async (params) => { calls.push(params); if (result instanceof Error) throw result; return result; } } },
  };
}

test("sends the document with the house settings and trims long lists", async () => {
  const client = fakeClient({ stop_reason: "end_turn", parsed_output: reading, model: MODEL, usage: { input_tokens: 10, output_tokens: 20 } });
  const out = await readDocument("the text", { env: {}, client });
  assert.equal(client.calls[0].model, "claude-opus-5-5");
  assert.equal(client.calls[0].fallbacks, "default");
  assert.match(client.calls[0].messages[0].content, /<<<DOCUMENT\nthe text\nDOCUMENT>>>/);
  assert.equal(out.reading.push_back.length, 5);
  assert.equal(out.meta.output_tokens, 20);
});

test("refusals and cut-off answers become clear errors", async () => {
  await assert.rejects(readDocument("x", { env: {}, client: fakeClient({ stop_reason: "refusal", parsed_output: null }) }),
    (e) => e instanceof EngineError && e.code === "refused");
  await assert.rejects(readDocument("x", { env: {}, client: fakeClient({ stop_reason: "max_tokens", parsed_output: null }) }),
    (e) => e instanceof EngineError && e.code === "incomplete");
});

test("API failures map to plain messages", async () => {
  const rate = new Anthropic.RateLimitError(429, { error: {} }, "rate", new Headers());
  await assert.rejects(readDocument("x", { env: {}, client: fakeClient(rate) }), (e) => e.code === "busy" && e.status === 503);
  const auth = new Anthropic.AuthenticationError(401, { error: {} }, "auth", new Headers());
  await assert.rejects(readDocument("x", { env: {}, client: fakeClient(auth) }), (e) => e.code === "engine_off");
});

test("engine is on only with a key and not paused", () => {
  assert.equal(engineReady({}), false);
  assert.equal(engineReady({ ANTHROPIC_API_KEY: "k" }), true);
  assert.equal(engineReady({ ANTHROPIC_API_KEY: "k", LIVE_READING: "off" }), false);
});

test("house style catches AI tells", () => {
  const bad = { ...reading, summary: "It is important to note the fee — sadly; wow!" };
  const rules = styleProblems(bad).map((p) => p.rule);
  for (const r of ["em dash", "semicolon", "exclamation mark", "filler"]) assert.ok(rules.includes(r), r);
  assert.deepEqual(styleProblems({ ...reading, push_back: [] }), []);
});
