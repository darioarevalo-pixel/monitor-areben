/**
 * El probador del redactor: la ÚNICA parte del camino que ningún test puede ejercer.
 *
 * 🔑 Todo lo demás está probado contra un modelo falso, sin API key y sin gastar un centavo.
 * Esto es lo otro: una llamada de verdad, con una foto de verdad, que cuesta unos milésimos de
 * dólar y contesta cuatro preguntas que la documentación no contesta —
 *
 *   1. ¿Gemini acepta nuestro esquema? (`additionalProperties` afuera, `minItems` adentro)
 *   2. ¿Acepta `thinking_level` en este modelo, o lo rechaza como Haiku rechazaba `effort`?
 *   3. ¿Se traga la URL del CDN de TiendaNube como imagen, sin bajarla nosotros?
 *   4. 🔴 ¿`total_output_tokens` YA trae adentro los tokens de pensar, o van aparte?
 *
 * La 4 es la que decide si el costo que muestra la pantalla es verdadero. Por eso se imprime el
 * `usage` crudo al lado del conciliado: acá se ve cuál de las dos lecturas era la buena.
 *
 * ⛔ NO usa una copia del pedido: importa `llamador` de `api/_tn-desc-ia.js`, el mismo que corre
 * en producción. Un probador con su propia copia puede salir en verde mientras el botón falla.
 *
 *   node scripts/probar-redactor.mjs [modelo]
 *
 * La clave sale de `GEMINI_API_KEY` (del entorno o del `.env`, que está en el .gitignore).
 */
import { readFileSync } from 'node:fs';
import { llamador } from '../api/_tn-desc-ia.js';
import { MODELOS, MODELO_POR_DEFECTO, costoDe, esModelo, redactar } from '../lib/tn-desc/redactor.core.js';

function clave() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const m = readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* no hay .env: lo dice el mensaje de abajo */ }
  return null;
}

/**
 * Un producto real de la tienda viva, no un fixture inventado: la foto tiene que existir en el
 * CDN de verdad, porque justamente lo que se está probando es que Gemini pueda ir a buscarla.
 */
const PRODUCTO = {
  marca: 'Zattia',
  nombre: 'JEAN LESKA',
  insumo: 'denim rígido',
  variantes: ['38', '40', '42', '44'],
  categorias: ['NEW IN', 'Jeans'],
  prosaActual: '',
  imagen:
    'https://acdn-us.mitiendanube.com/stores/004/445/369/products/jean-leska-1-2-071cab7b2b86735e6317806701952923-1024-1024.webp',
};

const modelo = process.argv[2] || MODELO_POR_DEFECTO;
if (!esModelo(modelo)) {
  console.error(`Modelo desconocido: ${modelo}\nLos que hay: ${Object.keys(MODELOS).join(', ')}`);
  process.exit(1);
}

const k = clave();
if (!k) {
  console.error('Falta GEMINI_API_KEY. Ponela en el entorno o agregá la línea al .env del repo.');
  process.exit(1);
}

const crudas = [];
const llamar = llamador(modelo, k, (j) => crudas.push(j));

console.log(`\n▶ ${MODELOS[modelo].nombre} (${modelo}) · pensar: ${MODELOS[modelo].pensar}`);
console.log(`▶ ${PRODUCTO.nombre} — con la foto del CDN\n`);

const r = await redactar(PRODUCTO, llamar);

for (const [i, j] of crudas.entries()) {
  console.log(`— llamada ${i + 1}: status=${j?.status} · usage crudo:`);
  console.log('  ', JSON.stringify(j?.usage ?? null));
}

if (r.error) {
  console.error(`\n⛔ ERROR: ${r.error}`);
  process.exit(1);
}

console.log(`\n${r.borrador.parrafo}`);
for (const b of r.borrador.bullets) console.log(`  · ${b.etiqueta}: ${b.texto}`);

console.log(`\nintentos: ${r.intentos}`);
console.log(`problemas: ${r.problemas.length ? JSON.stringify(r.problemas) : 'ninguno ✅'}`);
console.log(`uso conciliado: ${JSON.stringify(r.uso)}`);

const hoy = new Date().toISOString().slice(0, 10);
const costo = costoDe(r.uso, modelo, hoy);
console.log(`costo: US$${costo.toFixed(6)}  ·  370 productos ≈ US$${(costo * 370).toFixed(2)}`);

// 🔴 La respuesta a la pregunta 4, escrita en castellano en vez de dejarla para deducir.
const u = crudas[0]?.usage ?? {};
const dentro = (u.total_input_tokens ?? 0) + (u.total_output_tokens ?? 0) === (u.total_tokens ?? -1);
console.log(
  `\ntokens de pensar: ${u.total_thought_tokens ?? '—'} · ${
    dentro ? 'YA venían adentro de la salida (no se cobran dos veces)' : 'van APARTE (se cobran aparte)'
  }`,
);
