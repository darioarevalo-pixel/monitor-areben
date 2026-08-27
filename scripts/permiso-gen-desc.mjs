/**
 * Le da el permiso de **Redacción** (`gen-desc`) en Zattia a los tres perfiles del local.
 *
 *   node scripts/permiso-gen-desc.mjs            → muestra qué haría, sin tocar nada
 *   node scripts/permiso-gen-desc.mjs --aplicar  → lo escribe
 *
 * 🔑 Con `gen-desc` ven la sección y **cargan la ficha de la prenda** (y el insumo). ⛔ NO pueden
 * escribir el párrafo, ni aprobarlo, ni publicar en la tienda: eso es el sub `gen-desc.publicar`,
 * que se tilda aparte y no lo toca este script.
 *
 * Los tres los eligió Bruno el 27-ago-2026. ⛔ El puesto compartido `local` quedó afuera a
 * propósito: la ficha guarda **quién** cargó cada valor, y desde una cuenta compartida ese dato
 * diría «local» y no serviría para preguntarle a nadie.
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
const QUIENES = ['josefinabatter', 'camilaquintana', 'Lorena Reyes'];

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
for (const nombre of QUIENES) {
  const u = users.find((x) => x.name === nombre);
  if (!u) {
    console.error(`✗ «${nombre}» no está en el padrón. Se corta: mejor no escribir un padrón a medias.`);
    process.exit(1);
  }
  u.acceso = u.acceso || {};
  u.acceso[MARCA] = u.acceso[MARCA] || {};
  const antes = !!u.acceso[MARCA][KEY];
  // ⚠️ La excepción negativa gana sobre el permiso tildado (`lib/permisos.core.js`, paso 2), así
  // que tildar sin sacarla dejaría el permiso puesto y la sección igual de invisible.
  const excluido = !!u.acceso[MARCA][`-${KEY}`];
  if (antes && !excluido) {
    console.log(`= ${nombre}: ya lo tiene`);
    continue;
  }
  u.acceso[MARCA][KEY] = true;
  if (excluido) delete u.acceso[MARCA][`-${KEY}`];
  tocados.push(`${nombre}${excluido ? ' (tenía la exclusión puesta, se saca)' : ''}`);
  console.log(`+ ${nombre}: ${MARCA}.${KEY} = true`);
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
const faltan = QUIENES.filter((n) => !(dVer?.config?.users || []).find((u) => u.name === n)?.acceso?.[MARCA]?.[KEY]);
if (faltan.length) {
  console.error(`✗ Se guardó pero al releer NO está el permiso en: ${faltan.join(', ')}`);
  process.exit(1);
}
console.log(`\n✓ Escrito y verificado releyendo el padrón: ${tocados.join(' · ')}`);
