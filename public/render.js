import { h, icon } from "./kit.js";
import { verifyReading, segment } from "./shared/quotes.js";

const SECTION_LINE = /^\s*(?:section\s+)?(\d{1,3})\.\s/i;
const SUB_LINE = /^\s*\(([a-z])\)\s/;

export function sectionAt(text, pos) {
  const lines = text.slice(0, pos).split("\n");
  let sub = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const s = lines[i].match(SUB_LINE);
    if (s && !sub) sub = s[1];
    const m = lines[i].match(SECTION_LINE);
    if (m) return `Sec ${m[1]}${sub ? `(${sub})` : ""}`;
  }
  return null;
}

function context(text, at, pad = 110) {
  let a = Math.max(0, at.start - pad);
  let b = Math.min(text.length, at.end + pad);
  const para = text.lastIndexOf("\n", at.start);
  if (para > a) a = para + 1;
  const paraEnd = text.indexOf("\n", at.end);
  if (paraEnd >= 0 && paraEnd < b) b = paraEnd;
  while (a > 0 && a < at.start && !/\s/.test(text[a - 1])) a++;
  while (b < text.length && b > at.end && !/\s/.test(text[b])) b--;
  return [(a > 0 && text[a - 1] !== "\n" ? "\u2026" : "") + text.slice(a, at.start), text.slice(at.start, at.end), text.slice(at.end, b) + (b < text.length && text[b] !== "\n" ? "\u2026" : "")];
}

function hash(str) {
  let x = 5381;
  for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0;
  return (x >>> 0).toString(36);
}
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* fine without it */ } },
};

function icsFor(title, dates) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fine Print//EN", "CALSCALE:GREGORIAN"];
  for (const d of dates) {
    const day = d.date.replace(/-/g, "");
    const next = new Date(`${d.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    lines.push("BEGIN:VEVENT", `UID:${day}-${hash(d.label)}@fineprint`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`, `SUMMARY:${esc(d.label)}`, `DESCRIPTION:${esc(`${d.when}\n${title}`)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function cal(iso) {
  if (!iso) return h("div", { class: "cal any" }, "Ongoing");
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return h("div", { class: "cal any" }, iso);
  const m = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return h("div", { class: "cal" }, h("span", {}, m.toUpperCase()), h("b", {}, String(d.getUTCDate())), h("small", {}, String(d.getUTCFullYear())));
}

const roleOf = (role) => {
  const r = String(role || "").trim();
  const inner = r.match(/^you\s*\((.+)\)$/i) || r.match(/^(.+?)\s*\(you\)$/i);
  return inner ? inner[1] : r;
};

const tile = (k, v, cls = "", ic = null, small = false) => h("div", { class: `tile ${cls}` }, h("span", { class: "k" }, ic ? icon(ic) : null, k), h("span", { class: `v${small ? " small" : ""}` }, v));

// Small live preview for the landing page, built from a real sample.
export function renderPreview(root, record) {
  const { reading, stats } = verifyReading(record.text, record.reading);
  const flag = reading.red_flags[0];
  const at = flag?.located;
  const q = at ? context(record.text, at, 60) : null;
  root.replaceChildren(h("div", { class: "card" },
    h("div", { class: "pv-top" }, h("span", { class: "chip accent" }, reading.kind_of_document), h("span", { class: "chip ok" }, icon("check"), "Verified")),
    h("p", { class: "pv-verdict" }, reading.bottom_line),
    h("div", { class: "pv-tiles" },
      tile("Red flags", String(reading.red_flags.length), "bad"),
      tile("Dates", String(reading.dates.length), "accent"),
      tile("Quotes", `${stats.found}/${stats.total}`, "ok"),
    ),
    flag ? h("div", { class: "pv-flag" },
      h("b", {}, h("span", { class: "num" }, "1"), flag.title),
      q ? h("p", { class: "pv-quote" }, q[0], h("mark", {}, q[1]), q[2]) : null,
    ) : null,
  ));
}

export function renderReading(root, { text, reading: raw, source, onBack }) {
  const { reading, ranges, stats } = verifyReading(text, raw);
  root.replaceChildren();
  let showTab = () => {};

  const marksFor = (id) => [...root.querySelectorAll(`.doc mark[data-ids~="${id}"]`)];
  const seeInDoc = (id) => {
    showTab("doc");
    const m = marksFor(id)[0];
    if (!m) return;
    m.scrollIntoView({ block: "center", behavior: "smooth" });
    marksFor(id).forEach((x) => { x.classList.add("lit"); setTimeout(() => x.classList.remove("lit"), 1800); });
  };

  const clause = (item) => {
    const where = item.located ? sectionAt(text, item.located.start) : null;
    const box = h("div", { class: "clause", hidden: true });
    if (item.located) {
      const [a, q, b] = context(text, item.located);
      box.append(a, h("mark", {}, q), b, h("span", { class: "found" }, icon("check"), `Found in your text${where ? `, ${where}` : ""}`));
    } else {
      box.append(`\u201C${item.quote}\u201D`, h("span", { class: "found miss" }, "Not found word for word. Check the original."));
    }
    const btn = h("button", {
      type: "button", class: "linkish", "aria-expanded": "false",
      onclick: () => { const open = box.hidden; box.hidden = !open; btn.setAttribute("aria-expanded", String(open)); btn.lastChild.textContent = open ? "Hide clause" : "Show clause"; },
    }, icon("eye"), "Show clause");
    const row = h("div", { class: "row" }, btn);
    if (item.located) row.append(h("button", { type: "button", class: "linkish", onclick: () => seeInDoc(item.id) }, icon("doc"), "In document"));
    return [row, box];
  };

  const flagEl = (it, i, calm) => h("li", { class: "flag", id: `item-${it.id}` },
    h("div", { class: "flag-top" }, h("span", { class: `num${calm ? " calm" : ""}` }, String(i + 1)), h("b", {}, it.title)),
    h("p", { class: "why" }, it.why),
    it.ask ? h("p", { class: "ask" }, h("span", { class: "chip accent" }, "Ask"), h("span", {}, it.ask)) : null,
    ...clause(it),
  );

  const people = (reading.parties || []).map((p) => `${p.name} (${roleOf(p.role)})`).join(", ");
  root.append(h("div", { class: "r-head" },
    h("div", { class: "bar" },
      h("button", { type: "button", class: "btn ghost sm", onclick: onBack }, icon("arrowLeft"), "New"),
      h("span", { class: "chip accent" }, reading.kind_of_document),
      source === "sample" ? h("span", { class: "chip" }, "Sample") : null,
    ),
    h("h1", { class: "r-title" }, reading.title),
    people ? h("p", { class: "r-parties" }, people) : null,
  ));

  root.append(h("div", { class: "card verdict" },
    h("span", { class: "ic" }, icon("shield")),
    h("div", {}, h("p", { class: "line" }, reading.bottom_line || reading.summary), reading.bottom_line ? h("p", { class: "sum" }, reading.summary) : null),
  ));

  const fixed = reading.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date || ""));
  const money = reading.key_terms[0];
  root.append(h("div", { class: "tiles", style: null },
    tile("Red flags", String(reading.red_flags.length), reading.red_flags.length ? "bad" : "ok", "flag"),
    tile("Dates", String(reading.dates.length), "accent", "calendar"),
    money ? tile(money.label, money.value.split(", ")[0].replace(/\.00\b/, ""), "", "dollar", true) : tile("Terms", String(reading.key_terms.length), "", "dollar"),
    tile("Quotes found", `${stats.found}/${stats.total}`, stats.found === stats.total ? "ok" : "bad", "shield"),
  ));

  const tabOverview = h("button", { type: "button", role: "tab", "aria-selected": "true", onclick: () => showTab("overview") }, "Overview");
  const tabDoc = h("button", { type: "button", role: "tab", "aria-selected": "false", onclick: () => showTab("doc") }, "Document");
  root.append(h("div", { class: "seg-row" }, h("div", { class: "seg", role: "tablist" }, tabOverview, tabDoc)));

  const main = h("div", { class: "stack" });
  const side = h("aside", { class: "side stack" });
  const overview = h("div", { class: "split", id: "panel-overview" }, main, side);

  main.append(h("section", { class: "card" },
    h("div", { class: "card-h" }, h("h2", {}, "Red flags"), h("span", { class: "count" }, String(reading.red_flags.length))),
    reading.red_flags.length ? h("ul", { class: "list" }, reading.red_flags.map((it, i) => flagEl(it, i, false))) : h("p", {}, "Nothing unusual."),
  ));
  if (reading.good_to_know.length) {
    main.append(h("section", { class: "card" },
      h("div", { class: "card-h" }, h("h2", {}, "Good to know"), h("span", { class: "count" }, String(reading.good_to_know.length))),
      h("ul", { class: "list" }, reading.good_to_know.map((it, i) => flagEl(it, i, true))),
    ));
  }

  if (reading.key_terms.length) {
    side.append(h("section", { class: "card" }, h("div", { class: "card-h" }, h("h2", {}, "Key terms")),
      h("dl", { class: "terms" }, reading.key_terms.map((t) => h("div", {}, h("dt", {}, t.label), h("dd", {}, t.value))))));
  }
  if (reading.dates.length) {
    const add = fixed.length ? h("button", {
      type: "button", class: "btn ghost sm",
      onclick: () => {
        const a = h("a", { href: URL.createObjectURL(new Blob([icsFor(reading.title, fixed)], { type: "text/calendar" })), download: "fine-print-dates.ics" });
        document.body.append(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      },
    }, icon("calendar"), "Add") : null;
    side.append(h("section", { class: "card" }, h("div", { class: "card-h" }, h("h2", {}, "Dates"), add),
      h("ul", { class: "list dates" }, reading.dates.map((d) => h("li", {}, cal(d.date), h("div", {}, h("b", { class: "label" }, d.label), h("small", { class: "when" }, d.when)))))));
  }
  if (reading.before_you_sign.length) {
    const key = `fp:check:${hash(text)}`;
    const saved = store.get(key) || [];
    side.append(h("section", { class: "card" }, h("div", { class: "card-h" }, h("h2", {}, "Before you sign")),
      h("ul", { class: "list checks" }, reading.before_you_sign.map((line, i) => h("li", {}, h("label", {},
        h("input", { type: "checkbox", checked: saved.includes(i), onchange: (e) => { const s = new Set(store.get(key) || []); e.target.checked ? s.add(i) : s.delete(i); store.set(key, [...s]); } }),
        h("span", {}, line)))))));
  }
  if (reading.email?.body) {
    const copy = h("button", {
      type: "button", class: "btn sm",
      onclick: async () => {
        try { await navigator.clipboard.writeText(`${reading.email.subject}\n\n${reading.email.body}`); copy.lastChild.textContent = "Copied"; } catch { copy.lastChild.textContent = "Copy failed"; }
        setTimeout(() => (copy.lastChild.textContent = "Copy"), 2200);
      },
    }, icon("copy"), "Copy");
    const mailto = `mailto:?subject=${encodeURIComponent(reading.email.subject)}&body=${encodeURIComponent(reading.email.body)}`;
    side.append(h("section", { class: "card mail" }, h("div", { class: "card-h" }, h("h2", {}, "Email them")),
      h("div", { class: "row" }, copy, h("a", { class: "btn ghost sm", href: mailto }, icon("mail"), "Open")),
      h("details", { class: "more" }, h("summary", {}, "Preview"), h("pre", {}, `${reading.email.subject}\n\n${reading.email.body}`))));
  }

  const docEl = h("div", { class: "doc", tabindex: "0", "aria-label": "Your document with highlights" });
  for (const seg of segment(text, ranges)) {
    if (!seg.ids.length) { docEl.append(seg.text); continue; }
    const tier = seg.ids.some((id) => id.startsWith("red_flags")) ? null : seg.ids.some((id) => id.startsWith("good_to_know")) ? "soft" : "faint";
    docEl.append(h("mark", {
      class: tier, "data-ids": seg.ids.join(" "),
      onclick: () => {
        const id = seg.ids.find((x) => root.querySelector(`#item-${x}`));
        if (!id) return;
        showTab("overview");
        const t = root.querySelector(`#item-${id}`);
        t.scrollIntoView({ block: "center", behavior: "smooth" });
        t.classList.add("lit");
        setTimeout(() => t.classList.remove("lit"), 1800);
      },
    }, seg.text));
  }
  const docPanel = h("section", { class: "card", id: "panel-doc", hidden: true },
    h("div", { class: "legend" }, h("span", {}, h("i"), "Red flag"), h("span", {}, h("i", { class: "soft" }), "Good to know"), h("span", {}, h("i", { class: "faint" }), "Numbers")),
    docEl);

  root.append(h("div", { class: "stack", id: "panels" }, overview, docPanel));
  showTab = (which) => {
    overview.hidden = which !== "overview";
    docPanel.hidden = which !== "doc";
    tabOverview.setAttribute("aria-selected", String(which === "overview"));
    tabDoc.setAttribute("aria-selected", String(which === "doc"));
  };
  return { stats };
}
