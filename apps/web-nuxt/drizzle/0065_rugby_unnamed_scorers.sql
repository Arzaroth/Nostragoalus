-- A scorer absent from the tournament squad list reached goal_event with an
-- empty name: Makazole Mapimpi is not in World Rugby's RWC 2023 squad document,
-- so his three tries against Romania stored as blank rows and rendered as an
-- empty line with a score beside it. The provider now resolves such a player
-- from /player/{id}, but the stored rows do not heal on their own because the
-- detail sync only visits a match whose details_fetched_at is null. Clearing it
-- for exactly the affected matches makes the next sync re-fetch and replace
-- their goal events with named ones.
-- Deliberately sport-agnostic: a football feed that ever shipped a goal with an
-- empty scorer name left the same blank row, and the re-sync is cheap and
-- self-terminating (details_fetched_at is set again either way).
UPDATE "match" SET "details_fetched_at" = NULL
WHERE "id" IN (
	SELECT "match_id" FROM "goal_event"
	WHERE "player_id" IS NOT NULL AND coalesce("player_name", '') = ''
);
