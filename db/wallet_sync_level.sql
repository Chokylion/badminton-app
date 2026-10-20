-- Atomic level-reward claim.
--
-- The old flow was read watermark -> credit coins -> write watermark, three
-- round trips in JS with no compare-and-swap. N concurrent GET /api/wallet all
-- read the stale watermark and all credited, minting N x the coins.
--
-- SELECT ... FOR UPDATE takes a row lock for the rest of this function's
-- transaction, so concurrent callers queue up, and the ones behind see the
-- already-advanced watermark and return early having paid nothing.
--
-- ---------------------------------------------------------------------------
-- WHY THIS TRACKS COINS AND NOT A LEVEL
--
-- It used to store a level watermark and pay `(new_level - old_level) * rate`,
-- which is only sound while BOTH inputs are derived from immutable history.
-- Once gear and charms could boost XP and the coin rate, the caller's p_level
-- and p_per_level became things a player could toggle at will by equipping a
-- charm, and the pair of them opened a mint:
--
--   1. equip an XP charm  -> derived level rises -> watermark up, coins paid
--   2. spend the coins    -> balance ~0
--   3. unequip the charm  -> derived level falls -> the clawback was CLAMPED to
--                            the remaining balance (so ~nothing was taken) but
--                            the watermark was still rewound
--   4. repeat forever
--
-- The rate was also read at claim time on both legs, so syncing up at 105/level
-- and down at 100/level skimmed 5 coins per level per cycle.
--
-- The fix is to make the ledger, not a level integer, the source of truth, and
-- to make it MONOTONIC: record how many coins have ever been paid out for
-- levels, and only ever pay the shortfall. Removing a charm lowers the target
-- below what has already been paid, so the delta is negative and we simply do
-- nothing -- no clawback to clamp, no watermark to rewind, nothing to farm.
--
-- Trade-off, deliberately accepted: voiding matches no longer claws coins back.
-- Letting a player keep coins an admin retro-actively invalidated is strictly
-- safer than leaving a repeatable mint open, and voids are rare and manual.
-- ---------------------------------------------------------------------------
alter table public.wallets add column if not exists level_coins_paid bigint not null default 0;

-- Backfill from the old level watermark at the historic flat rate, so existing
-- players are neither paid twice nor re-paid for levels already collected.
update public.wallets
   set level_coins_paid = (greatest(level_paid, 1) - 1)::bigint * 100
 where level_coins_paid = 0 and level_paid > 1;

create or replace function public.wallet_sync_level(p_user uuid, p_level int, p_per_level int)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid   bigint;
  v_coins  bigint;
  v_target bigint;
  v_delta  bigint;
begin
  insert into public.wallets (user_id, coins) values (p_user, 0)
    on conflict (user_id) do nothing;

  select level_coins_paid, coins into v_paid, v_coins
    from public.wallets where user_id = p_user for update;

  if v_paid is null then v_paid := 0; end if;

  v_target := (greatest(p_level, 1) - 1)::bigint * greatest(p_per_level, 0);
  v_delta  := v_target - v_paid;

  -- Monotonic: we never un-pay. A lower target just means nothing is owed.
  if v_delta <= 0 then
    return v_coins;
  end if;

  update public.wallets
     set level_coins_paid = v_target,
         level_paid       = greatest(level_paid, p_level),
         updated_at       = now()
   where user_id = p_user;

  return public.wallet_apply(p_user, v_delta, 'level',
    jsonb_build_object('to', p_level, 'paid_total', v_target));
end
$$;

revoke all on function public.wallet_sync_level(uuid, int, int) from public, anon, authenticated;
