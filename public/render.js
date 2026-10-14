import { verifyReading, segment } from "./shared/quotes.js";

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SECTION_LINE = /^\s*(?:section\s+)?(\d{1,3})\.\s/i;
const SUB_LINE = /^\s*\(([a-z])\)\s/;

export function sectionAt(text, pos) {
  const lines = text.slice(0, pos).split("\n");
  let sub = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const s = line.match(SUB_LINE);
    if (s && !sub) sub = s[1];
    const m = line.match(SECTION_LINE);
    if (m) return `Section ${m[1]}${sub ? `(${sub})` : ""}`;
  }
  return null;
}

function context(text, located, pad = 140) {
  let a = Math.max(0, located.start - pad);
  let b = Math.min(text.length, located.end + pad);
  const para = text.lastIndexOf("\n", located.start);
  if (para > a) a = para + 1;
  const paraEnd = text.indexOf("\n", located.end);
  if (paraEnd >= 0 && paraEnd < b) b = paraEnd;
  while (a > 0 && a < located.start && !/\s/.test(text[a - 1])) a++;
  while (b < text.length && b > located.end && !/\s/.test(text[b])) b--;
  return {
    before: (a > 0 && text[a - 1] !== "\n" ? "\u2026" : "") + text.slice(a, located.start),
    quote: text.slice(located.start, located.end),
    after: text.slice(located.end, b) + (b < text.length && text[b] !== "\n" ? "\u2026" : ""),
  };
}

function hash(str) {
  let x = 5381;
  for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0;
  return (x >>> 0).toString(36);
}

const store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be blocked */ }
  },
};

function icsFor(title, dates) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fine Print//EN", "CALSCALE:GREGORIAN"];
  for (const d of dates) {
    const day = d.date.replace(/-/g, "");
    const next = new Date(`${d.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${day}-${hash(d.label)}@fineprint`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`,
      `SUMMARY:${esc(d.label)}`,
      `DESCRIPTION:${esc(`${d.when}\n${title}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function flashSoon(el) {
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

export function renderReading(root, { text, reading: raw, source }) {
  const { reading, ranges, stats } = verifyReading(text, raw);
  root.replaceChildren();

  const isWide = () => window.matchMedia("(min-width: 960px)").matches;
  const marksFor = (id) => [...root.querySelectorAll(`.doc mark[data-ids~="${id}"]`)];
  let showPanel = () => {};

  function revealInDoc(id) {
    const marks = marksFor(id);
    if (!marks.length) return;
    if (!isWide()) showPanel("doc");
    const mark = marks[0];
    const panel = root.querySelector(".doc");
    if (isWide() && panel) {
      panel.scrollTo({ top: mark.offsetTop - panel.clientHeight / 3, behavior: "smooth" });
    } else {
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    marks.forEach(flashSoon);
  }

  function light(id, on) {
    for (const m of marksFor(id)) m.classList.toggle("lit", on);
  }

  function wordingFor(item) {
    const where = item.located ? sectionAt(text, item.located.start) : null;
    const box = h("div", { class: "wording", hidden: true });
    if (item.located) {
      const c = context(text, item.located);
      box.append(c.before, h("mark", {}, c.quote), c.after);
      box.append(h("span", { class: "check" }, "Found in your document", where ? `, ${where}` : "", "."));
      if (!isWide()) {
        box.append(" ", h("a", { href: "#", onclick: (e) => { e.preventDefault(); revealInDoc(item.id); } }, "See it in the document"));
      }
    } else {
      box.append(h("span", {}, `\u201C${item.quote}\u201D`));
      box.append(h("span", { class: "check missing" }, "This exact wording was not found in your document. Check the original before relying on it."));
    }
    const toggle = h("button", {
      type: "button",
      class: "wording-toggle",
      "aria-expanded": "false",
      onclick: () => {
        const open = box.hidden;
        box.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
        toggle.firstChild.textContent = open ? "Hide the wording" : "Show the wording";
        if (open && isWide()) revealInDoc(item.id);
      },
    }, h("span", {}, "Show the wording"), where ? h("span", { class: "where" }, where) : null);
    return [toggle, box];
  }

  function itemEl(item, { ask }) {
    const li = h("li", {
      class: "item",
      id: `item-${item.id}`,
      onmouseenter: () => light(item.id, true),
      onmouseleave: () => light(item.id, false),
    },
      h("h3", {}, item.title),
      h("p", {}, item.why),
      ask && item.ask ? h("p", { class: "ask" }, h("b", {}, "Ask: "), item.ask) : null,
      ...wordingFor(item),
    );
    return li;
  }

  const roleOf = (role) => {
    const r = String(role || "").trim();
    const inner = r.match(/^you\s*\((.+)\)$/i) || r.match(/^(.+?)\s*\(you\)$/i);
    return inner ? `${inner[1]}, you` : r;
  };
  const people = (reading.parties || []).map((p) => `${p.name} (${roleOf(p.role)})`);
  const partyLine = people.length > 1 ? `${people.slice(0, -1).join(", ")} and ${people.at(-1)}` : people[0] || "";
  const sourceLine = source === "sample"
    ? `Sample document with made-up names. Reading by Claude. ${stats.found} of ${stats.total} quotes found in the document.`
    : `Read by Claude just now. ${stats.found} of ${stats.total} quotes found in your document.`;

  root.append(h("div", { class: "doc-head" },
    h("a", { class: "back", href: "#" }, "New document"),
    h("p", { class: "kind" }, reading.kind_of_document),
    h("h1", {}, reading.title),
    partyLine ? h("p", { class: "parties" }, partyLine) : null,
    h("p", { class: "source-line" }, sourceLine),
  ));

  const toTop = () => {
    const grid = root.querySelector(".reading-grid");
    const y = grid.getBoundingClientRect().top + window.scrollY - tabs.offsetHeight;
    if (window.scrollY > y) window.scrollTo(0, y);
  };
  const tabReading = h("button", { type: "button", role: "tab", "aria-selected": "true", "aria-controls": "panel-reading", onclick: () => { showPanel("reading"); toTop(); } }, "Reading");
  const tabDoc = h("button", { type: "button", role: "tab", "aria-selected": "false", "aria-controls": "panel-doc", onclick: () => { showPanel("doc"); toTop(); } }, "Document");
  const tabs = h("div", { class: "tabs", role: "tablist" }, tabReading, tabDoc);
  root.append(tabs);

  const readingPanel = h("div", { class: "panel reading", id: "panel-reading", role: "tabpanel" });
  const docPanel = h("div", { class: "panel doc-panel", id: "panel-doc", role: "tabpanel", hidden: true });
  root.append(h("div", { class: "reading-grid" }, readingPanel, docPanel));

  showPanel = (which) => {
    readingPanel.hidden = which !== "reading";
    docPanel.hidden = which !== "doc";
    tabReading.setAttribute("aria-selected", String(which === "reading"));
    tabDoc.setAttribute("aria-selected", String(which === "doc"));
  };

  const section = (title, count, ...body) => h("section", {},
    h("h2", {}, title, count != null ? h("span", { class: "count" }, String(count)) : null), ...body);

  readingPanel.append(section("In plain words", null, h("p", { class: "summary" }, reading.summary)));

  if (reading.readable !== false) {
    if (reading.key_terms.length) {
      readingPanel.append(section("The numbers", null, h("dl", { class: "terms" },
        reading.key_terms.map((t) => h("div", {
          onmouseenter: () => light(t.id, true),
          onmouseleave: () => light(t.id, false),
        },
          h("dt", {}, t.label),
          h("dd", {}, t.located ? h("button", { type: "button", title: "Show in the document", onclick: () => revealInDoc(t.id) }, t.value) : t.value),
        )),
      )));
    }

    readingPanel.append(section("Push back on", reading.push_back.length,
      reading.push_back.length
        ? h("ul", { class: "items push" }, reading.push_back.map((it) => itemEl(it, { ask: true })))
        : h("p", {}, "Nothing here stands out as unusual or one-sided."),
    ));

    if (reading.good_to_know.length) {
      readingPanel.append(section("Good to know", reading.good_to_know.length,
        h("ul", { class: "items" }, reading.good_to_know.map((it) => itemEl(it, { ask: false })))));
    }

    if (reading.dates.length) {
      const fixed = reading.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date || ""));
      const download = fixed.length ? h("button", {
        type: "button",
        class: "btn quiet small",
        onclick: () => {
          const blob = new Blob([icsFor(reading.title, fixed)], { type: "text/calendar" });
          const a = h("a", { href: URL.createObjectURL(blob), download: "fine-print-dates.ics" });
          document.body.append(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        },
      }, `Add ${fixed.length === 1 ? "this date" : `${fixed.length} dates`} to your calendar`) : null;
      readingPanel.append(section("Dates", null,
        h("ul", { class: "dates" }, reading.dates.map((d) => h("li", {},
          d.date ? h("time", { datetime: d.date }, formatDate(d.date)) : h("span", { class: "tbd" }, "Depends"),
          h("div", {}, h("span", { class: "label" }, d.label), h("span", { class: "when" }, d.when)),
        ))),
        download,
      ));
    }

    if (reading.before_you_sign.length) {
      const key = `fp:check:${hash(text)}`;
      const saved = store.get(key) || [];
      readingPanel.append(section("Before you sign", null, h("ul", { class: "checklist" },
        reading.before_you_sign.map((line, i) => h("li", {}, h("label", {},
          h("input", {
            type: "checkbox",
            checked: saved.includes(i),
            onchange: (e) => {
              const now = new Set(store.get(key) || []);
              e.target.checked ? now.add(i) : now.delete(i);
              store.set(key, [...now]);
            },
          }),
          h("span", {}, line),
        ))),
      )));
    }

    if (reading.email?.body) {
      const copyBtn = h("button", {
        type: "button",
        class: "btn small",
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(`${reading.email.subject}\n\n${reading.email.body}`);
            copyBtn.textContent = "Copied";
          } catch {
            copyBtn.textContent = "Select the text to copy";
          }
          setTimeout(() => (copyBtn.textContent = "Copy the message"), 2500);
        },
      }, "Copy the message");
      const mailto = `mailto:?subject=${encodeURIComponent(reading.email.subject)}&body=${encodeURIComponent(reading.email.body)}`;
      readingPanel.append(section("Questions to send", null,
        h("div", { class: "letter" },
          h("p", { class: "subject" }, reading.email.subject),
          h("p", { class: "body" }, reading.email.body),
        ),
        h("div", { class: "row" }, copyBtn, h("a", { class: "btn quiet small", href: mailto }, "Open in email")),
      ));
    }
  }

  const docEl = h("div", { class: "doc", tabindex: "0", "aria-label": "Document text with highlighted passages" });
  for (const seg of segment(text, ranges)) {
    if (!seg.ids.length) {
      docEl.append(seg.text);
      continue;
    }
    const tier = seg.ids.some((id) => id.startsWith("push_back")) ? ""
      : seg.ids.some((id) => id.startsWith("good_to_know")) ? "soft" : "faint";
    docEl.append(h("mark", {
      class: tier || null,
      "data-ids": seg.ids.join(" "),
      onclick: () => {
        const target = root.querySelector(`#item-${seg.ids.find((id) => root.querySelector(`#item-${id}`)) || ""}`);
        if (!target) return;
        if (!isWide()) showPanel("reading");
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        target.classList.add("lit");
        setTimeout(() => target.classList.remove("lit"), 1600);
      },
    }, seg.text));
  }
  docPanel.append(h("h2", {}, "The document"), docEl);

  return { stats };
}
