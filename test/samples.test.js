import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ReadingSchema, LIMITS } from "../src/reading/schema.js";
import { PROMPT_VERSION } from "../src/reading/prompt.js";
import { verifyReading } from "../src/shared/quotes.js";
import { styleProblems } from "../src/reading/style.js";

const manifest = JSON.parse(await readFile(new URL("../samples/manifest.json", import.meta.url), "utf8"));

for (const sample of manifest) {
  test(`sample "${sample.id}" is a valid, current, grounded reading`, async () => {
    const record = JSON.parse(await readFile(new URL(`../public/samples/${sample.id}.json`, import.meta.url), "utf8"));
    const source = (await readFile(new URL(`../samples/${sample.file}`, import.meta.url), "utf8")).trim();

    assert.equal(record.text, source, "sample text matches the source document");
    assert.equal(record.meta.prompt, PROMPT_VERSION, "sample was made with the current prompt; run npm run samples");
    const reading = ReadingSchema.parse(record.reading);
    for (const [key, max] of Object.entries(LIMITS)) assert.ok(reading[key].length <= max, `${key} within limit`);

    const { stats } = verifyReading(source, reading);
    assert.equal(stats.found, stats.total, "every quote is found in the document");
    assert.deepEqual(styleProblems(reading), [], "house style");
    assert.ok(reading.red_flags.length >= 1, "the planted problems are caught");
  });
}

test("each sample catches its key planted problem", async () => {
  const expect = {
    lease: [/renew/i, /notice|entry|enter/i],
    "job-offer": [/non-?compet/i, /bonus/i],
    gym: [/cancel/i],
    freelance: [/revision/i, /payment|paid|accept/i],
  };
  for (const [id, patterns] of Object.entries(expect)) {
    const record = JSON.parse(await readFile(new URL(`../public/samples/${id}.json`, import.meta.url), "utf8"));
    const titles = record.reading.red_flags.map((p) => `${p.title} ${p.why}`).join(" | ");
    for (const p of patterns) assert.match(titles, p, `${id}: ${p}`);
  }
});
