// Phone + desktop walkthrough with real mobile emulation.
//   BASE=http://127.0.0.1:8171/ node e2e/phone.mjs     (paste test needs MOCK_ENGINE=1 on the server; SKIP_LIVE=1 to skip)
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_PATH || "puppeteer-core");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE || "http://127.0.0.1:8171/";
const SHOTS = process.env.SHOTS || join(root, "shots");
const LIVE = process.env.SKIP_LIVE !== "1";
await mkdir(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => { results.push({ ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };
const devices = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "small", width: 360, height: 640, mobile: true },
  { name: "desk", width: 1366, height: 900, mobile: false },
];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const leaseText = (await readFile(join(root, "samples/docs/lease.txt"), "utf8")).trim();
const sideways = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
const smallTargets = (page) => page.evaluate(() => [...document.querySelectorAll(".btn, .pick, .seg button, .linkish, .checks label, .icon-btn")]
  .filter((el) => el.offsetParent !== null)
  .map((el) => ({ t: el.textContent.trim().slice(0, 20), h: Math.round(el.getBoundingClientRect().height) }))
  .filter((x) => x.h < 40));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

for (const scheme of ["light", "dark"]) {
  for (const d of devices) {
    const tag = `${d.name}-${scheme}`;
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.setViewport({ width: d.width, height: d.height, deviceScaleFactor: 2, isMobile: d.mobile, hasTouch: d.mobile });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
    const tap = (sel) => (d.mobile ? page.tap(sel) : page.click(sel));

    await page.goto(BASE, { waitUntil: "networkidle0" });
    await page.evaluate(() => { try { localStorage.clear(); } catch {} });
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("#sample-list .pick");
    await page.waitForSelector("#preview .pv-verdict");
    const w = await sideways(page);
    check(`${tag}: page width is the device width`, w.iw === d.width, `innerWidth ${w.iw}`);
    check(`${tag}: landing has no sideways scroll`, w.sw <= w.iw, `scrollWidth ${w.sw}`);
    check(`${tag}: landing tap targets 40px+`, (await smallTargets(page)).length === 0, JSON.stringify(await smallTargets(page)));
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(`${tag}: theme background`, scheme === "dark" ? bg === "rgb(15, 18, 24)" : bg === "rgb(246, 247, 249)", bg);
    const taBg = await page.$eval("#doc-text", (el) => getComputedStyle(el).backgroundColor);
    check(`${tag}: textarea uses the theme`, scheme === "dark" ? taBg === "rgb(23, 27, 35)" : taBg === "rgb(255, 255, 255)", taBg);
    const sticky = await page.$eval(".topbar", (el) => getComputedStyle(el).position);
    check(`${tag}: top bar is sticky`, sticky === "sticky");
    check(`${tag}: version in footer`, /v\d+\.\d+\.\d+/.test(await page.$eval(".foot span", (el) => el.textContent)));
    const heroWords = await page.evaluate(() => [".display", ".sub"].map((s) => document.querySelector(s).textContent.trim().split(/\s+/).length));
    check(`${tag}: hero copy is short`, heroWords[0] <= 6 && heroWords[1] <= 10, heroWords.join("/"));
    await page.screenshot({ path: join(SHOTS, `${tag}-landing.png`) });

    await tap("#theme");
    const flipped = await page.evaluate(() => document.documentElement.dataset.theme);
    check(`${tag}: theme toggle flips`, flipped === (scheme === "dark" ? "light" : "dark"), String(flipped));
    await tap("#theme");

    await page.$eval("#sample-list .pick", (el) => el.scrollIntoView({ block: "center" }));
    await tap("#sample-list .pick");
    await page.waitForSelector(".r-title");
    const quotes = await page.$$eval(".tile", (els) => els.map((e) => e.textContent));
    check(`${tag}: all quotes found`, quotes.some((t) => /Quotes found(\d+)\/\1/.test(t)), quotes.join(" | "));
    const flags = await page.$$eval("#panel-overview .card:first-child .flag", (els) => els.length);
    check(`${tag}: red flags shown`, flags >= 3, String(flags));
    const w2 = await sideways(page);
    check(`${tag}: reading has no sideways scroll`, w2.sw <= w2.iw, `scrollWidth ${w2.sw}`);
    check(`${tag}: reading tap targets 40px+`, (await smallTargets(page)).length === 0, JSON.stringify(await smallTargets(page)));
    await page.screenshot({ path: join(SHOTS, `${tag}-reading.png`) });

    await page.$eval(".flag .linkish", (el) => el.scrollIntoView({ block: "center" }));
    await tap(".flag .linkish");
    await page.waitForSelector(".flag .clause:not([hidden])");
    const found = await page.$eval(".flag .clause .found", (el) => el.textContent);
    check(`${tag}: clause opens and is found`, found.startsWith("Found in your text"), found);
    await pause(400);
    await page.screenshot({ path: join(SHOTS, `${tag}-clause.png`) });

    const box = await page.$(".checks input");
    if (box) {
      await box.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const before = await page.$eval(".checks input", (el) => el.checked);
      await tap(".checks label");
      check(`${tag}: checklist tap flips the box`, (await page.$eval(".checks input", (el) => el.checked)) !== before);
    }

    if (d.mobile) {
      const order = await page.evaluate(() => {
        const main = document.querySelector("#panel-overview > .stack").getBoundingClientRect();
        const side = document.querySelector("#panel-overview > .side").getBoundingClientRect();
        return side.top >= main.bottom - 1;
      });
      check(`${tag}: sidebar stacks under the flags`, order);
    } else {
      const both = await page.evaluate(() => {
        const main = document.querySelector("#panel-overview > .stack").getBoundingClientRect();
        const side = document.querySelector("#panel-overview > .side").getBoundingClientRect();
        return side.left > main.right - 1 && side.width > 250;
      });
      check(`${tag}: sidebar sits beside the flags`, both);
    }

    await page.$eval(".seg", (el) => el.scrollIntoView({ block: "center" }));
    await tap(".seg button:nth-child(2)");
    const docShown = await page.$eval("#panel-doc", (el) => !el.hidden && el.getBoundingClientRect().height > 200);
    check(`${tag}: document tab shows the document`, docShown);
    const marks = await page.$$eval(".doc mark", (els) => els.length);
    check(`${tag}: document has highlights`, marks > 5, String(marks));
    const w3 = await sideways(page);
    check(`${tag}: document has no sideways scroll`, w3.sw <= w3.iw, `scrollWidth ${w3.sw}`);
    await page.$eval(".doc mark:not(.soft):not(.faint)", (el) => el.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: join(SHOTS, `${tag}-document.png`) });
    await tap(".doc mark:not(.soft):not(.faint)");
    await pause(500);
    check(`${tag}: tapping a highlight returns to its flag`, await page.$eval("#panel-overview", (el) => !el.hidden));

    if (d.name === "desk") {
      await page.goto(BASE, { waitUntil: "networkidle0" });
      const input = await page.$("#pdf-input");
      await input.uploadFile(join(root, "e2e/fixtures/gym.pdf"));
      await page.waitForFunction(() => document.getElementById("doc-text").value.length > 1000, { timeout: 15000 });
      const pdfText = await page.$eval("#doc-text", (el) => el.value);
      check(`${tag}: PDF upload fills the text`, pdfText.includes("IRONWORKS FITNESS CLUB"), `${pdfText.length} chars`);
    }

    if (LIVE && d.name !== "small") {
      await page.goto(BASE, { waitUntil: "networkidle0" });
      await page.$eval("#doc-text", (el, t) => { el.value = t; el.dispatchEvent(new Event("input")); }, leaseText);
      await tap("#read-btn");
      await page.waitForSelector(".r-title", { timeout: 15000 });
      check(`${tag}: pasted text gets a reading`, (await page.$eval(".r-title", (el) => el.textContent)) === "Test reading");
      check(`${tag}: a quote not in the text is flagged`, (await page.$$eval(".found.miss", (els) => els.length)) === 1);
    }

    check(`${tag}: no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
