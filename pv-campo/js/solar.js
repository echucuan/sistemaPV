// Modelos de radiación solar mensual (Duffie & Beckman, "Solar Engineering of Thermal Processes").
// Todas las energías en kWh/m²·día. Ángulos de entrada en grados.

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// Día "promedio" de cada mes recomendado por Klein (1977).
export const DIA_REPRESENTATIVO = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];

const GSC = 1367; // constante solar, W/m²
const rad = (g) => (g * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Declinación solar (Cooper), en grados, para el día n del año. */
export function declinacion(n) {
  return 23.45 * Math.sin(rad((360 * (284 + n)) / 365));
}

/** Ángulo horario de puesta del sol sobre superficie horizontal (grados). */
export function anguloPuesta(lat, dec) {
  return deg(Math.acos(clamp(-Math.tan(rad(lat)) * Math.tan(rad(dec)), -1, 1)));
}

/** Irradiación extraterrestre diaria sobre plano horizontal, H0 (kWh/m²·día). */
export function irradiacionExtraterrestre(lat, n) {
  const dec = declinacion(n);
  const ws = anguloPuesta(lat, dec);
  const phi = rad(lat), d = rad(dec);
  const h0 = ((24 * 3600 * GSC) / Math.PI) * (1 + 0.033 * Math.cos(rad((360 * n) / 365))) *
    (Math.cos(phi) * Math.cos(d) * Math.sin(rad(ws)) + rad(ws) * Math.sin(phi) * Math.sin(d));
  return Math.max(0, h0 / 3.6e6);
}

/**
 * Factor geométrico Rb para un plano inclinado β orientado hacia el ecuador
 * (al sur en el hemisferio norte, al norte en el sur).
 */
export function factorRb(lat, n, beta) {
  // Por simetría, el hemisferio sur se resuelve invirtiendo latitud y declinación.
  const sgn = lat >= 0 ? 1 : -1;
  const L = lat * sgn;
  const dec = declinacion(n) * sgn;
  const ws = anguloPuesta(L, dec);
  const wsT = Math.min(ws, anguloPuesta(L - beta, dec));
  const phi = rad(L), d = rad(dec), pb = rad(L - beta);
  const num = Math.cos(pb) * Math.cos(d) * Math.sin(rad(wsT)) + rad(wsT) * Math.sin(pb) * Math.sin(d);
  const den = Math.cos(phi) * Math.cos(d) * Math.sin(rad(ws)) + rad(ws) * Math.sin(phi) * Math.sin(d);
  return den > 0 ? Math.max(0, num / den) : 0;
}

/**
 * Irradiación diaria promedio sobre plano inclinado (modelo isotrópico Liu–Jordan).
 * H: global horizontal, Hd: difusa horizontal (kWh/m²·día), rho: albedo del suelo.
 */
export function irradiacionInclinada(H, Hd, lat, n, beta, rho = 0.2) {
  const b = rad(beta);
  const Rb = factorRb(lat, n, beta);
  return (H - Hd) * Rb + Hd * (1 + Math.cos(b)) / 2 + H * rho * (1 - Math.cos(b)) / 2;
}

/** Fracción difusa mensual a partir del índice de claridad KT (Erbs et al., 1982). */
export function fraccionDifusa(KT, ws) {
  return ws <= 81.4
    ? 1.391 - 3.560 * KT + 4.189 * KT ** 2 - 2.137 * KT ** 3
    : 1.311 - 3.022 * KT + 3.427 * KT ** 2 - 1.821 * KT ** 3;
}

/**
 * Datos de respaldo sin internet: cielo despejado con índice de claridad fijo.
 * Sobreestima la radiación real (no considera nubes ni temporada de lluvias).
 */
export function datosCieloDespejado(lat, KT = 0.72) {
  return DIA_REPRESENTATIVO.map((n) => {
    const H0 = irradiacionExtraterrestre(lat, n);
    const H = KT * H0;
    const ws = anguloPuesta(lat, declinacion(n));
    return { H, Hd: H * fraccionDifusa(KT, ws), tProm: 25, tMax: 32 };
  });
}

/**
 * Fracción de la irradiación diaria que llega en la hora del mediodía solar
 * (Collares-Pereira & Rabl). Sirve para estimar la irradiancia "pico" del mes.
 */
export function fraccionMediodia(lat, n) {
  const ws = anguloPuesta(lat, declinacion(n));
  const a = 0.409 + 0.5016 * Math.sin(rad(ws - 60));
  const b = 0.6609 - 0.4767 * Math.sin(rad(ws - 60));
  const wsr = rad(ws);
  return (Math.PI / 24) * (a + b) * (1 - Math.cos(wsr)) / (Math.sin(wsr) - wsr * Math.cos(wsr));
}

/**
 * Calcula, mes a mes, la inclinación que maximiza la energía, además del ángulo
 * fijo anual óptimo. `datos` es un arreglo de 12 objetos { H, Hd, tProm, tMax }.
 */
export function analisisAngulos(datos, lat, { rho = 0.2, paso = 1 } = {}) {
  const angulos = [];
  for (let b = 0; b <= 90 + 1e-9; b += paso) angulos.push(Math.round(b * 10) / 10);

  // matriz[m][i] = irradiación diaria del mes m con la inclinación angulos[i]
  const matriz = datos.map((d, m) =>
    angulos.map((b) => irradiacionInclinada(d.H, d.Hd, lat, DIA_REPRESENTATIVO[m], b, rho)));

  // Ángulo fijo anual: maximiza la suma de energía de los 12 meses.
  let iAnual = 0, maxAnual = -Infinity;
  angulos.forEach((_, i) => {
    const total = matriz.reduce((s, fila, m) => s + fila[i] * DIAS_MES[m], 0);
    if (total > maxAnual) { maxAnual = total; iAnual = i; }
  });

  const meses = datos.map((d, m) => {
    const fila = matriz[m];
    let iOpt = 0;
    fila.forEach((v, i) => { if (v > fila[iOpt]) iOpt = i; });
    return {
      mes: m,
      anguloOptimo: angulos[iOpt],
      hOptimo: fila[iOpt],
      hHorizontal: d.H,
      hAnual: fila[iAnual],
      ganancia: d.H > 0 ? fila[iOpt] / d.H - 1 : 0,
      curva: fila, // energía vs. inclinación, para graficar
      fMediodia: fraccionMediodia(lat, DIA_REPRESENTATIVO[m]),
      ...d,
    };
  });

  const sum = (k) => meses.reduce((s, x, m) => s + x[k] * DIAS_MES[m], 0);
  return {
    angulos,
    meses,
    anguloAnual: angulos[iAnual],
    anual: {
      horizontal: sum('hHorizontal'),
      fijo: sum('hAnual'),
      mensual: sum('hOptimo'),
    },
  };
}

// ---------- Valores instantáneos (para la animación del día) ----------

/** Posición del sol para la hora solar `hora` (0–24) del día n. Ángulos en grados; azimut desde el norte, horario. */
export function posicionSol(lat, n, hora) {
  const d = rad(declinacion(n)), phi = rad(lat), w = rad(15 * (hora - 12));
  const sinEl = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(w);
  const el = Math.asin(clamp(sinEl, -1, 1));
  // Componentes en ejes Este, Norte, Arriba.
  const este = -Math.cos(d) * Math.sin(w);
  const norte = Math.cos(phi) * Math.sin(d) - Math.sin(phi) * Math.cos(d) * Math.cos(w);
  let az = deg(Math.atan2(este, norte));
  if (az < 0) az += 360;
  return { elevacion: deg(el), azimut: az, vector: [este, norte, sinEl] };
}

/** Horas solares de salida y puesta del sol. */
export function salidaPuesta(lat, n) {
  const ws = anguloPuesta(lat, declinacion(n)) / 15;
  return { salida: 12 - ws, puesta: 12 + ws };
}

/**
 * Irradiancias instantáneas (W/m²) a partir de la irradiación diaria del mes,
 * repartida en el día con las fracciones horarias de Collares-Pereira & Rabl (global) y Liu-Jordan (difusa).
 * El panel mira al ecuador con inclinación beta.
 */
export function irradianciaInstante(lat, n, hora, beta, H, Hd, rho = 0.2) {
  const ws = anguloPuesta(lat, declinacion(n));
  const wsr = rad(ws), w = rad(15 * (hora - 12));
  const sol = posicionSol(lat, n, hora);
  if (Math.abs(15 * (hora - 12)) >= ws || sol.elevacion <= 0) {
    return { ...sol, cosTheta: 0, incidencia: 90, gh: 0, gt: 0, gtDirecta: 0 };
  }
  const den = Math.sin(wsr) - wsr * Math.cos(wsr);
  const a = 0.409 + 0.5016 * Math.sin(wsr - Math.PI / 3);
  const b = 0.6609 - 0.4767 * Math.sin(wsr - Math.PI / 3);
  const rt = (Math.PI / 24) * (a + b * Math.cos(w)) * (Math.cos(w) - Math.cos(wsr)) / den;
  const rd = (Math.PI / 24) * (Math.cos(w) - Math.cos(wsr)) / den;
  const gh = Math.max(0, rt * H * 1000);
  const gd = Math.min(gh, Math.max(0, rd * Hd * 1000));
  // Normal del panel: hacia el ecuador e inclinada beta.
  const s = lat >= 0 ? -1 : 1;
  const nrm = [0, s * Math.sin(rad(beta)), Math.cos(rad(beta))];
  const v = sol.vector;
  const cosTheta = Math.max(0, nrm[0] * v[0] + nrm[1] * v[1] + nrm[2] * v[2]);
  const sinEl = Math.max(0.05, v[2]);
  const directa = Math.min((gh - gd) * (cosTheta / sinEl), (gh - gd) * 6);
  const gt = directa + gd * (1 + Math.cos(rad(beta))) / 2 + gh * rho * (1 - Math.cos(rad(beta))) / 2;
  return { ...sol, cosTheta, incidencia: deg(Math.acos(cosTheta)), gh, gt: Math.max(0, gt), gtDirecta: directa };
}
