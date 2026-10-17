// Produces the sample readings shown on the site, with the same instructions and schema the live reader uses.
//   node scripts/make-samples.mjs                 all samples, Claude API (needs ANTHROPIC_API_KEY)
//   node scripts/make-samples.mjs --engine claude-code --only lease
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ReadingSchema, trimToLimits, readingJsonSchema } from "../src/reading/schema.js";
import { SYSTEM_PROMPT, PROMPT_VERSION, userMessage } from "../src/reading/prompt.js";
import { readDocument, MODEL } from "../src/reading/engine.js";
import { verifyReading } from "../src/shared/quotes.js";
import { styleProblems } from "../src/reading/style.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const engine = flag("--engine") || "api";
const only = flag("--only");

function runClaudeCode(text) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", [
      "-p", "--tools", "", "--setting-sources", "local", "--no-session-persistence",
      "--model", MODEL, "--effort", "medium", "--output-format", "json",
      "--system-prompt", SYSTEM_PROMPT,
      "--json-schema", JSON.stringify(readingJsonSchema()),
    ], { cwd: process.env.SAMPLE_CWD || root, stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`claude exited ${code}`));
      const parsed = JSON.parse(out);
      const result = Array.isArray(parsed) ? parsed.find((e) => e.type === "result") : parsed;
      if (!result || result.is_error || !result.structured_output) return reject(new Error("no structured output"));
      resolve({
        reading: trimToLimits(ReadingSchema.parse(result.structured_output)),
        meta: {
          model: Object.keys(result.modelUsage || {})[0] || MODEL,
          prompt: PROMPT_VERSION,
          output_tokens: result.usage?.output_tokens ?? null,
        },
      });
    });
    child.stdin.end(userMessage(text));
  });
}

const manifest = JSON.parse(await readFile(join(root, "samples/manifest.json"), "utf8"));
await mkdir(join(root, "public/samples"), { recursive: true });

for (const sample of manifest) {
  if (only && sample.id !== only) continue;
  const text = (await readFile(join(root, "samples", sample.file), "utf8")).trim();
  const started = Date.now();
  const { reading, meta } = engine === "claude-code"
    ? await runClaudeCode(text)
    : await readDocument(text, { env: process.env });
  const { stats } = verifyReading(text, reading);
  const style = styleProblems(reading);
  const record = {
    id: sample.id,
    label: sample.label,
    text,
    reading,
    meta: { ...meta, engine, generated_at: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000) },
  };
  await writeFile(join(root, "public/samples", `${sample.id}.json`), JSON.stringify(record, null, 2) + "\n");
  console.log(`${sample.id}: quotes found ${stats.found}/${stats.total}, style problems ${style.length}, ${record.meta.seconds}s`);
  for (const p of style) console.log(`  style: ${p.rule} in ${p.where}: ${p.text}`);
}
