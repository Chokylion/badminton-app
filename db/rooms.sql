-- ---------------------------------------------------------------------------
-- ROOMS (live play sessions: courts on/off, auto-drawn teams, live scoreboard)
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,                     -- short join code
  name       text,
  host_id    uuid not null references public.users(id) on delete cascade,
  status     text not null default 'open',             -- open | closed
  courts     jsonb not null default '[1,2,3,4]'::jsonb,-- enabled court numbers
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
create index if not exists rooms_status_idx on public.rooms (status, created_at desc);

create table if not exists public.room_players (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  rounds_played int not null default 0,
  rounds_rested int not null default 0
);
create unique index if not exists room_players_room_user on public.room_players (room_id, user_id);

create table if not exists public.room_rounds (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  round_no    int not null,
  mode        text not null,                           -- rank | random
  courts_json jsonb not null default '[]'::jsonb,      -- [{court,teamA,teamB,matchId,scoreA,scoreB,winner}]
  resting_ids uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);
create unique index if not exists room_rounds_room_no on public.room_rounds (room_id, round_no);

alter table public.rooms        enable row level security;
alter table public.room_players enable row level security;
alter table public.room_rounds  enable row level security;
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
