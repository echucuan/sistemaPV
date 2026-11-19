# Simulaciones de sistemas fotovoltaicos

Apps web para clase. Funcionan en el celular, sin instalar nada.

| App | Qué hace |
| --- | --- |
| [`pv-campo/`](pv-campo/) | Radiación solar mensual de cualquier coordenada (NASA POWER), ángulo óptimo de los paneles mes a mes y ángulo fijo anual, y curvas I-V y P-V de un módulo (modelo de un diodo) con las condiciones de cada mes. |

## Sol y paneles en campo (`pv-campo/`)

Recorrido guiado en cinco pasos; el mes elegido se sincroniza en todas las secciones.

1. **¿Dónde estás?** GPS del teléfono o coordenadas escritas a mano. Viene precargado el campo de fútbol del Tec campus Sinaloa (24.80346, −107.42182). Radiación de NASA POWER (2001–2025); sin internet usa un modelo de cielo despejado y lo indica.
2. **El viaje del sol en un día:** escena 3D animada, vista desde detrás del panel mirando al ecuador. El sol recorre la cúpula del cielo y se ven la sombra, los rayos, el ángulo de incidencia θ y cómo se iluminan las celdas. Muestra lecturas en vivo (altura y dirección del sol, irradiancia, potencia, energía acumulada), una gráfica de potencia del día y un **reto** para encontrar la inclinación que da más energía.
3. **¿Por qué cambia el ángulo con las estaciones?** Vista lateral al mediodía con la altura del sol α y la inclinación β, animada mes a mes (β = 90° − α).
4. **Mes a mes:** tabla de la inclinación óptima (modelo isotrópico de Liu-Jordan), comparada contra el panel horizontal y el ángulo fijo anual.
5. **Tu panel por dentro:** el módulo con sus celdas en serie conectado a un foco; la corriente fluye más rápido con más amperes. Curvas I-V y P-V (modelo de un diodo) de módulos genéricos de 100, 450 y 550 W con datos editables.

Incluye glosario, explicación del método y respeta la preferencia de "reducir movimiento" del teléfono.

Se puede compartir una ubicación con un enlace: `pv-campo/?lat=24.80346&lon=-107.42182`.

## Probar en local

Los módulos de JavaScript necesitan un servidor (no abren con doble clic):

```bash
npx serve .
```

Pruebas de los modelos (Node 18 o superior):

```bash
npm test
```

## Publicar con GitHub Pages

En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, rama `main`, carpeta `/ (root)`.
La app queda en `https://echucuan.github.io/sistemaPV/pv-campo/`.
