# FilingLens — Demo Script & Pitch

For hackathon problem statement **F-06 (Investment Portfolio Risk and Scenario
Analysis)**. Everything below describes features that exist in the codebase.
No numbers in this document are invented; the live figures come from whatever
the data pipeline has populated at demo time.

---

## 1. One-line pitch

> **FilingLens turns a retail investor's portfolio and a company's own filings
> into a transparent, citation-backed risk view — education, never advice.**

Longer: Most Indian retail tools show ratios and charts. FilingLens adds two
things they don't: (1) an AI that answers **only** from the company's own
filings, with page citations and a fact-audit badge, and (2) a portfolio **risk
lab** — concentration, correlation, per-holding volatility contribution, and
four hypothetical scenarios (market, sector, interest-rate, currency) — with
every assumption shown and historical vs hypothetical kept strictly separate.

---

## 2. Three-minute demo script

Keep it to one unbroken flow. Have the app already signed in, on `/portfolio`.

**0:00 — Frame it (15s).**
"This is FilingLens. It helps a retail investor understand the risk in their own
portfolio and research a company from its filings. It never gives advice — I'll
show you that it actively refuses to."

**0:15 — Load a populated portfolio (20s).**
On `/portfolio`, click **Load sample portfolio**. (Deliberately concentrated, so
the risk features have something to show.) Point at the **Holdings** table and
total value.

**0:35 — Concentration + risk (30s).**
Show the **Sector concentration** donut and the concentration flags (e.g. ">40%
in one sector"). Then the **Risk (historical)** card: portfolio beta (and the %
of value it covers), 1-year annualised volatility, single-stock HHI. Say: "These
are historical, computed from daily returns — not predictions."

**1:05 — Explain my portfolio's risk (25s).**
Click **Explain my portfolio's risk**. The server computes every number and the
AI only turns them into plain English. Read one line aloud, then point out it
ends with the "not investment advice" disclaimer and never tells you to trade.

**1:30 — Scenario lab (35s).**
In the **Risk Lab**, run a **Sector shock** (e.g. −20% to the top sector), then
switch to **Interest-rate** and **Currency**. Note the "Hypothetical estimate
based on stated assumptions. Not a prediction." label and the **Assumptions**
drawer you can edit live. Optionally edit one alternative weight to show the
**side-by-side allocation comparison** (HHI / beta / scenario impact).

**2:05 — Filings-grounded chat (40s).**
Open a stock (e.g. from the home page), scroll to the chat. Ask:
"What are the key risks management highlights?" Show the answer with **[S1]**
citation chips that open the exact filing passage and page, plus the fact-audit
badge.

**2:45 — Guardrail proof (15s).**
Ask: "Should I buy this stock?" (or Hinglish: "kya mujhe ye stock lena chahiye?")
It refuses deterministically, summarises neutral facts, and ends with the
disclaimer. That's the trust story.

**3:00 — Close.**
"Transparent scoring, filings-grounded answers, a full risk lab, and hard
no-advice guardrails — by construction."

### If the data pipeline is empty at demo time
Lead with the **guardrail proof** and the **Risk Lab** (the scenario math is
pure and runs on the sample portfolio's weights). Avoid the chat demo if no
filings are ingested — it will correctly say "I couldn't find that in the
available filings." Use the backup video (below) for the cited-answer moment.

---

## 3. Top 3 differentiators vs Screener / Tickertape / Stock Alpha

These tools are strong at ratios, screening, and clean dashboards. FilingLens is
not trying to out-screen them; it differentiates on **trust and risk depth**:

1. **Answers grounded in the company's own filings, with citations + a fact
   audit.** The AI can only use retrieved filing passages, cites each claim with
   a page reference, and a second pass audits the answer against the sources.
   General dashboards summarise metrics; they don't hand you the paragraph and
   page the claim came from.

2. **A real portfolio risk lab, not just a score.** Concentration (sector + HHI),
   correlation between holdings, per-holding volatility contribution, and four
   hypothetical scenarios (market / sector / interest-rate / currency) with
   editable, visible assumptions and side-by-side allocation comparison — the
   explicit F-06 requirements, with historical and hypothetical kept separate.

3. **Trust by construction.** Deterministic no-advice guardrails (English +
   Hinglish) that refuse "should I buy" style prompts before any model call, an
   output guard on the AI's replies, a disclaimer on every page and every
   answer, and the app never touches money or places orders.

> Verify specific competitor feature claims before stating them on stage — treat
> this list as positioning, not as audited facts about other products.

---

## 4. Likely judge questions (with short answers)

- **"Where does your data come from?"** Market data and fundamentals from Yahoo
  Finance (NSE/BSE); filings are official annual-report PDFs ingested into a
  pgvector store. Missing values are stored as NULL — we never default or invent
  a number.
- **"How is the score computed?"** Six weighted pillars summing to 100 from one
  constants file, percentile-ranked, with Piotroski, Altman Z'' and dividend
  checks; red flags can cap the score. The `/methodology` page reads the same
  constants and lists limitations.
- **"How do you stop the AI giving advice?"** A deterministic intent guard
  refuses advice-seeking prompts (English + Hinglish) before retrieval; an output
  guard scans the model's reply; the system prompt forbids buy/sell/targets; and
  every answer ends with the disclaimer.
- **"How do you avoid hallucinated numbers in the risk explainer?"** The server
  computes every figure and passes a neutral DATA block; the model only explains
  it and is told to never add a number not in DATA. Unavailable values are
  reported as "not available," with the reason.
- **"Are the scenarios predictions?"** No. They're clearly labelled hypothetical
  estimates based on stated, editable assumptions.
- **"What about reliability if a provider is down?"** Gemini calls cascade
  through a model-fallback chain; retrieval failures degrade to a clean message;
  the nightly fetch fails loudly if >30% of stocks error.
- **"Is my uploaded document private?"** Yes — per-user RLS and a private storage
  bucket scoped to the owner's folder; documents and chunks are owner-only.

---

## 5. Backup-video checklist

Record a 60–90s screen capture **before** the event so a cited-answer demo is
guaranteed even if live data or an API is unavailable:

- [ ] App signed in with Google (header shows the user).
- [ ] `/portfolio` with the sample portfolio loaded: concentration donut + flags.
- [ ] "Explain my portfolio's risk" output visible, ending with the disclaimer.
- [ ] Risk Lab: a sector-shock scenario + the assumptions drawer open.
- [ ] Allocation comparison table (current vs alternative) on screen.
- [ ] A stock page chat answer with visible **[S1]** citation chips and a source
      passage opened to its page, plus the fact-audit badge.
- [ ] A "should I buy?" prompt (and one Hinglish variant) showing the refusal.
- [ ] Clean audio or on-screen captions; keep each scene a few seconds.
- [ ] Export at 1080p; keep the file on the demo machine **and** a phone.
- [ ] Note the exact data-as-of date shown by the DataFreshness badge.
