// Escenas ilustradas en SVG: el cielo con el recorrido del sol y el panel (vista 3D),
// y la vista lateral al mediodía que explica la inclinación.
const NS = 'http://www.w3.org/2000/svg';
const rad = (g) => (g * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function el(tag, attrs = {}, padre) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (padre) padre.appendChild(e);
  return e;
}
const set = (e, attrs) => { for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); };
const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const mezcla = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// Colores del cielo según la altura del sol.
function colorCielo(elev) {
  const noche = [[12, 24, 52], [28, 48, 92]];
  const alba = [[70, 110, 170], [250, 170, 110]];
  const dia = [[70, 150, 220], [200, 230, 250]];
  if (elev <= -4) return noche;
  if (elev <= 6) { const t = (elev + 4) / 10; return [mezcla(noche[0], alba[0], t), mezcla(noche[1], alba[1], t)]; }
  if (elev <= 20) { const t = (elev - 6) / 14; return [mezcla(alba[0], dia[0], t), mezcla(alba[1], dia[1], t)]; }
  return dia;
}

/** Color de una celda según la irradiancia que recibe (0–1100 W/m²). */
export function colorCelda(g) {
  const k = Math.max(0, Math.min(1, g / 1100));
  return `hsl(218 ${55 + 20 * k}% ${14 + 34 * k}%)`;
}

let contador = 0;
const EC = 24; // elevación de la cámara (grados)

/**
 * Vista 3D del campo con la cúpula del cielo, el recorrido del sol y el panel.
 * Ejes del mundo: x = Este, y = Norte, z = Arriba. El domo tiene radio 1.
 */
export function crearEscena3D(contenedor) {
  const id = `esc${++contador}`;
  const W = 400, H = 300, cx = 200, cy = 196, S = 150;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'escena', role: 'img' });
  const defs = el('defs', {}, svg);
  const gCielo = el('linearGradient', { id: `${id}-cielo`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  const stop1 = el('stop', { offset: '0' }, gCielo);
  const stop2 = el('stop', { offset: '1' }, gCielo);
  const gSol = el('radialGradient', { id: `${id}-sol` }, defs);
  el('stop', { offset: '0', 'stop-color': '#fff7d1' }, gSol);
  el('stop', { offset: '0.35', 'stop-color': '#ffd04d' }, gSol);
  el('stop', { offset: '1', 'stop-color': '#ffb000', 'stop-opacity': '0' }, gSol);
  const gBrillo = el('linearGradient', { id: `${id}-brillo`, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0.55' }, gBrillo);
  el('stop', { offset: '0.5', 'stop-color': '#fff', 'stop-opacity': '0' }, gBrillo);

  const cielo = el('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#${id}-cielo)` }, svg);
  // Orden de dibujo: lo lejano primero. El observador mira hacia el ecuador (como en el campo),
  // así que el sol queda al fondo y el panel, visto por detrás, adelante.
  const capaSuelo = el('g', {}, svg);
  const cupula = el('path', { class: 'esc-cupula' }, svg);
  const camino = el('path', { class: 'esc-camino' }, svg);
  const capaHoras = el('g', { class: 'esc-horas' }, svg);
  const halo = el('circle', { r: 34, fill: `url(#${id}-sol)` }, svg);
  const sol = el('circle', { r: 11, class: 'esc-sol' }, svg);
  const sombra = el('polygon', { class: 'esc-sombra' }, svg);
  const capaRayos = el('g', { class: 'esc-rayos' }, svg);
  const normal = el('line', { class: 'esc-normal' }, svg);
  const arco = el('path', { class: 'esc-arco' }, svg);
  const capaPanel = el('g', {}, svg);
  const textoTheta = el('text', { class: 'esc-theta' }, svg);
  const luna = el('text', { class: 'esc-noche', x: W / 2, y: 40, 'text-anchor': 'middle' }, svg);
  contenedor.replaceChildren(svg);

  let cam, geo = {};

  function camara(lat) {
    // Cámara detrás del panel mirando hacia el ecuador: el sol sale a la izquierda (este),
    // sube al fondo y se pone a la derecha (oeste). En el hemisferio sur, al revés.
    const ac = rad(lat >= 0 ? 15 : 195), ec = rad(EC);
    const c = [Math.sin(ac) * Math.cos(ec), Math.cos(ac) * Math.cos(ec), Math.sin(ec)];
    const right = [-Math.cos(ac), Math.sin(ac), 0];
    let up = add([0, 0, 1], c, -c[2]);
    const n = Math.hypot(...up); up = up.map((x) => x / n);
    cam = { c, right, up };
  }
  const P = (p) => [cx + S * (p[0] * cam.right[0] + p[1] * cam.right[1] + p[2] * cam.right[2]),
    cy - S * (p[0] * cam.up[0] + p[1] * cam.up[1] + p[2] * cam.up[2])];

  /** Redibuja lo que no cambia durante el día: suelo, recorrido del sol y panel. */
  function construir({ lat, beta, trayectoria, horas, columnas, filas }) {
    camara(lat);
    // Suelo: disco del horizonte con la cancha.
    capaSuelo.replaceChildren();
    const circ = [];
    for (let a = 0; a <= 360; a += 6) circ.push(P([Math.sin(rad(a)), Math.cos(rad(a)), 0]));
    el('polygon', { points: pts(circ), class: 'esc-suelo' }, capaSuelo);
    const cancha = [[-0.7, -0.45], [0.7, -0.45], [0.7, 0.45], [-0.7, 0.45]].map(([x, y]) => P([x, y, 0]));
    el('polygon', { points: pts(cancha), class: 'esc-cancha' }, capaSuelo);
    for (let i = 0; i < 7; i++) {
      if (i % 2) continue;
      const f = [[-0.7 + 0.2 * i, -0.45], [-0.5 + 0.2 * i, -0.45], [-0.5 + 0.2 * i, 0.45], [-0.7 + 0.2 * i, 0.45]];
      el('polygon', { points: pts(f.map(([x, y]) => P([Math.min(x, 0.7), y, 0]))), class: 'esc-franja' }, capaSuelo);
    }
    el('polygon', { points: pts(cancha), class: 'esc-linea' }, capaSuelo);
    el('polyline', { points: pts([P([0, -0.45, 0]), P([0, 0.45, 0])]), class: 'esc-linea' }, capaSuelo);
    const cc = [];
    for (let a = 0; a <= 360; a += 15) cc.push(P([0.13 * Math.sin(rad(a)), 0.13 * Math.cos(rad(a)), 0]));
    el('polygon', { points: pts(cc), class: 'esc-linea' }, capaSuelo);
    // Cúpula del cielo (semiesfera transparente): el sol se mueve sobre ella.
    const sMin = S * Math.sin(rad(EC));
    set(cupula, { d: `M${cx - S},${cy} A${S},${S} 0 0,1 ${cx + S},${cy} A${S},${sMin} 0 0,1 ${cx - S},${cy} Z` });
    for (const [t, az] of [['N', 0], ['E', 90], ['S', 180], ['O', 270]]) {
      const p = P([1.1 * Math.sin(rad(az)), 1.1 * Math.cos(rad(az)), 0]);
      el('text', { x: p[0], y: p[1] + 5, 'text-anchor': 'middle', class: 'esc-brujula' }, capaSuelo).textContent = t;
    }

    // Recorrido del sol en el cielo.
    const arriba = trayectoria.filter((v) => v[2] > -0.02).map((v) => P(v.map((x) => x * 0.97)));
    set(camino, { d: arriba.length ? `M${pts(arriba).replaceAll(' ', 'L')}` : '' });
    capaHoras.replaceChildren();
    for (const { hora, v } of horas) {
      if (v[2] < 0.02) continue;
      const p = P(v.map((x) => x * 0.97));
      el('circle', { cx: p[0], cy: p[1], r: 2.5 }, capaHoras);
      el('text', { x: p[0], y: p[1] - 7, 'text-anchor': 'middle' }, capaHoras).textContent = `${hora}h`;
    }

    // Panel: centro sobre la cancha, mira al ecuador con inclinación beta.
    const s = lat >= 0 ? -1 : 1;
    const b = rad(beta);
    const n = [0, s * Math.sin(b), Math.cos(b)];
    const u = [0, -s * Math.cos(b), Math.sin(b)]; // hacia arriba a lo largo del panel
    const e = [1, 0, 0];
    const w = 0.6, L = 0.36, h0 = 0.06;
    const centro = [0, 0, h0 + (L / 2) * Math.sin(b)];
    const esq = (i, j) => add(add(centro, e, (i - 0.5) * w), u, (j - 0.5) * L);
    geo = { n, u, e, w, L, centro, esq, columnas, filas };

    capaPanel.replaceChildren();
    // Patas
    for (const [i, j] of [[0.08, 1], [0.92, 1], [0.08, 0], [0.92, 0]]) {
      const top = esq(i, j);
      el('line', { x1: P(top)[0], y1: P(top)[1], x2: P([top[0], top[1], 0])[0], y2: P([top[0], top[1], 0])[1], class: 'esc-pata' }, capaPanel);
    }
    el('polygon', { points: pts([esq(0, 0), esq(1, 0), esq(1, 1), esq(0, 1)].map(P)), class: 'esc-marco' }, capaPanel);
    geo.celdas = [];
    const gx = 0.06, gy = 0.06, m = 0.025;
    for (let i = 0; i < columnas; i++) {
      for (let j = 0; j < filas; j++) {
        const x0 = m + ((1 - 2 * m) * (i + gx)) / columnas, x1 = m + ((1 - 2 * m) * (i + 1 - gx)) / columnas;
        const y0 = m + ((1 - 2 * m) * (j + gy)) / filas, y1 = m + ((1 - 2 * m) * (j + 1 - gy)) / filas;
        geo.celdas.push(el('polygon', { points: pts([esq(x0, y0), esq(x1, y0), esq(x1, y1), esq(x0, y1)].map(P)) }, capaPanel));
      }
    }
    geo.brillo = el('polygon', { points: pts([esq(0, 0), esq(1, 0), esq(1, 1), esq(0, 1)].map(P)), fill: `url(#${id}-brillo)`, opacity: 0 }, capaPanel);
  }

  /** Actualiza lo que cambia con la hora. */
  function actualizar({ v, elevacion, cosTheta, incidencia, gt }) {
    const [c1, c2] = colorCielo(elevacion);
    set(stop1, { 'stop-color': rgb(c1) });
    set(stop2, { 'stop-color': rgb(c2) });
    const deDia = elevacion > 0;
    svg.classList.toggle('noche', !deDia);
    luna.textContent = deDia ? '' : '🌙 Es de noche: el panel no genera';

    const ps = P(v.map((x) => x * 0.97));
    for (const c of [sol, halo]) set(c, { cx: ps[0], cy: ps[1], opacity: deDia ? 1 : 0 });

    // Celdas iluminadas según la irradiancia sobre el panel.
    const color = colorCelda(gt);
    for (const c of geo.celdas) c.setAttribute('fill', color);
    set(geo.brillo, { opacity: deDia ? (0.15 + 0.6 * cosTheta) * Math.min(1, gt / 600) : 0 });

    // Sombra del panel en el suelo.
    if (deDia && v[2] > 0.03) {
      const proy = (p) => P([p[0] - (v[0] * p[2]) / v[2], p[1] - (v[1] * p[2]) / v[2], 0]);
      const { esq } = geo;
      set(sombra, { points: pts([esq(0, 0), esq(1, 0), esq(1, 1), esq(0, 1)].map(proy)), opacity: Math.min(0.45, v[2] * 1.5) });
    } else set(sombra, { points: '', opacity: 0 });

    // Rayos paralelos que llegan al panel y su normal.
    capaRayos.replaceChildren();
    const { centro, n, esq } = geo;
    if (deDia && cosTheta > 0) {
      for (const [i, j] of [[0.2, 0.25], [0.5, 0.5], [0.8, 0.75], [0.35, 0.8], [0.65, 0.2]]) {
        const q = esq(i, j);
        const a = P(add(q, v, 0.55)), b2 = P(q);
        el('line', { x1: a[0], y1: a[1], x2: b2[0], y2: b2[1], opacity: 0.25 + 0.75 * cosTheta }, capaRayos);
      }
    }
    const pc = P(centro), pn = P(add(centro, n, 0.36));
    set(normal, { x1: pc[0], y1: pc[1], x2: pn[0], y2: pn[1], opacity: deDia ? 1 : 0.3 });
    if (deDia && cosTheta > 0) {
      // Arco entre la normal y el rayo, para mostrar el ángulo de incidencia.
      const r = 0.2;
      const pts2 = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        let d = add(n.map((x) => x * (1 - t)), v, t);
        const nn = Math.hypot(...d); d = d.map((x) => (x / nn) * r);
        pts2.push(P(add(centro, d)));
      }
      set(arco, { d: `M${pts(pts2).replaceAll(' ', 'L')}`, opacity: 1 });
      const pm = pts2[6];
      set(textoTheta, { x: pm[0] + 6, y: pm[1] - 4, opacity: 1 });
      textoTheta.textContent = `θ ${Math.round(incidencia)}°`;
    } else {
      set(arco, { opacity: 0 });
      set(textoTheta, { opacity: 0 });
    }
  }

  return { construir, actualizar };
}

/**
 * Vista lateral al mediodía: el ecuador queda a la izquierda.
 * Muestra la altura del sol (α), la inclinación del panel (β) y si los rayos llegan perpendiculares.
 */
export function crearVistaLateral(contenedor) {
  const W = 400, H = 250, suelo = 205, px = 215;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'lateral', role: 'img' });
  el('rect', { x: 0, y: 0, width: W, height: suelo, class: 'lat-cielo' }, svg);
  el('rect', { x: 0, y: suelo, width: W, height: H - suelo, class: 'lat-suelo' }, svg);
  const tEcuador = el('text', { x: 12, y: suelo + 30, class: 'lat-rumbo' }, svg);
  const tPolo = el('text', { x: W - 12, y: suelo + 30, 'text-anchor': 'end', class: 'lat-rumbo' }, svg);
  const rayos = el('g', { class: 'lat-rayos' }, svg);
  const arcoAlfa = el('path', { class: 'lat-arco-alfa' }, svg);
  const tAlfa = el('text', { class: 'lat-alfa' }, svg);
  const pata = el('line', { class: 'lat-pata' }, svg);
  const panel = el('line', { class: 'lat-panel' }, svg);
  const normal = el('line', { class: 'lat-normal' }, svg);
  const arcoBeta = el('path', { class: 'lat-arco-beta' }, svg);
  const tBeta = el('text', { class: 'lat-beta' }, svg);
  const marca90 = el('path', { class: 'lat-90' }, svg);
  const halo = el('circle', { r: 30, class: 'lat-halo' }, svg);
  const sol = el('circle', { r: 13, class: 'lat-sol' }, svg);
  contenedor.replaceChildren(svg);

  let actual = null, anim = 0;

  function dibujar({ alfa, beta, sur }) {
    tEcuador.textContent = sur ? '← Norte (ecuador)' : '← Sur (ecuador)';
    tPolo.textContent = sur ? 'Sur →' : 'Norte →';
    const Lp = 110;
    const base = [px - (Lp / 2) * Math.cos(rad(beta)), suelo - 16];
    const tope = [base[0] + Lp * Math.cos(rad(beta)), base[1] - Lp * Math.sin(rad(beta))];
    set(panel, { x1: base[0], y1: base[1], x2: tope[0], y2: tope[1] });
    set(pata, { x1: tope[0], y1: tope[1], x2: tope[0], y2: suelo });
    const mid = [(base[0] + tope[0]) / 2, (base[1] + tope[1]) / 2];
    // Normal del panel (hacia el ecuador y arriba).
    const nv = [-Math.sin(rad(beta)), -Math.cos(rad(beta))];
    set(normal, { x1: mid[0], y1: mid[1], x2: mid[0] + nv[0] * 70, y2: mid[1] + nv[1] * 70 });

    // Sol en el lado del ecuador a altura alfa.
    const R = 175;
    const sp = [mid[0] - R * Math.cos(rad(alfa)), mid[1] - R * Math.sin(rad(alfa))];
    const visible = alfa > 0;
    for (const c of [sol, halo]) set(c, { cx: sp[0], cy: Math.max(18, sp[1]), opacity: visible ? 1 : 0 });
    rayos.replaceChildren();
    const dir = [Math.cos(rad(alfa)), Math.sin(rad(alfa))];
    // Rayos paralelos que terminan sobre la superficie del panel.
    const pu = [Math.cos(rad(beta)), -Math.sin(rad(beta))];
    if (visible) {
      for (const k of [-38, 0, 38]) {
        const hit = [mid[0] + pu[0] * k, mid[1] + pu[1] * k];
        el('line', { x1: hit[0] - dir[0] * 160, y1: hit[1] - dir[1] * 160, x2: hit[0], y2: hit[1] }, rayos);
      }
    }
    // Ángulo α: entre el suelo (hacia el sol) y el rayo, dibujado en el punto medio del panel.
    const ra = 46;
    set(arcoAlfa, { d: `M${mid[0] - ra},${mid[1]} A${ra},${ra} 0 0,1 ${mid[0] - ra * Math.cos(rad(alfa))},${mid[1] - ra * Math.sin(rad(alfa))}` });
    set(tAlfa, { x: mid[0] - ra - 8, y: mid[1] - 8, 'text-anchor': 'end' });
    tAlfa.textContent = `α = ${Math.round(alfa)}°`;
    // Ángulo β: entre el suelo y el panel.
    const rb = 34;
    set(arcoBeta, { d: `M${base[0] + rb},${base[1]} A${rb},${rb} 0 0,0 ${base[0] + rb * Math.cos(rad(beta))},${base[1] - rb * Math.sin(rad(beta))}` });
    set(tBeta, { x: base[0] + rb + 6, y: base[1] - 4 });
    tBeta.textContent = `β = ${Math.round(beta)}°`;
    // Escuadra de 90° cuando el rayo llega perpendicular (α + β ≈ 90°).
    const perp = Math.abs(alfa + beta - 90) < 3;
    if (perp) {
      const a1 = [mid[0] + nv[0] * 12, mid[1] + nv[1] * 12];
      set(marca90, { d: `M${a1[0]},${a1[1]} l${pu[0] * 12},${pu[1] * 12} l${-nv[0] * 12},${-nv[1] * 12}`, opacity: 1 });
    } else set(marca90, { opacity: 0 });
    svg.classList.toggle('perpendicular', perp);
  }

  function actualizar(objetivo, { animar = true } = {}) {
    cancelAnimationFrame(anim);
    if (!actual || !animar) { actual = { ...objetivo }; dibujar(actual); return; }
    const ini = { ...actual }, t0 = performance.now(), dur = 700;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3;
      actual = { ...objetivo, alfa: ini.alfa + (objetivo.alfa - ini.alfa) * e, beta: ini.beta + (objetivo.beta - ini.beta) * e };
      dibujar(actual);
      if (k < 1) anim = requestAnimationFrame(paso);
    };
    anim = requestAnimationFrame(paso);
  }

  return { actualizar };
}

export { deg };
