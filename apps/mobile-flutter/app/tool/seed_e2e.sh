#!/usr/bin/env bash
# Seed the isolated e2e stack for the mobile integration test: a verified probe
# account owning a league in a competition that has an open fixture. Without a
# league in the default competition the prediction editor renders
# picks.noLeagueForCompetition instead of the steppers.
set -euo pipefail

APP="${APP:-http://127.0.0.1:3100}"
EMAIL="${PROBE_EMAIL:-probe@example.com}"
PASSWORD="${PROBE_PASSWORD:-Probe-Password123!}"
SLUG=e2e-cup
PROJECT="ng-e2e-$(basename "$PWD" | tr . -)"

psql() { docker compose -p "$PROJECT" -f apps/web-nuxt/compose.yaml -f apps/web-nuxt/compose.dev.yaml -f apps/web-nuxt/compose.e2e.yaml exec -T db psql -U nostragoalus -d nostragoalus -v ON_ERROR_STOP=1 "$@"; }

# Fixture: wipe any previous e2e rows, then one GROUP match kicking off inside
# the pick window.
psql -v slug="$SLUG" <<'SQL'
delete from prediction where match_id in
  (select m.id from match m join competition c on c.id = m.competition_id where c.slug = :'slug');
delete from league_member where league_id in
  (select l.id from league l join competition c on c.id = l.competition_id where c.slug = :'slug');
delete from league where competition_id in (select id from competition where slug = :'slug');
delete from match where competition_id in (select id from competition where slug = :'slug');
delete from round where competition_id in (select id from competition where slug = :'slug');
delete from competition where slug = :'slug';

with c as (
  insert into competition (id, slug, name, provider, external_competition_id, season_hint, is_active)
  values (gen_random_uuid(), :'slug', 'E2E Cup', 'fifa', 'e2e', '2026', true)
  returning id
),
r as (
  insert into round (id, competition_id, kind, stage, matchday, label, sort_order)
  select gen_random_uuid(), c.id, 'GROUP_MATCHDAY', 'GROUP', 1, 'Matchday 1', 1 from c
  returning id, competition_id
)
insert into match (id, competition_id, provider_match_id, round_id, stage, group_name,
                   home_team, away_team, home_team_code, away_team_code, kickoff_time, status)
select gen_random_uuid(), r.competition_id, 'e2e-m1', r.id, 'GROUP', 'A',
       'Spain', 'Brazil', 'ESP', 'BRA', now() + interval '6 hours', 'SCHEDULED'
from r;

insert into scoring_config (id, version, is_active, competition_id, bonus_source, crowd_tiers)
select gen_random_uuid(), 1, true, null, 'NONE', '[]'::jsonb
where not exists (select 1 from scoring_config where competition_id is null and is_active = true);
SQL

# The account goes through the real sign-up route, so the password hash and
# session rows are whatever better-auth actually writes.
code=$(curl -s -o /tmp/ng-signup.out -w '%{http_code}' -X POST "$APP/api/auth/sign-up/email" \
  -H 'content-type: application/json' \
  --data "$(printf '{"name":"Probe","email":"%s","password":"%s"}' "$EMAIL" "$PASSWORD")")
echo "sign-up: HTTP $code"
[ "$code" = "200" ] || grep -qi 'exist' /tmp/ng-signup.out || { cat /tmp/ng-signup.out; exit 1; }

psql -v email="$EMAIL" -v slug="$SLUG" <<'SQL'
update "user" set email_verified = true where email = :'email';

with u as (select id from "user" where email = :'email' limit 1),
     c as (select id from competition where slug = :'slug'),
     l as (
       insert into league (id, competition_id, name, visibility, join_code, created_by)
       select gen_random_uuid(), c.id, 'E2E League', 'PRIVATE',
              'E2E' || substr(md5(random()::text), 1, 8), u.id
       from c, u
       returning id, created_by
     )
insert into league_member (league_id, user_id, role) select l.id, l.created_by, 'OWNER' from l;
SQL

# Read back what the spec depends on, so a half-seeded stack fails here rather
# than as a confusing widget-finder timeout on the device.
psql -v email="$EMAIL" -t -A <<'SQL'
select 'probe=' || id || ' verified=' || email_verified from "user" where email = :'email';
select 'competitions=' || count(*) from competition;
select 'matches=' || count(*) from match;
select 'league_members=' || count(*) from league_member;
SQL
