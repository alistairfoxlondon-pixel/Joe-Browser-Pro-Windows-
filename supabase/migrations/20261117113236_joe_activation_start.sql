-- A key's assigned validity starts at redemption, rather than after an existing trial.
create or replace function public.msap_redeem_code(p_code text) returns table(expires_at timestamptz, server_time timestamptz)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := joe_private.require_user(); c joe_private.codes%rowtype; expiry timestamptz;
begin
  perform public.msap_my_entitlement();
  if exists(select 1 from joe_private.accounts a where a.user_id = uid and a.is_blocked) then raise exception 'Account blocked'; end if;
  select * into c from joe_private.codes where code_hash = extensions.digest(upper(regexp_replace(p_code, '[[:space:]-]', '', 'g')), 'sha256') for update;
  if not found or c.redeemed_at is not null or c.revoked_at is not null then raise exception 'Invalid or unavailable code'; end if;
  update joe_private.accounts a set expires_at = now() + make_interval(secs => c.duration_seconds), plan = c.kind where a.user_id = uid returning a.expires_at into expiry;
  update joe_private.codes set redeemed_at = now(), redeemed_by = uid where joe_private.codes.id = c.id;
  return query select expiry, now();
end $$;
