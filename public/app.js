import { h, icon, fillIcons, themeToggle } from "./kit.js";
import { renderReading, renderPreview } from "./render.js";

const MAX_CHARS = 60000;
const MIN_CHARS = 200;
const ICONS = { lease: "home", "job-offer": "briefcase", gym: "dumbbell", freelance: "pen" };

const landing = document.getElementById("landing");
const view = document.getElementById("reading-view");
const form = document.getElementById("paste-form");
const textarea = document.getElementById("doc-text");
const counter = document.getElementById("char-count");
const notice = document.getElementById("form-notice");
const readBtn = document.getElementById("read-btn");
const pdfInput = document.getElementById("pdf-input");

fillIcons();
themeToggle(document.getElementById("theme"));

let meta = { live: false };
const metaReady = fetch("api/meta").then((r) => (r.ok ? r.json() : meta)).then((m) => (meta = m)).catch(() => meta);
const session = {
  get() { try { return JSON.parse(sessionStorage.getItem("fp:last") || "null"); } catch { return null; } },
  set(v) { try { sessionStorage.setItem("fp:last", JSON.stringify(v)); } catch { /* fine without it */ } },
};

function say(message) {
  notice.textContent = message;
  notice.hidden = !message;
}

textarea.addEventListener("input", () => {
  const n = textarea.value.length;
  counter.textContent = n ? `${n.toLocaleString("en-US")} chars${n > MAX_CHARS ? ", too long" : ""}` : "Never stored";
});

async function loadSamples() {
  const list = await (await fetch("samples/index.json")).json();
  document.getElementById("sample-list").replaceChildren(...list.map((s) => h("button", { type: "button", class: "pick", onclick: () => (location.hash = `#sample/${s.id}`) },
    h("span", { class: "ic" }, icon(ICONS[s.id] || "doc")), h("span", {}, h("b", {}, s.label), h("small", {}, s.blurb)))));
  const lease = await (await fetch("samples/lease.json")).json();
  renderPreview(document.getElementById("preview"), lease);
}

async function readPdf(file) {
  const pdfjs = await import("./vendor/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    let line = "";
    const lines = [];
    for (const item of content.items) { line += item.str; if (item.hasEOL) { lines.push(line); line = ""; } }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

pdfInput.addEventListener("change", async () => {
  const file = pdfInput.files?.[0];
  if (!file) return;
  say("Opening…");
  try {
    const text = /\.pdf$/i.test(file.name) || file.type === "application/pdf" ? await readPdf(file) : await file.text();
    if (text.length < 50) return say("No text found. Scanned image? Paste instead.");
    textarea.value = text;
    textarea.dispatchEvent(new Event("input"));
    say("");
  } catch {
    say("Could not open that file. Paste instead.");
  } finally {
    pdfInput.value = "";
  }
});

function showLanding() {
  view.hidden = true;
  view.replaceChildren();
  landing.hidden = false;
  document.title = "Fine Print";
}

function showReading(data, source) {
  landing.hidden = true;
  view.hidden = false;
  renderReading(view, { text: data.text, reading: data.reading, source, onBack: () => { location.hash = ""; } });
  document.title = `${data.reading.title} | Fine Print`;
  window.scrollTo(0, 0);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textarea.value.replace(/\r\n?/g, "\n").trim();
  if (text.length < MIN_CHARS) return say("Too short. Paste the whole contract.");
  if (text.length > MAX_CHARS) return say("Too long. Paste the key part.");
  await metaReady;
  if (!meta.live) return say("Live reading paused. Try a sample.");
  readBtn.disabled = true;
  say("");
  landing.hidden = true;
  view.hidden = false;
  view.replaceChildren(h("div", { class: "loading", role: "status" }, h("b", {}, "Reading…"), h("p", { class: "help" }, "About a minute"), h("div", { class: "bar" }, h("i"))));
  window.scrollTo(0, 0);
  try {
    const res = await fetch("api/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message || "Something went wrong. Try again.");
    session.set({ text, reading: body.reading });
    if (location.hash === "#reading") route();
    else location.hash = "#reading";
  } catch (err) {
    location.hash = "";
    showLanding();
    say(err.message);
  } finally {
    readBtn.disabled = false;
  }
});

async function route() {
  const sample = location.hash.match(/^#sample\/([\w-]+)$/);
  if (sample) {
    try {
      const res = await fetch(`samples/${sample[1]}.json`);
      if (!res.ok) throw new Error();
      return showReading(await res.json(), "sample");
    } catch {
      location.hash = "";
    }
  }
  if (location.hash === "#reading") {
    const last = session.get();
    if (last) return showReading(last, "live");
  }
  showLanding();
  if (location.hash === "#samples") document.getElementById("samples").scrollIntoView();
}

document.querySelector("[data-home]").addEventListener("click", (e) => {
  e.preventDefault();
  if (location.hash) location.hash = "";
  else showLanding();
  window.scrollTo(0, 0);
});
window.addEventListener("hashchange", route);
loadSamples().catch(() => {});
route();
