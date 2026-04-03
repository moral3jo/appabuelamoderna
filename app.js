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
  const data = JSON.parse(text.substring(47, text.length - 2));
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

// ---- Selección por bloques ---------------------------------

/**
 * Carga todos los ejercicios del Sheet, los agrupa por tipo,
 * guarda el pool completo para poder hacer swaps en preview,
 * y devuelve la selección del día organizada por bloques.
 *
 * Cada ejercicio lleva _tipo (nombre del bloque al que pertenece).
 */
async function getEjerciciosPorBloques() {
  const todos = await leerSheet('ejercicios');
  const seed  = dayOfYear();

  // Agrupar todos por tipo (clave normalizada)
  const porTipo = {};
  todos.forEach(e => {
    const t = normalizarClave(e.tipo || 'sin_tipo');
    if (!porTipo[t]) porTipo[t] = [];
    porTipo[t].push(e);
  });
  guardarPool(porTipo);

  const seleccionados = [];

  for (const bloque of CONFIG.BLOQUES) {
    const tipoKey    = normalizarClave(bloque.tipo);
    const disponibles = porTipo[tipoKey] || [];
    const n          = Math.min(bloque.cantidad, disponibles.length);
    const usados     = new Set();
    let   i          = 0;

    while (usados.size < n && i < disponibles.length * 3) {
      const idx = (seed * 3 + i * 7) % disponibles.length;
      if (!usados.has(idx)) {
        usados.add(idx);
        seleccionados.push({ ...disponibles[idx], _tipo: bloque.tipo });
      }
      i++;
    }
  }

  return seleccionados;
}

/**
 * Intercambia el ejercicio en la posición `posicion` por otro
 * del mismo tipo que no esté ya en la selección.
 * Cicla entre los candidatos disponibles.
 * Devuelve el array actualizado (y lo guarda en sessionStorage).
 */
function swapEjercicio(posicion) {
  const ejercicios  = cargarEjercicios();
  const ej          = ejercicios[posicion];
  const tipoKey     = normalizarClave(ej._tipo || '');
  const pool        = cargarPool();
  const disponibles = pool[tipoKey] || [];

  if (disponibles.length <= 1) return ejercicios;

  // IDs del mismo tipo ya en uso (excepto el que vamos a cambiar)
  const idsEnUso = new Set(
    ejercicios
      .filter((e, i) => i !== posicion && normalizarClave(e._tipo || '') === tipoKey)
      .map(e => e.id)
  );

  const candidatos = disponibles.filter(e => e.id !== ej.id && !idsEnUso.has(e.id));
  if (candidatos.length === 0) return ejercicios;

  // Ciclar con contador en sessionStorage para no repetir al pulsar varias veces
  const clave   = `swap_${posicion}`;
  const swapIdx = parseInt(sessionStorage.getItem(clave) || '0');
  sessionStorage.setItem(clave, (swapIdx + 1) % candidatos.length);

  ejercicios[posicion] = { ...candidatos[swapIdx % candidatos.length], _tipo: ej._tipo };
  guardarEjercicios(ejercicios);
  return ejercicios;
}

// ---- Sesión del día ----------------------------------------

function sesionCompletadaHoy() {
  return localStorage.getItem('sesion_fecha') === new Date().toDateString();
}

function marcarSesionCompleta() {
  localStorage.setItem('sesion_fecha', new Date().toDateString());
}

// ---- Persistencia entre páginas ----------------------------

function guardarEjercicios(ejercicios) {
  sessionStorage.setItem('ejercicios_hoy', JSON.stringify(ejercicios));
}

function cargarEjercicios() {
  try { return JSON.parse(sessionStorage.getItem('ejercicios_hoy') || '[]'); }
  catch { return []; }
}

function guardarPool(porTipo) {
  sessionStorage.setItem('ejercicios_pool', JSON.stringify(porTipo));
}

function cargarPool() {
  try { return JSON.parse(sessionStorage.getItem('ejercicios_pool') || '{}'); }
  catch { return {}; }
}

// ---- Renderizado de imágenes / vídeos / YouTube ------------

function crearElementoMedia(src, emoji, cssClass) {
  src = (src || '').trim();
  if (!src) return null;

  // YouTube
  const ytMatch = src.match(
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch) {
    const el = document.createElement('iframe');
    el.className       = cssClass || 'media-img';
    el.src             = `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`;
    el.allow           = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope';
    el.allowFullscreen = true;
    el.frameBorder     = '0';
    return el;
  }

  // Nombre de archivo solo → buscar en img/
  if (!src.startsWith('http') && !src.startsWith('data:') && !src.includes('/')) {
    src = `img/${src}`;
  }

  // Vídeo local
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

  // Imagen
  const el = document.createElement('img');
  el.className = cssClass || 'media-img';
  el.src       = src;
  el.alt       = emoji || '';
  el.onerror   = () => {
    const span = document.createElement('span');
    span.className   = el.className;
    span.textContent = emoji || '🏃';
    span.style.fontSize = '5rem';
    el.replaceWith(span);
  };
  return el;
}

function insertarMedia(contenedor, src, emoji, cssClass) {
  contenedor.innerHTML = '';
  const el = crearElementoMedia(src, emoji, cssClass);
  if (el) contenedor.appendChild(el);
  else    contenedor.textContent = emoji || '🏃';
}
