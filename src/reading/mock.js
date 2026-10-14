// Stand-in reader for local runs and end-to-end tests (MOCK_ENGINE=1). Never set in production.
export async function mockRead(text) {
  const first = text.split(/(?<=[.!?])\s+/).find((s) => s.length > 30) || text.slice(0, 120);
  const quote = first.slice(0, 160);
  return {
    reading: {
      readable: true,
      kind_of_document: "Test document",
      title: "Test reading",
      parties: [{ role: "You", name: "Test reader" }],
      summary: "This is a stand-in reading used for testing the page.",
      key_terms: [{ label: "Length", value: `${text.length} characters`, quote }],
      push_back: [{ title: "First sentence", why: "Used to test highlighting.", ask: "Nothing to ask.", quote }],
      good_to_know: [{ title: "A quote that is not in the document", why: "Used to test the missing-quote message.", quote: "This sentence does not appear anywhere in the text at all." }],
      dates: [{ label: "Test date", date: "2027-01-15", when: "January 15, 2027", quote }],
      before_you_sign: ["Check the page renders."],
      email: { subject: "Test", body: "Hi,\n\n1. A test question?\n\nThank you,\n[Your name]" },
    },
    meta: { model: "mock", prompt: "mock" },
  };
}
