-- A GROUP round's sort_order is its matchday, and `round` is unique on
-- (competition_id, sort_order), so the knockout ladder (10..60) sat inside the
-- range a matchday can occupy. Pools kept matchdays at five or fewer, so it was
-- unreachable; a single table is not bounded that way (the Championship plays 46
-- rounds), and matchday 10 would collide with R32, aborting the sync on the
-- unique index. sync/rounds.ts now writes knockout rounds at 1000 + the ladder,
-- and the rounds already stored are lifted to match so ordering stays consistent
-- within a competition that gains a knockout stage later.
--
-- Group rounds are left alone: their sort_order is already the matchday.
-- The target band is empty, so no row collides on the way.
UPDATE "round"
SET "sort_order" = 1000 + CASE "stage"
	WHEN 'R32' THEN 10
	WHEN 'R16' THEN 20
	WHEN 'QF' THEN 30
	WHEN 'SF' THEN 40
	WHEN 'THIRD_PLACE' THEN 50
	WHEN 'FINAL' THEN 60
END
WHERE "stage" <> 'GROUP';
