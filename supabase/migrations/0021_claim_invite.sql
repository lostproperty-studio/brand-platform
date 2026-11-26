-- Invite links with a limited number of uses: claim one use and check the limit in a single statement, so people
-- joining at the same moment can't take more uses than the link allows. Server only.
create or replace function claim_invite(p_id uuid) returns boolean language plpgsql security definer set search_path = public as $$
declare ok uuid;
begin
  update invite_links set uses = uses + 1
  where id = p_id and not coalesce(revoked, false) and (expires_at is null or expires_at > now()) and (max_uses is null or uses < max_uses)
  returning id into ok;
  return ok is not null;
end $$;
revoke all on function claim_invite(uuid) from public, anon, authenticated;
