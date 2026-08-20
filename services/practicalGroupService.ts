import { supabase } from './supabaseClient';

/**
 * Kumpulan ujian amali (ikatan).
 *
 * Unit agihan ialah ORANG, bukan sekolah — berbeza daripada kumpulan stesen
 * (stationGroupService.ts). Penguji ikatan hanya boleh mengendalikan lapan
 * peserta serentak, jadi sekolah 20 orang MESTI dipecahkan kepada 8 + 8 + baki
 * 4, dan baki itu bergabung dengan baki sekolah lain menjadi kumpulan CAMPUR.
 *
 * Rujuk docs/rancangan-kumpulan-amali.md.
 */

export const SAIZ_LALAI = 8;

/** Lajur tanda lalai bagi ujian ikatan. Kekangan DB mengehadkan 1..6. */
export const LAJUR_LALAI = ['SERAYA', 'SILANG', 'TUNGKU'];
export const MAKS_LAJUR = 6;

export interface PesertaAmali {
  personId: string;
  nama: string;
  schoolId: string | null;
  sekolah: string;
  unit: string | null;
}

export interface AhliKumpulan extends PesertaAmali {
  kumpulan: number;
}

export interface JadualAmali {
  runId: string;
  badgeName: string;
  year: number;
  siri: number;
  saizKumpulan: number;
  asingPpki: boolean;
  /** Kepala lajur tanda pada borang, mengikut susunan. */
  lajurTanda: string[];
  /** Sama ada lajur CATATAN kosong dicetak di hujung setiap baris. */
  gunaCatatan: boolean;
  createdAt: string;
  ahli: AhliKumpulan[];
}

/** PPKI dan PPKI Udara dikira sama — kedua-duanya pendidikan khas. */
export const isPpki = (unit: string | null | undefined): boolean =>
  (unit || '').toUpperCase().startsWith('PPKI');

/**
 * Tajuk yang dicetak di kepala setiap kumpulan.
 *
 * Diterbitkan daripada ahli, bukan disimpan. Kalau ia disimpan, memindahkan
 * seorang peserta secara manual akan meninggalkan tajuk "SK X" pada kumpulan
 * yang sudah bercampur — dan tiada sesiapa perasan sehingga borang dicetak.
 */
export const tajukKumpulan = (ahli: PesertaAmali[]): string => {
  if (ahli.length === 0) return 'KOSONG';
  const sekolah = Array.from(new Set(ahli.map(a => a.sekolah)));
  const asas = sekolah.length === 1 ? sekolah[0] : 'CAMPUR';
  return ahli.every(a => isPpki(a.unit)) ? `${asas} (PPKI)` : asas;
};

/**
 * Bahagikan peserta kepada kumpulan bersaiz `saiz`.
 *
 * Tiga fasa, mengikut keutamaan yang admin sebenarnya mahukan:
 *
 *   1. Setiap sekolah memberi seberapa banyak kumpulan PENUH yang boleh —
 *      sekolah 20 orang memberi dua kumpulan 8, tinggal baki 4.
 *   2. Baki semua sekolah dipadatkan menjadi kumpulan CAMPUR. Blok baki
 *      terbesar diletakkan dahulu, dan blok hanya dipecahkan apabila tiada
 *      blok utuh yang muat dalam ruang yang tinggal. Itu memberi padatan ketat
 *      (bilangan kumpulan = ceil(jumlah/saiz)) sambil meminimumkan bilangan
 *      sekolah dalam setiap kumpulan CAMPUR.
 *   3. Peserta PPKI, kalau diasingkan, membentuk kumpulan sendiri di hujung.
 *
 * Susunan: sekolah mengikut abjad, peserta mengikut abjad dalam setiap
 * kumpulan. Ini menjadikan jana semula memberi hasil yang sama, bukan susunan
 * rawak yang berubah setiap kali tanpa sebab.
 */
export const bahagikanPeserta = (
  peserta: PesertaAmali[],
  saiz: number,
  asingPpki: boolean,
): PesertaAmali[][] => {
  const n = Math.max(2, saiz);
  const ikutNama = (a: PesertaAmali, b: PesertaAmali) => a.nama.localeCompare(b.nama);

  const ppki = asingPpki ? peserta.filter(p => isPpki(p.unit)) : [];
  const kolam = asingPpki ? peserta.filter(p => !isPpki(p.unit)) : [...peserta];

  // Fasa 1 — kumpulan penuh setiap sekolah, sekolah mengikut abjad.
  const ikutSekolah = new Map<string, PesertaAmali[]>();
  kolam.forEach(p => {
    const kunci = p.schoolId || p.sekolah;
    ikutSekolah.set(kunci, [...(ikutSekolah.get(kunci) || []), p]);
  });

  const kumpulan: PesertaAmali[][] = [];
  const blokBaki: PesertaAmali[][] = [];

  Array.from(ikutSekolah.values())
    .sort((a, b) => a[0].sekolah.localeCompare(b[0].sekolah))
    .forEach(senarai => {
      const sisa = [...senarai].sort(ikutNama);
      while (sisa.length >= n) kumpulan.push(sisa.splice(0, n));
      if (sisa.length) blokBaki.push(sisa);
    });

  // Fasa 2 — padatkan baki menjadi kumpulan CAMPUR.
  kumpulan.push(...padatkanBaki(blokBaki, n));

  // Fasa 3 — PPKI di hujung, dikumpulkan mengikut sekolah dahulu supaya
  // kumpulan PPKI satu sekolah tidak dicampur tanpa perlu.
  if (ppki.length) {
    const ikutSekolahPpki = new Map<string, PesertaAmali[]>();
    ppki.forEach(p => {
      const kunci = p.schoolId || p.sekolah;
      ikutSekolahPpki.set(kunci, [...(ikutSekolahPpki.get(kunci) || []), p]);
    });

    const bakiPpki: PesertaAmali[][] = [];
    Array.from(ikutSekolahPpki.values())
      .sort((a, b) => a[0].sekolah.localeCompare(b[0].sekolah))
      .forEach(senarai => {
        const sisa = [...senarai].sort(ikutNama);
        while (sisa.length >= n) kumpulan.push(sisa.splice(0, n));
        if (sisa.length) bakiPpki.push(sisa);
      });

    kumpulan.push(...padatkanBaki(bakiPpki, n));
  }

  // Dalam setiap kumpulan: sekolah dahulu, kemudian nama. Untuk kumpulan satu
  // sekolah ini sama sahaja dengan susunan nama; untuk CAMPUR ia menjadikan
  // murid sekolah yang sama duduk bersebelahan pada borang.
  return kumpulan.map(g => [...g].sort(
    (a, b) => a.sekolah.localeCompare(b.sekolah) || ikutNama(a, b)));
};

/**
 * Padatkan blok baki menjadi bakul bersaiz `n`.
 *
 * Setiap blok ialah baki satu sekolah (1..n-1 orang). Bakul semasa mengambil
 * blok UTUH terbesar yang masih muat; hanya apabila tiada blok utuh yang muat,
 * blok terbesar dipecahkan untuk menghabiskan ruang. Kesannya bakul sentiasa
 * penuh kecuali yang terakhir, dan sekolah jarang merentas dua bakul.
 *
 * Contoh: baki 7,5,4,3,1 dengan n=8 memberi [7+1], [5+3], [4] — tiga bakul,
 * dan tiada satu sekolah pun dipecahkan.
 */
const padatkanBaki = (blok: PesertaAmali[][], n: number): PesertaAmali[][] => {
  const sisa = blok.map(b => [...b]).filter(b => b.length);
  const bakul: PesertaAmali[][] = [];
  let semasa: PesertaAmali[] = [];

  while (sisa.length) {
    sisa.sort((a, b) => b.length - a.length || a[0].sekolah.localeCompare(b[0].sekolah));
    const ruang = n - semasa.length;

    const idx = sisa.findIndex(b => b.length <= ruang);
    if (idx === -1) {
      semasa.push(...sisa[0].splice(0, ruang));   // pecahkan yang terbesar
    } else {
      semasa.push(...sisa[idx]);
      sisa.splice(idx, 1);
    }

    for (let i = sisa.length - 1; i >= 0; i--) if (!sisa[i].length) sisa.splice(i, 1);
    if (semasa.length >= n) { bakul.push(semasa); semasa = []; }
  }

  if (semasa.length) bakul.push(semasa);
  return bakul;
};

/**
 * Bersihkan senarai lajur sebelum ia disimpan atau dicetak.
 *
 * Ruang di hujung label tidak kelihatan pada skrin tetapi mengubah lebar lajur
 * yang dicetak, dan label kosong menghasilkan petak tanpa kepala — penguji
 * tidak tahu apa yang ditanda. Senarai yang tinggal kosong kembali kepada
 * lalai dan bukan kepada borang tanpa lajur, kerana borang begitu tiada guna.
 *
 * Had 6 sepadan dengan kekangan chk_lajur_tanda dalam migrasi 070; menapisnya
 * di sini bermakna admin nampak had itu sebagai lajur yang berhenti bertambah,
 * bukan sebagai ralat pangkalan data selepas menekan Jana.
 */
export const bersihkanLajur = (lajur: string[]): string[] => {
  const bersih = (lajur || [])
    .map(x => (x || '').trim())
    .filter(x => x.length > 0)
    .slice(0, MAKS_LAJUR);
  return bersih.length ? bersih : [...LAJUR_LALAI];
};

/**
 * Ubah lajur borang tanpa menjana semula kumpulan.
 *
 * Menukar kepala lajur tidak menyentuh siapa berada dalam kumpulan mana, jadi
 * memaksa admin menjana semula untuk membetulkan satu ejaan akan memusnahkan
 * setiap pelarasan manual yang dia sudah buat.
 */
export const simpanLajurBorang = async (
  runId: string, lajurTanda: string[], gunaCatatan: boolean,
): Promise<void> => {
  const { error } = await supabase
    .from('practical_group_runs')
    .update({ lajur_tanda: bersihkanLajur(lajurTanda), guna_catatan: gunaCatatan })
    .eq('id', runId);
  if (error) throw error;
};

/** Peserta yang layak: approved sahaja, PESERTA sahaja, tiada pegawai. */
export const ambilPesertaLayak = async (
  badgeName: string, year: number, siri: number,
): Promise<PesertaAmali[]> => {
  const { data, error } = await supabase.rpc('peserta_layak_amali', {
    p_badge_name: badgeName, p_year: year, p_siri: siri,
  });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    personId: r.person_id,
    nama: r.nama || '-',
    schoolId: r.school_id || null,
    sekolah: r.sekolah || '-',
    unit: r.unit || null,
  }));
};

/** Simpan jadual. Padam dan sisip dalam satu transaksi di sebelah SQL. */
export const simpanJadualAmali = async (
  badgeName: string, year: number, siri: number,
  saiz: number, asingPpki: boolean,
  kumpulan: PesertaAmali[][],
  lajurTanda: string[] = LAJUR_LALAI,
  gunaCatatan: boolean = true,
): Promise<string> => {
  const ahli = kumpulan.flatMap((g, i) => g.map(p => ({
    person_id: p.personId,
    kumpulan: i + 1,
    nama: p.nama,
    school_id: p.schoolId,
    sekolah: p.sekolah,
    unit: p.unit,
  })));

  const { data, error } = await supabase.rpc('simpan_kumpulan_amali', {
    p_badge_name: badgeName, p_year: year, p_siri: siri,
    p_saiz: saiz, p_asing_ppki: asingPpki, p_ahli: ahli,
    p_lajur_tanda: bersihkanLajur(lajurTanda),
    p_guna_catatan: gunaCatatan,
    p_nota: null,
  });
  if (error) throw error;
  return data as string;
};

/** Baca jadual tersimpan. null bermakna belum dijana untuk program/siri itu. */
export const ambilJadualAmali = async (
  badgeName: string, year: number, siri: number,
): Promise<JadualAmali | null> => {
  const { data, error } = await supabase
    .from('practical_group_runs')
    .select(`id, year, siri, saiz_kumpulan, asing_ppki, lajur_tanda, guna_catatan, created_at,
             badge:badge_id(name),
             ahli:practical_group_members(kumpulan, person_id, nama, school_id, sekolah, unit)`)
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
    saizKumpulan: (baris as any).saiz_kumpulan,
    asingPpki: (baris as any).asing_ppki,
    // Larian yang dijana sebelum migrasi 070 tiada lajur tersimpan.
    lajurTanda: (baris as any).lajur_tanda?.length
      ? (baris as any).lajur_tanda : LAJUR_LALAI,
    gunaCatatan: (baris as any).guna_catatan ?? true,
    createdAt: (baris as any).created_at,
    ahli: ((baris as any).ahli || []).map((x: any) => ({
      kumpulan: Number(x.kumpulan),
      personId: x.person_id,
      nama: x.nama || '-',
      schoolId: x.school_id || null,
      sekolah: x.sekolah || '-',
      unit: x.unit || null,
    })),
  };
};

export interface RekodAmali {
  runId: string;
  badgeName: string;
  siri: number;
  saizKumpulan: number;
  bilKumpulan: number;
  bilAhli: number;
  createdAt: string;
}

/**
 * Setiap jadual amali yang pernah dijana bagi satu tahun.
 *
 * Tanpa ini, satu-satunya cara mengetahui jadual mana sudah wujud ialah
 * memilih program dan siri satu demi satu sehingga sesuatu muncul. Larian
 * yang dilupakan kekal tersembunyi sehingga seseorang menjananya semula dan
 * tertanya-tanya kenapa amaran 'sudah wujud' keluar.
 */
export const ambilRekodAmali = async (year: number): Promise<RekodAmali[]> => {
  const { data, error } = await supabase
    .from('practical_group_runs')
    .select(`id, siri, saiz_kumpulan, created_at,
             badge:badge_id(name),
             ahli:practical_group_members(kumpulan)`)
    .eq('year', year);
  if (error) throw error;

  return (data || []).map((r: any) => {
    const b = Array.isArray(r.badge) ? r.badge[0] : r.badge;
    const ahli = r.ahli || [];
    return {
      runId: r.id,
      badgeName: b?.name || '-',
      siri: r.siri,
      saizKumpulan: r.saiz_kumpulan,
      // Dikira daripada ahli sebenar, bukan daripada saiz yang diminta:
      // pemindahan manual boleh mengosongkan kumpulan terakhir.
      bilKumpulan: new Set(ahli.map((x: any) => Number(x.kumpulan))).size,
      bilAhli: ahli.length,
      createdAt: r.created_at,
    };
  }).sort((a, b) => a.badgeName.localeCompare(b.badgeName) || a.siri - b.siri);
};

/**
 * Padam satu jadual amali.
 *
 * Ahli dipadam bersama melalui cascade. Menjana semula juga menggantikan
 * jadual sedia ada, jadi ini untuk kes yang berbeza: jadual yang memang tidak
 * sepatutnya wujud, bukan yang perlu dibina semula.
 */
export const padamJadualAmali = async (runId: string): Promise<void> => {
  const { error } = await supabase
    .from('practical_group_runs')
    .delete()
    .eq('id', runId);
  if (error) throw error;
};

/**
 * Pindahkan seorang peserta ke kumpulan lain.
 *
 * Tiada had saiz dikuatkuasakan di sini. Admin yang memindahkan peserta
 * kesembilan ke dalam satu kumpulan tahu apa yang dia buat — selalunya kerana
 * adik-beradik atau pengangkutan. Skrin menunjukkan saiz setiap kumpulan
 * supaya lebihan itu kelihatan, bukan disekat.
 */
export const pindahPeserta = async (
  runId: string, personId: string, kumpulanBaharu: number,
): Promise<void> => {
  const { error } = await supabase
    .from('practical_group_members')
    .update({ kumpulan: kumpulanBaharu })
    .eq('run_id', runId).eq('person_id', personId);
  if (error) throw error;
};
