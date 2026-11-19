// Modelo de un diodo para módulos fotovoltaicos.
// Ajuste de parámetros a partir de la hoja de datos según Villalva, Gazoli y Filho (2009),
// "Comprehensive approach to modeling and simulation of photovoltaic arrays", IEEE TPEL.

const Q = 1.602176634e-19; // carga del electrón, C
const K = 1.380649e-23;    // constante de Boltzmann, J/K
const TN = 298.15;         // temperatura STC, K
const GN = 1000;           // irradiancia STC, W/m²

// Módulos genéricos de referencia (valores típicos de hojas de datos comerciales).
export const MODULOS = [
  { id: 'm100', nombre: 'Genérico 100 W · 36 celdas (laboratorio)',
    pmax: 100, voc: 22.0, isc: 5.90, vmp: 18.0, imp: 5.56, ns: 36, kv: -0.30, ki: 0.05, noct: 45 },
  { id: 'm450', nombre: 'Genérico 450 W · 144 medias celdas',
    pmax: 450, voc: 49.5, isc: 11.60, vmp: 41.5, imp: 10.85, ns: 72, kv: -0.27, ki: 0.048, noct: 45 },
  { id: 'm550', nombre: 'Genérico 550 W · 144 medias celdas',
    pmax: 550, voc: 49.9, isc: 14.00, vmp: 41.96, imp: 13.11, ns: 72, kv: -0.275, ki: 0.045, noct: 45 },
];

export const CAMPOS_MODULO = [
  { k: 'pmax', etiqueta: 'Pmáx', unidad: 'W', paso: 1 },
  { k: 'voc', etiqueta: 'Voc', unidad: 'V', paso: 0.1 },
  { k: 'isc', etiqueta: 'Isc', unidad: 'A', paso: 0.01 },
  { k: 'vmp', etiqueta: 'Vmp', unidad: 'V', paso: 0.1 },
  { k: 'imp', etiqueta: 'Imp', unidad: 'A', paso: 0.01 },
  { k: 'ns', etiqueta: 'Celdas en serie', unidad: '', paso: 1 },
  { k: 'kv', etiqueta: 'Coef. Voc', unidad: '%/°C', paso: 0.01 },
  { k: 'ki', etiqueta: 'Coef. Isc', unidad: '%/°C', paso: 0.001 },
  { k: 'noct', etiqueta: 'NOCT', unidad: '°C', paso: 1 },
];

/** Revisa que los datos de la hoja sean coherentes. Devuelve una lista de errores. */
export function validarModulo(m) {
  const e = [];
  for (const c of CAMPOS_MODULO) if (!Number.isFinite(m[c.k])) e.push(`${c.etiqueta} no es un número.`);
  if (e.length) return e;
  if (m.voc <= 0 || m.isc <= 0 || m.vmp <= 0 || m.imp <= 0) e.push('Voc, Isc, Vmp e Imp deben ser positivos.');
  if (m.vmp >= m.voc) e.push('Vmp debe ser menor que Voc.');
  if (m.imp >= m.isc) e.push('Imp debe ser menor que Isc.');
  if (m.ns < 1) e.push('El número de celdas debe ser al menos 1.');
  const ff = (m.vmp * m.imp) / (m.voc * m.isc);
  if (ff < 0.5 || ff > 0.9) e.push(`Factor de forma ${ff.toFixed(2)} fuera de rango (0.5–0.9): revisa los datos.`);
  return e;
}

/** Corriente para un voltaje dado (resuelve la ecuación implícita por bisección). */
function corriente(V, p) {
  const f = (I) => p.Ipv - p.I0 * (Math.exp((V + I * p.Rs) / p.aVt) - 1) - (V + I * p.Rs) / p.Rp - I;
  let lo = -p.Ipv - 1, hi = p.Ipv + 1e-9;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Parámetros del circuito equivalente en STC para unos Rs y factor de idealidad a. */
function parametrosSTC(m, Rs, a) {
  const aVt = (a * m.ns * K * TN) / Q;
  const I0 = m.isc / (Math.exp(m.voc / aVt) - 1);
  const ex = Math.exp((m.vmp + m.imp * Rs) / aVt);
  let Ipv = m.isc, Rp = Infinity;
  for (let i = 0; i < 30; i++) {
    const den = m.vmp * Ipv - m.vmp * I0 * ex + m.vmp * I0 - m.vmp * m.imp;
    Rp = den > 0 ? (m.vmp * (m.vmp + m.imp * Rs)) / den : Infinity;
    const nuevo = Number.isFinite(Rp) ? ((Rp + Rs) / Rp) * m.isc : m.isc;
    if (Math.abs(nuevo - Ipv) < 1e-12) { Ipv = nuevo; break; }
    Ipv = nuevo;
  }
  return { Ipv, I0, Rs, Rp, aVt };
}

/** Pendiente dI/dV de la curva en un punto (V, I). */
function pendiente(V, I, p) {
  const g = (p.I0 / p.aVt) * Math.exp((V + I * p.Rs) / p.aVt) + 1 / p.Rp;
  return -g / (1 + g * p.Rs);
}

/**
 * Ajusta Rs y Rp para que la curva pase por (Vmp, Imp) y que ese punto sea
 * el de máxima potencia (dP/dV = 0). Devuelve el modelo listo para simular.
 */
export function ajustarModelo(m) {
  // Se prefiere a = 1.3; si con ese valor los datos no tienen solución, se prueban otros.
  for (const a of [1.3, 1.2, 1.4, 1.1, 1.5, 1.0, 1.6, 1.7, 1.8, 1.9, 2.0]) {
    const r = ajustarConIdealidad(m, a);
    if (r.exacto) return r;
  }
  return ajustarConIdealidad(m, 1.3);
}

function ajustarConIdealidad(m, a) {
  // Por construcción la curva pasa por (Vmp, Imp); buscamos Rs tal que
  // dI/dV = −Imp/Vmp en ese punto (condición de máxima potencia).
  const h = (Rs) => {
    const p = parametrosSTC(m, Rs, a);
    if (!Number.isFinite(p.Rp) || p.Rp <= 0) return { p, val: NaN };
    return { p, val: pendiente(m.vmp, m.imp, p) + m.imp / m.vmp };
  };
  const RsMax = (m.voc - m.vmp) / m.imp;
  // Barrido grueso para encontrar el cambio de signo, luego bisección.
  let prev = h(0), lo = 0, hi = null;
  const N = 400;
  for (let i = 1; i <= N; i++) {
    const Rs = (RsMax * i) / N;
    const cur = h(Rs);
    if (Number.isNaN(cur.val)) break;
    if (!Number.isNaN(prev.val) && Math.sign(cur.val) !== Math.sign(prev.val)) { lo = (RsMax * (i - 1)) / N; hi = Rs; break; }
    prev = cur;
  }
  let p;
  if (hi === null) {
    // Sin cambio de signo: los datos no admiten Rs > 0; usamos Rs ≈ 0.
    p = parametrosSTC(m, 0, a);
  } else {
    const sLo = Math.sign(h(lo).val);
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(h(mid).val) === sLo) lo = mid; else hi = mid;
    }
    p = parametrosSTC(m, (lo + hi) / 2, a);
  }
  if (!Number.isFinite(p.Rp)) p.Rp = 1e6;
  return { ...m, a, IpvN: p.Ipv, Rs: p.Rs, Rp: p.Rp, exacto: hi !== null };
}

/** Parámetros del circuito para una irradiancia G (W/m²) y temperatura de celda Tc (°C). */
export function parametrosOperacion(mod, G, Tc) {
  const T = Tc + 273.15;
  const dT = T - TN;
  const KV = (mod.kv / 100) * mod.voc;
  const KI = (mod.ki / 100) * mod.isc;
  const aVt = (mod.a * mod.ns * K * T) / Q;
  return {
    Ipv: ((mod.IpvN + KI * dT) * G) / GN,
    I0: (mod.isc + KI * dT) / (Math.exp((mod.voc + KV * dT) / aVt) - 1),
    Rs: mod.Rs,
    Rp: mod.Rp,
    aVt,
  };
}

/** Temperatura de celda con el modelo NOCT. */
export function temperaturaCelda(Ta, G, noct) {
  return Ta + ((noct - 20) / 800) * G;
}

/** Curvas I-V y P-V completas y punto de máxima potencia. */
export function curvas(mod, G, Tc, puntos = 140) {
  if (G <= 0) return { V: [0], I: [0], P: [0], voc: 0, isc: 0, mpp: { v: 0, i: 0, p: 0 } };
  const p = parametrosOperacion(mod, G, Tc);
  // Voc: voltaje con corriente cero.
  let lo = 0, hi = mod.voc * 1.6;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (corriente(mid, p) > 0) lo = mid; else hi = mid;
  }
  const voc = (lo + hi) / 2;
  const V = [], I = [], P = [];
  for (let k = 0; k <= puntos; k++) {
    const v = (voc * k) / puntos;
    const i = Math.max(0, corriente(v, p));
    V.push(v); I.push(i); P.push(v * i);
  }
  // Máximo de potencia con búsqueda de sección áurea.
  const pot = (v) => v * corriente(v, p);
  const gr = (Math.sqrt(5) - 1) / 2;
  let a = 0, b = voc;
  let c = b - gr * (b - a), d = a + gr * (b - a);
  for (let k = 0; k < 80; k++) {
    if (pot(c) > pot(d)) b = d; else a = c;
    c = b - gr * (b - a); d = a + gr * (b - a);
  }
  const vm = (a + b) / 2, im = corriente(vm, p);
  return { V, I, P, voc, isc: corriente(0, p), mpp: { v: vm, i: im, p: vm * im } };
}
