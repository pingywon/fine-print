// Phone + desktop walkthrough with real mobile emulation.
//   BASE=http://127.0.0.1:8171/ node e2e/phone.mjs
// Needs a server running with MOCK_ENGINE=1 for the paste test (wrangler dev --var MOCK_ENGINE:1).
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_PATH || "/home/pingywon/gc-klaviyo/node_modules/puppeteer-core");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE || "http://127.0.0.1:8171/";
const SHOTS = process.env.SHOTS || join(root, "shots");
const LIVE = process.env.SKIP_LIVE !== "1";
await mkdir(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const devices = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "small", width: 360, height: 640, mobile: true },
  { name: "desk", width: 1366, height: 900, mobile: false },
];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const leaseText = (await readFile(join(root, "samples/docs/lease.txt"), "utf8")).trim();

async function noSideScroll(page) {
  return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
}

async function smallTargets(page) {
  return page.evaluate(() => {
    const sel = ".btn, .sample-list button, .tabs button, .wording-toggle, .checklist label, .back, .upload";
    return [...document.querySelectorAll(sel)]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ text: el.textContent.trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((t) => t.h < 40);
  });
}

for (const scheme of ["light", "dark"]) {
  for (const d of devices) {
    const tag = `${d.name}-${scheme}`;
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.setViewport({ width: d.width, height: d.height, deviceScaleFactor: 2, isMobile: d.mobile, hasTouch: d.mobile });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
    const tap = async (sel) => (d.mobile ? page.tap(sel) : page.click(sel));

    await page.goto(BASE, { waitUntil: "networkidle0" });
    await page.waitForSelector(".sample-list button");
    const w = await noSideScroll(page);
    check(`${tag}: page width is the device width`, w.iw === d.width, `innerWidth ${w.iw}`);
    check(`${tag}: landing has no sideways scroll`, w.sw <= w.iw, `scrollWidth ${w.sw}`);
    check(`${tag}: landing tap targets 40px+`, (await smallTargets(page)).length === 0, JSON.stringify(await smallTargets(page)));
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(`${tag}: theme background`, scheme === "dark" ? bg === "rgb(22, 27, 35)" : bg === "rgb(238, 241, 245)", bg);
    const taBg = await page.evaluate(() => getComputedStyle(document.getElementById("doc-text")).backgroundColor);
    check(`${tag}: textarea uses the theme`, scheme === "dark" ? taBg === "rgb(30, 37, 47)" : taBg === "rgb(255, 255, 255)", taBg);
    const version = await page.evaluate(() => document.querySelector("footer.site p").textContent);
    check(`${tag}: version in footer`, /v\d+\.\d+\.\d+/.test(version), version);
    await page.screenshot({ path: join(SHOTS, `${tag}-landing.png`) });

    await tap(".sample-list li:first-child button");
    await page.waitForSelector(".doc-head h1");
    const source = await page.$eval(".source-line", (el) => el.textContent);
    check(`${tag}: sample quotes all found`, /(\d+) of \1 quotes found/.test(source), source);
    const pushCount = await page.$$eval(".push .item", (els) => els.length);
    check(`${tag}: push-back items shown`, pushCount >= 3, String(pushCount));
    const w2 = await noSideScroll(page);
    check(`${tag}: reading has no sideways scroll`, w2.sw <= w2.iw, `scrollWidth ${w2.sw}`);
    check(`${tag}: reading tap targets 40px+`, (await smallTargets(page)).length === 0, JSON.stringify(await smallTargets(page)));
    await page.screenshot({ path: join(SHOTS, `${tag}-reading.png`) });

    await tap(".push .item .wording-toggle");
    await page.waitForSelector(".push .item .wording:not([hidden])");
    const found = await page.$eval(".push .item .wording .check", (el) => el.textContent);
    check(`${tag}: wording opens and is found`, found.startsWith("Found in your document"), found);
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: join(SHOTS, `${tag}-wording.png`) });

    const box = await page.$(".checklist input");
    if (box) {
      await box.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const before = await page.$eval(".checklist input", (el) => el.checked);
      await tap(".checklist label");
      check(`${tag}: checklist tap flips the box`, (await page.$eval(".checklist input", (el) => el.checked)) !== before);
    }

    if (d.mobile) {
      await tap(".tabs button[aria-controls=panel-doc]");
      const docShown = await page.$eval("#panel-doc", (el) => !el.hidden && el.getBoundingClientRect().height > 100);
      check(`${tag}: document tab shows the document`, docShown);
      const marks = await page.$$eval(".doc mark", (els) => els.length);
      check(`${tag}: document has highlights`, marks > 5, String(marks));
      const w3 = await noSideScroll(page);
      check(`${tag}: document has no sideways scroll`, w3.sw <= w3.iw, `scrollWidth ${w3.sw}`);
      await page.screenshot({ path: join(SHOTS, `${tag}-document.png`) });
      await page.$eval(".doc mark[data-ids*=push_back]", (el) => el.scrollIntoView({ block: "center" }));
      await tap(".doc mark[data-ids*=push_back]");
      await new Promise((r) => setTimeout(r, 400));
      const back = await page.$eval("#panel-reading", (el) => !el.hidden);
      check(`${tag}: tapping a highlight returns to the reading`, back);
    } else {
      const both = await page.evaluate(() => {
        const a = document.getElementById("panel-reading").getBoundingClientRect();
        const b = document.getElementById("panel-doc").getBoundingClientRect();
        return a.width > 300 && b.width > 300 && b.left > a.left;
      });
      check(`${tag}: reading and document side by side`, both);
    }

    if (LIVE && d.name !== "small") {
      await page.goto(BASE, { waitUntil: "networkidle0" });
      await page.$eval("#doc-text", (el, t) => { el.value = t; el.dispatchEvent(new Event("input")); }, leaseText);
      await tap("#read-btn");
      await page.waitForSelector(".doc-head h1", { timeout: 15000 });
      const title = await page.$eval(".doc-head h1", (el) => el.textContent);
      check(`${tag}: pasted text gets a reading`, title.length > 0, title);
      const toggles = await page.$$(".item .wording-toggle");
      await toggles[toggles.length - 1].evaluate((el) => el.click());
      const missing = await page.$$eval(".check.missing", (els) => els.length);
      check(`${tag}: a quote not in the text is flagged`, missing === 1, String(missing));
    }

    if (d.name === "desk") {
      await page.goto(BASE, { waitUntil: "networkidle0" });
      const input = await page.$("#pdf-input");
      await input.uploadFile(join(root, "e2e/fixtures/gym.pdf"));
      await page.waitForFunction(() => document.getElementById("doc-text").value.length > 1000, { timeout: 15000 });
      const pdfText = await page.$eval("#doc-text", (el) => el.value);
      check(`${tag}: PDF upload fills the text`, pdfText.includes("IRONWORKS FITNESS CLUB") && pdfText.includes("Annual Club Enhancement Fee"), `${pdfText.length} chars`);
    }

    check(`${tag}: no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
