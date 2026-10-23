import api from '../../server/api.cjs';
const handle = api.createAPI();

// Netlify ejecuta este archivo en el servidor, fuera del directorio público dist.
export default async function handler(request, context) {
  const result = await handle({
    method: request.method,
    url: request.url,
    ip: context.ip || 'unknown',
    origin: request.headers.get('origin'),
    expectedOrigin: new URL(request.url).origin,
    fetchSite: request.headers.get('sec-fetch-site'),
  });
  return new Response(result.body, { status: result.statusCode, headers: result.headers });
}
