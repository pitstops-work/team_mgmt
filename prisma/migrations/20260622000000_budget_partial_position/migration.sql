-- Where the pro-rated stub year sits for non-whole-year horizons: "end"
-- (default; final band partial) or "start" (Year 1 partial). Additive with a
-- default, so existing rows keep current "end" behaviour.
ALTER TABLE "Budget" ADD COLUMN "partialPosition" TEXT NOT NULL DEFAULT 'end';
