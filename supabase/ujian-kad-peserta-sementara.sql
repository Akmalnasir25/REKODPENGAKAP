-- ============================================================
-- SQL SEMENTARA UJIAN: Kad peserta / pemimpin / penguji / pembantu
-- ============================================================
--
-- Tujuan:
--   Paste dan Run fail ini di Supabase SQL Editor untuk uji QR kad sekarang.
--   Kandungannya selari dengan migrasi 058, tetapi selamat dijalankan berulang.
--
-- Privasi:
--   QR hanya menyimpan token. Fungsi public TIDAK memulangkan nombor IC atau
--   nombor keahlian.
-- ============================================================

create table if not exists public.participant_cards (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  ic_number text not null unique,
  created_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_cards_token_check check (token ~ '^[0-9a-f]{22}$'),
  constraint participant_cards_ic_check check (ic_number ~ '^[0-9]{12}$')
);

create index if not exists idx_participant_cards_token
  on public.participant_cards(token)
  where revoked_at is null;

drop trigger if exists set_updated_at on public.participant_cards;
create trigger set_updated_at before update on public.participant_cards
  for each row execute function public.handle_updated_at();

alter table public.participant_cards enable row level security;

drop policy if exists "participant_cards_admin_select" on public.participant_cards;
drop policy if exists "participant_cards_admin_insert" on public.participant_cards;
drop policy if exists "participant_cards_admin_update" on public.participant_cards;

create or replace function public.participant_card_normalize_ic(p_ic text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_ic, ''), '[^0-9]', '', 'g');
$$;

create or replace function public.participant_card_is_supported_role(
  p_role text,
  p_is_penguji boolean default false
)
returns boolean
language sql
immutable
as $$
  select coalesce(p_is_penguji, false)
    or coalesce(p_role, 'PESERTA') in (
      'PESERTA',
      'PENERIMA RAMBU',
      'PEMIMPIN',
      'PENOLONG PEMIMPIN',
      'PENGUJI',
      'PEMBANTU'
    );
$$;

create or replace function public.participant_card_role_label(
  p_role text,
  p_is_penguji boolean default false
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_is_penguji, false) or coalesce(p_role, '') = 'PENGUJI' then 'PENGUJI'
    when coalesce(p_role, '') = 'PENOLONG PEMIMPIN' then 'PENOLONG PEMIMPIN'
    when coalesce(p_role, '') = 'PEMIMPIN' then 'PEMIMPIN'
    when coalesce(p_role, '') = 'PEMBANTU' then 'PEMBANTU'
    when coalesce(p_role, '') = 'PENERIMA RAMBU' then 'PENERIMA RAMBU'
    else 'PESERTA'
  end;
$$;

create or replace function public.participant_card_new_token()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  loop
    v_token := lower(substr(
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', ''),
      1,
      22
    ));
    exit when not exists (
      select 1 from public.participant_cards pc where pc.token = v_token
    );
  end loop;
  return v_token;
end;
$$;

create or replace function public.participant_card_age_from_ic(p_ic text)
returns integer
language plpgsql
stable
as $$
declare
  v_ic text := public.participant_card_normalize_ic(p_ic);
  v_yy int;
  v_year int;
  v_month int;
  v_day int;
  v_birth date;
  v_current_yy int := (extract(year from current_date)::int % 100);
begin
  if v_ic !~ '^[0-9]{12}$' then
    return null;
  end if;

  v_yy := substring(v_ic from 1 for 2)::int;
  v_month := substring(v_ic from 3 for 2)::int;
  v_day := substring(v_ic from 5 for 2)::int;
  v_year := case when v_yy <= v_current_yy then 2000 + v_yy else 1900 + v_yy end;

  begin
    v_birth := make_date(v_year, v_month, v_day);
  exception when others then
    return null;
  end;

  return extract(year from age(current_date, v_birth))::int;
end;
$$;

create or replace function public.participant_card_admin_can_touch_ic(p_ic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.submission_people sp
      join public.submissions s on s.id = sp.submission_id
      join public.schools sc on sc.id = s.school_id
      join public.school_badge_status sbs
        on sbs.school_id = s.school_id
       and sbs.badge_id = s.badge_id
       and sbs.year = s.submission_year
       and sbs.siri = coalesce(sp.siri, 1)
       and sbs.status = 'approved'
     where public.participant_card_normalize_ic(sp.ic_number) = p_ic
       and p_ic ~ '^[0-9]{12}$'
       and sp.is_deleted = false
       and coalesce(sp.is_withdrawn, false) = false
       and public.participant_card_is_supported_role(sp.role, coalesce(sp.is_penguji, false))
       and case public.get_my_role()
             when 'developer' then true
             when 'admin' then true
             when 'negeri_admin' then sc.negeri_id = public.get_my_negeri_id()
             when 'daerah_admin' then sc.daerah_id = public.get_my_daerah_id()
             else false
           end
  );
$$;

create policy "participant_cards_admin_select" on public.participant_cards
  for select to authenticated using (
    public.is_admin_or_above()
    and public.participant_card_admin_can_touch_ic(ic_number)
  );

create or replace function public.ensure_participant_cards(p_ic_numbers text[])
returns table(ic_number text, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ic text;
  v_existing record;
  v_token text;
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh menjana kad peserta';
  end if;

  for v_ic in
    select distinct public.participant_card_normalize_ic(x)
      from unnest(coalesce(p_ic_numbers, array[]::text[])) as x
     where public.participant_card_normalize_ic(x) ~ '^[0-9]{12}$'
     order by 1
  loop
    if not public.participant_card_admin_can_touch_ic(v_ic) then
      continue;
    end if;

    select pc.token, pc.revoked_at
      into v_existing
      from public.participant_cards pc
     where pc.ic_number = v_ic;

    if not found then
      v_token := public.participant_card_new_token();
      insert into public.participant_cards(token, ic_number, created_by)
      values (v_token, v_ic, auth.uid());
    elsif v_existing.revoked_at is not null then
      v_token := public.participant_card_new_token();
      update public.participant_cards
         set token = v_token,
             revoked_at = null,
             revoked_reason = null,
             created_by = coalesce(public.participant_cards.created_by, auth.uid())
       where ic_number = v_ic;
    else
      v_token := v_existing.token;
    end if;

    ic_number := v_ic;
    token := v_token;
    return next;
  end loop;
end;
$$;

create or replace function public.revoke_participant_card(
  p_token text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh membatalkan kad peserta';
  end if;

  update public.participant_cards pc
     set revoked_at = now(),
         revoked_reason = nullif(trim(coalesce(p_reason, '')), '')
   where pc.token = p_token
     and public.participant_card_admin_can_touch_ic(pc.ic_number);

  return found;
end;
$$;

create or replace function public.regenerate_participant_card(
  p_ic_number text,
  p_reason text default null
)
returns table(ic_number text, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ic text := public.participant_card_normalize_ic(p_ic_number);
  v_token text;
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh menjana semula kad peserta';
  end if;

  if v_ic !~ '^[0-9]{12}$' or not public.participant_card_admin_can_touch_ic(v_ic) then
    return;
  end if;

  v_token := public.participant_card_new_token();

  insert into public.participant_cards(token, ic_number, created_by, revoked_reason)
  values (v_token, v_ic, auth.uid(), nullif(trim(coalesce(p_reason, '')), ''))
  on conflict (ic_number) do update
     set token = excluded.token,
         revoked_at = null,
         revoked_reason = excluded.revoked_reason,
         created_by = coalesce(public.participant_cards.created_by, auth.uid());

  ic_number := v_ic;
  token := v_token;
  return next;
end;
$$;

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

create or replace function public.get_participant_card_public(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ic text;
  v_name text;
  v_role text;
  v_school_name text;
  v_school_code text;
  v_negeri_name text;
  v_negeri_code text;
  v_daerah_name text;
  v_daerah_code text;
  v_programs jsonb;
begin
  select pc.ic_number
    into v_ic
    from public.participant_cards pc
   where pc.token = trim(coalesce(p_token, ''))
     and pc.revoked_at is null;

  if v_ic is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'Kad peserta tidak sah atau telah dibatalkan.'
    );
  end if;

  with approved_rows as (
    select
      sp.name,
      public.participant_card_role_label(sp.role, coalesce(sp.is_penguji, false)) as role_label,
      sc.name as school_name,
      sc.school_code,
      n.name as negeri_name,
      n.code as negeri_code,
      d.name as daerah_name,
      d.code as daerah_code,
      b.name as badge_name,
      s.submission_year,
      coalesce(sp.siri, 1) as siri,
      coalesce(s.submitted_at, sp.created_at) as sort_date
    from public.submission_people sp
    join public.submissions s on s.id = sp.submission_id
    join public.schools sc on sc.id = s.school_id
    left join public.negeri n on n.id = sc.negeri_id
    left join public.daerah d on d.id = sc.daerah_id
    join public.badges b on b.id = s.badge_id
    join public.school_badge_status sbs
      on sbs.school_id = s.school_id
     and sbs.badge_id = s.badge_id
     and sbs.year = s.submission_year
     and sbs.siri = coalesce(sp.siri, 1)
     and sbs.status = 'approved'
    where public.participant_card_normalize_ic(sp.ic_number) = v_ic
      and sp.is_deleted = false
      and coalesce(sp.is_withdrawn, false) = false
      and public.participant_card_is_supported_role(sp.role, coalesce(sp.is_penguji, false))
  )
  select ar.name, ar.role_label, ar.school_name, ar.school_code, ar.negeri_name, ar.negeri_code, ar.daerah_name, ar.daerah_code
    into v_name, v_role, v_school_name, v_school_code, v_negeri_name, v_negeri_code, v_daerah_name, v_daerah_code
    from approved_rows ar
   order by ar.submission_year desc, ar.sort_date desc, ar.badge_name asc
   limit 1;

  if v_name is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'Kad wujud, tetapi tiada pendaftaran yang disahkan untuk pemegang kad ini.'
    );
  end if;

  with approved_rows as (
    select distinct
      b.name as badge_name,
      s.submission_year,
      coalesce(sp.siri, 1) as siri
    from public.submission_people sp
    join public.submissions s on s.id = sp.submission_id
    join public.badges b on b.id = s.badge_id
    join public.school_badge_status sbs
      on sbs.school_id = s.school_id
     and sbs.badge_id = s.badge_id
     and sbs.year = s.submission_year
     and sbs.siri = coalesce(sp.siri, 1)
     and sbs.status = 'approved'
    where public.participant_card_normalize_ic(sp.ic_number) = v_ic
      and sp.is_deleted = false
      and coalesce(sp.is_withdrawn, false) = false
      and public.participant_card_is_supported_role(sp.role, coalesce(sp.is_penguji, false))
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'badge', ar.badge_name,
        'year', ar.submission_year,
        'siri', ar.siri
      )
      order by ar.submission_year desc, ar.badge_name asc, ar.siri asc
    ),
    '[]'::jsonb
  )
    into v_programs
    from approved_rows ar;

  return jsonb_build_object(
    'ok', true,
    'name', v_name,
    'role', v_role,
    'age', public.participant_card_age_from_ic(v_ic),
    'schoolName', v_school_name,
    'schoolCode', v_school_code,
    'negeriName', v_negeri_name,
    'negeriCode', v_negeri_code,
    'daerahName', v_daerah_name,
    'daerahCode', v_daerah_code,
    'programs', v_programs
  );
end;
$$;

revoke execute on function public.participant_card_normalize_ic(text) from public, anon, authenticated;
revoke execute on function public.participant_card_is_supported_role(text, boolean) from public, anon, authenticated;
revoke execute on function public.participant_card_role_label(text, boolean) from public, anon, authenticated;
revoke execute on function public.participant_card_new_token() from public, anon, authenticated;
revoke execute on function public.participant_card_age_from_ic(text) from public, anon, authenticated;
revoke execute on function public.participant_card_admin_can_touch_ic(text) from public, anon;
revoke execute on function public.ensure_participant_cards(text[]) from public, anon;
revoke execute on function public.revoke_participant_card(text, text) from public, anon;
revoke execute on function public.regenerate_participant_card(text, text) from public, anon;
revoke execute on function public.relink_participant_card(text, text, text) from public, anon;
revoke execute on function public.get_participant_card_public(text) from public;

grant execute on function public.ensure_participant_cards(text[]) to authenticated;
grant execute on function public.revoke_participant_card(text, text) to authenticated;
grant execute on function public.regenerate_participant_card(text, text) to authenticated;
grant execute on function public.relink_participant_card(text, text, text) to authenticated;
grant execute on function public.participant_card_admin_can_touch_ic(text) to authenticated;
grant execute on function public.get_participant_card_public(text) to anon, authenticated;

comment on table public.participant_cards is
  'Token kekal untuk kad peserta/petugas. QR menyimpan token sahaja; IC kekal sebagai kunci dalaman.';

comment on function public.get_participant_card_public(text) is
  'Carian awam untuk QR kad. Tidak memulangkan IC atau nombor keahlian.';

comment on function public.relink_participant_card(text, text, text) is
  'Relink token QR kad peserta yang sudah dicetak kepada IC baharu tanpa menukar QR.';
