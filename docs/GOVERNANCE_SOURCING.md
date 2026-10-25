# Governance inputs — source-to-field mapping

`governance_inputs` (migration `0002`) feeds the **Governance pillar (10%)** of the
Fundamental Score and the governance red-flag caps. The scoring engine treats
every governance field as **optional**: a missing value is `unknown`/null, the
sub-score is skipped, and the pillar is renormalised over whatever is available
(verified: with zero governance rows, `governance` pillar is null and
`data_confidence` reflects the gap — the stock is still scored on the other
pillars). **Do not invent these values.** Populate `data/governance_seed.csv`
only from the official sources below, then run `pnpm seed`.

All values are point-in-time; record the disclosure date in `as_of`.

| CSV column | Meaning | Official source |
| --- | --- | --- |
| `symbol` | NSE symbol (must match `stocks.symbol`) | — |
| `as_of` | Disclosure date (YYYY-MM-DD) | the filing's period/date |
| `promoter_holding_pct` | Promoter & promoter-group holding % | **NSE/BSE Shareholding Pattern** (quarterly, Reg. 31) — NSE: company page → "Shareholding Pattern"; BSE: Corp Filings → Shareholding Pattern |
| `promoter_pledge_pct` | % of promoter holding pledged/encumbered | Same shareholding-pattern filing (pledge table), and **SEBI/depository** encumbrance disclosures |
| `promoter_holding_change_1y` | Change in promoter % vs 1 year earlier (percentage points) | Compare two shareholding-pattern filings ~4 quarters apart |
| `fii_pct` | Foreign institutional / FPI holding % | Shareholding Pattern ("Foreign Portfolio Investors" rows) |
| `dii_pct` | Domestic institutional holding % | Shareholding Pattern ("Mutual Funds" + "Insurance" + other DII rows) |
| `public_pct` | Public shareholding % | Shareholding Pattern ("Public" total) |
| `auditor_opinion` | One of `unqualified`/`qualified`/`adverse`/`disclaimer` | **Annual Report → Independent Auditor's Report** ("Opinion" section) |
| `related_party_trend` | `stable`/`rising`/`sharply_rising` | **Annual Report → Notes → Related-Party Transactions**; trend judged across years |
| `source_note` | Free-text provenance (URL, filing date) | — |

## Why this is not auto-ingested
- Tapetide exposes **shareholding/FII-DII flows** (`getStockOwnership`,
  institutional-flow endpoints), which could supply `promoter_holding_pct`,
  `fii_pct`, `dii_pct`, `public_pct` and possibly pledge — but **auditor opinion
  and related-party trend come from the narrative annual report** and have no
  reliable structured feed. A future enhancement could auto-fill the numeric
  ownership fields from Tapetide's ownership endpoint and leave the two
  qualitative fields for manual/verified entry. That is **not** implemented here
  to avoid partially-sourced rows; it is noted as a scoped follow-up.
- Until verified values are entered, the Governance pillar stays null for all
  stocks and **no governance red flags can fire** — which is correct, honest
  behaviour, not a bug.
