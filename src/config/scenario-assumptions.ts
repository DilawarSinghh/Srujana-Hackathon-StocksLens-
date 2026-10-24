/**
 * DOCUMENTED, EDITABLE assumptions for hypothetical scenario analysis.
 *
 * These are ASSUMPTIONS, not measured values. They are deliberately simple,
 * transparent, and shown to the user in the Assumptions panel. They let the
 * tool illustrate "what could happen under condition X" — never a prediction.
 *
 * Sector keys match the `sector` strings seeded in src/config/universe.ts.
 */

/** Default spillover: how much a sector shock bleeds into other sectors. */
export const DEFAULT_SPILLOVER = 0.25;

/**
 * Assumed interest-rate sensitivity per sector: the % change in value per
 * +100 bps rate move (negative = value falls when rates rise). Rate-sensitive
 * sectors (lenders, real estate, autos, capital goods) are more negative;
 * defensives are mild. These are illustrative, not measured durations.
 */
export const RATE_SENSITIVITY: Record<string, number> = {
  Banking: -1.2,
  NBFC: -1.8,
  "Real Estate": -2.0,
  Automobile: -1.3,
  "Capital Goods": -1.4,
  Construction: -1.3,
  "Consumer Durables": -1.0,
  Energy: -0.6,
  Telecom: -0.7,
  "Information Technology": -0.4,
  FMCG: -0.3,
  Pharmaceuticals: -0.3,
};
export const DEFAULT_RATE_SENSITIVITY = -0.8;

/**
 * Assumed USD/INR exposure factor per sector: the % change in value per +1%
 * rupee DEPRECIATION (rupee weaker vs USD). Exporters (IT services, pharma)
 * benefit (positive); importers (oil/commodities) are hurt (negative).
 */
export const CURRENCY_EXPOSURE: Record<string, number> = {
  "Information Technology": 0.8,
  Pharmaceuticals: 0.5,
  Energy: -0.6,
  "Consumer Durables": -0.2,
  Automobile: -0.2,
  FMCG: -0.1,
  Banking: 0.0,
  NBFC: 0.0,
  Telecom: 0.0,
  Construction: -0.1,
};
export const DEFAULT_CURRENCY_EXPOSURE = 0.0;

/** Scenario input bounds (also enforced server-side where applicable). */
export const SCENARIO_BOUNDS = {
  marketDeclinePct: { min: -40, max: 0 },
  sectorShockPct: { min: -40, max: -5 },
  rateChangeBps: { min: -100, max: 200 },
  currencyMovePct: { min: -10, max: 10 },
} as const;

/** Human-readable labels for the Assumptions panel. */
export const ASSUMPTION_NOTES = {
  rate:
    "Interest-rate impact uses assumed per-sector sensitivities (% change per +100 bps). These are illustrative, not measured bond-style durations.",
  currency:
    "Currency impact uses assumed per-sector USD/INR exposure (% change per 1% rupee depreciation). Exporters benefit, importers are hurt.",
  spillover:
    "Sector-shock spillover is how much a shock to one sector is assumed to affect other holdings, scaled by their beta.",
  beta:
    "Market-decline impact scales each holding by its historical beta vs the Nifty 50; a missing beta is assumed to be 1.0.",
} as const;
