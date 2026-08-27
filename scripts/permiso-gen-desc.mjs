/**
 * Le da el permiso de **Redacción** (`gen-desc`) en Zattia a los tres perfiles del local.
 *
 *   node scripts/permiso-gen-desc.mjs            → muestra qué haría, sin tocar nada
 *   node scripts/permiso-gen-desc.mjs --aplicar  → lo escribe
 *
 * 🔑 Dos niveles, que son el reparto de trabajo que decidió Bruno el 27-ago-2026:
 *
 *   - **el local CARGA los datos** (`gen-desc`): elige de una lista y nada más;
 *   - **Administración REVISA, genera el texto y PUBLICA** (`gen-desc.publicar`).
 *
 * ⛔ El puesto compartido `local` quedó afuera a propósito: la ficha guarda **quién** cargó cada
 * valor, y desde una cuenta compartida ese dato diría «local» y no serviría para preguntarle a
 * nadie.
 *
 * 🔴 **Reescribe el padrón entero** (es como está hecho `api/usuarios` de `bdi-catalogo`: se manda
 * `config.users` completo). Por eso imprime el antes/después de cada usuario que toca y no aplica
 * nada sin `--aplicar`. ⚠️ Si alguien está editando usuarios en el Monitor en este momento, su
 * cambio se pisa: mirá la pantalla antes de correrlo con `--aplicar`.
 */
import { readFileSync } from 'node:fs';

const USU_API = 'https://bdi-catalogo.vercel.app/api/usuarios';
const MARCA = 'zattia';
const KEY = 'gen-desc';

/** Cargan la ficha de la prenda: eligen de una lista y nada más. */
const QUIENES = ['josefinabatter', 'camilaquintana', 'Lorena Reyes'];

/**
 * Y además revisan el texto y lo publican en la tienda (sub `gen-desc.publicar`).
 *
 * 🔴 **Es el permiso que GASTA PLATA y el que ESCRIBE EN LA TIENDA VIVA**, los dos únicos del
 * módulo: el botón de la IA cuesta ~US$0,0008 por producto y publicar pisa la ficha de un
 * producto real. Decisión de Bruno del 27-ago-2026: el local carga los datos y **Administración**
 * revisa, genera y publica.
 */
const PUBLICAN = ['Lorena Reyes'];

const aplicar = process.argv.includes('--aplicar');

function env() {
  const t = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const e = {};
  for (const l of t.split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) e[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return e;
}

const e = env();
const adminUser = process.env.MONITOR_USER || 'Bruno Arevalo';
const adminPass = process.env.MONITOR_PASS || e.MONITOR_PASS;
if (!adminPass) {
  console.error('Falta MONITOR_PASS en el .env (o en el entorno).');
  process.exit(1);
}

const rLeer = await fetch(USU_API, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'config', adminUser, adminPass }),
});
const dLeer = await rLeer.json().catch(() => null);
if (!dLeer?.ok || !Array.isArray(dLeer.config?.users)) {
  console.error('No se pudo leer el padrón:', dLeer?.error || `HTTP ${rLeer.status}`);
  process.exit(1);
}

const users = dLeer.config.users;
const tocados = [];

/** Los subs se guardan PLANOS (`gen-desc.publicar`), no anidados: `puedeSub` los busca así. */
const clave = (nombre) => (PUBLICAN.includes(nombre) ? [KEY, `${KEY}.publicar`] : [KEY]);

for (const nombre of QUIENES) {
  const u = users.find((x) => x.name === nombre);
  if (!u) {
    console.error(`✗ «${nombre}» no está en el padrón. Se corta: mejor no escribir un padrón a medias.`);
    process.exit(1);
  }
  u.acceso = u.acceso || {};
  u.acceso[MARCA] = u.acceso[MARCA] || {};
  for (const k of clave(nombre)) {
    const antes = !!u.acceso[MARCA][k];
    // ⚠️ La excepción negativa gana sobre el permiso tildado (`lib/permisos.core.js`, paso 2), así
    // que tildar sin sacarla dejaría el permiso puesto y la sección igual de invisible.
    const excluido = !!u.acceso[MARCA][`-${k}`];
    if (antes && !excluido) {
      console.log(`= ${nombre}: ya tiene ${k}`);
      continue;
    }
    u.acceso[MARCA][k] = true;
    if (excluido) delete u.acceso[MARCA][`-${k}`];
    tocados.push(`${nombre} → ${k}${excluido ? ' (tenía la exclusión puesta, se saca)' : ''}`);
    console.log(`+ ${nombre}: ${MARCA}.${k} = true`);
  }
}

if (!tocados.length) {
  console.log('\nNo hay nada que cambiar.');
  process.exit(0);
}

if (!aplicar) {
  console.log(`\n(simulacro) Volvé a correrlo con --aplicar para escribirlo.`);
  process.exit(0);
}

const rEsc = await fetch(USU_API, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ adminUser, adminPass, config: { users } }),
});
const dEsc = await rEsc.json().catch(() => null);
if (!dEsc?.ok) {
  console.error('✗ No se pudo guardar:', dEsc?.error || `HTTP ${rEsc.status}`);
  process.exit(1);
}

// ⛔ El oráculo no es el `{ok:true}` del POST: se relee el padrón y se mira el permiso puesto.
const rVer = await fetch(USU_API, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'config', adminUser, adminPass }),
});
const dVer = await rVer.json().catch(() => null);
const faltan = QUIENES.flatMap((n) =>
  clave(n)
    .filter((k) => !(dVer?.config?.users || []).find((u) => u.name === n)?.acceso?.[MARCA]?.[k])
    .map((k) => `${n}/${k}`),
);
if (faltan.length) {
  console.error(`✗ Se guardó pero al releer NO está el permiso en: ${faltan.join(', ')}`);
  process.exit(1);
}
console.log(`\n✓ Escrito y verificado releyendo el padrón: ${tocados.join(' · ')}`);
