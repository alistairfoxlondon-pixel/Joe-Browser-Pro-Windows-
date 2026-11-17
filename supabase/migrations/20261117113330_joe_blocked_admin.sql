-- An administrator who has been blocked must not retain administrative privileges.
create or replace function joe_private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from joe_private.admins a
    left join joe_private.accounts ac on ac.user_id = a.user_id
    where a.user_id = auth.uid() and not coalesce(ac.is_blocked, false)
  ) then raise exception 'Administrator access required'; end if;
end $$;
