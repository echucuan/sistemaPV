import { MESES, MESES_LARGO, DIAS_MES, analisisAngulos, datosCieloDespejado } from './solar.js';
import { MODULOS, CAMPOS_MODULO, ajustarModelo, curvas, temperaturaCelda, validarModulo } from './pv.js';
import { grafica } from './grafica.js';

// Campo de fútbol del Tec, campus Sinaloa (Culiacán).
const CAMPO = { lat: 24.80346, lon: -107.42182 };

// Climatología NASA POWER 2001–2025 del campo, incluida para que funcione al instante y sin internet.
const DATOS_CAMPO = {
  H: [4.3078, 5.2483, 6.4608, 7.2725, 7.6843, 7.1882, 6.3614, 6.0007, 5.5106, 5.4619, 4.6846, 4.1023],
  Hd: [1.2386, 1.3702, 1.5036, 1.7962, 1.6507, 1.9488, 2.3112, 2.2176, 1.9632, 1.1786, 1.0032, 1.1093],
  T: [20.26, 21.14, 23.28, 25.72, 28.45, 30.31, 28.81, 28.07, 27.23, 26.33, 23.41, 20.2],
  R: [13.73, 14.68, 15.91, 16.16, 16.21, 13.35, 9.01, 7.31, 7.35, 10.93, 12.9, 13.07],
};

const CLAVES_NASA = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const $ = (id) => document.getElementById(id);
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');

const estado = {
  lat: CAMPO.lat, lon: CAMPO.lon,
  analisis: null,
  mes: new Date().getMonth(),
  modulo: { ...MODULOS[1] },
  modelo: null,
};

// ---------- Datos solares ----------

function aDatos(H, Hd, T, R) {
  // Temperatura típica al mediodía ≈ promedio + medio rango diario.
  return H.map((h, i) => ({ H: h, Hd: Hd[i], tProm: T[i], tMax: T[i] + R[i] / 2 }));
}

const cerca = (a, b) => Math.abs(a - b) < 0.005;

function leerCache(clave) {
  try { return JSON.parse(localStorage.getItem(clave)); } catch { return null; }
}
function guardarCache(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
}

async function obtenerDatos(lat, lon) {
  if (cerca(lat, CAMPO.lat) && cerca(lon, CAMPO.lon)) {
    const d = DATOS_CAMPO;
    return { datos: aDatos(d.H, d.Hd, d.T, d.R), fuente: 'NASA POWER (2001–2025)', tipo: 'ok' };
  }
  const clave = `nasa:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const url = 'https://power.larc.nasa.gov/api/temporal/climatology/point' +
    '?parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DIFF,T2M,T2M_RANGE&community=RE&format=JSON' +
    `&latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const p = (await resp.json()).properties.parameter;
    const serie = (k) => CLAVES_NASA.map((m) => p[k][m]);
    const [H, Hd, T, R] = ['ALLSKY_SFC_SW_DWN', 'ALLSKY_SFC_SW_DIFF', 'T2M', 'T2M_RANGE'].map(serie);
    if ([...H, ...Hd, ...T, ...R].some((v) => !Number.isFinite(v) || v < -900)) throw new Error('datos incompletos');
    guardarCache(clave, { H, Hd, T, R });
    return { datos: aDatos(H, Hd, T, R), fuente: 'NASA POWER (2001–2025)', tipo: 'ok' };
  } catch (err) {
    const c = leerCache(clave);
    if (c) return { datos: aDatos(c.H, c.Hd, c.T, c.R), fuente: 'NASA POWER (guardado en este teléfono)', tipo: 'ok' };
    return {
      datos: datosCieloDespejado(lat),
      fuente: 'modelo de cielo despejado (sin conexión a NASA POWER: la radiación real será menor)',
      tipo: 'aviso',
    };
  }
}

// ---------- Ubicación ----------

function mostrarEstado(texto, tipo = '') {
  const e = $('estado');
  e.textContent = texto;
  e.className = `estado ${tipo}`;
}

function leerCoordenadas() {
  const lat = parseFloat($('lat').value), lon = parseFloat($('lon').value);
  if (!Number.isFinite(lat) || lat < -66 || lat > 66) return { error: 'La latitud debe estar entre −66° y 66°.' };
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return { error: 'La longitud debe estar entre −180° y 180°.' };
  return { lat, lon };
}

async function calcular() {
  const c = leerCoordenadas();
  if (c.error) { mostrarEstado(c.error, 'error'); return; }
  Object.assign(estado, c);
  const params = new URLSearchParams({ lat: c.lat.toFixed(5), lon: c.lon.toFixed(5) });
  history.replaceState(null, '', `?${params}`);

  const boton = document.querySelector('#form-ubicacion .primario');
  boton.disabled = true;
  mostrarEstado('Consultando la radiación solar de NASA POWER…');
  const r = await obtenerDatos(c.lat, c.lon);
  boton.disabled = false;

  estado.analisis = analisisAngulos(r.datos, c.lat);
  mostrarEstado(`📍 ${fmt(c.lat, 4)}°, ${fmt(c.lon, 4)}° · Datos: ${r.fuente}.`, r.tipo);
  $('orientacion').textContent = c.lat >= 0 ? 'sur' : 'norte';
  pintarResumen();
  pintarTabla();
  seleccionarMes(estado.mes);
}

function usarGPS() {
  if (!('geolocation' in navigator)) { mostrarEstado('Este navegador no permite usar el GPS.', 'error'); return; }
  const b = $('btn-gps');
  b.disabled = true;
  mostrarEstado('Buscando tu ubicación… (acepta el permiso de ubicación)');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      b.disabled = false;
      $('lat').value = pos.coords.latitude.toFixed(5);
      $('lon').value = pos.coords.longitude.toFixed(5);
      calcular();
    },
    (err) => {
      b.disabled = false;
      const msg = err.code === err.PERMISSION_DENIED
        ? 'No se dio permiso de ubicación. Escribe las coordenadas a mano.'
        : 'No se pudo obtener la ubicación. Intenta de nuevo al aire libre o escríbela a mano.';
      mostrarEstado(msg, 'error');
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
  );
}

// ---------- Resumen y tabla ----------

function kpi(valor, unidad, texto, destacado = false) {
  return `<div class="kpi${destacado ? ' destacado' : ''}"><div class="v">${valor} <small>${unidad}</small></div><div class="k">${texto}</div></div>`;
}

function pintarResumen() {
  const a = estado.analisis;
  const pct = (x) => `+${fmt((x / a.anual.horizontal - 1) * 100, 0)}%`;
  $('resumen').innerHTML =
    kpi(`${a.anguloAnual}°`, '', 'Mejor ángulo fijo para todo el año', true) +
    kpi(fmt(a.anual.horizontal, 0), 'kWh/m²', 'Al año con el panel horizontal') +
    kpi(fmt(a.anual.fijo, 0), 'kWh/m²', `Al año con ${a.anguloAnual}° fijo (${pct(a.anual.fijo)})`) +
    kpi(fmt(a.anual.mensual, 0), 'kWh/m²', `Al año ajustando cada mes (${pct(a.anual.mensual)})`);
}

function pintarTabla() {
  const a = estado.analisis;
  const hoy = new Date().getMonth();
  const filas = a.meses.map((m, i) => `
    <tr tabindex="0" data-mes="${i}" aria-selected="false">
      <td><span class="largo">${MESES_LARGO[i]}</span><span class="corto">${MESES[i]}</span>${i === hoy ? '<span class="hoy" title="Mes actual">●</span>' : ''}</td>
      <td class="ang">${m.anguloOptimo}°</td>
      <td>${fmt(m.hOptimo, 2)}</td>
      <td>${fmt(m.hHorizontal, 2)}</td>
      <td class="gan">+${fmt(m.ganancia * 100, 0)}%</td>
    </tr>`).join('');
  const prom = (x) => x / 365;
  $('tabla-meses').innerHTML = filas;
  $('tabla-meses').parentElement.querySelector('tfoot')?.remove();
  $('tabla-meses').insertAdjacentHTML('afterend', `
    <tfoot><tr>
      <td>Fijo anual</td><td class="ang">${a.anguloAnual}°</td>
      <td>${fmt(prom(a.anual.fijo), 2)}</td><td>${fmt(prom(a.anual.horizontal), 2)}</td>
      <td class="gan">+${fmt((a.anual.fijo / a.anual.horizontal - 1) * 100, 0)}%</td>
    </tr></tfoot>`);
}

function seleccionarMes(i) {
  estado.mes = i;
  const a = estado.analisis;
  const m = a.meses[i];
  for (const tr of $('tabla-meses').rows) tr.setAttribute('aria-selected', String(+tr.dataset.mes === i));

  const maxAng = Math.max(60, Math.ceil((Math.max(...a.meses.map((x) => x.anguloOptimo)) + 15) / 10) * 10);
  grafica($('g-angulos'), {
    titulo: 'Ángulo óptimo por mes',
    xmin: 0, xmax: 11, ymin: 0, ymax: Math.min(90, maxAng),
    xlabel: 'Mes', ylabel: 'Inclinación (°)', xEtiquetas: MESES,
    series: [{ tipo: 'barras', clase: 'barra', x: a.meses.map((_, k) => k), y: a.meses.map((x) => x.anguloOptimo),
      valores: a.meses.map((x) => `${x.anguloOptimo}°`), resaltar: i }],
    lineasH: [{ y: a.anguloAnual, clase: 'naranja', texto: `Fijo anual ${a.anguloAnual}°`, xTexto: 5.5 }],
  });

  $('t-curva-mes').textContent = `Energía según la inclinación en ${MESES_LARGO[i].toLowerCase()}`;
  grafica($('g-inclinacion'), {
    titulo: `Energía contra inclinación en ${MESES_LARGO[i]}`,
    xmin: 0, xmax: 90, ymin: 0, ymax: Math.ceil(Math.max(...m.curva) + 0.5),
    xlabel: 'Inclinación del panel (°)', ylabel: 'kWh/m²·día',
    series: [{ x: a.angulos, y: m.curva, clase: 'azul' }],
    puntos: [{ x: m.anguloOptimo, y: m.hOptimo, texto: `Óptimo ${m.anguloOptimo}° · ${fmt(m.hOptimo, 2)}` }],
  });

  // Condiciones típicas al mediodía del mes, con el ángulo óptimo.
  const G = Math.min(1200, Math.round((m.fMediodia * m.hOptimo * 1000) / 10) * 10);
  $('r-g').value = G;
  $('r-t').value = Math.round(m.tMax * 2) / 2;
  $('mes-curvas').textContent = `${MESES_LARGO[i]} · ${m.anguloOptimo}°`;
  pintarCurvas();
}

// ---------- Módulo y curvas ----------

function pintarSelectModulo() {
  $('sel-modulo').innerHTML = MODULOS.map((m) =>
    `<option value="${m.id}"${m.id === estado.modulo.id ? ' selected' : ''}>${m.nombre}</option>`).join('');
}

function pintarCamposModulo() {
  $('campos-modulo').innerHTML = CAMPOS_MODULO.map((c) => `
    <label>${c.etiqueta}${c.unidad ? ` (${c.unidad})` : ''}
      <input type="number" inputmode="decimal" step="${c.paso}" data-k="${c.k}" value="${estado.modulo[c.k]}">
    </label>`).join('');
}

function ajustar() {
  const errores = validarModulo(estado.modulo);
  $('errores-modulo').textContent = errores.join(' ');
  if (errores.length) { estado.modelo = null; return false; }
  estado.modelo = ajustarModelo(estado.modulo);
  return true;
}

function pintarCurvas() {
  const G = +$('r-g').value, Ta = +$('r-t').value;
  $('o-g').textContent = G;
  $('o-t').textContent = fmt(Ta, 1);
  const mod = estado.modelo;
  if (!mod || !estado.analisis) return;

  const Tc = temperaturaCelda(Ta, G, mod.noct);
  const c = curvas(mod, G, Tc);
  const stc = curvas(mod, 1000, 25);

  // Energía estimada del mes con las condiciones típicas (independiente de los controles).
  const m = estado.analisis.meses[estado.mes];
  const Gm = Math.max(50, m.fMediodia * m.hOptimo * 1000);
  const cm = curvas(mod, Gm, temperaturaCelda(m.tMax, Gm, mod.noct));
  const energiaMes = (cm.mpp.p / Gm) * m.hOptimo * DIAS_MES[estado.mes];

  $('kpis-pv').innerHTML =
    kpi(fmt(c.mpp.p, 1), 'W', 'Potencia máxima (Pmp)', true) +
    kpi(fmt(c.mpp.v, 2), 'V', 'Voltaje en Pmp (Vmp)') +
    kpi(fmt(c.mpp.i, 2), 'A', 'Corriente en Pmp (Imp)') +
    kpi(fmt(c.voc, 2), 'V', 'Circuito abierto (Voc)') +
    kpi(fmt(c.isc, 2), 'A', 'Cortocircuito (Isc)') +
    kpi(fmt(Tc, 1), '°C', 'Temperatura de la celda') +
    kpi(fmt(energiaMes, 1), 'kWh', `Energía estimada en ${MESES_LARGO[estado.mes].toLowerCase()} (1 módulo, ${m.anguloOptimo}°)`, true);

  const xmax = Math.ceil((mod.voc * 1.12) / 5) * 5;
  const comun = { xmin: 0, xmax, xlabel: 'Voltaje (V)' };
  grafica($('g-iv'), {
    ...comun, titulo: 'Curva corriente contra voltaje',
    ymin: 0, ymax: Math.ceil(mod.isc * 1.3), ylabel: 'Corriente (A)',
    series: [{ x: stc.V, y: stc.I, clase: 'ref' }, { x: c.V, y: c.I, clase: 'azul' }],
    puntos: [{ x: c.mpp.v, y: c.mpp.i, texto: `Pmp ${fmt(c.mpp.p, 0)} W`, abajo: true }],
  });
  grafica($('g-pv'), {
    ...comun, titulo: 'Curva potencia contra voltaje',
    ymin: 0, ymax: Math.ceil((mod.pmax * 1.25) / 10) * 10, ylabel: 'Potencia (W)',
    series: [{ x: stc.V, y: stc.P, clase: 'ref' }, { x: c.V, y: c.P, clase: 'naranja' }],
    puntos: [{ x: c.mpp.v, y: c.mpp.p, texto: `${fmt(c.mpp.p, 0)} W a ${fmt(c.mpp.v, 1)} V` }],
  });
}

// ---------- Arranque ----------

function iniciar() {
  const q = new URLSearchParams(location.search);
  const qlat = parseFloat(q.get('lat')), qlon = parseFloat(q.get('lon'));
  $('lat').value = Number.isFinite(qlat) ? qlat : CAMPO.lat;
  $('lon').value = Number.isFinite(qlon) ? qlon : CAMPO.lon;

  $('form-ubicacion').addEventListener('submit', (e) => { e.preventDefault(); calcular(); });
  $('btn-gps').addEventListener('click', usarGPS);
  $('btn-campo').addEventListener('click', () => {
    $('lat').value = CAMPO.lat; $('lon').value = CAMPO.lon; calcular();
  });

  const tbody = $('tabla-meses');
  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr) seleccionarMes(+tr.dataset.mes);
  });
  tbody.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleccionarMes(+tr.dataset.mes); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const sig = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
      if (sig) { sig.focus(); seleccionarMes(+sig.dataset.mes); }
    }
  });

  pintarSelectModulo();
  pintarCamposModulo();
  ajustar();
  $('sel-modulo').addEventListener('change', (e) => {
    estado.modulo = { ...MODULOS.find((m) => m.id === e.target.value) };
    pintarCamposModulo();
    if (ajustar()) pintarCurvas();
  });
  $('campos-modulo').addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    estado.modulo[k] = parseFloat(e.target.value);
    if (ajustar()) pintarCurvas();
  });
  $('btn-restaurar').addEventListener('click', () => {
    estado.modulo = { ...MODULOS.find((m) => m.id === estado.modulo.id) };
    pintarCamposModulo();
    if (ajustar()) pintarCurvas();
  });
  $('r-g').addEventListener('input', pintarCurvas);
  $('r-t').addEventListener('input', pintarCurvas);

  calcular();

  // Redibuja las gráficas al girar el teléfono o cambiar el tamaño de la ventana.
  let anchoPrevio = innerWidth, t;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (innerWidth !== anchoPrevio && estado.analisis) { anchoPrevio = innerWidth; seleccionarMes(estado.mes); }
    }, 150);
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo sin conexión */ });
  }
}

iniciar();
