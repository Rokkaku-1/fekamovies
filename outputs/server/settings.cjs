// Solo servidor/build. Nunca importar desde el navegador.
'use strict';
function publicSettings(env = process.env) {
  const url = String(env.SUPABASE_URL || '').trim();
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) throw new Error('SUPABASE_URL no válida.');
  if (publishableKey && !publishableKey.startsWith('sb_publishable_'))
    throw new Error('Usa SUPABASE_PUBLISHABLE_KEY; nunca una clave secreta o service_role.');
  const email = String(env.DMCA_EMAIL || '').trim();
  if (email && (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email) || email.length > 254))
    throw new Error('DMCA_EMAIL no válido.');
  return { supabase: { url: url.replace(/\/$/, ''), publishableKey }, dmcaEmail: email };
}
function settingsScript(env) {
  // Estos dos valores son publicables por diseño. El secreto de TMDB no está aquí.
  const { supabase } = publicSettings(env);
  return 'window.LUMEN_SUPABASE_CONFIG = Object.freeze(' + JSON.stringify(supabase) + ');\n';
}
module.exports = { publicSettings, settingsScript };
