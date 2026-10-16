import { z } from "zod";

const quote = z.string().describe("Copied exactly from the document, one passage, no ellipses");

export const ReadingSchema = z.object({
  readable: z.boolean().describe("False when the text is not an agreement or cannot be read"),
  kind_of_document: z.string().describe('Plain name, like "Apartment lease" or "Job offer"'),
  title: z.string().describe('Short title, like "Lease for 214 Elm Street, Apt 3B"'),
  parties: z.array(z.object({
    role: z.string().describe('Role in 1 or 2 words, like "Landlord" or "Tenant"'),
    name: z.string(),
  })),
  bottom_line: z.string().describe("One verdict, at most 12 words"),
  summary: z.string().describe("At most 2 sentences"),
  key_terms: z.array(z.object({
    label: z.string(),
    value: z.string(),
    quote,
  })),
  red_flags: z.array(z.object({
    title: z.string().describe("At most 5 words"),
    why: z.string().describe("At most 14 words"),
    ask: z.string().describe("The change to request, at most 14 words"),
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

export const LIMITS = { key_terms: 6, red_flags: 5, good_to_know: 4, dates: 6, before_you_sign: 5, parties: 4 };

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
