/**
 * Eligibility.gs — jambatan ke scoutnadi (Supabase edge function
 * `quiz-eligibility`). Read-only. Kunci disimpan dalam Script Properties:
 *   SUPABASE_FN_URL   = https://<ref>.functions.supabase.co/quiz-eligibility
 *   SUPABASE_ANON_KEY = <anon key Supabase> (untuk header Authorization/apikey)
 *   QUIZ_API_KEY      = <rahsia sama dengan secret QUIZ_API_KEY di Supabase>
 *
 * Set melalui: Project Settings ▸ Script Properties (atau setupProperties()).
 */

function _props() { return PropertiesService.getScriptProperties(); }

/** Panggil edge function quiz-eligibility dengan payload JSON */
function callEligibility(payload) {
  const p = _props();
  const url = p.getProperty('SUPABASE_FN_URL');
  const anon = p.getProperty('SUPABASE_ANON_KEY');
  const key = p.getProperty('QUIZ_API_KEY');
  if (!url || !anon || !key) {
    throw new Error('Script Properties belum lengkap (SUPABASE_FN_URL, SUPABASE_ANON_KEY, QUIZ_API_KEY).');
  }

  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + anon,
      'apikey': anon,
      'x-quiz-api-key': key,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = resp.getResponseCode();
  let data = {};
  try { data = JSON.parse(resp.getContentText() || '{}'); } catch (e) { data = {}; }
  if (code !== 200) {
    throw new Error(data.error || ('Ralat sambungan peserta (HTTP ' + code + ')'));
  }
  return data;
}

/** Sahkan identiti peserta tanpa dedah IC penuh */
function verifyParticipant(participantId, value, method) {
  const data = callEligibility({
    action: 'verify', participantId: participantId, value: value, method: method || 'ic_last4',
  });
  return { ok: !!data.ok, name: data.name || '' };
}

/** Bantuan sekali-set: isi nilai kemudian Run fungsi ini sekali. */
function setupProperties() {
  _props().setProperties({
    SUPABASE_FN_URL: 'https://YOUR_REF.functions.supabase.co/quiz-eligibility',
    SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
    QUIZ_API_KEY: 'YOUR_SHARED_SECRET',
  }, false);
}
