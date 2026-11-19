# Simulaciones de sistemas fotovoltaicos

Apps web para clase. Funcionan en el celular, sin instalar nada.

| App | Qué hace |
| --- | --- |
| [`pv-campo/`](pv-campo/) | Radiación solar mensual de cualquier coordenada (NASA POWER), ángulo óptimo de los paneles mes a mes y ángulo fijo anual, y curvas I-V y P-V de un módulo (modelo de un diodo) con las condiciones de cada mes. |

## Sol y paneles en campo (`pv-campo/`)

1. **Ubicación:** GPS del teléfono o coordenadas escritas a mano. Viene precargado el campo de fútbol del Tec campus Sinaloa (24.80346, −107.42182).
2. **Radiación:** promedios mensuales de 2001 a 2025 de NASA POWER (irradiación global y difusa, temperatura). Sin internet usa un modelo de cielo despejado y lo indica.
3. **Tabla mes a mes:** inclinación con la que el panel recibe más energía (modelo isotrópico de Liu-Jordan, de 0° a 90°), comparada contra el panel horizontal y el ángulo fijo anual.
4. **Curvas I-V y P-V:** módulos genéricos de 100, 450 y 550 W con datos editables. Al tocar un mes, las curvas usan la irradiancia y la temperatura típicas de ese mes al mediodía.

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
