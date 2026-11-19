// "Tu panel por dentro": el módulo visto de frente con sus celdas en serie,
// conectado a una carga. La corriente se dibuja como puntos que avanzan por el cable.
import { colorCelda } from './escena.js';

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, padre) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (padre) padre.appendChild(e);
  return e;
}

/** Distribución de celdas en el módulo (columnas × filas) y si son medias celdas. */
export function distribucion(ns) {
  if (ns === 72) return { columnas: 6, filas: 12, medias: true };
  if (ns === 60) return { columnas: 6, filas: 10, medias: false };
  if (ns === 36) return { columnas: 4, filas: 9, medias: false };
  const columnas = Math.max(1, Math.round(Math.sqrt(ns / 2)));
  return { columnas, filas: Math.ceil(ns / columnas), medias: false };
}

export function crearModulo(contenedor) {
  const W = 400, H = 344;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'modulo', role: 'img' });
  const capaPanel = el('g', {}, svg);
  const calor = el('rect', { class: 'mod-calor', rx: 6 }, svg);
  const serie = el('path', { class: 'mod-serie' }, svg);
  const cable = el('path', { class: 'mod-cable' }, svg);
  const flujo = el('path', { class: 'mod-flujo' }, svg);
  const foco = el('g', { class: 'mod-foco' }, svg);
  const textos = el('g', { class: 'mod-textos' }, svg);
  contenedor.replaceChildren(svg);

  let celdas = [], clave = '', desfase = 0, velocidad = 0, ultimo = 0, anim = 0;
  const caja = { x: 22, y: 18, w: 168, h: 296 };

  function construir(ns) {
    const d = distribucion(ns);
    const k = `${ns}`;
    if (k === clave) return;
    clave = k;
    capaPanel.replaceChildren();
    el('rect', { x: caja.x - 6, y: caja.y - 6, width: caja.w + 12, height: caja.h + 12, rx: 8, class: 'mod-marco' }, capaPanel);
    celdas = [];
    const cw = caja.w / d.columnas, ch = caja.h / d.filas, g = 2;
    for (let i = 0; i < d.columnas; i++) {
      for (let j = 0; j < d.filas; j++) {
        const x = caja.x + i * cw, y = caja.y + j * ch;
        const c = el('rect', { x: x + g / 2, y: y + g / 2, width: cw - g, height: ch - g, rx: 1.5 }, capaPanel);
        celdas.push(c);
        if (d.medias) el('line', { x1: x + g, x2: x + cw - g, y1: y + ch / 2, y2: y + ch / 2, class: 'mod-corte' }, capaPanel);
        // Barras colectoras (busbars) en cada celda.
        for (const f of [0.3, 0.7]) el('line', { x1: x + cw * f, x2: x + cw * f, y1: y + g, y2: y + ch - g, class: 'mod-bus' }, capaPanel);
      }
    }
    // Camino en serie: sube y baja por las columnas (serpentina).
    let dd = '';
    for (let i = 0; i < d.columnas; i++) {
      const x = caja.x + (i + 0.5) * cw;
      const [y1, y2] = i % 2 ? [caja.y + caja.h - ch / 2, caja.y + ch / 2] : [caja.y + ch / 2, caja.y + caja.h - ch / 2];
      dd += `${i ? 'L' : 'M'}${x},${y1} L${x},${y2} `;
    }
    serie.setAttribute('d', dd);
    set(calor, { x: caja.x, y: caja.y, width: caja.w, height: caja.h });

    // Caja de conexiones arriba y cable hasta el foco (la carga).
    const jx = caja.x + caja.w / 2, jy = caja.y - 6;
    const fx = 320, fy = 100;
    const bx = caja.x + caja.w + 6;
    // Positivo: de la caja de conexiones al foco. Negativo: del foco de regreso al costado del módulo.
    cable.setAttribute('d', `M${jx},${jy} L${jx},6 L${fx},6 L${fx},${fy - 34} ` +
      `M${fx},${fy + 36} L${fx},${fy + 58} L230,${fy + 58} L230,250 L${bx},250`);
    flujo.setAttribute('d', cable.getAttribute('d'));
    foco.replaceChildren();
    el('text', { x: jx + 8, y: 28, class: 'mod-polo' }, foco).textContent = '+';
    el('text', { x: bx + 6, y: 244, class: 'mod-polo' }, foco).textContent = '−';
    el('circle', { cx: fx, cy: fy, r: 46, class: 'mod-resplandor' }, foco);
    el('path', { d: `M${fx - 16},${fy + 22} C${fx - 30},${fy} ${fx - 26},${fy - 34} ${fx},${fy - 34} C${fx + 26},${fy - 34} ${fx + 30},${fy} ${fx + 16},${fy + 22} Z`, class: 'mod-bulbo' }, foco);
    el('rect', { x: fx - 13, y: fy + 22, width: 26, height: 14, rx: 3, class: 'mod-rosca' }, foco);
    el('path', { d: `M${fx - 8},${fy + 4} l5,-12 l6,12 l5,-12`, class: 'mod-filamento' }, foco);
  }

  const set = (e, a) => { for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); };

  function actualizar({ ns, G, Tc, V, I, P, pmax, verSerie }) {
    construir(ns);
    const color = colorCelda(G);
    for (const c of celdas) c.setAttribute('fill', color);
    set(calor, { opacity: Math.max(0, Math.min(0.28, (Tc - 30) / 150)) });
    serie.style.opacity = verSerie ? 1 : 0;
    const k = Math.max(0, Math.min(1, P / pmax));
    foco.style.setProperty('--brillo', k.toFixed(3));
    velocidad = I; // px/s proporcional a la corriente

    textos.replaceChildren();
    const linea = (x, y, t, cls = '') => { el('text', { x, y, class: cls, 'text-anchor': 'middle' }, textos).textContent = t; };
    linea(320, 214, `${V.toFixed(1)} V`, 'mod-v');
    linea(320, 238, `${I.toFixed(2)} A`, 'mod-i');
    linea(320, 268, `${P.toFixed(0)} W`, 'mod-p');
    linea(caja.x + caja.w / 2, H - 4, `${ns} celdas en serie × ${(V / ns).toFixed(2)} V`, 'mod-nota');
    if (!anim) anim = requestAnimationFrame(mover);
  }

  // La animación de la corriente: los puntos avanzan más rápido con más amperes.
  function mover(t) {
    const dt = ultimo ? Math.min(0.1, (t - ultimo) / 1000) : 0;
    ultimo = t;
    desfase -= dt * velocidad * 9;
    flujo.style.strokeDashoffset = desfase.toFixed(1);
    flujo.style.opacity = velocidad > 0.05 ? 1 : 0;
    anim = svg.isConnected ? requestAnimationFrame(mover) : 0;
  }

  return { actualizar };
}
