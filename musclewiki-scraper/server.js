const express = require('express');
const https   = require('https');
const zlib    = require('zlib');
const path    = require('path');

const app  = express();
const PORT = 3333;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── Headers que imitan Chrome real ───────────────────────────────────────────
const CHROME_HEADERS = {
  'User-Agent'      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'          : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language' : 'es-ES,es;q=0.9,en;q=0.8',
  'Accept-Encoding' : 'gzip, deflate, br',
  'Sec-Ch-Ua'       : '"Chromium";v="124","Google Chrome";v="124","Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest'  : 'document',
  'Sec-Fetch-Mode'  : 'navigate',
  'Sec-Fetch-Site'  : 'none',
  'Sec-Fetch-User'  : '?1',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control'   : 'max-age=0',
};

// ── Fetch con descompresión automática ───────────────────────────────────────
function httpGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = { ...CHROME_HEADERS, ...extraHeaders };
    const req = https.get(url, { headers }, (res) => {
      // Redirecciones
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : 'https://musclewiki.com' + res.headers.location;
        return httpGet(next, extraHeaders).then(resolve).catch(reject);
      }

      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const enc = res.headers['content-encoding'];
        try {
          let text;
          if (enc === 'gzip')     text = zlib.gunzipSync(buf).toString('utf8');
          else if (enc === 'deflate') text = zlib.inflateSync(buf).toString('utf8');
          else if (enc === 'br')  text = zlib.brotliDecompressSync(buf).toString('utf8');
          else                    text = buf.toString('utf8');
          resolve({ status: res.statusCode, text, ct: res.headers['content-type'] || '' });
        } catch (e) {
          resolve({ status: res.statusCode, text: buf.toString('utf8'), ct: '' });
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── Extraer __NEXT_DATA__ de una página Next.js ───────────────────────────────
function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// ── Mapeo equipo/nivel ────────────────────────────────────────────────────────
const EQUIP = { bodyweight: 'Bodyweight', stretches: 'Stretches' };
const LEVEL = { beginner: 'Beginner', novice: 'Novice' };

// ── URL de vídeo femenino (patrón conocido) ───────────────────────────────────
function buildVideoUrl(slug, equipment) {
  const cat = EQUIP[equipment] || equipment || 'Bodyweight';
  return `https://media.musclewiki.com/media/uploads/videos/branded/female-${cat}-${slug}-front.mp4`;
}

// ── Normalizar ejercicio desde distintas estructuras de API ───────────────────
function normalizeExercise(raw, equipment) {
  const slug = raw.slug || raw.url_slug || (raw.name || '').toLowerCase().replace(/\s+/g, '-');
  return {
    slug,
    nombre      : raw.name || raw.title || slug,
    descripcion : raw.description || raw.overview || '',
    nivel       : raw.difficulty  || raw.level     || '',
    musculos    : (raw.muscles || raw.primary_muscles || []).map(m => m.name || m).join(', '),
    equipo      : raw.equipment   || equipment || '',
    videoUrl    : buildVideoUrl(slug, (equipment || '').toLowerCase()),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GET /api/exercises?equipment=bodyweight&level=beginner
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/exercises', async (req, res) => {
  const equipment = (req.query.equipment || 'bodyweight').toLowerCase();
  const level     = (req.query.level     || 'beginner').toLowerCase();
  const eq        = EQUIP[equipment] || 'Bodyweight';
  const lv        = LEVEL[level]     || 'Beginner';

  // ── Intento 1: REST API v1 ──────────────────────────────────────────────────
  for (const diffParam of ['difficulty', 'level', 'skill_level']) {
    try {
      const url = `https://musclewiki.com/api/v1/exercises/?equipment=${encodeURIComponent(eq)}&${diffParam}=${encodeURIComponent(lv)}&format=json&limit=300`;
      console.log('Probando API:', url);
      const r = await httpGet(url, { 'Accept': 'application/json', 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin', 'Referer': 'https://musclewiki.com/' });
      if (r.status === 200 && r.ct.includes('json')) {
        const data  = JSON.parse(r.text);
        const list  = Array.isArray(data) ? data : (data.results || data.exercises || []);
        if (list.length > 0) {
          console.log(`API v1 OK: ${list.length} ejercicios (param: ${diffParam})`);
          return res.json({ ok: true, fuente: 'api-v1', ejercicios: list.map(e => normalizeExercise(e, equipment)) });
        }
      }
      console.log(`API v1 status ${r.status} con param ${diffParam}`);
    } catch (e) { console.log('API v1 error:', e.message); }
  }

  // ── Intento 2: API sin filtro de nivel ─────────────────────────────────────
  try {
    const url = `https://musclewiki.com/api/v1/exercises/?equipment=${encodeURIComponent(eq)}&format=json&limit=300`;
    console.log('Probando API sin nivel:', url);
    const r = await httpGet(url, { 'Accept': 'application/json', 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin', 'Referer': 'https://musclewiki.com/' });
    if (r.status === 200 && r.ct.includes('json')) {
      const data = JSON.parse(r.text);
      const list = Array.isArray(data) ? data : (data.results || data.exercises || []);
      if (list.length > 0) {
        console.log(`API v1 sin nivel OK: ${list.length} ejercicios`);
        const filtrados = list.filter(e => {
          const d = (e.difficulty || e.level || '').toLowerCase();
          return !d || d === level;
        });
        return res.json({ ok: true, fuente: 'api-v1-sin-nivel', ejercicios: filtrados.map(e => normalizeExercise(e, equipment)) });
      }
    }
  } catch (e) { console.log('API sin nivel error:', e.message); }

  // ── Intento 3: __NEXT_DATA__ de la página directorio ──────────────────────
  try {
    const url = `https://musclewiki.com/es-es/directory`;
    console.log('Scrapeando directorio…');
    const r   = await httpGet(url);
    if (r.status !== 200) {
      console.log('Directorio bloqueado, status:', r.status);
    } else {
      const nd = extractNextData(r.text);
      if (nd) {
        const pp = nd?.props?.pageProps || {};
        console.log('Next data keys:', Object.keys(pp));
        // Buscar el array de ejercicios en distintos lugares posibles
        const candidates = [pp.exercises, pp.exerciseList, pp.data?.exercises, pp.allExercises, pp.initialExercises];
        for (const c of candidates) {
          if (Array.isArray(c) && c.length > 0) {
            const filtrados = c.filter(e => {
              const eqOk  = !e.equipment || JSON.stringify(e.equipment).toLowerCase().includes(equipment);
              const lvOk  = !e.difficulty || e.difficulty.toLowerCase() === level;
              return eqOk && lvOk;
            });
            console.log(`Next data: ${filtrados.length} ejercicios encontrados`);
            return res.json({ ok: true, fuente: 'next-data', ejercicios: filtrados.map(e => normalizeExercise(e, equipment)) });
          }
        }
        console.log('Next data presente pero sin array de ejercicios reconocido. Keys:', Object.keys(pp));
        // Devolver el objeto crudo para debug
        return res.json({ ok: false, fuente: 'next-data-debug', debug: pp, error: 'Estructura desconocida de Next data' });
      } else {
        // Si la página devuelve Cloudflare challenge, detéctalo
        if (r.text.includes('cf-browser-verification') || r.text.includes('Checking your browser')) {
          return res.json({ ok: false, error: 'Cloudflare bloqueó la petición. Prueba a esperar un momento.' });
        }
        console.log('No se encontró __NEXT_DATA__. Primeros 500 chars:', r.text.substring(0, 500));
        return res.json({ ok: false, error: 'No se encontró __NEXT_DATA__ en la página', debug: { status: r.status, preview: r.text.substring(0, 300) } });
      }
    }
  } catch (e) { console.log('Scrape error:', e.message); }

  res.json({ ok: false, error: 'Todos los intentos fallaron. Revisa la consola del servidor.' });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GET /api/exercise/:slug?equipment=bodyweight
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/exercise/:slug', async (req, res) => {
  const { slug } = req.params;
  const equipment = (req.query.equipment || 'bodyweight').toLowerCase();
  const videoUrl  = buildVideoUrl(slug, equipment);

  // Intentar obtener descripción y datos completos
  try {
    const url = `https://musclewiki.com/es-es/exercise/${encodeURIComponent(slug)}?model=f`;
    console.log('Fetching exercise:', url);
    const r  = await httpGet(url, { 'Referer': 'https://musclewiki.com/es-es/directory' });
    const nd = extractNextData(r.text);

    if (nd) {
      const pp = nd?.props?.pageProps || {};
      // El ejercicio suele estar en pp.exercise, pp.data, o directamente en pp
      const raw = pp.exercise || pp.data || pp;
      console.log('Exercise keys:', Object.keys(raw));

      // Extraer pasos/instrucciones de distintas estructuras
      const steps = raw.steps || raw.instructions || raw.how_to || [];
      const desc  = raw.description || raw.overview ||
                    (Array.isArray(steps) ? steps.map(s => s.text || s).join(' ') : '') ||
                    '';

      // Extraer URL de vídeo desde los datos si está disponible
      let videoFromData = videoUrl; // fallback al patrón conocido
      const videos = raw.videos || raw.video_urls || {};
      if (typeof videos === 'object') {
        videoFromData = videos.female_front || videos.female || videos.front || videoUrl;
      } else if (typeof videos === 'string') {
        videoFromData = videos;
      }

      return res.json({
        ok: true,
        slug,
        nombre      : raw.name || raw.title || slug.replace(/-/g, ' '),
        descripcion : desc,
        videoUrl    : videoFromData,
        musculos    : (raw.muscles || raw.primary_muscles || []).map(m => m.name || m).join(', '),
        nivel       : raw.difficulty || raw.level || '',
        equipo      : raw.equipment  || equipment,
      });
    }
  } catch (e) { console.log('Exercise fetch error:', e.message); }

  // Fallback: datos mínimos con vídeo construido por patrón
  res.json({
    ok          : true,
    slug,
    nombre      : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    descripcion : '',
    videoUrl,
    musculos    : '',
    nivel       : '',
    equipo      : equipment,
  });
});

// ── Arrancar ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Servidor arrancado → http://localhost:${PORT}\n`);
});
