import { z } from "zod";

/**
 * Zod schemas for all Community mutations. Shared by server actions (server
 * validation) and, where useful, by client forms. Keep limits in sync with the
 * CHECK constraints in migration 0013.
 */

export const POST_BODY_MAX = 5000;
export const COMMENT_BODY_MAX = 2000;
export const POLL_OPTION_MAX = 6;
export const POLL_OPTION_MIN = 2;

export const postTypeSchema = z.enum([
  "discussion",
  "thesis",
  "analysis",
  "portfolio_review",
  "poll",
]);
export const stanceSchema = z.enum(["bullish", "bearish", "neutral"]);

/** A ticker symbol as typed by the user (validated against the universe later). */
const symbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((s) => s.toUpperCase());

export const createPostSchema = z
  .object({
    postType: postTypeSchema.default("discussion"),
    body: z.string().trim().min(1).max(POST_BODY_MAX),
    symbols: z.array(symbolSchema).max(5).default([]),
    // Thesis-only fields.
    stance: stanceSchema.optional(),
    timeHorizon: z.string().trim().max(60).optional(),
    thesisRisks: z.string().trim().max(2000).optional(),
    // Portfolio review link.
    portfolioShareId: z.string().uuid().optional(),
    // Poll-only fields.
    pollQuestion: z.string().trim().min(1).max(300).optional(),
    pollOptions: z.array(z.string().trim().min(1).max(120)).optional(),
    pollClosesAt: z.string().datetime().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.postType === "analysis" && val.symbols.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A stock analysis post must attach at least one stock.",
        path: ["symbols"],
      });
    }
    if (val.postType === "thesis" && val.symbols.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A thesis must reference at least one stock.",
        path: ["symbols"],
      });
    }
    if (val.postType === "portfolio_review" && !val.portfolioShareId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A portfolio review must link a portfolio share.",
        path: ["portfolioShareId"],
      });
    }
    if (val.postType === "poll") {
      const opts = (val.pollOptions ?? []).filter((o) => o.length > 0);
      if (!val.pollQuestion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A poll needs a question.",
          path: ["pollQuestion"],
        });
      }
      if (opts.length < POLL_OPTION_MIN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A poll needs at least ${POLL_OPTION_MIN} options.`,
          path: ["pollOptions"],
        });
      }
      if (opts.length > POLL_OPTION_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A poll can have at most ${POLL_OPTION_MAX} options.`,
          path: ["pollOptions"],
        });
      }
      if (!val.pollClosesAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A poll needs a closing time.",
          path: ["pollClosesAt"],
        });
      } else if (new Date(val.pollClosesAt).getTime() <= Date.now()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The poll closing time must be in the future.",
          path: ["pollClosesAt"],
        });
      }
    }
  });

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const createCommentSchema = z.object({
  postId: z.string().uuid(),
  body: z.string().trim().min(1).max(COMMENT_BODY_MAX),
  parentId: z.string().uuid().optional(),
});

export const editCommentSchema = z.object({
  commentId: z.string().uuid(),
  body: z.string().trim().min(1).max(COMMENT_BODY_MAX),
});

export const reportSchema = z.object({
  targetType: z.enum(["post", "comment", "profile"]),
  postId: z.string().uuid().optional(),
  commentId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  reason: z.string().trim().min(1).max(500),
});

export const createShareSchema = z.object({
  /**
   * Optional feed-post body. When present, the share is published to the feed
   * as a `portfolio_review` post in the same server action (see
   * createSharePost). When absent, only the standalone share is created.
   */
  postBody: z.string().trim().max(POST_BODY_MAX).optional(),
  title: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(1000).optional(),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
  isHypothetical: z.boolean().default(false),
  showHoldings: z.boolean().default(true),
  showQuantities: z.boolean().default(false),
  showAmounts: z.boolean().default(false),
  showAllocations: z.boolean().default(true),
  showSectors: z.boolean().default(true),
  showRiskMetrics: z.boolean().default(true),
  objective: z.string().trim().max(300).optional(),
  horizon: z.string().trim().max(60).optional(),
  riskTolerance: z.string().trim().max(60).optional(),
  feedbackWanted: z.string().trim().max(500).optional(),
  // Either an existing portfolio id (real) or manual holdings (hypothetical).
  sourcePortfolioId: z.string().uuid().optional(),
  manualHoldings: z
    .array(
      z.object({
        symbol: z.string().trim().min(1).max(40),
        allocationPct: z.coerce.number().min(0).max(100).optional(),
      }),
    )
    .max(50)
    .optional(),
});

export type CreateShareInput = z.infer<typeof createShareSchema>;

export const createReviewSchema = z.object({
  shareId: z.string().uuid(),
  diversificationRating: z.coerce.number().int().min(1).max(5).optional(),
  concentrationRating: z.coerce.number().int().min(1).max(5).optional(),
  sectorBalanceRating: z.coerce.number().int().min(1).max(5).optional(),
  riskAlignmentRating: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(2000).optional(),
});
