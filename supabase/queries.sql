-- ============================================
-- Bingo App — ad-hoc queries
-- Paste into Supabase SQL editor as needed.
-- ============================================

-- ─── 1. Flat: one row per player, joined with their game ───
select
  g.code            as game_code,
  g.status          as game_status,
  g.created_at      as game_created_at,
  p.name            as player_name,
  p.joined_at,
  p.id              as player_id
from games g
join players p on p.game_id = g.id
order by g.created_at desc, p.joined_at asc;


-- ─── 2. Grouped: one row per game, with the list of players ───
select
  g.code,
  g.status,
  g.created_at,
  count(p.id)                                  as player_count,
  coalesce(
    array_agg(p.name order by p.joined_at)
      filter (where p.id is not null),
    '{}'
  )                                            as players
from games g
left join players p on p.game_id = g.id
group by g.id
order by g.created_at desc;


-- ─── 3. Same as #2 but for a single game by code ───
-- Replace 'ABC123' with the game code you want.
select
  g.code,
  g.status,
  count(p.id) as player_count,
  coalesce(
    array_agg(p.name order by p.joined_at)
      filter (where p.id is not null),
    '{}'
  ) as players
from games g
left join players p on p.game_id = g.id
where g.code = 'ABC123'
group by g.id;
