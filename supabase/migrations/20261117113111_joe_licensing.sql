-- Joe Browser licensing. Apply to a dedicated Supabase project, then provision an
-- administrator in joe_private.admins by user UUID from a trusted SQL session.
create schema if not exists joe_private;
revoke all on schema joe_private from public, anon, authenticated;

create table joe_private.admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table joe_private.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz,
  plan text check (plan in ('trial', 'premium')),
  trial_claimed_at timestamptz,
  is_blocked boolean not null default false
);
create table joe_private.codes (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea not null unique,
  kind text not null check (kind in ('trial', 'premium')),
  duration_seconds integer not null check (duration_seconds between 60 and 315360000),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id),
  revoked_at timestamptz
);
revoke all on all tables in schema joe_private from public, anon, authenticated;

create function joe_private.require_user() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required'; end if;
  return uid;
end $$;
create function joe_private.require_admin() returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from joe_private.admins a where a.user_id = auth.uid()) then raise exception 'Administrator access required'; end if;
end $$;

-- Creating the account row is atomic; the unique user ID prevents repeated trials.
create function public.msap_my_entitlement() returns table(expires_at timestamptz, server_time timestamptz, is_admin boolean, is_blocked boolean, plan text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := joe_private.require_user();
begin
  insert into joe_private.accounts (user_id, expires_at, plan, trial_claimed_at)
    values (uid, now() + interval '7 days', 'trial', now()) on conflict (user_id) do nothing;
  return query select a.expires_at, now(), exists(select 1 from joe_private.admins ad where ad.user_id = uid), a.is_blocked, a.plan from joe_private.accounts a where a.user_id = uid;
end $$;

create function public.msap_start_trial() returns table(expires_at timestamptz, server_time timestamptz, is_admin boolean, is_blocked boolean, plan text, started boolean)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := joe_private.require_user(); inserted integer;
begin
  insert into joe_private.accounts (user_id, expires_at, plan, trial_claimed_at)
    values (uid, now() + interval '7 days', 'trial', now()) on conflict (user_id) do nothing;
  get diagnostics inserted = row_count;
  return query select a.expires_at, now(), exists(select 1 from joe_private.admins ad where ad.user_id = uid), a.is_blocked, a.plan, inserted = 1 from joe_private.accounts a where a.user_id = uid;
end $$;

create function public.msap_create_code(p_duration_seconds integer, p_kind text) returns table(code text, id uuid, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare raw text; new_id uuid; created timestamptz;
begin
  perform joe_private.require_admin();
  if p_kind not in ('trial', 'premium') or p_duration_seconds not between 60 and 315360000 then raise exception 'Invalid license duration or kind'; end if;
  raw := upper(encode(extensions.gen_random_bytes(20), 'hex'));
  insert into joe_private.codes(code_hash, kind, duration_seconds) values (extensions.digest(raw, 'sha256'), p_kind, p_duration_seconds) returning joe_private.codes.id, joe_private.codes.created_at into new_id, created;
  return query select raw, new_id, created;
end $$;

create function public.msap_redeem_code(p_code text) returns table(expires_at timestamptz, server_time timestamptz)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := joe_private.require_user(); c joe_private.codes%rowtype; expiry timestamptz;
begin
  perform public.msap_my_entitlement();
  if exists(select 1 from joe_private.accounts a where a.user_id = uid and a.is_blocked) then raise exception 'Account blocked'; end if;
  select * into c from joe_private.codes where code_hash = extensions.digest(upper(regexp_replace(p_code, '[[:space:]-]', '', 'g')), 'sha256') for update;
  if not found or c.redeemed_at is not null or c.revoked_at is not null then raise exception 'Invalid or unavailable code'; end if;
  update joe_private.accounts a set expires_at = greatest(coalesce(a.expires_at, now()), now()) + make_interval(secs => c.duration_seconds), plan = c.kind where a.user_id = uid returning a.expires_at into expiry;
  update joe_private.codes set redeemed_at = now(), redeemed_by = uid where joe_private.codes.id = c.id;
  return query select expiry, now();
end $$;

create function public.msap_admin_users() returns table(user_id uuid, email text, created_at timestamptz, expires_at timestamptz, is_blocked boolean, plan text)
language plpgsql security definer set search_path = '' as $$
begin
  perform joe_private.require_admin();
  return query select u.id, u.email::text, u.created_at, a.expires_at, coalesce(a.is_blocked, false), a.plan from auth.users u left join joe_private.accounts a on a.user_id = u.id order by u.created_at desc;
end $$;
create function public.msap_admin_codes() returns table(id uuid, kind text, duration_seconds integer, created_at timestamptz, redeemed_at timestamptz, redeemed_by uuid, revoked_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform joe_private.require_admin();
  return query select c.id, c.kind, c.duration_seconds, c.created_at, c.redeemed_at, c.redeemed_by, c.revoked_at from joe_private.codes c order by c.created_at desc;
end $$;
create function public.msap_admin_trial_claims() returns table(user_id uuid, email text, claimed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform joe_private.require_admin();
  return query select a.user_id, u.email::text, a.trial_claimed_at from joe_private.accounts a join auth.users u on u.id = a.user_id where a.trial_claimed_at is not null order by a.trial_claimed_at desc;
end $$;
create function public.msap_admin_revoke_code(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform joe_private.require_admin();
  update joe_private.codes c set revoked_at = now() where c.id = p_id and c.redeemed_at is null and c.revoked_at is null;
  if not found then raise exception 'Key not found or already used'; end if;
end $$;
create function public.msap_admin_set_blocked(p_user_id uuid, p_blocked boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform joe_private.require_admin();
  if p_user_id = auth.uid() and p_blocked then raise exception 'Cannot block your own account'; end if;
  insert into joe_private.accounts(user_id, is_blocked) values (p_user_id, p_blocked) on conflict (user_id) do update set is_blocked = excluded.is_blocked;
end $$;
create function public.msap_admin_set_expiry(p_user_id uuid, p_expires_at timestamptz) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform joe_private.require_admin();
  insert into joe_private.accounts(user_id, expires_at, plan) values (p_user_id, p_expires_at, 'premium') on conflict (user_id) do update set expires_at = excluded.expires_at, plan = 'premium';
end $$;

revoke all on all functions in schema joe_private from public, anon, authenticated;
revoke all on function public.msap_my_entitlement(), public.msap_start_trial(), public.msap_create_code(integer,text), public.msap_redeem_code(text), public.msap_admin_users(), public.msap_admin_codes(), public.msap_admin_trial_claims(), public.msap_admin_revoke_code(uuid), public.msap_admin_set_blocked(uuid,boolean), public.msap_admin_set_expiry(uuid,timestamptz) from public, anon;
grant execute on function public.msap_my_entitlement(), public.msap_start_trial(), public.msap_create_code(integer,text), public.msap_redeem_code(text), public.msap_admin_users(), public.msap_admin_codes(), public.msap_admin_trial_claims(), public.msap_admin_revoke_code(uuid), public.msap_admin_set_blocked(uuid,boolean), public.msap_admin_set_expiry(uuid,timestamptz) to authenticated;
