// ============================================================
//  app.js — Lógica compartida entre todas las pantallas
// ============================================================

/** Convierte "Descripción" → "descripcion", "Animación" → "animacion", etc. */
function normalizarClave(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Número del día del año (1–366). Mismo día = mismo índice. */
function dayOfYear() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

/**
 * Lee una pestaña del Google Sheet y devuelve array de objetos.
 * Las claves se normalizan: sin tildes, en minúsculas.
 */
async function leerSheet(pestana) {
  const url =
    `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}` +
    `/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(pestana)}`;

  const res  = await fetch(url);
  const text = await res.text();

  // La respuesta tiene prefijo /*O_o*/ de 47 chars
  const jsonStr = text.substring(47, text.length - 2);
  const data    = JSON.parse(jsonStr);

  // Normalizar cabeceras: "Descripción" → "descripcion"
  const cols = data.table.cols.map(c => normalizarClave(c.label));

  return data.table.rows.map(row => {
    const obj = {};
    row.c.forEach((cell, i) => {
      obj[cols[i]] = (cell && cell.v !== null && cell.v !== undefined) ? String(cell.v) : '';
    });
    return obj;
  });
}

/** Consejo del día (rotación determinista por día del año). */
async function getConsejoDelDia() {
  const consejos = await leerSheet('consejos');
  return consejos[dayOfYear() % consejos.length];
}

/**
 * Ejercicios del día (selección determinista: mismo día = misma rutina).
 * Columnas del sheet: id, nombre, descripcion, segundos, animacion, emoji, grupo
 */
async function getEjerciciosDelDia() {
  const todos = await leerSheet('ejercicios');
  const n     = Math.min(CONFIG.EJERCICIOS_POR_SESION, todos.length);
  const seed  = dayOfYear();

  const seleccionados = [];
  const usados        = new Set();
  let i = 0;

  while (seleccionados.length < n) {
    const idx = (seed * 3 + i * 7) % todos.length;
    if (!usados.has(idx)) {
      usados.add(idx);
      seleccionados.push(todos[idx]);
    }
    i++;
  }
  return seleccionados;
}

// ---- Sesión del día ----------------------------------------

function sesionCompletadaHoy() {
  return localStorage.getItem('sesion_fecha') === new Date().toDateString();
}

function marcarSesionCompleta() {
  localStorage.setItem('sesion_fecha', new Date().toDateString());
}

// ---- Transferencia de datos entre páginas ------------------

function guardarEjercicios(ejercicios) {
  sessionStorage.setItem('ejercicios_hoy', JSON.stringify(ejercicios));
}

function cargarEjercicios() {
  try {
    return JSON.parse(sessionStorage.getItem('ejercicios_hoy') || '[]');
  } catch {
    return [];
  }
}

// ---- Renderizado de imágenes / vídeos / YouTube ------------

/**
 * Devuelve un elemento HTML (img, video o iframe) para mostrar la animación.
 * Acepta:
 *   - URL completa http/https → img o video según extensión
 *   - URL de YouTube          → iframe embed
 *   - data:...                → img (base64)
 *   - nombre de archivo solo  → busca en img/ (ej: "ejercicio.gif" → "img/ejercicio.gif")
 *   - vacío / null            → devuelve null (usa emoji de fallback)
 */
function crearElementoMedia(src, emoji, cssClass) {
  src = (src || '').trim();

  if (!src) return null;

  // YouTube
  const ytMatch = src.match(
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch) {
    const el = document.createElement('iframe');
    el.className    = cssClass || 'media-img';
    el.src          = `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`;
    el.allow        = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope';
    el.allowFullscreen = true;
    el.frameBorder  = '0';
    return el;
  }

  // Si es solo un nombre de archivo (sin / ni http ni data:), buscar en img/
  if (!src.startsWith('http') && !src.startsWith('data:') && !src.includes('/')) {
    src = `img/${src}`;
  }

  // Vídeo local (.webm, .mp4, .ogv, .ogg)
  if (/\.(webm|mp4|ogv|ogg)(\?.*)?$/i.test(src)) {
    const el = document.createElement('video');
    el.className = cssClass || 'media-img';
    el.src       = src;
    el.autoplay  = true;
    el.loop      = true;
    el.muted     = true;
    el.setAttribute('playsinline', '');
    return el;
  }

  // Imagen (png, jpg, gif, webp, svg, data:, etc.)
  const el = document.createElement('img');
  el.className = cssClass || 'media-img';
  el.src       = src;
  el.alt       = emoji || '';
  el.onerror   = () => {
    // Si la imagen falla, muestra el emoji
    const span = document.createElement('span');
    span.className   = el.className;
    span.textContent = emoji || '🏃';
    span.style.fontSize = '5rem';
    el.replaceWith(span);
  };
  return el;
}

/**
 * Inserta el media (o el emoji de fallback) dentro de un contenedor.
 * @param {HTMLElement} contenedor  - donde insertar
 * @param {string}      src         - valor de la columna animacion/imagen
 * @param {string}      emoji       - fallback si no hay imagen
 * @param {string}      cssClass    - clase CSS para el elemento creado
 */
function insertarMedia(contenedor, src, emoji, cssClass) {
  contenedor.innerHTML = '';
  const el = crearElementoMedia(src, emoji, cssClass);
  if (el) {
    contenedor.appendChild(el);
  } else {
    contenedor.textContent = emoji || '🏃';
  }
}
