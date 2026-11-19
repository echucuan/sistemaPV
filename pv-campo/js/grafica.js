// Gráficas SVG ligeras (sin dependencias) que se adaptan al ancho del contenedor.
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, padre) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (padre) padre.appendChild(e);
  return e;
}

function pasoBonito(rango, n = 5) {
  const crudo = rango / n;
  const mag = 10 ** Math.floor(Math.log10(crudo || 1));
  const r = crudo / mag;
  return (r >= 5 ? 10 : r >= 2 ? 5 : r >= 1 ? 2 : 1) * mag;
}

function marcas(min, max, n) {
  const paso = pasoBonito(max - min, n);
  const out = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max + paso * 1e-6; v += paso) out.push(+v.toFixed(10));
  return out;
}

/**
 * Dibuja una gráfica XY.
 * opciones: { xmin, xmax, ymin, ymax, xlabel, ylabel, series: [{ x, y, clase, tipo: 'linea'|'barras' }],
 *             puntos: [{ x, y, clase, texto }], lineasH: [{ y, clase, texto }], xEtiquetas: [..] }
 */
export function grafica(contenedor, o) {
  // Se dibuja al tamaño real del contenedor para que el texto se lea bien en el celular.
  const W = Math.max(280, Math.round(contenedor.clientWidth || 640));
  const H = Math.round(Math.min(320, Math.max(230, W * 0.62)));
  const m = { l: 48, r: 12, t: 16, b: 44 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const sx = (x) => m.l + ((x - o.xmin) / (o.xmax - o.xmin)) * pw;
  const sy = (y) => m.t + ph - ((y - o.ymin) / (o.ymax - o.ymin)) * ph;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'grafica', role: 'img', 'aria-label': o.titulo || '' });

  // Rejilla y ejes
  const g = el('g', { class: 'rejilla' }, svg);
  for (const y of marcas(o.ymin, o.ymax, 5)) {
    el('line', { x1: m.l, x2: W - m.r, y1: sy(y), y2: sy(y) }, g);
    el('text', { x: m.l - 6, y: sy(y) + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = y;
  }
  if (o.xEtiquetas) {
    // En pantallas angostas se usa solo la inicial del mes.
    const corto = pw / o.xEtiquetas.length < 30;
    o.xEtiquetas.forEach((t0, i) => {
      const t = corto ? t0[0] : t0;
      el('text', { x: sx(i), y: H - m.b + 18, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = t;
    });
  } else {
    for (const x of marcas(o.xmin, o.xmax, 6)) {
      el('line', { x1: sx(x), x2: sx(x), y1: m.t, y2: m.t + ph }, g);
      el('text', { x: sx(x), y: H - m.b + 18, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = x;
    }
  }
  el('line', { x1: m.l, x2: W - m.r, y1: sy(o.ymin), y2: sy(o.ymin), class: 'eje' }, svg);
  el('text', { x: m.l + pw / 2, y: H - 6, 'text-anchor': 'middle', class: 'etiqueta' }, svg).textContent = o.xlabel || '';
  const yl = el('text', { x: 14, y: m.t + ph / 2, 'text-anchor': 'middle', class: 'etiqueta',
    transform: `rotate(-90 14 ${m.t + ph / 2})` }, svg);
  yl.textContent = o.ylabel || '';

  for (const s of o.series || []) {
    if (s.tipo === 'barras') {
      const ancho = (pw / (o.xmax - o.xmin + 1)) * 0.62;
      s.x.forEach((x, i) => {
        const y0 = sy(Math.max(o.ymin, 0)), y1 = sy(s.y[i]);
        el('rect', { x: sx(x) - ancho / 2, y: Math.min(y0, y1), width: ancho, height: Math.max(1.5, Math.abs(y0 - y1)),
          rx: 3, class: `${s.clase || ''} ${s.resaltar === i ? 'activo' : ''}` }, svg);
        if (s.valores) {
          el('text', { x: sx(x), y: Math.min(y0, y1) - 5, 'text-anchor': 'middle', class: 'valor' }, svg).textContent = s.valores[i];
        }
      });
    } else {
      const d = s.x.map((x, i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(s.y[i]).toFixed(1)}`).join('');
      el('path', { d, class: `linea ${s.clase || ''}` }, svg);
    }
  }
  for (const l of o.lineasH || []) {
    el('line', { x1: m.l, x2: W - m.r, y1: sy(l.y), y2: sy(l.y), class: `lineaH ${l.clase || ''}` }, svg);
    if (l.texto) {
      const enX = l.xTexto !== undefined;
      el('text', { x: enX ? sx(l.xTexto) : W - m.r - 4, y: sy(l.y) - 6, 'text-anchor': enX ? 'middle' : 'end',
        class: `nota ${l.clase || ''}` }, svg).textContent = l.texto;
    }
  }
  for (const p of o.puntos || []) {
    el('circle', { cx: sx(p.x), cy: sy(p.y), r: 6, class: `punto ${p.clase || ''}` }, svg);
    if (p.texto) {
      const derecha = sx(p.x) > m.l + pw * 0.45;
      el('text', { x: sx(p.x) + (derecha ? -10 : 10), y: sy(p.y) + (p.abajo ? 22 : -10), 'text-anchor': derecha ? 'end' : 'start',
        class: `nota ${p.clase || ''}` }, svg).textContent = p.texto;
    }
  }
  contenedor.replaceChildren(svg);
  return { svg, sx, sy, m, W, H };
}
