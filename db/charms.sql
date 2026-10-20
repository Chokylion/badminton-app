-- ---------------------------------------------------------------------------
-- PLAYER CHARMS (the hidden treasure layer — Cookie Run style)
--
-- One row per charm a player owns. `slot` is NULL when the charm sits in the
-- box and 0..2 when it is equipped, and the partial unique index below makes
-- it physically impossible to equip two charms into the same slot — the rule
-- lives in the database, not just in the app.
--
-- Written ONLY by the server after a server-side pull.
-- ---------------------------------------------------------------------------
create table if not exists public.player_charms (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.users(id) on delete cascade,
  charm_key text not null,
  gilded    boolean not null default false,
  slot      int,                                       -- null = stored, 0..2 = equipped
  found_at  timestamptz not null default now(),
  constraint player_charms_slot_range check (slot is null or (slot >= 0 and slot <= 2))
);
-- you can only own one of each charm; a duplicate gilds it or turns to dust
create unique index if not exists player_charms_user_key  on public.player_charms (user_id, charm_key);
-- and only one charm may occupy a given slot
create unique index if not exists player_charms_user_slot on public.player_charms (user_id, slot) where slot is not null;

alter table public.player_charms enable row level security;
revoke all on public.player_charms from anon, authenticated;
