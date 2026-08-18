import { supabase } from './supabaseClient';

/**
 * Kumpulan ujian stesen.
 *
 * Unit agihan ialah SEKOLAH, bukan orang. Semua peserta satu sekolah duduk
 * dalam stesen yang sama; satu stesen boleh memuatkan beberapa sekolah.
 * Peraturan itu dikuatkuasakan oleh unique(run_id, school_id) dalam migrasi
 * 061 — kod di sini tidak boleh melanggarnya walaupun tersilap.
 *
 * Rujuk docs/rancangan-kumpulan-stesen.md.
 */

export interface SekolahStesen {
  schoolId: string;
  sekolah: string;
  peserta: number;
  stesen: string;
}

export interface JadualStesen {
  runId: string;
  badgeName: string;
  year: number;
  siri: number;
  bilKumpulan: number;
  createdAt: string;
  sekolah: SekolahStesen[];
  /**
   * Program TAMBAHAN yang penguji dikumpulkan bersama.
   *
   * Kosong bermakna kolam penguji program ini sahaja. Stesen tidak pernah
   * dikongsi — hanya kolam orang. Rujuk docs/rancangan-kumpulan-stesen.md.
   */
  programGabung: string[];
  /**
   * Berapa penguji program ini perlukan daripada kolam.
   *
   * null bermakna belum ditetapkan — pengagihan mengambil seluruh kolam yang
   * ada, seperti kelakuan asal.
   */
  pengujiDiperlukan: number | null;
}

/** Label mengikut bahagian: 12 kumpulan = 1A-6A + 1B-6B. */
export const labelStesen = (bilKumpulan: number): string[] => {
  const perBahagian = 6;
  const bahagian = Math.ceil(bilKumpulan / perBahagian);
  const huruf = 'ABCDEFGH'.split('');
  const keluar: string[] = [];
  for (let b = 0; b < bahagian; b++) {
    for (let i = 1; i <= perBahagian && keluar.length < bilKumpulan; i++) {
      keluar.push(`${i}${huruf[b]}`);
    }
  }
  return keluar;
};

/**
 * Bahagikan sekolah kepada n kumpulan dengan jumlah sedekat mungkin.
 *
 * Dua langkah. Longest Processing Time meletakkan sekolah terbesar dahulu ke
 * dalam stesen terkecil — cepat, tetapi berhenti pada agihan yang boleh
 * diperbaiki. Carian tempatan kemudian memindah atau menukar sekolah antara
 * stesen terbesar dan terkecil selagi jurang mengecil.
 *
 * Pada data sebenar Keris Perak Siri 2 (29 sekolah, 397 peserta), LPT sahaja
 * memberi jurang 6; dengan carian tempatan ia turun kepada 2.
 *
 * Sekolah tidak pernah dipecah: ia bergerak sebagai satu unit sepanjang masa.
 */
export const bahagikanSekolah = (
  sekolah: { schoolId: string; sekolah: string; peserta: number }[],
  bilKumpulan: number,
): string[][] => {
  const n = Math.max(1, bilKumpulan);
  const susun = [...sekolah].sort((a, b) => b.peserta - a.peserta);
  const bakul: { schoolId: string; peserta: number }[][] = Array.from({ length: n }, () => []);
  const jum = (i: number) => bakul[i].reduce((t, x) => t + x.peserta, 0);

  for (const s of susun) {
    let kecil = 0;
    for (let i = 1; i < n; i++) if (jum(i) < jum(kecil)) kecil = i;
    bakul[kecil].push({ schoolId: s.schoolId, peserta: s.peserta });
  }

  // Carian tempatan. Berhenti bila jurang <= 1 (tidak boleh diperbaiki lagi)
  // atau bila satu pusingan penuh tidak menemui pertukaran yang membantu.
  for (let pusingan = 0; pusingan < 5000; pusingan++) {
    const saiz = bakul.map((_, i) => jum(i));
    const hi = saiz.indexOf(Math.max(...saiz));
    const lo = saiz.indexOf(Math.min(...saiz));
    const jurang = saiz[hi] - saiz[lo];
    if (jurang <= 1) break;

    let maju = false;
    for (let i = 0; i < bakul[hi].length; i++) {           // pindah satu sekolah
      const x = bakul[hi][i];
      const baharu = Math.max(...saiz.map((v, k) => k === hi ? v - x.peserta : k === lo ? v + x.peserta : v))
                   - Math.min(...saiz.map((v, k) => k === hi ? v - x.peserta : k === lo ? v + x.peserta : v));
      if (baharu < jurang) { bakul[lo].push(bakul[hi].splice(i, 1)[0]); maju = true; break; }
    }
    if (maju) continue;

    for (let i = 0; i < bakul[hi].length && !maju; i++) {  // tukar sepasang
      for (let j = 0; j < bakul[lo].length; j++) {
        const a = bakul[hi][i], c = bakul[lo][j];
        if (a.peserta <= c.peserta) continue;
        const d = a.peserta - c.peserta;
        const baharu = Math.max(...saiz.map((v, k) => k === hi ? v - d : k === lo ? v + d : v))
                     - Math.min(...saiz.map((v, k) => k === hi ? v - d : k === lo ? v + d : v));
        if (baharu < jurang) { bakul[hi][i] = c; bakul[lo][j] = a; maju = true; break; }
      }
    }
    if (!maju) break;
  }

  return bakul.map(g => g.map(x => x.schoolId));
};

/** Peserta yang layak: approved sahaja, PESERTA sahaja, tiada pegawai. */
export const ambilSekolahLayak = async (
  badgeName: string, year: number, siri: number,
): Promise<{ schoolId: string; sekolah: string; peserta: number }[]> => {
  const { data, error } = await supabase.rpc('sekolah_layak_stesen', {
    p_badge_name: badgeName, p_year: year, p_siri: siri,
  });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    schoolId: r.school_id, sekolah: r.sekolah, peserta: Number(r.peserta),
  }));
};

/** Simpan jadual. Padam dan sisip dalam satu transaksi di sebelah SQL. */
export const simpanJadual = async (
  badgeName: string, year: number, siri: number, bilKumpulan: number,
  agihan: { school_id: string; station_label: string; peserta: number }[],
): Promise<string> => {
  const { data, error } = await supabase.rpc('simpan_kumpulan_stesen', {
    p_badge_name: badgeName, p_year: year, p_siri: siri,
    p_bil_kumpulan: bilKumpulan, p_agihan: agihan, p_nota: null,
  });
  if (error) throw error;
  return data as string;
};

/** Baca jadual tersimpan. null bermakna belum dijana untuk program/siri itu. */
export const ambilJadual = async (
  badgeName: string, year: number, siri: number,
): Promise<JadualStesen | null> => {
  const { data, error } = await supabase
    .from('station_group_runs')
    .select(`id, year, siri, bil_kumpulan, created_at, program_gabung, penguji_diperlukan,
             badge:badge_id(name),
             sekolah:station_group_schools(station_label, peserta_snapshot, school:school_id(id, name))`)
    .eq('year', year).eq('siri', siri);
  if (error) throw error;

  const baris = (data || []).find((r: any) => {
    const b = Array.isArray(r.badge) ? r.badge[0] : r.badge;
    return b?.name === badgeName;
  });
  if (!baris) return null;

  const b = Array.isArray((baris as any).badge) ? (baris as any).badge[0] : (baris as any).badge;
  return {
    runId: (baris as any).id,
    badgeName: b?.name || badgeName,
    year: (baris as any).year,
    siri: (baris as any).siri,
    bilKumpulan: (baris as any).bil_kumpulan,
    createdAt: (baris as any).created_at,
    programGabung: (baris as any).program_gabung || [],
    pengujiDiperlukan: (baris as any).penguji_diperlukan ?? null,
    sekolah: ((baris as any).sekolah || []).map((x: any) => {
      const sc = Array.isArray(x.school) ? x.school[0] : x.school;
      return {
        schoolId: sc?.id, sekolah: sc?.name || '-',
        peserta: Number(x.peserta_snapshot || 0), stesen: x.station_label,
      };
    }),
  };
};

/**
 * Pindahkan satu sekolah ke stesen lain.
 *
 * Sekolah bergerak sebagai satu unit — tiada cara memindahkan separuh
 * daripadanya, kerana unique(run_id, school_id) hanya membenarkan satu baris
 * per sekolah. Itu disengajakan.
 */
export const pindahSekolah = async (
  runId: string, schoolId: string, stesenBaharu: string,
): Promise<void> => {
  const { error } = await supabase
    .from('station_group_schools')
    .update({ station_label: stesenBaharu })
    .eq('run_id', runId).eq('school_id', schoolId);
  if (error) throw error;
};

// ── Penguji ─────────────────────────────────────────────────────────
// Rujuk docs/rancangan-kumpulan-stesen.md §8-12.

export interface PengujiLayak {
  personIc: string;
  nama: string;
  sekolah: string;
  programLain: string;       // setiap program siri ini yang dia daftar
  sudahDitempatkan: string;  // program lain yang sudah mengambilnya, atau ''
}

export interface PengujiStesen {
  personIc: string;
  nama: string;
  sekolah: string;
  stesen: string;
}

/**
 * Senarai penguji yang boleh diletakkan.
 *
 * `programs` ialah kolam: program larian ini, dicampur mana-mana program lain
 * yang admin tanda untuk digabungkan. Keris Perak 27 + Keris Emas 7 = 34.
 *
 * Menggabungkan kolam tidak membenarkan seorang penguji berada dalam dua
 * jadual — kedua-dua program MELIHAT orang yang sama, tetapi hanya satu boleh
 * MENGAMBILNYA. `sudahDitempatkan` memberitahu siapa yang sudah diambil.
 */
export const ambilPengujiLayak = async (
  programs: string[], year: number, siri: number,
): Promise<PengujiLayak[]> => {
  const { data, error } = await supabase.rpc('penguji_layak_stesen', {
    p_programs: programs, p_year: year, p_siri: siri,
  });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    personIc: r.person_ic, nama: r.nama, sekolah: r.sekolah || '',
    programLain: r.program_lain || '', sudahDitempatkan: r.sudah_ditempatkan || '',
  }));
};

/**
 * Rekod program mana digabungkan untuk larian ini.
 *
 * Disimpan supaya tandaan itu kekal selepas muat semula, dan supaya sesiapa
 * yang membuka jadual itu kemudian nampak dari mana penguji datang.
 */
export const simpanProgramGabung = async (
  runId: string, programs: string[],
): Promise<void> => {
  const { error } = await supabase
    .from('station_group_runs')
    .update({ program_gabung: programs.length ? programs : null })
    .eq('id', runId);
  if (error) throw error;
};

export interface RingkasanPenguji {
  runId: string;
  badgeName: string;
  bilKumpulan: number;
  kuota: number | null;
  ditempatkan: number;
}

/**
 * Status pengagihan penguji bagi SEMUA program dalam satu siri.
 *
 * Tanpa ini, admin membuka satu program pada satu masa dan tiada cara
 * mengetahui sama ada program lain sudah mengambil bahagiannya daripada
 * kolam yang dikongsi — sedangkan itulah maklumat yang menentukan berapa
 * ramai yang masih tinggal.
 *
 * Dua bacaan mudah, bukan satu pertanyaan bersarang: baris penguji sudah
 * membawa `year` dan `siri` sendiri (disalin ke sana untuk kekangan dalam
 * migrasi 062), jadi ia boleh dibaca terus dan dikumpulkan di sini.
 */
export const ambilRingkasanPenguji = async (
  year: number, siri: number,
): Promise<RingkasanPenguji[]> => {
  const [larian, penguji] = await Promise.all([
    supabase.from('station_group_runs')
      .select('id, bil_kumpulan, penguji_diperlukan, badge:badge_id(name)')
      .eq('year', year).eq('siri', siri),
    supabase.from('station_group_examiners')
      .select('run_id').eq('year', year).eq('siri', siri),
  ]);
  if (larian.error) throw larian.error;
  if (penguji.error) throw penguji.error;

  const kira = new Map<string, number>();
  (penguji.data || []).forEach((r: any) => {
    kira.set(r.run_id, (kira.get(r.run_id) || 0) + 1);
  });

  return (larian.data || []).map((r: any) => {
    const b = Array.isArray(r.badge) ? r.badge[0] : r.badge;
    return {
      runId: r.id,
      badgeName: b?.name || '-',
      bilKumpulan: r.bil_kumpulan,
      kuota: r.penguji_diperlukan ?? null,
      ditempatkan: kira.get(r.id) || 0,
    };
  }).sort((a, b) => a.badgeName.localeCompare(b.badgeName));
};

/**
 * Buang semua penempatan penguji bagi satu larian.
 *
 * Nama stesen TIDAK dipadam. Ia ditaip tangan dan tiada kaitan dengan siapa
 * yang menguji — memadamnya bersama penempatan bermakna kerja itu hilang
 * setiap kali admin mahu mengagih semula.
 *
 * Ini juga cara melepaskan penguji kembali ke kolam: selagi baris ini wujud,
 * kekangan unique(year, siri, person_ic) menghalang program lain mengambil
 * mereka.
 */
export const kosongkanPenguji = async (runId: string): Promise<void> => {
  const { error } = await supabase
    .from('station_group_examiners')
    .delete()
    .eq('run_id', runId);
  if (error) throw error;
};

/** Kosong disimpan sebagai NULL — kekangan menolak 0 dan negatif. */
export const simpanKuotaPenguji = async (
  runId: string, kuota: number | null,
): Promise<void> => {
  const { error } = await supabase
    .from('station_group_runs')
    .update({ penguji_diperlukan: kuota && kuota > 0 ? kuota : null })
    .eq('id', runId);
  if (error) throw error;
};

/**
 * Pilih siapa yang diambil daripada kolam, mengikut kuota.
 *
 * Penguji program itu sendiri dahulu, baru dipinjam daripada program yang
 * digabungkan. Peminjaman menampung kekurangan; ia tidak menggantikan orang
 * yang sudah ada. Kalau Keris Perak perlukan 24 dan mempunyai 27 orangnya
 * sendiri, ia tidak meminjam langsung — dan Keris Emas mendapat kesemua
 * pengujinya kembali.
 *
 * Kesannya, menanda program lain untuk digabungkan tidak mengubah apa-apa
 * selagi program itu cukup orang sendiri. Ia hanya membuka simpanan.
 *
 * Kuota null atau lebih besar daripada kolam bermakna ambil semua.
 */
export const pilihPenguji = (
  layak: PengujiLayak[], badgeName: string, kuota: number | null,
): PengujiLayak[] => {
  const ikutNama = (a: PengujiLayak, b: PengujiLayak) => a.nama.localeCompare(b.nama);
  const miliknya = (p: PengujiLayak) => p.programLain.split(', ').includes(badgeName);

  const susun = [
    ...layak.filter(miliknya).sort(ikutNama),
    ...layak.filter(p => !miliknya(p)).sort(ikutNama),
  ];
  return !kuota || kuota >= susun.length ? susun : susun.slice(0, kuota);
};

/**
 * Agih penguji merata ke stesen.
 *
 * Lebih mudah daripada pembahagian sekolah: penguji ialah unit tunggal, jadi
 * ia hanya pusingan bulat. Dengan 27 penguji dan 12 stesen, tiga stesen
 * pertama mendapat 3 orang dan selebihnya 2 — jurang sentiasa 0 atau 1.
 *
 * Sekolah penguji TIDAK diambil kira. Pada nisbah 2 orang sestesen, mengelak
 * sekolah sendiri selalunya mustahil dipenuhi (keputusan P2).
 */
export const bahagikanPenguji = (
  penguji: PengujiLayak[], bilKumpulan: number,
): { personIc: string; stesen: string }[] => {
  const label = labelStesen(bilKumpulan);
  // Disusun ikut nama supaya jana semula memberi hasil yang sama, bukan
  // susunan rawak yang berubah setiap kali tanpa sebab.
  const susun = [...penguji].sort((a, b) => a.nama.localeCompare(b.nama));
  return susun.map((p, i) => ({ personIc: p.personIc, stesen: label[i % label.length] }));
};

export const simpanPenguji = async (
  runId: string, year: number, siri: number,
  agihan: { personIc: string; nama: string; sekolah: string; stesen: string }[],
): Promise<void> => {
  const { error: padamErr } = await supabase
    .from('station_group_examiners').delete().eq('run_id', runId);
  if (padamErr) throw padamErr;
  if (agihan.length === 0) return;

  const { error } = await supabase.from('station_group_examiners').insert(
    agihan.map(p => ({
      run_id: runId, station_label: p.stesen, person_ic: p.personIc,
      nama: p.nama, sekolah: p.sekolah, year, siri,
    })),
  );
  // unique(year, siri, person_ic) menolak penguji yang sudah berada dalam
  // jadual program lain bagi siri yang sama. Mesejnya diterjemah supaya admin
  // tahu apa yang berlaku, bukan melihat ralat Postgres mentah.
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error(
        'Sekurang-kurangnya seorang penguji sudah ditempatkan dalam jadual '
        + 'program lain bagi siri ini. Seorang penguji hanya boleh berada '
        + 'dalam satu jadual setiap siri.',
      );
    }
    throw error;
  }
};

export const ambilPenguji = async (runId: string): Promise<PengujiStesen[]> => {
  const { data, error } = await supabase
    .from('station_group_examiners')
    .select('person_ic, nama, sekolah, station_label')
    .eq('run_id', runId);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    personIc: r.person_ic, nama: r.nama, sekolah: r.sekolah || '', stesen: r.station_label,
  }));
};

export const pindahPenguji = async (
  runId: string, personIc: string, stesenBaharu: string,
): Promise<void> => {
  const { error } = await supabase
    .from('station_group_examiners')
    .update({ station_label: stesenBaharu })
    .eq('run_id', runId).eq('person_ic', personIc);
  if (error) throw error;
};

// ── Nama ujian setiap stesen ────────────────────────────────────────

export const ambilNamaStesen = async (runId: string): Promise<Record<string, string>> => {
  const { data, error } = await supabase
    .from('station_group_stations').select('label, nama').eq('run_id', runId);
  if (error) throw error;
  const peta: Record<string, string> = {};
  (data || []).forEach((r: any) => { peta[r.label] = r.nama || ''; });
  return peta;
};

export const simpanNamaStesen = async (
  runId: string, label: string, nama: string,
): Promise<void> => {
  const { error } = await supabase
    .from('station_group_stations')
    .upsert({ run_id: runId, label, nama: nama.trim() || null },
            { onConflict: 'run_id,label' });
  if (error) throw error;
};
