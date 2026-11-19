import {
  MESES, MESES_LARGO, DIAS_MES, DIA_REPRESENTATIVO, analisisAngulos, datosCieloDespejado, declinacion,
  irradiacionInclinada, irradianciaInstante, posicionSol, salidaPuesta,
} from './solar.js';
import {
  MODULOS, CAMPOS_MODULO, ajustarModelo, curvas, potenciaMaxima, temperaturaCelda, validarModulo,
} from './pv.js';
import { grafica } from './grafica.js';
import { crearEscena3D, crearVistaLateral } from './escena.js';
import { crearModulo, distribucion } from './modulo.js';

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
  beta: 0,
  hora: 10,
  reproduciendo: false,
  modulo: { ...MODULOS[1] },
  modelo: null,
  perfil: null,
  perfilOptimo: null,
};

let escena, lateral, moduloVista, cursorDia = null;

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
  } catch {
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
  history.replaceState(null, '', `?${params}${location.hash}`);

  const boton = document.querySelector('#form-ubicacion .primario');
  boton.disabled = true;
  mostrarEstado('Consultando la radiación solar de NASA POWER…');
  const r = await obtenerDatos(c.lat, c.lon);
  boton.disabled = false;

  estado.analisis = analisisAngulos(r.datos, c.lat);
  mostrarEstado(`📍 ${fmt(c.lat, 4)}°, ${fmt(c.lon, 4)}° · Datos: ${r.fuente}.`, r.tipo);
  $('orientacion').textContent = c.lat >= 0 ? 'sur' : 'norte';
  for (const e of document.querySelectorAll('.rumbo-ecuador')) e.textContent = c.lat >= 0 ? 'sur' : 'norte';
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

// ---------- Utilidades de presentación ----------

function kpi(valor, unidad, texto, destacado = false) {
  return `<div class="kpi${destacado ? ' destacado' : ''}"><div class="v">${valor} <small>${unidad}</small></div><div class="k">${texto}</div></div>`;
}

function horaTexto(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${hh}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
}

function rumbo(az) {
  const r = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return r[Math.round(az / 45) % 8];
}

// ---------- Sección 2: el día del sol ----------

/** Potencia del panel a lo largo del día para el mes actual y una inclinación. */
function calcularPerfil(beta) {
  const a = estado.analisis, m = a.meses[estado.mes], n = DIA_REPRESENTATIVO[estado.mes];
  const { salida, puesta } = salidaPuesta(estado.lat, n);
  const paso = 0.1;
  const horas = [], g = [];
  for (let h = Math.ceil(salida / paso) * paso; h <= puesta; h += paso) {
    horas.push(h);
    g.push(irradianciaInstante(estado.lat, n, h, beta, m.H, m.Hd).gt);
  }
  // Ajuste para que la energía del día sea igual a la del modelo mensual (tabla).
  const total = g.reduce((s, x) => s + x * paso, 0);
  const objetivo = irradiacionInclinada(m.H, m.Hd, estado.lat, n, beta) * 1000;
  const factor = total > 0 ? objetivo / total : 0;
  const mod = estado.modelo;
  const G = g.map((x) => x * factor);
  const P = G.map((gi, i) => {
    if (!mod) return 0;
    const Ta = m.tProm + (m.tMax - m.tProm) * Math.cos((Math.PI * (horas[i] - 15)) / 12);
    return potenciaMaxima(mod, gi, temperaturaCelda(Ta, gi, mod.noct));
  });
  const energia = P.reduce((s, p) => s + p * paso, 0) / 1000; // kWh
  return { beta, horas, G, P, factor, energia, salida, puesta, paso };
}

function interpolar(perfil, h, clave) {
  const { horas } = perfil;
  if (!horas.length || h < horas[0] || h > horas[horas.length - 1]) return 0;
  const i = Math.min(horas.length - 2, Math.floor((h - horas[0]) / perfil.paso));
  const t = (h - horas[i]) / perfil.paso;
  return perfil[clave][i] * (1 - t) + perfil[clave][i + 1] * t;
}

function prepararDia() {
  const a = estado.analisis;
  if (!a || !estado.modelo) return;
  const n = DIA_REPRESENTATIVO[estado.mes];
  const m = a.meses[estado.mes];
  estado.perfil = calcularPerfil(estado.beta);
  estado.perfilOptimo = estado.beta === m.anguloOptimo ? estado.perfil : calcularPerfil(m.anguloOptimo);

  // Recorrido del sol para dibujar el arco y las horas.
  const { salida, puesta } = estado.perfil;
  const trayectoria = [];
  for (let h = salida - 0.4; h <= puesta + 0.4; h += 0.2) trayectoria.push(posicionSol(estado.lat, n, h).vector);
  const horas = [6, 8, 10, 12, 14, 16, 18].filter((h) => h > salida + 0.2 && h < puesta - 0.2)
    .map((h) => ({ hora: h, v: posicionSol(estado.lat, n, h).vector }));
  const d = distribucion(estado.modulo.ns);
  // En la escena el panel está acostado de lado (horizontal): columnas a lo ancho.
  escena.construir({ lat: estado.lat, beta: estado.beta, trayectoria, horas, columnas: d.filas, filas: d.columnas });

  $('r-hora').min = Math.floor(salida - 0.5);
  $('r-hora').max = Math.ceil(puesta + 0.5);
  pintarGraficaDia();
  pintarReto();
  dibujarHora();
}

function pintarGraficaDia() {
  const p = estado.perfil, po = estado.perfilOptimo;
  const xmin = Math.floor(p.salida - 0.5), xmax = Math.ceil(p.puesta + 0.5);
  const ymax = Math.ceil((Math.max(estado.modelo.pmax * 0.8, ...po.P, ...p.P) * 1.1) / 50) * 50;
  const series = [];
  if (po !== p) series.push({ x: po.horas, y: po.P, clase: 'ref' });
  series.push({ x: p.horas, y: p.P, clase: 'naranja' });
  const g = grafica($('g-dia'), {
    titulo: 'Potencia del panel durante el día',
    xmin, xmax, ymin: 0, ymax, xlabel: 'Hora solar', ylabel: 'Potencia (W)', series,
  });
  // Cursor que sigue a la hora actual.
  const NS = 'http://www.w3.org/2000/svg';
  const linea = document.createElementNS(NS, 'line');
  linea.setAttribute('class', 'cursor-dia');
  const punto = document.createElementNS(NS, 'circle');
  punto.setAttribute('r', 6);
  punto.setAttribute('class', 'punto');
  g.svg.append(linea, punto);
  cursorDia = { ...g, linea, punto, ymin: 0 };
}

function pintarReto() {
  const p = estado.perfil, po = estado.perfilOptimo;
  const m = estado.analisis.meses[estado.mes];
  const pct = po.energia > 0 ? (p.energia / po.energia) * 100 : 0;
  let msg;
  if (Math.abs(estado.beta - m.anguloOptimo) <= 1) msg = '🎯 ¡Ese es el ángulo óptimo del mes!';
  else if (pct >= 99) msg = '👏 ¡Muy cerca! Casi la misma energía que el óptimo.';
  else msg = estado.beta < m.anguloOptimo ? '⬆️ Prueba a inclinarlo <b>más</b>.' : '⬇️ Prueba a inclinarlo <b>menos</b>.';
  $('reto').innerHTML = `
    <div class="reto-titulo">🏆 Reto: encuentra la inclinación que da más energía en ${MESES_LARGO[estado.mes].toLowerCase()}</div>
    <div class="reto-barra"><span style="width:${Math.min(100, pct).toFixed(1)}%"></span></div>
    <div class="reto-datos">
      <span>Con ${estado.beta}°: <b>${fmt(p.energia, 2)} kWh/día</b></span>
      <span>${fmt(pct, 1)}% del máximo</span>
    </div>
    <div class="reto-msg">${msg}</div>`;
}

function dibujarHora() {
  const a = estado.analisis;
  if (!a || !estado.perfil) return;
  const n = DIA_REPRESENTATIVO[estado.mes], m = a.meses[estado.mes];
  const h = estado.hora;
  const r = irradianciaInstante(estado.lat, n, h, estado.beta, m.H, m.Hd);
  const G = r.gt * estado.perfil.factor;
  const P = interpolar(estado.perfil, h, 'P');
  // Energía acumulada desde la salida del sol hasta esta hora.
  const { horas, paso } = estado.perfil;
  let acumulada = 0;
  for (let i = 0; i < horas.length && horas[i] <= h; i++) acumulada += estado.perfil.P[i] * paso;

  escena.actualizar({ v: r.vector, elevacion: r.elevacion, cosTheta: r.cosTheta, incidencia: r.incidencia, gt: G });
  $('o-hora').textContent = horaTexto(h);
  $('r-hora').value = h;
  $('hud-hora').textContent = `🕒 ${horaTexto(h)}`;
  $('hud-g').textContent = r.elevacion > 0 ? `☀️ ${fmt(G, 0)} W/m²` : '🌙';
  const deDia = r.elevacion > 0;
  $('lecturas').innerHTML =
    kpi(deDia ? `${fmt(r.elevacion, 0)}°` : '—', '', 'Altura del sol α') +
    kpi(deDia ? rumbo(r.azimut) : '—', deDia ? `${fmt(r.azimut, 0)}°` : '', 'Dirección del sol') +
    kpi(deDia && r.cosTheta > 0 ? `${fmt(r.incidencia, 0)}°` : '—', '', 'Incidencia θ') +
    kpi(fmt(G, 0), 'W/m²', 'Sol sobre el panel') +
    kpi(fmt(P, 0), 'W', 'Potencia del panel', true) +
    kpi(fmt(acumulada / 1000, 2), 'kWh', 'Energía acumulada');

  if (cursorDia) {
    const x = cursorDia.sx(Math.min(Math.max(h, +$('r-hora').min), +$('r-hora').max));
    cursorDia.linea.setAttribute('x1', x); cursorDia.linea.setAttribute('x2', x);
    cursorDia.linea.setAttribute('y1', cursorDia.m.t); cursorDia.linea.setAttribute('y2', cursorDia.H - cursorDia.m.b);
    cursorDia.punto.setAttribute('cx', x); cursorDia.punto.setAttribute('cy', cursorDia.sy(P));
    cursorDia.punto.style.opacity = P > 0 ? 1 : 0;
  }
}

let ultimoCuadro = 0;
function animar(t) {
  if (!estado.reproduciendo) return;
  const dt = ultimoCuadro ? Math.min(0.1, (t - ultimoCuadro) / 1000) : 0;
  ultimoCuadro = t;
  const min = +$('r-hora').min, max = +$('r-hora').max;
  estado.hora += dt * ((max - min) / 14); // un día completo en ~14 s
  if (estado.hora > max) estado.hora = min;
  dibujarHora();
  requestAnimationFrame(animar);
}

function reproducir(si) {
  estado.reproduciendo = si;
  const b = $('btn-play');
  b.textContent = si ? '❚❚' : '▶';
  b.setAttribute('aria-label', si ? 'Pausar' : 'Reproducir el día');
  if (si) { ultimoCuadro = 0; requestAnimationFrame(animar); }
}

function cambiarBeta(beta) {
  estado.beta = Math.round(beta);
  $('r-beta').value = estado.beta;
  $('o-beta').textContent = estado.beta;
  prepararDia();
}

// ---------- Sección 3: vista lateral ----------

function pintarLateral(animar = true) {
  const a = estado.analisis, m = a.meses[estado.mes];
  const n = DIA_REPRESENTATIVO[estado.mes];
  const sur = estado.lat < 0;
  const L = Math.abs(estado.lat), d = declinacion(n) * (sur ? -1 : 1);
  const alfa = 90 - (L - d); // altura del sol al mediodía (puede pasar de 90° en los trópicos)
  const beta = Math.max(0, Math.min(90, 90 - alfa));
  lateral.actualizar({ alfa, beta, sur }, { animar });
  $('o-mes').textContent = MESES_LARGO[estado.mes];
  $('r-mes').value = estado.mes;
  const alfaTxt = alfa > 90 ? `${fmt(180 - alfa, 0)}° del lado contrario (¡pasa del cenit!)` : `${fmt(alfa, 0)}°`;
  $('texto-lateral').innerHTML =
    `En <b>${MESES_LARGO[estado.mes].toLowerCase()}</b>, al mediodía el sol sube <b>α = ${alfaTxt}</b> sobre el horizonte. ` +
    `Para que los rayos lleguen perpendiculares el panel se inclina <b>β = ${fmt(beta, 0)}°</b>. ` +
    `Considerando todo el día y la luz difusa, el óptimo del mes es <b>${m.anguloOptimo}°</b>.`;
}

// ---------- Sección 4: resumen y tabla ----------

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
  $('tabla-meses').innerHTML = a.meses.map((m, i) => `
    <tr tabindex="0" data-mes="${i}" aria-selected="false">
      <td><span class="largo">${MESES_LARGO[i]}</span><span class="corto">${MESES[i]}</span>${i === hoy ? '<span class="hoy" title="Mes actual">●</span>' : ''}</td>
      <td class="ang">${m.anguloOptimo}°</td>
      <td>${fmt(m.hOptimo, 2)}</td>
      <td>${fmt(m.hHorizontal, 2)}</td>
      <td class="gan">+${fmt(m.ganancia * 100, 0)}%</td>
    </tr>`).join('');
  $('tabla-meses').parentElement.querySelector('tfoot')?.remove();
  $('tabla-meses').insertAdjacentHTML('afterend', `
    <tfoot><tr>
      <td>Fijo anual</td><td class="ang">${a.anguloAnual}°</td>
      <td>${fmt(a.anual.fijo / 365, 2)}</td><td>${fmt(a.anual.horizontal / 365, 2)}</td>
      <td class="gan">+${fmt((a.anual.fijo / a.anual.horizontal - 1) * 100, 0)}%</td>
    </tr></tfoot>`);
}

function pintarGraficasMes() {
  const a = estado.analisis, i = estado.mes, m = a.meses[i];
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
}

// ---------- Selección de mes (sincroniza todas las secciones) ----------

function seleccionarMes(i) {
  estado.mes = i;
  const a = estado.analisis, m = a.meses[i];
  for (const b of $('meses').children) b.setAttribute('aria-pressed', String(+b.dataset.mes === i));
  for (const tr of $('tabla-meses').rows) tr.setAttribute('aria-selected', String(+tr.dataset.mes === i));

  pintarGraficasMes();
  pintarLateral();

  // Condiciones típicas al mediodía para la sección del panel.
  const G = Math.min(1200, Math.round((m.fMediodia * m.hOptimo * 1000) / 10) * 10);
  $('r-g').value = G;
  $('r-t').value = Math.round(m.tMax * 2) / 2;
  $('mes-curvas').textContent = `${MESES_LARGO[i]} · mediodía`;
  pintarCurvas();

  // La escena arranca con el ángulo óptimo del mes.
  cambiarBeta(m.anguloOptimo);
}

// ---------- Sección 5: módulo y curvas ----------

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

function moduloCambiado() {
  if (!ajustar()) return;
  pintarCurvas();
  if (estado.analisis) prepararDia();
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

  moduloVista.actualizar({ ns: mod.ns, G, Tc, V: c.mpp.v, I: c.mpp.i, P: c.mpp.p, pmax: mod.pmax, verSerie: $('chk-serie').checked });

  $('kpis-pv').innerHTML =
    kpi(fmt(c.mpp.p, 1), 'W', 'Potencia máxima (Pmp)', true) +
    kpi(fmt(c.mpp.v, 2), 'V', 'Voltaje en Pmp (Vmp)') +
    kpi(fmt(c.mpp.i, 2), 'A', 'Corriente en Pmp (Imp)') +
    kpi(fmt(c.voc, 2), 'V', 'Circuito abierto (Voc)') +
    kpi(fmt(c.isc, 2), 'A', 'Cortocircuito (Isc)') +
    kpi(fmt(Tc, 1), '°C', 'Temperatura de la celda') +
    kpi(fmt(energiaMes, 1), 'kWh', `Energía en ${MESES_LARGO[estado.mes].toLowerCase()} (1 módulo, ${m.anguloOptimo}°)`, true);

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
  escena = crearEscena3D($('escena'));
  lateral = crearVistaLateral($('lateral'));
  moduloVista = crearModulo($('modulo'));

  const q = new URLSearchParams(location.search);
  const qlat = parseFloat(q.get('lat')), qlon = parseFloat(q.get('lon'));
  $('lat').value = Number.isFinite(qlat) ? qlat : CAMPO.lat;
  $('lon').value = Number.isFinite(qlon) ? qlon : CAMPO.lon;

  $('form-ubicacion').addEventListener('submit', (e) => { e.preventDefault(); calcular(); });
  $('btn-gps').addEventListener('click', usarGPS);
  $('btn-campo').addEventListener('click', () => {
    $('lat').value = CAMPO.lat; $('lon').value = CAMPO.lon; calcular();
  });

  // Botones de mes
  $('meses').innerHTML = MESES.map((m, i) =>
    `<button type="button" data-mes="${i}" aria-pressed="false">${m}</button>`).join('');
  $('meses').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && estado.analisis) seleccionarMes(+b.dataset.mes);
  });
  $('r-mes').addEventListener('input', (e) => { if (estado.analisis) seleccionarMes(+e.target.value); });

  // Reproductor del día
  $('btn-play').addEventListener('click', () => reproducir(!estado.reproduciendo));
  $('r-hora').addEventListener('input', (e) => { reproducir(false); estado.hora = +e.target.value; dibujarHora(); });
  $('r-beta').addEventListener('input', (e) => cambiarBeta(+e.target.value));
  $('btn-optimo').addEventListener('click', () => cambiarBeta(estado.analisis.meses[estado.mes].anguloOptimo));
  $('btn-plano').addEventListener('click', () => cambiarBeta(0));

  // Tabla
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

  // Módulo
  pintarSelectModulo();
  pintarCamposModulo();
  ajustar();
  $('sel-modulo').addEventListener('change', (e) => {
    estado.modulo = { ...MODULOS.find((m) => m.id === e.target.value) };
    pintarCamposModulo();
    moduloCambiado();
  });
  $('campos-modulo').addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    estado.modulo[k] = parseFloat(e.target.value);
    moduloCambiado();
  });
  $('btn-restaurar').addEventListener('click', () => {
    estado.modulo = { ...MODULOS.find((m) => m.id === estado.modulo.id) };
    pintarCamposModulo();
    moduloCambiado();
  });
  $('r-g').addEventListener('input', pintarCurvas);
  $('r-t').addEventListener('input', pintarCurvas);
  $('chk-serie').addEventListener('change', pintarCurvas);

  calcular().then(() => {
    // La animación es parte central de la explicación: arranca sola en todos los dispositivos.
    reproducir(true);
  });

  // Redibuja las gráficas al girar el teléfono o cambiar el tamaño de la ventana.
  let anchoPrevio = innerWidth, t;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (innerWidth !== anchoPrevio && estado.analisis) {
        anchoPrevio = innerWidth;
        pintarGraficasMes(); pintarCurvas(); pintarGraficaDia(); dibujarHora();
      }
    }, 150);
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    // Si había una versión anterior instalada, recarga una vez cuando llegue la nueva.
    const habiaVersion = !!navigator.serviceWorker.controller;
    let recargado = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (habiaVersion && !recargado) { recargado = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { /* sin modo sin conexión */ });
  }
}

iniciar();
