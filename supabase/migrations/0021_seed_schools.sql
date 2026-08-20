-- Seed schools from Google Apps Script into Supabase
-- Generated for Fasa 2 preview/production registration flow
-- Purpose: Populate public.schools so school users can self-register with Supabase Auth.

alter table public.schools enable row level security;

drop policy if exists public_view_active_schools on public.schools;

create policy public_view_active_schools
on public.schools
for select
to anon, authenticated
using (is_active = true);

insert into public.schools (
  name,
  school_code,
  allow_students,
  allow_assistants,
  allow_examiners,
  is_active,
  is_claimed
)
values
  ('SK PENGKALAN', 'ABA2057', false, true, true, true, false),
  ('SJK(T) CHETTIARS', 'ABD2164', false, true, true, true, false),
  ('SK BANDAR BARU PUTERA', 'ABA2059', false, true, true, true, false),
  ('SK BUNTONG', 'ABA2066', false, true, true, true, false),
  ('SK CATOR AVENUE', 'ABB2076', false, true, true, true, false),
  ('SK CHEPOR', 'ABA2007', false, true, true, true, false),
  ('SK CORONATION PARK', 'ABB2089', false, true, true, true, false),
  ('SK DATO'' AHMAD SAID TAMBAHAN', 'ABA2046', false, true, true, true, false),
  ('SK JALAN PANGLIMA BUKIT GANTANG', 'ABA2011', false, true, true, true, false),
  ('SK JALAN PEGOH', 'ABA2051', false, true, true, true, false),
  ('SK JATI', 'ABA2058', false, true, true, true, false),
  ('SK JELAPANG', 'ABA2045', false, true, true, true, false),
  ('SK JELAPANG JAYA', 'ABA2065', false, true, true, true, false),
  ('SK KAMPUNG PASIR PUTEH', 'ABA2014', false, true, true, true, false),
  ('SK KELEBANG JAYA', 'ABA2073', false, true, true, true, false),
  ('SK KUALA PARI', 'ABA2015', false, true, true, true, false),
  ('SK LA SALLE', 'ABB2082', false, true, true, true, false),
  ('SK MANJOI (DUA)', 'ABA2043', false, true, true, true, false),
  ('SK MANJOI (SATU)', 'ABA2041', false, true, true, true, false),
  ('SK MARIAN CONVENT', 'ABB2086', false, true, true, true, false),
  ('SK MERU RAYA', 'ABA2075', false, true, true, true, false),
  ('SK METHODIST (ACS)', 'ABB2078', false, true, true, true, false),
  ('SK PASUKAN POLIS HUTAN', 'ABA2039', false, true, true, true, false),
  ('SK PENGKALAN PEGOH', 'ABA2016', false, true, true, true, false),
  ('SK PINJI', 'ABA2064', false, true, true, true, false),
  ('SK POS RAYA', 'ABA2047', false, true, true, true, false),
  ('SK PUSING', 'ABB2092', false, true, true, true, false),
  ('SK RAJA CHULAN', 'ABA2055', false, true, true, true, false),
  ('SK RAJA DIHILIR EKRAM', 'ABB2077', false, true, true, true, false),
  ('SK RAJA PEREMPUAN', 'ABB2083', false, true, true, true, false),
  ('SK RAPAT JAYA', 'ABA2063', false, true, true, true, false),
  ('SK RAPAT SETIA', 'ABA2068', false, true, true, true, false),
  ('SK SERI AMPANG', 'ABA2050', false, true, true, true, false),
  ('SK SERI KELEBANG', 'ABA2052', false, true, true, true, false),
  ('SK SERI KEPAYANG', 'ABA2012', false, true, true, true, false),
  ('SK SERI MUTIARA', 'ABA2070', false, true, true, true, false),
  ('SK SILIBIN', 'ABA2060', false, true, true, true, false),
  ('SK SIMPANG PULAI', 'ABA2062', false, true, true, true, false),
  ('SK SRI KINTA', 'ABB2075', false, true, true, true, false),
  ('SK ST MICHAEL', 'ABB2080', false, true, true, true, false),
  ('SK SUNGAI RAPAT', 'ABA2002', false, true, true, true, false),
  ('SK SUNGAI RAYA', 'ABA2001', false, true, true, true, false),
  ('SK SUNGAI ROKAM', 'ABA2003', false, true, true, true, false),
  ('SK TAMAN BERSATU', 'ABA2056', false, true, true, true, false),
  ('SK TAMBUN', 'ABA2004', false, true, true, true, false),
  ('SK TANAH HITAM', 'ABA2074', false, true, true, true, false),
  ('SK TANJONG RAMBUTAN', 'ABA2005', false, true, true, true, false),
  ('SK TARCISIAN CONVENT', 'ABB2088', false, true, true, true, false),
  ('SK TASEK', 'ABA2006', false, true, true, true, false),
  ('SK TASEK DERMAWAN', 'ABA2061', false, true, true, true, false),
  ('SK TASIK DAMAI', 'ABA2071', false, true, true, true, false),
  ('SK WIRA JAYA', 'ABA2069', false, true, true, true, false),
  ('SK PERPADUAN', 'ABA2053', false, true, true, true, false),
  ('SK PAKATAN JAYA', 'ABA2072', false, true, true, true, false)
on conflict (school_code) do update
set
  name = excluded.name,
  allow_students = excluded.allow_students,
  allow_assistants = excluded.allow_assistants,
  allow_examiners = excluded.allow_examiners,
  is_active = true;

select count(*) as total_schools
from public.schools;
