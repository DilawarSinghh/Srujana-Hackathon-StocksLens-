# NOTICE — Third-party attributions

FilingLens adapts a small amount of logic from one open-source project and was
inspired (ideas only) by another. Nothing in those repositories is copied
verbatim; the items below were re-implemented in TypeScript inside this
project's own structure.

---

## Nipun-AI — MIT License

Source: https://github.com/myProjectsRavi/Nipun-AI

The following ideas/logic were adapted (rewritten, not copied) from Nipun-AI.
Each adapted function carries the comment
`// Adapted from Nipun-AI (MIT License). See NOTICE.md.`:

- **Piotroski F-Score** — the idea of a 9-criterion fundamental-health score
  (`src/lib/scoring/quality.ts`). Nipun-AI uses a single-year proxy; FilingLens
  implements the real year-over-year criteria using its multi-year
  `fundamentals_annual` data.
- **Gemini model fallback cascade** — the cascading-model strategy (try an
  ordered list of models, advance on transient failure) in
  `src/lib/rag/model-chain.ts`. Reimplemented on the Vercel AI SDK (no raw
  `fetch`, no hard-coded model names).
- **Claim / fact audit** — the grounded/speculative claim-classification idea in
  `src/lib/rag/audit.ts`. Reimplemented against FilingLens's own RAG sources and
  Gemini (no Cohere or any new AI provider).
- **PDF report layout** — the jsPDF report structure with a per-page disclaimer
  footer, used in `src/lib/portfolio/risk-report.ts`. All investment-advice
  content (buy/sell signals, price targets, recommendations) was removed and the
  data is India/INR-specific.

> Note: Nipun-AI's own buy/sell/hold signals, A–F grade, "recommendation" text,
> and DCF/Graham/Lynch price targets were intentionally **not** ported, because
> FilingLens is educational and never gives investment advice.

### Nipun-AI LICENSE (verbatim)

```
MIT License

Copyright (c) 2025 RTN Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## StockSnapAI — ideas only, no code copied

Source: https://github.com/sayed-ashfaq/StockSnapAI

StockSnapAI (a Python/Streamlit prototype) ships **no license file**. Per our
licensing policy, **no code was copied and no code was translated** from it.

Only the high-level product *ideas* informed FilingLens's user-document feature:
uploading a financial PDF, producing a neutral summary with red-flag detection,
chatting with the document using citations, and exporting the chat. These were
built from scratch on FilingLens's own stack (Supabase + pgvector + the Vercel
AI SDK), reusing FilingLens's existing extraction/chunking/embedding/RAG code.
See `src/lib/rag/doc-scan.ts`, `src/lib/rag/ingest.ts`,
`src/app/api/documents/**`, and `src/components/documents/**`.
