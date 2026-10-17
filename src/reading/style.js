// House style checks for model-written text. Used by the sample maker and the tests.

const RULES = [
  { name: "em dash", test: /—/ },
  { name: "semicolon", test: /;/ },
  { name: "exclamation mark", test: /!/ },
  { name: "banned phrase", test: /\bpush(ing)?[\s-]?back\b/i },
  { name: "filler", test: /\b(it'?s important to note|it is important to note|may potentially|delve|in conclusion|overall,)\b/i },
  { name: "emoji", test: /\p{Extended_Pictographic}/u },
];

const CAPS = { bottom_line: 14, title: 6, why: 16, ask: 16, value: 6, label: 5, when: 10, check: 10 };
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

function* texts(reading) {
  yield ["summary", reading.summary, null];
  yield ["bottom_line", reading.bottom_line, "bottom_line"];
  for (const key of ["red_flags", "good_to_know"]) {
    for (const [i, item] of (reading[key] || []).entries()) {
      yield [`${key}[${i}].title`, item.title, "title"];
      yield [`${key}[${i}].why`, item.why, "why"];
      if (item.ask) yield [`${key}[${i}].ask`, item.ask, "ask"];
    }
  }
  for (const [i, t] of (reading.key_terms || []).entries()) yield [`key_terms[${i}].value`, t.value, "value"];
  for (const [i, line] of (reading.before_you_sign || []).entries()) yield [`before_you_sign[${i}]`, line, "check"];
  for (const [i, d] of (reading.dates || []).entries()) {
    yield [`dates[${i}].label`, d.label, "label"];
    yield [`dates[${i}].when`, d.when, "when"];
  }
}

export function styleProblems(reading) {
  const problems = [];
  for (const [where, text, cap] of texts(reading)) {
    for (const rule of RULES) if (rule.test.test(String(text || ""))) problems.push({ where, rule: rule.name, text });
    if (cap && words(text) > CAPS[cap]) problems.push({ where, rule: `over ${CAPS[cap]} words`, text });
  }
  if (words(reading.summary) > 40) problems.push({ where: "summary", rule: "over 40 words", text: reading.summary });
  return problems;
}
