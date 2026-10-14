// House style checks for model-written text. Used by the sample maker and the tests.

const RULES = [
  { name: "em dash", test: /—/ },
  { name: "semicolon", test: /;/ },
  { name: "exclamation mark", test: /!/ },
  { name: "filler", test: /\b(it'?s important to note|it is important to note|may potentially|delve|in conclusion|overall,)\b/i },
  { name: "emoji", test: /\p{Extended_Pictographic}/u },
];

function* texts(reading) {
  yield ["summary", reading.summary];
  for (const key of ["push_back", "good_to_know"]) {
    for (const [i, item] of (reading[key] || []).entries()) {
      yield [`${key}[${i}].title`, item.title];
      yield [`${key}[${i}].why`, item.why];
      if (item.ask) yield [`${key}[${i}].ask`, item.ask];
    }
  }
  for (const [i, line] of (reading.before_you_sign || []).entries()) yield [`before_you_sign[${i}]`, line];
  for (const [i, d] of (reading.dates || []).entries()) yield [`dates[${i}].when`, d.when];
}

export function styleProblems(reading) {
  const problems = [];
  for (const [where, text] of texts(reading)) {
    for (const rule of RULES) {
      if (rule.test.test(String(text || ""))) problems.push({ where, rule: rule.name, text });
    }
  }
  return problems;
}
