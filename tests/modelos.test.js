// Pruebas de los modelos: node tests/modelos.test.js
import assert from 'node:assert/strict';
import { analisisAngulos, datosCieloDespejado, irradiacionInclinada, MESES } from '../pv-campo/js/solar.js';
import { MODULOS, ajustarModelo, curvas, validarModulo } from '../pv-campo/js/pv.js';

const LAT = 24.80346; // campo de fútbol, Tec campus Sinaloa

// Climatología NASA POWER (2001–2025) para el campo, kWh/m²·día y °C.
const H = [4.3078, 5.2483, 6.4608, 7.2725, 7.6843, 7.1882, 6.3614, 6.0007, 5.5106, 5.4619, 4.6846, 4.1023];
const Hd = [1.2386, 1.3702, 1.5036, 1.7962, 1.6507, 1.9488, 2.3112, 2.2176, 1.9632, 1.1786, 1.0032, 1.1093];
const datos = H.map((h, i) => ({ H: h, Hd: Hd[i], tProm: 25, tMax: 32 }));

// 1. Con β = 0 el plano inclinado debe dar exactamente la irradiación horizontal.
assert.ok(Math.abs(irradiacionInclinada(5, 1.5, LAT, 17, 0) - 5) < 1e-9, 'β=0 debe igualar a H');

// 2. Ángulos óptimos: grandes en invierno, ~0 en verano, anual cerca de la latitud.
const r = analisisAngulos(datos, LAT);
const ang = r.meses.map((m) => m.anguloOptimo);
console.log('Ángulo óptimo por mes:', MESES.map((m, i) => `${m} ${ang[i]}°`).join(', '));
console.log(`Ángulo fijo anual: ${r.anguloAnual}°`);
console.log(`Anual kWh/m²: horizontal ${r.anual.horizontal.toFixed(0)}, fijo ${r.anual.fijo.toFixed(0)}, ajuste mensual ${r.anual.mensual.toFixed(0)}`);
assert.ok(ang[11] > 40 && ang[11] < 60, 'diciembre ~45–55°');
assert.ok(ang[5] <= 5, 'junio ~0°');
assert.ok(r.anguloAnual > 10 && r.anguloAnual < 30, 'anual entre 10° y 30°');
assert.ok(r.anual.mensual >= r.anual.fijo && r.anual.fijo >= r.anual.horizontal);

// 3. Respaldo sin internet: valores razonables.
const cs = datosCieloDespejado(LAT);
assert.ok(cs[5].H > 7 && cs[5].H < 9.5 && cs[11].H > 3.5 && cs[11].H < 5.5, 'cielo despejado razonable');

// 4. Modelo de un diodo: en STC debe reproducir la hoja de datos.
for (const m of MODULOS) {
  assert.deepEqual(validarModulo(m), []);
  const mod = ajustarModelo(m);
  const c = curvas(mod, 1000, 25);
  console.log(`${m.nombre}: a=${mod.a}, Rs=${mod.Rs.toFixed(3)} Ω, Rp=${mod.Rp.toFixed(1)} Ω → Pmp ${c.mpp.p.toFixed(1)} W, Vmp ${c.mpp.v.toFixed(2)} V, Voc ${c.voc.toFixed(2)} V, Isc ${c.isc.toFixed(2)} A`);
  assert.ok(Math.abs(c.mpp.p - m.vmp * m.imp) / m.pmax < 0.005, 'Pmp en STC');
  assert.ok(Math.abs(c.mpp.v - m.vmp) < 0.3, 'Vmp en STC');
  assert.ok(Math.abs(c.voc - m.voc) < 0.05, 'Voc en STC');
  assert.ok(Math.abs(c.isc - m.isc) < 0.02, 'Isc en STC');
  // Temperatura alta → menos potencia; menos irradiancia → menos corriente.
  const caliente = curvas(mod, 1000, 60);
  const nublado = curvas(mod, 500, 25);
  assert.ok(caliente.mpp.p < c.mpp.p && caliente.voc < c.voc);
  assert.ok(Math.abs(nublado.isc - c.isc / 2) < 0.05);
}
console.log('✔ Todas las pruebas pasaron');
