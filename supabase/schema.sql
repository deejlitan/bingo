-- ============================================
-- Bingo App — Supabase schema
-- Paste into Supabase SQL editor and run.
-- ============================================

-- Drop existing (safe to re-run while developing)
drop table if exists claims cascade;
drop table if exists players cascade;
drop table if exists games cascade;

-- ─── GAMES ───
create table games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  grid_size int not null default 5,
  char_type text not null default 'numbers',     -- 'numbers' | 'names'
  pool jsonb not null,                            -- array of characters
  patterns jsonb not null,                        -- { line: bool, blackout: bool, ... }
  drawn jsonb not null default '[]'::jsonb,       -- ordered list of called chars
  status text not null default 'lobby',           -- 'lobby' | 'live' | 'ended'
  created_at timestamptz not null default now()
);
create index on games (code);

-- ─── PLAYERS ───
create table players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  name text not null,
  card jsonb not null,                            -- 2d array of characters
  marked jsonb not null,                          -- 2d array of booleans
  joined_at timestamptz not null default now()
);
create index on players (game_id);

-- ─── CLAIMS ───
create table claims (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  pattern text not null,                          -- claimed winning pattern
  status text not null default 'pending',         -- 'pending' | 'verified' | 'rejected'
  claimed_at timestamptz not null default now()
);
create index on claims (game_id);

-- ─── REALTIME ───
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table claims;

-- ─── ROW LEVEL SECURITY ───
-- Demo policies: open access. Tighten for production
-- (e.g. require caller auth, restrict players to their own row).
alter table games enable row level security;
alter table players enable row level security;
alter table claims enable row level security;

create policy "read games" on games for select using (true);
create policy "insert games" on games for insert with check (true);
create policy "update games" on games for update using (true);

create policy "read players" on players for select using (true);
create policy "insert players" on players for insert with check (true);
create policy "update players" on players for update using (true);
create policy "delete players" on players for delete using (true);

create policy "read claims" on claims for select using (true);
create policy "insert claims" on claims for insert with check (true);
create policy "update claims" on claims for update using (true);
