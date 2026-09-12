begin;

-- 072 — halang pengguna menaikkan keistimewaan sendiri dalam profiles
--
-- Dasar "profiles_update" (002_rls_policies.sql:154) ditulis dengan USING
-- sahaja, tanpa WITH CHECK. Bila WITH CHECK ditinggalkan, Postgres guna
-- semula ungkapan USING untuk menyemak baris baharu — dan ungkapan itu
-- hanya mengekang `id`. Baris yang dikemas kini masih milik pengguna yang
-- sama, jadi semakan lulus walaupun `role` bertukar menjadi 'developer'.
-- Constraint di 001_schema.sql:76 menerima nilai itu, dan tiada trigger
-- pengawal di mana-mana migrasi terkemudian.
--
-- Kesannya: mana-mana school_user boleh menjadi developer sendiri.
--
-- Lajur yang dibekukan bukan `role` sahaja. `school_id`, `negeri_id` dan
-- `daerah_id` menentukan skop data yang boleh dicapai (lihat dasar
-- submissions_select), jadi menukarnya memindahkan pengguna ke sekolah atau
-- daerah lain. `is_active` pula ialah get log masuk di supabaseAuth.ts:99
-- dan :181 — kalau pengguna boleh menetapkannya semula kepada true, dia
-- membatalkan penyahaktifan yang dibuat oleh reset-school-claim.
--
-- Nama, emel dan telefon sengaja dibiarkan boleh disunting.
--
-- Tiada aliran klien yang menulis ke profiles langsung. Setiap tulisan sah
-- datang dari edge function memakai service role — submit-registration:61,
-- reset-school-claim:124, register-school-user:109, register-admin:208 —
-- dan service role memintas RLS sepenuhnya. Jadi pembekuan ini tidak
-- menyentuh satu pun aliran sedia ada.

create or replace function public.get_my_is_active()
returns boolean as $$
  select is_active from public.profiles where id = auth.uid();
$$ language sql security definer stable;

drop policy if exists "profiles_update" on public.profiles;

create policy "profiles_update" on public.profiles
  for update to authenticated
  using (
    id = auth.uid() or public.is_developer()
  )
  with check (
    public.is_developer()
    or (
      id = auth.uid()
      and role      is not distinct from public.get_my_role()
      and school_id is not distinct from public.get_my_school_id()
      and negeri_id is not distinct from public.get_my_negeri_id()
      and daerah_id is not distinct from public.get_my_daerah_id()
      and is_active is not distinct from public.get_my_is_active()
    )
  );

-- Fungsi pembantu di atas adalah STABLE, jadi ia berkongsi snapshot dengan
-- pernyataan UPDATE yang memanggilnya. Satu pernyataan tidak melihat
-- perubahannya sendiri, maka nilai yang dikembalikan ialah nilai LAMA —
-- itulah yang perlu dibandingkan dengan nilai baharu.

insert into public.audit_logs (action, actor_role, entity_type, entity_id, details)
values ('migrasi_072', 'developer', 'profiles', 'profiles_update',
        jsonb_build_object('migrasi', '072_lindung_peranan_profiles',
                           'sebab', 'Dasar UPDATE tiada WITH CHECK — pengguna boleh menaikkan peranan sendiri jadi developer'));

commit;
