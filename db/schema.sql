-- Smashboard database schema (Supabase / Postgres).
--
-- SECURITY MODEL
--   * The app never talks to Postgres with raw string-built SQL. All runtime
--     access goes through @supabase/supabase-js using bound parameters, so SQL
--     injection is structurally impossible.
--   * This file is STATIC DDL (no user input) applied once at provisioning time.
--   * RLS is enabled on every table with NO anon/authenticated policies, and
--     direct grants to anon/authenticated are revoked. The app connects with the
--     service_role key (server-side only), which bypasses RLS. Result: even if the
--     public anon key leaked, no table is directly readable or writable.
--
-- Re-runnable: uses IF NOT EXISTS guards.

-- ---------------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id             uuid primary key default gen_random_uuid(),
  employee_no    text not null,                       -- PRIVATE: login handle only, never returned by API
  nickname       text not null,                       -- public display name
  password_hash  text not null,                       -- scrypt: scrypt$N$r$p$salthex$hashhex
  avatar_emoji   text not null default '🏸',
  avatar_color   text not null default '#F97316',
  role           text not null default 'player' check (role in ('player','admin')),
  settings_json  jsonb not null default '{}'::jsonb,  -- { roast_visibility, notifs, ... }
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz,
  constraint users_employee_no_len check (char_length(employee_no) between 3 and 32),
  constraint users_nickname_len   check (char_length(nickname) between 2 and 24),
  constraint users_emoji_len      check (char_length(avatar_emoji) between 1 and 16),
  constraint users_color_fmt      check (avatar_color ~ '^#[0-9A-Fa-f]{6}$')
);
create unique index if not exists users_employee_no_key    on public.users (employee_no);
create unique index if not exists users_nickname_lower_key on public.users (lower(nickname));
create index        if not exists users_role_idx           on public.users (role);

-- ---------------------------------------------------------------------------
-- SESSIONS (opaque token stored hashed; enables revocation / logout-all)
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  token_hash   text not null,                         -- sha256 of the random cookie token
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  user_agent   text,
  ip           text
);
create unique index if not exists sessions_token_hash_key on public.sessions (token_hash);
create index        if not exists sessions_user_idx       on public.sessions (user_id);
create index        if not exists sessions_expires_idx    on public.sessions (expires_at);

-- ---------------------------------------------------------------------------
-- LOGIN ATTEMPTS (rate-limiting + security telemetry)
-- ---------------------------------------------------------------------------
create table if not exists public.login_attempts (
  id         uuid primary key default gen_random_uuid(),
  identifier text not null,                            -- normalized employee_no / nickname
  ip         text,
  success    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_identifier_idx on public.login_attempts (identifier, created_at desc);
create index if not exists login_attempts_ip_idx         on public.login_attempts (ip, created_at desc);

-- ---------------------------------------------------------------------------
-- MATCHES  (a logged match is 'active' immediately; admin can void = soft delete)
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  played_at   timestamptz not null default now(),
  format      text not null check (format in ('doubles','singles')),
  logged_by   uuid references public.users(id) on delete set null,
  status      text not null default 'active' check (status in ('active','flagged','void')),
  location    text,
  created_at  timestamptz not null default now(),
  voided_by   uuid references public.users(id) on delete set null,
  voided_at   timestamptz,
  void_reason text,
  constraint matches_location_len check (location is null or char_length(location) <= 80)
);
create index if not exists matches_status_idx    on public.matches (status);
create index if not exists matches_played_at_idx on public.matches (played_at desc);
create index if not exists matches_logged_by_idx on public.matches (logged_by);

-- ---------------------------------------------------------------------------
-- MATCH PLAYERS (2 or 4 rows per match)
-- ---------------------------------------------------------------------------
create table if not exists public.match_players (
  id       uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id  uuid not null references public.users(id)   on delete cascade,
  team     text not null check (team in ('A','B'))
);
create unique index if not exists match_players_unique    on public.match_players (match_id, user_id);
create index        if not exists match_players_user_idx  on public.match_players (user_id);
create index        if not exists match_players_match_idx on public.match_players (match_id);

-- ---------------------------------------------------------------------------
-- GAMES (best-of-3 to 21, win by 2, cap 30; quick mode = 1 game)
-- ---------------------------------------------------------------------------
create table if not exists public.games (
  id       uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  game_no  int not null check (game_no between 1 and 5),
  score_a  int not null check (score_a between 0 and 30),
  score_b  int not null check (score_b between 0 and 30)
);
create unique index if not exists games_unique    on public.games (match_id, game_no);
create index        if not exists games_match_idx on public.games (match_id);

-- ---------------------------------------------------------------------------
-- FLAGS ("this score is wrong" -> admin queue)
-- ---------------------------------------------------------------------------
create table if not exists public.flags (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches(id) on delete cascade,
  raised_by     uuid references public.users(id) on delete set null,
  reason        text,
  claimed_score text,
  status        text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references public.users(id) on delete set null,
  constraint flags_reason_len  check (reason is null or char_length(reason) <= 300),
  constraint flags_claimed_len check (claimed_score is null or char_length(claimed_score) <= 60)
);
create index if not exists flags_status_idx on public.flags (status, created_at desc);
create index if not exists flags_match_idx  on public.flags (match_id);

-- ---------------------------------------------------------------------------
-- AUDIT LOG (every admin action; transparent, never silent)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.users(id) on delete set null,
  action      text not null check (action in ('edit','void','restore','adjust','reset','resolve_flag','dismiss_flag','create')),
  entity      text not null,
  entity_id   text,
  before_json jsonb,
  after_json  jsonb,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx   on public.audit_log (actor_id);

-- ---------------------------------------------------------------------------
-- RATINGS (materialized per (user, season); recomputed from match rows)
-- ---------------------------------------------------------------------------
create table if not exists public.ratings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  season      text not null,                           -- 'all-time' | 'YYYY-MM'
  elo         numeric(8,2) not null default 1500,
  games       int not null default 0,                  -- matches played (for provisional gate)
  wins        int not null default 0,
  losses      int not null default 0,
  streak      int not null default 0,                  -- + win streak / - loss streak (current)
  provisional boolean not null default true,
  updated_at  timestamptz not null default now()
);
create unique index if not exists ratings_user_season_key on public.ratings (user_id, season);
create index        if not exists ratings_season_elo_idx  on public.ratings (season, elo desc);

-- ---------------------------------------------------------------------------
-- TITLES AWARDED (materialized global/season singletons; recomputed each write)
-- ---------------------------------------------------------------------------
create table if not exists public.titles_awarded (
  id          uuid primary key default gen_random_uuid(),
  title_key   text not null,                           -- 'goat','best_duo',...
  season      text not null,                           -- 'all-time' | 'YYYY-MM'
  holder_ids  uuid[] not null default '{}',            -- 1 (prestige) or 2 (duo)
  value       text,                                    -- display string
  meta_json   jsonb,
  computed_at timestamptz not null default now()
);
create unique index if not exists titles_awarded_key_season on public.titles_awarded (title_key, season);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY: deny-all for anon/authenticated. App uses service_role.
-- ---------------------------------------------------------------------------
alter table public.users          enable row level security;
alter table public.sessions       enable row level security;
alter table public.login_attempts enable row level security;
alter table public.matches        enable row level security;
alter table public.match_players  enable row level security;
alter table public.games          enable row level security;
alter table public.flags          enable row level security;
alter table public.audit_log      enable row level security;
alter table public.ratings        enable row level security;
alter table public.titles_awarded enable row level security;

-- Belt-and-suspenders: strip any default grants to the public API roles.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
