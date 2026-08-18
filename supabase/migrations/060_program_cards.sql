-- ============================================================
-- MIGRATION 060: Kad urusetia dan kad umum bernombor
-- ============================================================
--
-- Kad ini guna konsep yang sama seperti kad peserta:
--   - QR hanya menyimpan URL token legap
--   - maklumat scan disimpan dalam database dan boleh diubah selepas cetak
--   - menyokong kad urusetia bernama dan kad umum bernombor
-- ============================================================

create table if not exists public.program_cards (
  id uuid primary key default uuid_generate_v4(),
  token text not null unique,
  card_type text not null check (card_type in ('urusetia', 'general')),
  title text not null,
  display_name text not null,
  card_number text,
  tag text,
  program_name text,
  program_year integer,
  siri integer,
  issuer_label text,
  scope_label text,
  color_key text,
  accent text,
  accent_dark text,
  accent_soft text,
  trim_color text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_cards_token_check check (token ~ '^[0-9a-f]{22}$'),
  constraint program_cards_program_year_check check (program_year is null or program_year between 2000 and 2100),
  constraint program_cards_siri_check check (siri is null or siri between 1 and 99)
);

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'program_cards'
       and column_name = 'trim'
  )
  and not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'program_cards'
       and column_name = 'trim_color'
  ) then
    alter table public.program_cards rename column "trim" to trim_color;
  end if;
end;
$$;

alter table public.program_cards
  add column if not exists trim_color text;

create index if not exists idx_program_cards_token
  on public.program_cards(token)
  where revoked_at is null;

create index if not exists idx_program_cards_type_created
  on public.program_cards(card_type, created_by, created_at desc)
  where revoked_at is null;

drop trigger if exists set_updated_at on public.program_cards;
create trigger set_updated_at before update on public.program_cards
  for each row execute function public.handle_updated_at();

alter table public.program_cards enable row level security;

drop policy if exists "program_cards_admin_select" on public.program_cards;
drop policy if exists "program_cards_admin_insert" on public.program_cards;
drop policy if exists "program_cards_admin_update" on public.program_cards;


-- ============================================================
-- Fungsi dalaman
-- ============================================================

create or replace function public.program_card_admin_can_manage(p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_or_above()
     and (
       public.get_my_role() in ('developer', 'admin')
       or p_created_by = auth.uid()
     );
$$;

create or replace function public.program_card_new_token()
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
      select 1 from public.program_cards pc where pc.token = v_token
    )
    and not exists (
      select 1 from public.participant_cards pc where pc.token = v_token
    );
  end loop;
  return v_token;
end;
$$;

create policy "program_cards_admin_select" on public.program_cards
  for select to authenticated using (
    public.program_card_admin_can_manage(created_by)
  );

create policy "program_cards_admin_insert" on public.program_cards
  for insert to authenticated with check (
    public.is_admin_or_above()
  );

create policy "program_cards_admin_update" on public.program_cards
  for update to authenticated using (
    public.program_card_admin_can_manage(created_by)
  ) with check (
    public.program_card_admin_can_manage(created_by)
  );


-- ============================================================
-- Admin: cipta kad urusetia / umum
-- ============================================================

create or replace function public.create_program_cards(p_cards jsonb)
returns table(
  id uuid,
  token text,
  card_type text,
  title text,
  display_name text,
  card_number text,
  tag text,
  program_name text,
  program_year integer,
  siri integer,
  issuer_label text,
  scope_label text,
  color_key text,
  accent text,
  accent_dark text,
  accent_soft text,
  trim_color text,
  payload jsonb,
  revoked_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_type text;
  v_title text;
  v_display_name text;
  v_token text;
  v_row public.program_cards%rowtype;
  v_count integer := coalesce(jsonb_array_length(coalesce(p_cards, '[]'::jsonb)), 0);
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh menjana kad program';
  end if;

  if v_count = 0 then
    return;
  end if;

  if v_count > 300 then
    raise exception 'Had maksimum jana pukal ialah 300 kad setiap kali';
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb))
  loop
    v_type := lower(trim(coalesce(v_item->>'card_type', 'general')));
    if v_type not in ('urusetia', 'general') then
      raise exception 'Jenis kad tidak sah: %', v_type;
    end if;

    v_title := nullif(trim(coalesce(v_item->>'title', '')), '');
    if v_title is null then
      v_title := case when v_type = 'urusetia' then 'URUSETIA' else 'KAD UMUM' end;
    end if;

    v_display_name := nullif(trim(coalesce(v_item->>'display_name', '')), '');
    if v_display_name is null then
      v_display_name := v_title;
    end if;

    v_token := public.program_card_new_token();

    insert into public.program_cards(
      token,
      card_type,
      title,
      display_name,
      card_number,
      tag,
      program_name,
      program_year,
      siri,
      issuer_label,
      scope_label,
      color_key,
      accent,
      accent_dark,
      accent_soft,
      trim_color,
      payload,
      created_by
    )
    values (
      v_token,
      v_type,
      upper(v_title),
      upper(v_display_name),
      nullif(trim(coalesce(v_item->>'card_number', '')), ''),
      nullif(trim(coalesce(v_item->>'tag', '')), ''),
      nullif(trim(coalesce(v_item->>'program_name', '')), ''),
      nullif(trim(coalesce(v_item->>'program_year', '')), '')::integer,
      nullif(trim(coalesce(v_item->>'siri', '')), '')::integer,
      nullif(trim(coalesce(v_item->>'issuer_label', '')), ''),
      nullif(trim(coalesce(v_item->>'scope_label', '')), ''),
      nullif(trim(coalesce(v_item->>'color_key', '')), ''),
      nullif(trim(coalesce(v_item->>'accent', '')), ''),
      nullif(trim(coalesce(v_item->>'accent_dark', '')), ''),
      nullif(trim(coalesce(v_item->>'accent_soft', '')), ''),
      nullif(trim(coalesce(v_item->>'trim_color', v_item->>'trim', '')), ''),
      case when jsonb_typeof(v_item->'payload') = 'object' then v_item->'payload' else '{}'::jsonb end,
      auth.uid()
    )
    returning * into v_row;

    id := v_row.id;
    token := v_row.token;
    card_type := v_row.card_type;
    title := v_row.title;
    display_name := v_row.display_name;
    card_number := v_row.card_number;
    tag := v_row.tag;
    program_name := v_row.program_name;
    program_year := v_row.program_year;
    siri := v_row.siri;
    issuer_label := v_row.issuer_label;
    scope_label := v_row.scope_label;
    color_key := v_row.color_key;
    accent := v_row.accent;
    accent_dark := v_row.accent_dark;
    accent_soft := v_row.accent_soft;
    trim_color := v_row.trim_color;
    payload := v_row.payload;
    revoked_at := v_row.revoked_at;
    created_at := v_row.created_at;
    updated_at := v_row.updated_at;
    return next;
  end loop;
end;
$$;


-- ============================================================
-- Admin: senarai, kemaskini dan batal kad
-- ============================================================

create or replace function public.list_program_cards(p_card_type text default null)
returns table(
  id uuid,
  token text,
  card_type text,
  title text,
  display_name text,
  card_number text,
  tag text,
  program_name text,
  program_year integer,
  siri integer,
  issuer_label text,
  scope_label text,
  color_key text,
  accent text,
  accent_dark text,
  accent_soft text,
  trim_color text,
  payload jsonb,
  revoked_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pc.id,
    pc.token,
    pc.card_type,
    pc.title,
    pc.display_name,
    pc.card_number,
    pc.tag,
    pc.program_name,
    pc.program_year,
    pc.siri,
    pc.issuer_label,
    pc.scope_label,
    pc.color_key,
    pc.accent,
    pc.accent_dark,
    pc.accent_soft,
    pc.trim_color,
    pc.payload,
    pc.revoked_at,
    pc.created_at,
    pc.updated_at
  from public.program_cards pc
  where pc.revoked_at is null
    and (p_card_type is null or pc.card_type = lower(trim(p_card_type)))
    and public.program_card_admin_can_manage(pc.created_by)
  order by pc.created_at desc, pc.card_number asc nulls last;
$$;

create or replace function public.update_program_card(
  p_card_id uuid,
  p_patch jsonb
)
returns table(
  id uuid,
  token text,
  card_type text,
  title text,
  display_name text,
  card_number text,
  tag text,
  program_name text,
  program_year integer,
  siri integer,
  issuer_label text,
  scope_label text,
  color_key text,
  accent text,
  accent_dark text,
  accent_soft text,
  trim_color text,
  payload jsonb,
  revoked_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.program_cards%rowtype;
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh mengemaskini kad program';
  end if;

  update public.program_cards pc
     set title = case when p_patch ? 'title' then coalesce(nullif(trim(coalesce(p_patch->>'title', '')), ''), pc.title) else pc.title end,
         display_name = case when p_patch ? 'display_name' then coalesce(nullif(trim(coalesce(p_patch->>'display_name', '')), ''), pc.display_name) else pc.display_name end,
         card_number = case when p_patch ? 'card_number' then nullif(trim(coalesce(p_patch->>'card_number', '')), '') else pc.card_number end,
         tag = case when p_patch ? 'tag' then nullif(trim(coalesce(p_patch->>'tag', '')), '') else pc.tag end,
         program_name = case when p_patch ? 'program_name' then nullif(trim(coalesce(p_patch->>'program_name', '')), '') else pc.program_name end,
         program_year = case when p_patch ? 'program_year' then nullif(trim(coalesce(p_patch->>'program_year', '')), '')::integer else pc.program_year end,
         siri = case when p_patch ? 'siri' then nullif(trim(coalesce(p_patch->>'siri', '')), '')::integer else pc.siri end,
         issuer_label = case when p_patch ? 'issuer_label' then nullif(trim(coalesce(p_patch->>'issuer_label', '')), '') else pc.issuer_label end,
         scope_label = case when p_patch ? 'scope_label' then nullif(trim(coalesce(p_patch->>'scope_label', '')), '') else pc.scope_label end,
         color_key = case when p_patch ? 'color_key' then nullif(trim(coalesce(p_patch->>'color_key', '')), '') else pc.color_key end,
         accent = case when p_patch ? 'accent' then nullif(trim(coalesce(p_patch->>'accent', '')), '') else pc.accent end,
         accent_dark = case when p_patch ? 'accent_dark' then nullif(trim(coalesce(p_patch->>'accent_dark', '')), '') else pc.accent_dark end,
         accent_soft = case when p_patch ? 'accent_soft' then nullif(trim(coalesce(p_patch->>'accent_soft', '')), '') else pc.accent_soft end,
         trim_color = case when p_patch ? 'trim_color' or p_patch ? 'trim' then nullif(trim(coalesce(p_patch->>'trim_color', p_patch->>'trim', '')), '') else pc.trim_color end,
         payload = case when p_patch ? 'payload' and jsonb_typeof(p_patch->'payload') = 'object' then p_patch->'payload' else pc.payload end
   where pc.id = p_card_id
     and pc.revoked_at is null
     and public.program_card_admin_can_manage(pc.created_by)
   returning * into v_row;

  if not found then
    return;
  end if;

  id := v_row.id;
  token := v_row.token;
  card_type := v_row.card_type;
  title := v_row.title;
  display_name := v_row.display_name;
  card_number := v_row.card_number;
  tag := v_row.tag;
  program_name := v_row.program_name;
  program_year := v_row.program_year;
  siri := v_row.siri;
  issuer_label := v_row.issuer_label;
  scope_label := v_row.scope_label;
  color_key := v_row.color_key;
  accent := v_row.accent;
  accent_dark := v_row.accent_dark;
  accent_soft := v_row.accent_soft;
  trim_color := v_row.trim_color;
  payload := v_row.payload;
  revoked_at := v_row.revoked_at;
  created_at := v_row.created_at;
  updated_at := v_row.updated_at;
  return next;
end;
$$;

create or replace function public.revoke_program_card(
  p_card_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh membatalkan kad program';
  end if;

  update public.program_cards pc
     set revoked_at = now(),
         revoked_reason = nullif(trim(coalesce(p_reason, '')), '')
   where pc.id = p_card_id
     and pc.revoked_at is null
     and public.program_card_admin_can_manage(pc.created_by);

  return found;
end;
$$;


-- ============================================================
-- Awam: baca maklumat scan kad program
-- ============================================================

create or replace function public.get_program_card_public(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_card public.program_cards%rowtype;
begin
  select pc.*
    into v_card
    from public.program_cards pc
   where pc.token = lower(trim(coalesce(p_token, '')))
     and pc.revoked_at is null;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'Kad program tidak sah atau telah dibatalkan.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'cardKind', 'program',
    'cardType', v_card.card_type,
    'cardTitle', v_card.title,
    'displayName', v_card.display_name,
    'cardNumber', v_card.card_number,
    'tag', v_card.tag,
    'programName', v_card.program_name,
    'programYear', v_card.program_year,
    'siri', v_card.siri,
    'issuerLabel', v_card.issuer_label,
    'scopeLabel', v_card.scope_label,
    'colorKey', v_card.color_key,
    'accent', v_card.accent,
    'accentDark', v_card.accent_dark,
    'accentSoft', v_card.accent_soft,
    'trim', v_card.trim_color,
    'details', v_card.payload
  );
end;
$$;


-- ============================================================
-- Grants eksplisit
-- ============================================================

revoke execute on function public.program_card_admin_can_manage(uuid) from public, anon;
revoke execute on function public.program_card_new_token() from public, anon, authenticated;
revoke execute on function public.create_program_cards(jsonb) from public, anon;
revoke execute on function public.list_program_cards(text) from public, anon;
revoke execute on function public.update_program_card(uuid, jsonb) from public, anon;
revoke execute on function public.revoke_program_card(uuid, text) from public, anon;
revoke execute on function public.get_program_card_public(text) from public;

grant execute on function public.program_card_admin_can_manage(uuid) to authenticated;
grant execute on function public.create_program_cards(jsonb) to authenticated;
grant execute on function public.list_program_cards(text) to authenticated;
grant execute on function public.update_program_card(uuid, jsonb) to authenticated;
grant execute on function public.revoke_program_card(uuid, text) to authenticated;
grant execute on function public.get_program_card_public(text) to anon, authenticated;

comment on table public.program_cards is
  'Kad urusetia dan kad umum bernombor. QR menyimpan token sahaja; maklumat scan boleh diubah selepas cetak.';

comment on function public.get_program_card_public(text) is
  'Carian awam untuk QR kad urusetia/kad umum. Tidak memerlukan login.';
