-- ---------------------------------------------------------------------------
-- PLAYER GEAR (the Blacksmith Goose: racket / boots / shuttle, +0..+9)
--
-- One row per player per slot — you can own at most one item in each slot, so
-- there is no inventory to reconcile and no way to stack duplicates.
--
-- Every value here is written ONLY by the server after a server-side roll.
-- The client never sends a level, a tier or a stat.
-- ---------------------------------------------------------------------------
create table if not exists public.player_gear (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  slot       text not null,                            -- racket | boots | shuttle
  tier       text not null default 'wood',             -- wood | silver | gold | diamond
  level      int  not null default 0,
  wink       boolean not null default false,
  subs       jsonb not null default '[]'::jsonb,       -- [{stat,val}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- belt and braces: even a bug in the app cannot write an impossible item
  constraint player_gear_level_range check (level >= 0 and level <= 9),
  constraint player_gear_slot_known  check (slot in ('racket','boots','shuttle')),
  constraint player_gear_tier_known  check (tier in ('wood','silver','gold','diamond'))
);
create unique index if not exists player_gear_user_slot on public.player_gear (user_id, slot);

alter table public.player_gear enable row level security;
revoke all on public.player_gear from anon, authenticated;
