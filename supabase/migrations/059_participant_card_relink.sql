-- ============================================================
-- MIGRATION 059: Relink QR kad peserta kepada IC baharu
-- ============================================================
--
-- Gunakan apabila kad sudah dicetak tetapi nombor IC peserta dibetulkan.
-- Token QR lama dikekalkan; pautan dalaman ditukar kepada IC baharu.
-- ============================================================

create or replace function public.relink_participant_card(
  p_token text,
  p_new_ic_number text,
  p_reason text default null
)
returns table(
  old_ic_number text,
  new_ic_number text,
  token text,
  replaced_token text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := lower(trim(coalesce(p_token, '')));
  v_new_ic text := public.participant_card_normalize_ic(p_new_ic_number);
  v_source public.participant_cards%rowtype;
  v_target public.participant_cards%rowtype;
  v_replaced_token text := null;
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh relink kad peserta';
  end if;

  if v_token !~ '^[0-9a-f]{22}$' then
    raise exception 'Token QR lama tidak sah';
  end if;

  if v_new_ic !~ '^[0-9]{12}$' then
    raise exception 'IC baharu mesti 12 digit';
  end if;

  if not public.participant_card_admin_can_touch_ic(v_new_ic) then
    raise exception 'IC baharu tiada rekod disahkan dalam skop admin ini';
  end if;

  select pc.*
    into v_source
    from public.participant_cards pc
   where pc.token = v_token
   for update;

  if not found then
    raise exception 'Token QR lama tidak dijumpai';
  end if;

  if v_source.revoked_at is not null then
    raise exception 'Token QR lama telah dibatalkan';
  end if;

  if v_source.ic_number = v_new_ic then
    old_ic_number := v_source.ic_number;
    new_ic_number := v_new_ic;
    token := v_source.token;
    replaced_token := null;
    message := 'Kad ini sudah dipautkan kepada IC tersebut';
    return next;
    return;
  end if;

  select pc.*
    into v_target
    from public.participant_cards pc
   where pc.ic_number = v_new_ic
   for update;

  if found and v_target.token <> v_source.token then
    v_replaced_token := v_target.token;
    delete from public.participant_cards pc
     where pc.id = v_target.id;
  end if;

  update public.participant_cards pc
     set ic_number = v_new_ic,
         revoked_at = null,
         revoked_reason = coalesce(
           nullif(trim(coalesce(p_reason, '')), ''),
           'Relink kad kepada IC baharu'
         ),
         created_by = coalesce(pc.created_by, auth.uid())
   where pc.id = v_source.id;

  old_ic_number := v_source.ic_number;
  new_ic_number := v_new_ic;
  token := v_source.token;
  replaced_token := v_replaced_token;
  message := case
    when v_replaced_token is null then 'QR lama berjaya dipautkan kepada IC baharu'
    else 'QR lama berjaya dipautkan; token terdahulu untuk IC baharu telah diganti'
  end;
  return next;
end;
$$;

revoke execute on function public.relink_participant_card(text, text, text) from public, anon;
grant execute on function public.relink_participant_card(text, text, text) to authenticated;

comment on function public.relink_participant_card(text, text, text) is
  'Relink token QR kad peserta yang sudah dicetak kepada IC baharu tanpa menukar QR.';
