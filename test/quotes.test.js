import { test } from "node:test";
import assert from "node:assert/strict";
import { locate, segment, verifyReading } from "../src/shared/quotes.js";

const doc = `3. AUTOMATIC RENEWAL. Unless Tenant delivers written notice of non-renewal to Landlord not less than ninety (90) days prior to the expiration of the Initial Term, this Lease shall automatically renew for an additional term of twelve (12) months.

5. LATE CHARGES. Tenant shall pay an initial late charge of $75.00, plus an additional late charge of $15.00 per day.`;

test("finds an exact quote and returns its position", () => {
  const q = "this Lease shall automatically renew";
  const r = locate(doc, q);
  assert.equal(r.match, "exact");
  assert.equal(doc.slice(r.start, r.end), q);
});

test("ignores case, curly quotes, dashes and line breaks", () => {
  const r = locate(doc, "THIS LEASE SHALL\n  automatically   renew");
  assert.equal(doc.slice(r.start, r.end), "this Lease shall automatically renew");
  const curly = "Tenant’s rent is due on the 1st — always.";
  const r2 = locate(curly, "Tenant's rent is due on the 1st - always.");
  assert.equal(r2.match, "exact");
});

test("tolerates punctuation differences", () => {
  const r = locate(doc, "an initial late charge of $75.00 plus an additional late charge");
  assert.ok(r);
  assert.equal(r.match, "loose");
  assert.match(doc.slice(r.start, r.end), /^an initial late charge of \$75\.00, plus an additional late charge$/);
});

test("matches a long quote with a changed word in the middle as approximate", () => {
  const q = "Unless Tenant delivers written notice of non-renewal to the Landlord not less than ninety (90) days prior to the expiration";
  const r = locate(doc, q);
  assert.equal(r.match, "approx");
  assert.ok(doc.slice(r.start, r.end).startsWith("Unless Tenant delivers"));
});

test("returns null for words that are not in the document", () => {
  assert.equal(locate(doc, "Landlord shall pay all utilities including internet."), null);
  assert.equal(locate(doc, ""), null);
  assert.equal(locate(doc, "a"), null);
});

test("strips wrapping quote marks and ellipses", () => {
  const r = locate(doc, "“...this Lease shall automatically renew…”");
  assert.ok(r);
});

test("segment covers the whole text and handles overlaps", () => {
  const text = "abcdefghij";
  const parts = segment(text, [{ start: 2, end: 6, id: "a" }, { start: 4, end: 8, id: "b" }]);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.deepEqual(parts.map((p) => [p.text, p.ids]), [
    ["ab", []], ["cd", ["a"]], ["ef", ["a", "b"]], ["gh", ["b"]], ["ij", []],
  ]);
});

test("verifyReading counts found quotes and tags each item", () => {
  const reading = {
    key_terms: [{ label: "Late fee", value: "$75", quote: "initial late charge of $75.00" }],
    push_back: [{ title: "Renewal", why: "", ask: "", quote: "shall automatically renew for an additional term" }],
    good_to_know: [{ title: "Made up", why: "", quote: "Landlord pays for parking." }],
    dates: [],
  };
  const { reading: out, ranges, stats } = verifyReading(doc, reading);
  assert.deepEqual(stats, { total: 3, found: 2 });
  assert.equal(ranges.length, 2);
  assert.equal(out.push_back[0].id, "push_back-0");
  assert.equal(out.good_to_know[0].located, null);
});
