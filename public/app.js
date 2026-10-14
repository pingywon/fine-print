import { h, renderReading } from "./render.js";

const MAX_CHARS = 60000;
const MIN_CHARS = 200;

const landing = document.getElementById("landing");
const view = document.getElementById("reading-view");
const form = document.getElementById("paste-form");
const textarea = document.getElementById("doc-text");
const counter = document.getElementById("char-count");
const notice = document.getElementById("form-notice");
const readBtn = document.getElementById("read-btn");
const pdfInput = document.getElementById("pdf-input");
const sampleList = document.getElementById("sample-list");

let meta = { live: false };
const metaReady = fetch("api/meta").then((r) => (r.ok ? r.json() : meta)).then((m) => (meta = m)).catch(() => meta);

const session = {
  get() {
    try { return JSON.parse(sessionStorage.getItem("fp:last") || "null"); } catch { return null; }
  },
  set(v) {
    try { sessionStorage.setItem("fp:last", JSON.stringify(v)); } catch { /* fine without it */ }
  },
};

function say(message, kind = "info") {
  notice.textContent = message;
  notice.classList.toggle("error", kind === "error");
  notice.hidden = !message;
}

function updateCount() {
  const n = textarea.value.length;
  counter.textContent = `${n.toLocaleString("en-US")} characters${n > MAX_CHARS ? `, over the ${MAX_CHARS.toLocaleString("en-US")} limit` : ""}`;
}

async function loadSamples() {
  const res = await fetch("samples/index.json");
  const list = await res.json();
  sampleList.replaceChildren(...list.map((s) => h("li", {},
    h("button", { type: "button", onclick: () => (location.hash = `#sample/${s.id}`) },
      h("strong", {}, s.label), h("span", {}, s.blurb)),
  )));
}

async function readPdf(file) {
  const pdfjs = await import("./vendor/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    const lines = [];
    for (const item of content.items) {
      line += item.str;
      if (item.hasEOL) { lines.push(line); line = ""; }
    }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

pdfInput.addEventListener("change", async () => {
  const file = pdfInput.files?.[0];
  if (!file) return;
  say("Opening the file…");
  try {
    const text = /\.pdf$/i.test(file.name) || file.type === "application/pdf" ? await readPdf(file) : await file.text();
    if (text.length < 50) {
      say("That file has no readable text. It may be a scanned image. Paste the text instead.", "error");
      return;
    }
    textarea.value = text;
    updateCount();
    say(`Loaded ${file.name}. Check the text, then press Read it.`);
  } catch {
    say("That file could not be opened. Paste the text instead.", "error");
  } finally {
    pdfInput.value = "";
  }
});

textarea.addEventListener("input", updateCount);

function showLoading() {
  landing.hidden = true;
  view.hidden = false;
  view.replaceChildren(h("div", { class: "loading", role: "status" },
    h("p", {}, "Reading your document. This takes about a minute for a long one."),
    h("div", { class: "bar", "aria-hidden": "true" }, h("i")),
  ));
  window.scrollTo(0, 0);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textarea.value.replace(/\r\n?/g, "\n").trim();
  if (text.length < MIN_CHARS) return say("Paste the whole document. That is too short to read.", "error");
  if (text.length > MAX_CHARS) return say(`That is over ${MAX_CHARS.toLocaleString("en-US")} characters. Paste the part you want read.`, "error");
  await metaReady;
  if (!meta.live) return say("Live reading is paused right now. Open a sample to see a full reading.", "error");

  readBtn.disabled = true;
  say("");
  showLoading();
  try {
    const res = await fetch("api/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message || "Something went wrong. Try again.");
    session.set({ text, reading: body.reading });
    if (location.hash === "#reading") route();
    else location.hash = "#reading";
  } catch (err) {
    location.hash = "";
    showLanding();
    say(err.message, "error");
  } finally {
    readBtn.disabled = false;
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
  renderReading(view, { text: data.text, reading: data.reading, source });
  document.title = `${data.reading.title} | Fine Print`;
  window.scrollTo(0, 0);
}

async function route() {
  const hash = location.hash;
  const sample = hash.match(/^#sample\/([\w-]+)$/);
  if (sample) {
    try {
      const res = await fetch(`samples/${sample[1]}.json`);
      if (!res.ok) throw new Error();
      showReading(await res.json(), "sample");
    } catch {
      location.hash = "";
    }
    return;
  }
  if (hash === "#reading") {
    const last = session.get();
    if (last) return showReading(last, "live");
  }
  showLanding();
}

document.querySelectorAll("[data-home]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  if (location.hash) location.hash = "";
  else showLanding();
}));

window.addEventListener("hashchange", route);
updateCount();
loadSamples().catch(() => {});
route();
