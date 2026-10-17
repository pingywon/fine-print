import { readDocument, engineReady, EngineError, MODEL } from "./reading/engine.js";
import { PROMPT_VERSION } from "./reading/prompt.js";
import { verifyReading } from "./shared/quotes.js";
import { takeDailyAllowance, visitorId } from "./limits.js";
import { VERSION } from "./version.js";

export const MIN_CHARS = 200;
export const MAX_CHARS = 60_000;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function problem(code, message, status) {
  return json({ error: { code, message } }, status);
}

const live = (env) => engineReady(env) || env.MOCK_ENGINE === "1";

async function handleRead(request, env, deps) {
  if (!live(env)) return problem("engine_off", "Live reading is paused. The samples show a full reading.", 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return problem("bad_request", "Send the document as JSON: { \"text\": \"...\" }.", 400);
  }
  const text = typeof body?.text === "string" ? body.text.replace(/\r\n?/g, "\n").trim() : "";
  if (text.length < MIN_CHARS) return problem("too_short", "That is too short to be an agreement. Paste the whole document.", 400);
  if (text.length > MAX_CHARS) return problem("too_long", `That is longer than ${MAX_CHARS.toLocaleString("en-US")} characters. Paste the part you want read.`, 413);

  const allowance = await takeDailyAllowance(env.FP_KV, {
    bucket: "read",
    visitor: await visitorId(request, env.IP_SALT),
    perVisitor: Number(env.READS_PER_VISITOR || 5),
    perDay: Number(env.READS_PER_DAY || 150),
  });
  if (!allowance.ok) {
    return problem("limit", allowance.reason === "visitor"
      ? "That is today's limit for live readings. The samples are always open."
      : "Live reading has hit today's limit. The samples are always open.", 429);
  }

  try {
    const { reading, meta } = await (deps.readDocument || readDocument)(text, { env, ...(deps.client ? { client: deps.client } : {}) });
    const verified = verifyReading(text, reading);
    return json({ reading: verified.reading, stats: verified.stats, meta: { ...meta, version: VERSION } });
  } catch (err) {
    if (err instanceof EngineError) return problem(err.code, err.message, err.status);
    return problem("server", "Something went wrong reading that. Try again.", 500);
  }
}

export function route(request, env, deps = {}) {
  const url = new URL(request.url);
  if (url.pathname === "/api/meta" && request.method === "GET") {
    return json({ version: VERSION, live: live(env), model: MODEL, prompt: PROMPT_VERSION });
  }
  if (url.pathname === "/api/read") {
    if (request.method !== "POST") return problem("method", "Use POST.", 405);
    return handleRead(request, env, deps);
  }
  if (url.pathname.startsWith("/api/")) return problem("not_found", "No such endpoint.", 404);
  return null;
}
