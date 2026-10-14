import { z } from "zod";

const quote = z.string().describe("Copied exactly from the document, one passage, no ellipses");

export const ReadingSchema = z.object({
  readable: z.boolean().describe("False when the text is not an agreement or cannot be read"),
  kind_of_document: z.string().describe('Plain name, like "Apartment lease" or "Job offer"'),
  title: z.string().describe('Short title, like "Lease for 214 Elm Street, Apt 3B"'),
  parties: z.array(z.object({
    role: z.string().describe('Role in plain words, like "Landlord" or "You"'),
    name: z.string(),
  })),
  summary: z.string().describe("2 to 4 sentences"),
  key_terms: z.array(z.object({
    label: z.string(),
    value: z.string(),
    quote,
  })),
  push_back: z.array(z.object({
    title: z.string().describe("A few words naming the problem"),
    why: z.string().describe("1 or 2 sentences"),
    ask: z.string().describe("The change or question to raise, said plainly"),
    quote,
  })),
  good_to_know: z.array(z.object({
    title: z.string(),
    why: z.string(),
    quote,
  })),
  dates: z.array(z.object({
    label: z.string(),
    date: z.string().nullable().describe("YYYY-MM-DD when the document fixes the date, else null"),
    when: z.string().describe("The timing in plain words"),
    quote,
  })),
  before_you_sign: z.array(z.string()),
  email: z.object({
    subject: z.string(),
    body: z.string(),
  }),
});

export const LIMITS = { key_terms: 8, push_back: 5, good_to_know: 6, dates: 8, before_you_sign: 6, parties: 4 };

export function trimToLimits(reading) {
  const out = { ...reading };
  for (const [key, max] of Object.entries(LIMITS)) {
    if (Array.isArray(out[key])) out[key] = out[key].slice(0, max);
  }
  return out;
}

export function readingJsonSchema() {
  return z.toJSONSchema(ReadingSchema, { target: "draft-7" });
}
