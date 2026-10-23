'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { files } = require('../server/public-files.cjs');
const { settingsScript, publicSettings } = require('../server/settings.cjs');
const { securityHeaders } = require('../server/headers.cjs');
async function build({ root = path.resolve(__dirname, '..'), env = process.env } = {}) {
  root = path.resolve(root);
  const destination = path.join(root, 'dist');
  publicSettings(env);
  if (!env.TMDB_API_KEY)
    throw new Error('Configura TMDB_API_KEY en las variables de entorno del servidor antes de construir.');
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
    throw new Error('Configura SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY antes de construir.');
  // Crear primero en staging. Un build fallido conserva la publicación anterior.
  const staging = await fs.mkdtemp(path.join(root, '.build-staging-'));
  for (const file of files) {
    const target = path.join(staging, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(root, file), target);
  }
  await fs.writeFile(path.join(staging, 'supabase-config.js'), settingsScript(env));
  await fs.writeFile(
    path.join(staging, '_headers'),
    '/*\n' +
      Object.entries(securityHeaders)
        .map(([name, value]) => '  ' + name + ': ' + value)
        .join('\n') +
      '\n/admin*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n/sw.js\n  Cache-Control: no-cache\n',
  );
  // Solo se eliminan dos directorios literales derivados de root, nunca la carpeta del proyecto.
  for (const target of [destination]) {
    if (path.dirname(target) !== root || path.basename(target) !== 'dist')
      throw new Error('Destino de build inválido.');
    await fs.rm(target, { recursive: true, force: true });
  }
  if (path.dirname(staging) !== root || !path.basename(staging).startsWith('.build-staging-'))
    throw new Error('Staging inválido.');
  await fs.rename(staging, destination);
  console.log('Build público listo: solo aplicación estática; sin claves privadas, ZIP, SQL ni código del servidor.');
  return destination;
}
if (require.main === module) {
  try {
    process.loadEnvFile(path.resolve(__dirname, '..', '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try {
      process.loadEnvFile(path.resolve(__dirname, '..', '..', '.env'));
    } catch (fallbackError) {
      if (fallbackError.code !== 'ENOENT') throw fallbackError;
    }
  }
  build().catch(() => {
    console.error('Build incompleto. Revisa los archivos y las variables de entorno requeridas.');
    process.exitCode = 1;
  });
}
module.exports = { build };
