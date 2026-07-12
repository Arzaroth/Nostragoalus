-- Retune crowd rarity to MPP-style framing: bonuses are earned only by a clear
-- minority of the correct-RESULT crowd (the engine now measures the share that
-- way), so the old field-wide tiers paid out far too readily. Only rewrite the
-- active config when it still holds the previous defaults, to avoid clobbering
-- an admin's custom tiers.
-- Bumping the version marks already-scored matches stale, so matches:finalize
-- recomputes the concluded games under the new rarity rules (the tournament is
-- already under way).
UPDATE "scoring_config"
SET "crowd_tiers" = '[{"maxShareExclusive":0.01,"bonus":5},{"maxShareExclusive":0.05,"bonus":4},{"maxShareExclusive":0.12,"bonus":3},{"maxShareExclusive":0.22,"bonus":2},{"maxShareExclusive":0.35,"bonus":1}]'::jsonb,
    "version" = (SELECT MAX("version") FROM "scoring_config") + 1
WHERE "is_active" = true
  AND "crowd_tiers" = '[{"maxShareExclusive":0.005,"bonus":5},{"maxShareExclusive":0.05,"bonus":3},{"maxShareExclusive":0.15,"bonus":2},{"maxShareExclusive":0.4,"bonus":1}]'::jsonb;
