// Sync del PADRÓN DE CLIENTES de Gestión Nube → tabla `clientes` del espejo (BDI).
//
// Trae la ficha de verdad, con el WhatsApp incluido. El porqué de todo esto está en
// `scripts/lib/clientes-espejo.mjs`; el resumen: la venta no expone `cellphone_number`, así que
// el número al que se le escribe nunca llegaba al CRM.
//
// 🔴 **Necesita su propio token.** `GN_TOKEN` (la clave 58, "Monitor + CRM") NO tiene el permiso
// `clients:read` y la API contesta 403 "Invalid ability provided". La clave 113 "Clientes BDI" se
// creó el 23-ago-2026 con ese permiso **y nada más**: si este script alguna vez intentara escribir
// en GN, no puede. Va aparte a propósito — cambiarle los permisos a la 58 significa regenerarla, y
// con ella se cae todo el resto del Monitor.
//
// ⚠️ Sólo BDI: la tabla `clientes` no existe en la base de Zattia (ver el comentario de
// `lib/crm/datos.ts`).
import { createClient } from '@supabase/supabase-js';
import { crearClienteGN } from './lib/gn-fetch.mjs';
import { armarLote, mapearFicha } from './lib/clientes-espejo.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const GN_TOKEN = process.env.GN_TOKEN_CLIENTES;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan credenciales de Supabase (SUPABASE_URL / SUPABASE_SERVICE_KEY).');
  process.exit(1);
}
if (!GN_TOKEN) {
  console.error(
    'Falta GN_TOKEN_CLIENTES: es la clave de GN con el permiso `clients:read`.\n' +
      'No sirve GN_TOKEN — esa clave no tiene ese permiso y la API responde 403.\n' +
      'Se crea en Gestión Nube → Configuración → Claves de API.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 1100 ms: éste barre el padrón entero (142 páginas), como los otros que recorren catálogos
// completos. Ver la nota de `pausaPagina` en scripts/lib/gn-fetch.mjs.
const { fetchAllPages } = crearClienteGN({ token: GN_TOKEN, pausaPagina: 1100 });

/** Lo que el espejo tiene hoy, por id. Paginado: PostgREST corta en 1.000 filas sin avisar. */
async function leerEspejo() {
  const porId = new Map();
  const PASO = 1000;
  for (let desde = 0; ; desde += PASO) {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, name, email, phone, city, province, address, postal_code')
      .order('id')
      .range(desde, desde + PASO - 1);
    if (error) throw new Error(`Error leyendo el espejo de clientes: ${error.message}`);
    for (const c of data) porId.set(c.id, c);
    if (data.length < PASO) break;
  }
  return porId;
}

async function guardar(filas) {
  const BATCH = 500;
  for (let i = 0; i < filas.length; i += BATCH) {
    const { error } = await supabase.from('clientes').upsert(filas.slice(i, i + BATCH), { onConflict: 'id' });
    if (error) throw new Error(`Error guardando clientes: ${error.message}`);
  }
}

(async () => {
  console.log('=== Sync padrón de clientes — BDI ===');

  console.log('\n[GN] descargando fichas...');
  const crudas = await fetchAllPages('clientes?per_page=100');
  console.log(`[GN] ${crudas.length} fichas.`);
  if (!crudas.length) {
    // Un padrón vacío es un error de la API, no un padrón vacío. Escribirlo no borra nada (el
    // lote saldría vacío), pero salir en rojo es lo que hace que el job avise.
    console.error('GN devolvió 0 clientes: no se toca el espejo.');
    process.exit(1);
  }

  const fichas = crudas.map(mapearFicha);
  const conTelefono = fichas.filter((f) => f.phone).length;
  console.log(`[GN] con teléfono en la ficha: ${conTelefono} (${Math.round((conTelefono / fichas.length) * 100)}%).`);

  console.log('\n[espejo] leyendo lo que ya está guardado...');
  const porId = await leerEspejo();
  console.log(`[espejo] ${porId.size} clientes.`);

  const lote = armarLote(fichas, porId, new Date().toISOString());
  const nuevos = lote.filter((f) => !porId.has(f.id)).length;
  const telefonosNuevos = lote.filter((f) => f.phone && !porId.get(f.id)?.phone).length;

  console.log(
    `\n[cambios] ${lote.length} fila(s) a escribir — ${nuevos} cliente(s) nuevo(s), ` +
      `${telefonosNuevos} teléfono(s) que el espejo no tenía.`,
  );

  if (!lote.length) {
    console.log('\n[listo] nada que actualizar.');
    return;
  }

  await guardar(lote);
  console.log('\n[listo] padrón de clientes actualizado.');
})().catch((e) => {
  console.error('\nERROR:', e.message);
  process.exit(1);
});
