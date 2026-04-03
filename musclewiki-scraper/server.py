#!/usr/bin/env python3
"""
MuscleWiki Extractor — Servidor local
Uso: python server.py   (no necesita Playwright)
Abre: http://localhost:3333
"""

import gzip
import json
import mimetypes
import os
import re
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT       = 3333
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')

# ── IDs de la API de MuscleWiki (api-next) ────────────────────────────────────
# Nota: la API general /api-next/exercises/ usa el param 'category' para filtrar
# por tipo de equipo. El param 'difficulty' en la URL NO filtra correctamente;
# hay que filtrar en Python usando el campo difficulty.id de cada ejercicio.
EQUIP_ID = {'bodyweight': 3, 'stretches': 8}
LEVEL_ID = {
    'beginner'    : 1,   # Beginner (35 ej. en bodyweight)
    'intermediate': 2,   # Intermediate
    'advanced'    : 3,   # Advanced
    'novice'      : 4,   # Novice (39 ej. en bodyweight)
    ''            : None, # Todos los niveles - sin filtro
}

# ── Headers Chrome ────────────────────────────────────────────────────────────
API_HEADERS = {
    'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept'         : 'application/json, text/plain, */*',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Referer'        : 'https://musclewiki.com/es-es/directory',
    'Sec-Fetch-Site' : 'same-origin',
    'Sec-Fetch-Mode' : 'cors',
    'Sec-Fetch-Dest' : 'empty',
    'Sec-Ch-Ua'      : '"Chromium";v="124","Google Chrome";v="124","Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile'  : '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
}


# ── HTTP helper ───────────────────────────────────────────────────────────────
def http_get(url):
    req = urllib.request.Request(url, headers=API_HEADERS)
    opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler())
    with opener.open(req, timeout=15) as resp:
        raw = resp.read()
        enc = resp.headers.get('Content-Encoding', '')
        text = gzip.decompress(raw).decode('utf-8', 'replace') if enc == 'gzip' else raw.decode('utf-8', 'replace')
        return json.loads(text)


# ── Strip HTML ────────────────────────────────────────────────────────────────
class _Stripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts = []
    def handle_data(self, d):
        d = d.strip()
        if d:
            self._parts.append(d)
    def text(self):
        return ' '.join(self._parts)

def strip_html(s):
    if not s:
        return ''
    p = _Stripper()
    p.feed(s)
    return p.text()


# ── Extraer URL de vídeo de female_images ────────────────────────────────────
def extract_video(raw):
    """Devuelve la URL del vídeo frontal femenino branded."""
    female_imgs = sorted(raw.get('female_images') or [], key=lambda x: x.get('order', 99))
    video_url = ''
    for img in female_imgs:
        v = img.get('branded_video') or ''
        if 'front' in v:
            video_url = v
            break
    if not video_url and female_imgs:
        video_url = female_imgs[0].get('branded_video') or ''
    return video_url


# ── Normalizar ejercicio completo (desde api-next/exercises/) ─────────────────
def normalize_full(raw):
    """Normaliza un ejercicio del endpoint general (tiene todos los campos)."""
    # Slug: construirlo desde target_url si existe, si no desde url_name o id
    target_url = raw.get('target_url') or {}
    female_path = target_url.get('female', '')
    if female_path:
        slug = re.sub(r'\?.*', '', female_path.replace('exercise/', ''))
    else:
        slug = raw.get('url_name') or str(raw.get('id', ''))

    # Descripción
    desc = strip_html(raw.get('description') or raw.get('description_en_us') or '')
    if not desc:
        steps = sorted(raw.get('correct_steps') or [], key=lambda s: s.get('order', 0))
        desc  = ' '.join(s.get('text') or s.get('text_en_us', '') for s in steps).strip()

    muscles_primary = [m.get('name_en_us') or m.get('name', '') for m in (raw.get('muscles_primary') or [])]
    if not muscles_primary:
        muscles_primary = [m.get('name_en_us') or m.get('name', '') for m in (raw.get('muscles') or [])]

    return {
        'id'         : raw.get('id'),
        'slug'       : slug,
        'nombre'     : raw.get('name') or slug,
        'descripcion': desc,
        'nivel'      : (raw.get('difficulty') or {}).get('name_en_us', ''),
        'musculos'   : ', '.join(muscles_primary),
        'equipo'     : (raw.get('category') or {}).get('name_en_us', ''),
        'videoUrl'   : extract_video(raw),
    }


# (normalize_detail se mantiene para compatibilidad con api_exercise_detail por ID)
def normalize_detail(raw, slug):
    desc = strip_html(raw.get('description') or raw.get('description_en_us') or '')
    if not desc:
        steps = sorted(raw.get('correct_steps') or [], key=lambda s: s.get('order', 0))
        desc  = ' '.join(s.get('text') or s.get('text_en_us', '') for s in steps).strip()

    muscles_primary = [m.get('name_en_us') or m.get('name', '') for m in (raw.get('muscles_primary') or [])]
    if not muscles_primary:
        muscles_primary = [m.get('name_en_us') or m.get('name', '') for m in (raw.get('muscles') or [])]

    return {
        'slug'       : slug,
        'nombre'     : raw.get('name') or slug,
        'descripcion': desc,
        'nivel'      : (raw.get('difficulty') or {}).get('name_en_us', ''),
        'musculos'   : ', '.join(muscles_primary),
        'equipo'     : (raw.get('category') or {}).get('name_en_us', ''),
        'videoUrl'   : extract_video(raw),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────
def api_exercises(query):
    equipment = (query.get('equipment', ['bodyweight'])[0]).lower()
    level     = (query.get('level',     ['beginner'])[0]).lower()

    eq_id = EQUIP_ID.get(equipment, 3)
    lv_id = LEVEL_ID.get(level, 1)  # None = sin filtro (todos los niveles)

    # NOTA: el param 'difficulty' en la URL de la API NO filtra correctamente:
    # devuelve siempre todos los ejercicios de esa category. Filtramos en Python.
    all_exercises = []
    page = 1
    page_size = 100
    while True:
        url = f'https://musclewiki.com/api-next/exercises/?category={eq_id}&limit={page_size}&offset={(page-1)*page_size}'
        print(f'  Llamando (pág {page}): {url}')
        try:
            data = http_get(url)
            lst  = data.get('results') or (data if isinstance(data, list) else [])
            all_exercises.extend(lst)
            total = data.get('count', len(all_exercises))
            if len(all_exercises) >= total or not lst:
                break
            page += 1
        except Exception as e:
            print(f'  Error: {e}')
            if not all_exercises:
                return {'ok': False, 'error': str(e)}
            break

    if not all_exercises:
        return {'ok': False, 'error': 'La API devolvió 0 ejercicios.'}

    # Filtrar por nivel en Python (el param difficulty de la API no funciona)
    if lv_id is not None:
        filtered = [e for e in all_exercises if (e.get('difficulty') or {}).get('id') == lv_id]
        print(f'  Filtrado por difficulty.id={lv_id}: {len(filtered)}/{len(all_exercises)} ejercicios')
    else:
        filtered = all_exercises
        print(f'  Sin filtro de nivel: {len(filtered)} ejercicios')

    if not filtered:
        return {'ok': False, 'error': f'No hay ejercicios para el nivel seleccionado (difficulty id={lv_id}).'}

    return {'ok': True, 'ejercicios': [normalize_full(e) for e in filtered]}


def api_exercise_detail(slug, query):
    # El slug lleva el ID codificado como "ID:slug" si fue generado por normalize_full,
    # o bien intentamos buscar por nombre en la API general.
    # En la práctica, como normalize_full ya incluye videoUrl desde el listado inicial,
    # este endpoint solo se llama si faltó algo. Intentamos por ID si está disponible.
    ex_id = query.get('id', [None])[0]
    if ex_id:
        url = f'https://musclewiki.com/api-next/exercises/?id={ex_id}'
    else:
        # Fallback: buscar en primeras páginas por slug (poco eficiente pero funcional)
        url = f'https://musclewiki.com/api-next/exercises/?limit=200'
    print(f'  Detalle: {url}')
    try:
        data    = http_get(url)
        results = data.get('results') or (data if isinstance(data, list) else [])
        if not results:
            return {'ok': False, 'error': 'Sin resultados'}
        # Si tenemos ID, buscar el ejercicio exacto
        if ex_id:
            match = next((r for r in results if str(r.get('id')) == str(ex_id)), results[0])
        else:
            # Buscar por slug coincidente
            match = next((r for r in results if slug in str(r.get('target_url') or '')), results[0])
        return {'ok': True, **normalize_detail(match, slug)}
    except Exception as e:
        print(f'  Error detalle: {e}')
        return {'ok': False, 'error': str(e), 'slug': slug}


# ── HTTP Handler ──────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path   = parsed.path
        query  = urllib.parse.parse_qs(parsed.query)

        if path == '/api/exercises':
            print(f'\n[GET] exercises  equipment={query.get("equipment")}  level={query.get("level")}')
            self._json(api_exercises(query))

        elif path.startswith('/api/exercise/'):
            slug = urllib.parse.unquote(path[len('/api/exercise/'):])
            print(f'\n[GET] exercise/{slug}')
            self._json(api_exercise_detail(slug, query))

        else:
            self._file(path)

    def _json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def _file(self, url_path):
        if url_path in ('', '/'):
            url_path = '/index.html'
        fp = os.path.join(PUBLIC_DIR, url_path.lstrip('/').replace('/', os.sep))
        if not os.path.isfile(fp):
            self.send_response(404); self.end_headers(); return
        ct, _ = mimetypes.guess_type(fp)
        with open(fp, 'rb') as f:
            data = f.read()
        self.send_response(200)
        self.send_header('Content-Type', ct or 'application/octet-stream')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    server = HTTPServer(('localhost', PORT), Handler)
    print(f'\n  Servidor en  http://localhost:{PORT}')
    print(  '  Ctrl+C para detener.\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Detenido.')
        sys.exit(0)
