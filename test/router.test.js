import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { route } from "../src/router.js";
import { VERSION } from "../src/version.js";
import { mockRead } from "../src/reading/mock.js";
import { EngineError } from "../src/reading/engine.js";

const doc = (await readFile(new URL("../samples/docs/gym.txt", import.meta.url), "utf8")).trim();

function fakeKV() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) };
}

const post = (body, ip = "203.0.113.9") => new Request("https://fineprint.test/api/read", {
  method: "POST",
  headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

test("version file matches package.json", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(VERSION, pkg.version);
});

test("meta reports version and whether live reading is on", async () => {
  const off = await (await route(new Request("https://fineprint.test/api/meta"), {})).json();
  assert.equal(off.version, VERSION);
  assert.equal(off.live, false);
  const on = await (await route(new Request("https://fineprint.test/api/meta"), { ANTHROPIC_API_KEY: "x" })).json();
  assert.equal(on.live, true);
  const paused = await (await route(new Request("https://fineprint.test/api/meta"), { ANTHROPIC_API_KEY: "x", LIVE_READING: "off" })).json();
  assert.equal(paused.live, false);
});

test("reading is refused with a clear message when the engine is off", async () => {
  const res = await route(post({ text: doc }), {});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "engine_off");
});

test("bad input is rejected before any model call", async () => {
  const env = { MOCK_ENGINE: "1" };
  const deps = { readDocument: () => assert.fail("should not be called") };
  assert.equal((await route(post("not json"), env, deps)).status, 400);
  assert.equal((await route(post({ text: "too short" }), env, deps)).status, 400);
  assert.equal((await route(post({ text: "x".repeat(60_001) }), env, deps)).status, 413);
  assert.equal((await route(new Request("https://fineprint.test/api/read"), env, deps)).status, 405);
  assert.equal((await route(new Request("https://fineprint.test/api/nope"), env, deps)).status, 404);
  assert.equal(route(new Request("https://fineprint.test/styles.css"), env, deps), null);
});

test("a reading comes back with quotes checked", async () => {
  const res = await route(post({ text: doc }), { MOCK_ENGINE: "1" }, { readDocument: mockRead });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.meta.version, VERSION);
  assert.equal(body.stats.total, 4);
  assert.equal(body.stats.found, 3);
  assert.ok(body.reading.red_flags[0].located);
  assert.equal(body.reading.good_to_know[0].located, null);
});

test("each visitor gets a daily allowance", async () => {
  const env = { MOCK_ENGINE: "1", FP_KV: fakeKV(), READS_PER_VISITOR: "2", READS_PER_DAY: "3" };
  const deps = { readDocument: mockRead };
  assert.equal((await route(post({ text: doc }, "198.51.100.1"), env, deps)).status, 200);
  assert.equal((await route(post({ text: doc }, "198.51.100.1"), env, deps)).status, 200);
  const third = await route(post({ text: doc }, "198.51.100.1"), env, deps);
  assert.equal(third.status, 429);
  assert.equal((await route(post({ text: doc }, "198.51.100.2"), env, deps)).status, 200);
  const overall = await route(post({ text: doc }, "198.51.100.3"), env, deps);
  assert.equal(overall.status, 429);
  assert.match((await overall.json()).error.message, /today's limit/);
});

test("engine errors become plain messages", async () => {
  const deps = { readDocument: async () => { throw new EngineError("busy", "The reader is busy. Try again in a minute.", 503); } };
  const res = await route(post({ text: doc }), { MOCK_ENGINE: "1" }, deps);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.message, "The reader is busy. Try again in a minute.");
  const crash = await route(post({ text: doc }), { MOCK_ENGINE: "1" }, { readDocument: async () => { throw new Error("boom"); } });
  assert.equal(crash.status, 500);
  assert.doesNotMatch((await crash.json()).error.message, /boom/);
});
