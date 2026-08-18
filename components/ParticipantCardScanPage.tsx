import React, { useEffect, useState } from 'react';
import { AlertTriangle, Award, Calendar, CheckCircle2, Hash, RefreshCw, School, ShieldCheck } from 'lucide-react';
import { LOGO_URL } from '../constants';
import { getParticipantCardPublic, getProgramCardPublic, ParticipantCardPublic } from '../services/supabaseApi';
import { getLogoUrl } from '../services/logoService';

interface ParticipantCardScanPageProps {
  token: string;
}

const DEV_PARTICIPANT_CARD_CACHE_KEY = 'PARTICIPANT_CARD_DEV_CACHE';

const getDevParticipantCard = (token: string): ParticipantCardPublic | null => {
  if (!Boolean((import.meta as any).env?.DEV) || !token.startsWith('dev-')) return null;
  try {
    const cache = JSON.parse(localStorage.getItem(DEV_PARTICIPANT_CARD_CACHE_KEY) || '{}') || {};
    return cache[token] || null;
  } catch {
    return null;
  }
};

const formatProgramSiri = (siri?: number): string => {
  const value = Number(siri || 1);
  return Number.isFinite(value) && value > 1 ? `Siri ${value}` : 'Siri 1';
};

const getRoleLabel = (role?: string): string => {
  const value = String(role || 'PESERTA').trim().toUpperCase();
  if (value === 'PENERIMA RAMBU') return 'Penerima Rambu';
  if (value === 'PENOLONG PEMIMPIN') return 'Penolong Pemimpin';
  if (value === 'PEMIMPIN') return 'Pemimpin';
  if (value === 'PENGUJI') return 'Penguji';
  if (value === 'PEMBANTU') return 'Pembantu';
  return 'Peserta';
};

const getRoleTone = (role?: string) => {
  const value = String(role || 'PESERTA').trim().toUpperCase();
  if (value === 'PENGUJI') return { dark: '#3f236f', accent: '#7c3aed', soft: '#f6f0ff' };
  if (value === 'PEMIMPIN' || value === 'PENOLONG PEMIMPIN') return { dark: '#17356f', accent: '#2563eb', soft: '#eff6ff' };
  if (value === 'PEMBANTU') return { dark: '#57310f', accent: '#b45309', soft: '#fff7ed' };
  if (value === 'PENERIMA RAMBU') return { dark: '#164e63', accent: '#0d9488', soft: '#ecfeff' };
  return { dark: '#173744', accent: '#0f7c56', soft: '#f1faf5' };
};

const getProgramCardTone = (data?: ParticipantCardPublic | null) => ({
  dark: data?.accentDark || (data?.cardType === 'urusetia' ? '#450a0a' : '#172554'),
  accent: data?.accent || (data?.cardType === 'urusetia' ? '#991b1b' : '#2563eb'),
  soft: data?.accentSoft || (data?.cardType === 'urusetia' ? '#fef2f2' : '#eff6ff'),
});

const formatProgramCardSiri = (data?: ParticipantCardPublic | null): string => {
  const parts = [
    data?.programName,
    data?.siri ? `Siri ${data.siri}` : '',
    data?.programYear ? String(data.programYear) : '',
  ].filter(Boolean);
  return parts.join(' | ') || 'Tidak ditetapkan';
};

export const ParticipantCardScanPage: React.FC<ParticipantCardScanPageProps> = ({ token }) => {
  const [data, setData] = useState<ParticipantCardPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logoUrl, setLogoUrl] = useState(LOGO_URL);

  const loadCard = async () => {
    setLoading(true);
    setError('');
    try {
      const devCard = getDevParticipantCard(token);
      if (devCard) {
        setData(devCard);
        return;
      }
      let participantError = '';
      try {
        const result = await getParticipantCardPublic(token);
        if (result?.ok) {
          setData(result);
          return;
        }
        participantError = result?.message || '';
      } catch (err: any) {
        participantError = String(err?.message || '');
      }

      try {
        const programCard = await getProgramCardPublic(token);
        if (programCard?.ok) {
          setData(programCard);
          return;
        }
        setData({ ok: false, message: programCard?.message || participantError || 'Kad tidak dijumpai.' });
      } catch (err: any) {
        if (participantError.includes('get_participant_card_public')) {
          setError('Migrasi 058 kad peserta belum dipasang di Supabase.');
        } else if (String(err?.message || '').includes('get_program_card_public')) {
          setData({ ok: false, message: participantError || 'Kad peserta/program tidak dijumpai.' });
        } else {
          setError(String(err?.message || participantError || 'Kad tidak dapat dibaca.'));
        }
      }
    } catch (err: any) {
      const message = String(err?.message || '');
      setError(message.includes('get_participant_card_public')
        ? 'Migrasi 058 kad peserta belum dipasang di Supabase.'
        : message || 'Kad peserta tidak dapat dibaca.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const valid = data?.ok;
  const isProgramCard = data?.cardKind === 'program';
  const roleLabel = isProgramCard
    ? data?.cardType === 'urusetia' ? 'Urusetia' : 'Kad Umum'
    : getRoleLabel(data?.role);
  const roleTone = isProgramCard ? getProgramCardTone(data) : getRoleTone(data?.role);
  const districtLabel = isProgramCard
    ? (data?.issuerLabel || data?.scopeLabel || '')
    : [data?.daerahName || data?.daerahCode].filter(Boolean).join('');

  useEffect(() => {
    let cancelled = false;
    setLogoUrl(LOGO_URL);
    const daerahCode = data?.daerahCode;
    if (!daerahCode) return () => { cancelled = true; };

    getLogoUrl('daerah', daerahCode)
      .then(url => {
        if (!cancelled) setLogoUrl(url || LOGO_URL);
      })
      .catch(() => {
        if (!cancelled) setLogoUrl(LOGO_URL);
      });

    return () => { cancelled = true; };
  }, [data?.daerahCode]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6 sm:py-10">
        <section className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
          <div className="px-5 py-5 text-white" style={{ background: `linear-gradient(135deg, ${roleTone.dark}, ${roleTone.accent})` }}>
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt="Logo Pengakap" className="h-14 w-14 rounded-full bg-white object-contain p-1.5" />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase">Persekutuan Pengakap Malaysia</p>
                {districtLabel && (
                  <p className="mt-0.5 text-xs font-bold uppercase opacity-90">
                    {isProgramCard ? districtLabel : `Daerah ${districtLabel}`}
                  </p>
                )}
                <h1 className="mt-1 text-xl font-black sm:text-2xl">Kad {roleLabel}</h1>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
              <RefreshCw className="mb-3 h-8 w-8 animate-spin text-emerald-700" />
              <p className="text-sm font-bold text-slate-600">Memuatkan kad peserta...</p>
            </div>
          ) : error || !valid ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
              <AlertTriangle className="mb-3 h-12 w-12 text-red-600" />
              <h2 className="text-lg font-black text-slate-900">Kad Tidak Sah</h2>
              <p className="mt-2 max-w-md text-sm font-semibold text-slate-600">
                {error || data?.message || 'Kad peserta tidak dijumpai atau telah dibatalkan.'}
              </p>
            </div>
          ) : (
            <div className="p-5 sm:p-7">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-emerald-100 p-2 text-emerald-700">
                  <CheckCircle2 size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase" style={{ color: roleTone.accent }}>Kad {roleLabel} Disahkan</p>
                  <h2 className="break-words text-2xl font-black uppercase leading-tight text-slate-950 sm:text-3xl">
                    {isProgramCard ? (data?.cardNumber ? `${data.cardTitle} ${data.cardNumber}` : data?.cardTitle) : data?.name}
                  </h2>
                  {isProgramCard && data?.displayName && (
                    <p className="mt-1 break-words text-sm font-black uppercase text-slate-600">{data.displayName}</p>
                  )}
                </div>
              </div>

              {isProgramCard ? (
                <>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 p-4" style={{ backgroundColor: roleTone.soft }}>
                      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                        <ShieldCheck size={15} /> Jenis Kad
                      </div>
                      <p className="text-2xl font-black text-slate-900">{roleLabel}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                        <Hash size={15} /> Nombor Kad
                      </div>
                      <p className="text-2xl font-black text-slate-900">{data?.cardNumber || 'Tiada nombor'}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                        <School size={15} /> Tag / Tugas
                      </div>
                      <p className="text-sm font-black uppercase leading-snug text-slate-900">{data?.tag || 'Tidak ditetapkan'}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                        <Calendar size={15} /> Program / Siri
                      </div>
                      <p className="text-sm font-black uppercase leading-snug text-slate-900">{formatProgramCardSiri(data)}</p>
                    </div>
                  </div>

                  <div className="mt-7">
                    <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-slate-700">
                      <Award size={17} style={{ color: roleTone.accent }} /> Maklumat QR
                    </div>
                    {Object.entries(data?.details || {}).length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                        Tiada maklumat tambahan.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                        {Object.entries(data?.details || {}).map(([key, value]) => (
                          <div key={key} className="bg-white p-4">
                            <p className="text-xs font-black uppercase" style={{ color: roleTone.accent }}>{key}</p>
                            <p className="mt-1 break-words text-sm font-bold text-slate-800">{String(value)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 p-4" style={{ backgroundColor: roleTone.soft }}>
                      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                        <ShieldCheck size={15} /> Peranan
                      </div>
                      <p className="text-2xl font-black text-slate-900">
                        {roleLabel}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                        <Calendar size={15} /> Umur
                      </div>
                      <p className="text-2xl font-black text-slate-900">
                        {typeof data?.age === 'number' ? `${data.age} tahun` : 'Tidak tersedia'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                        <School size={15} /> Sekolah
                      </div>
                      <p className="text-sm font-black uppercase leading-snug text-slate-900">
                        {data?.schoolName || 'Tidak tersedia'}
                      </p>
                      {data?.schoolCode && (
                        <p className="mt-1 text-xs font-bold text-slate-500">{data.schoolCode}</p>
                      )}
                      {districtLabel && (
                        <p className="mt-2 text-xs font-black uppercase" style={{ color: roleTone.accent }}>Daerah {districtLabel}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-7">
                    <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-slate-700">
                      <Award size={17} className="text-emerald-700" /> Program Disahkan
                    </div>
                    {(data?.programs || []).length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                        Tiada program disahkan.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                        {(data?.programs || []).map((program, index) => (
                          <div key={`${program.badge}-${program.year}-${program.siri}-${index}`} className="flex items-center justify-between gap-3 bg-white p-4">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-black text-slate-900">{program.badge}</p>
                              <p className="mt-0.5 text-xs font-bold text-slate-500">{formatProgramSiri(program.siri)}</p>
                            </div>
                            <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                              {program.year}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
