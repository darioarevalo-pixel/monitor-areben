// El padrón del CRM — tabla `clientes` de BDI, servida con la clave de servicio.
//
//   POST { recurso:'crm', ids:[…] } → { ok, clientes:[{id,name,email,phone,city,province}] }
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO EXISTE (escalón 2 de la Fase S)
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Hasta acá el navegador leía `clientes` derecho de Supabase con la **anon key**, que viaja en el
// bundle. Medido el 14-ago-2026 desde afuera: cualquiera con esa key se bajaba **nombre, mail,
// teléfono y ciudad de 12.523 personas** en 13 llamadas de un segundo. El escalón 1
// (`sql/migrate-columnas-pii.sql`) ya le había sacado la dirección, el CP y cuánto gastó cada uno,
// pero las cuatro que el CRM muestra tenían que seguir abiertas justamente porque el CRM las lee.
//
// El arreglo no es un login de Supabase —duplicaría el padrón de usuarios y la política seguiría
// diciendo `true`—: es **sacar la lectura del navegador**. Acá hay sesión (`exigirUsuario`) y
// permisos (`puedeVerAlguna`), que es lo que la anon key no puede tener. Con esto puesto, el
// `select` sobre `clientes` se le revoca a `anon` (`sql/migrate-clientes-servidor.sql`).
//
// 🔑 **Bonus que no era el objetivo y vale igual**: hasta hoy el padrón se lo bajaba *cualquier*
// usuario del monitor, tuviera o no tildado el permiso de Clientes — la anon key no sabe de
// permisos. Ahora el gate es el mismo que el de la sección.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA FORMA: los ids van en el BODY y las tandas las arma el servidor
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// El navegador manda de una los client_id de las ventas que ya cargó (12.485 en el modo «todos»,
// 85 KB de body) y esto contesta con las filas. Es **un viaje** en vez de los 63 lotes de 200 que
// hacía antes contra PostgREST.
//
// Medido el 14-ago-2026 contra la base de BDI, con los 12.485 ids reales:
//
//   lotes de 500 ids, 6 en vuelo  → 25 consultas,  3,9 s,  1,76 MB de respuesta
//   lotes de 1000 ids, 6 en vuelo → 13 consultas,  2,3 s   ← más rápido, pero la URL queda en
//                                                             7.048 caracteres y el techo de un
//                                                             proxy HTTP anda por los 8 KB
//
// Van 500. La diferencia son 1,6 s una vez por carga de pantalla; el otro camino se rompe solo el
// día que los ids pasen a siete dígitos, y ese modo de falla es un 414 que nadie va a saber leer.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';

// El select del CRM, palabra por palabra el de `lib/crm/datos.ts` (SEL_CLIENTES). Un campo de menos
// y el agregado computa otra cosa sin un solo error en consola.
const COLUMNAS = 'id, name, email, phone, city, province';

// El CRM es **bdi-only por esquema**: `clientes` no existe en la base de Zattia (por eso
// `migrate-columnas-pii.sql` se la saltea ahí). No hay `store` en la puerta a propósito.
const MARCA = 'bdi';

const LOTE = 500;
const EN_VUELO = 6;

// Techo de una respuesta de función en Vercel. Hoy el padrón entero pesa 1,76 MB, o sea 2,5x de
// aire, pero el que se pasa no recibe un error legible: recibe una respuesta cortada, que del otro
// lado se ve como un JSON.parse roto. Mejor decirlo.
const TOPE_RESPUESTA = 4 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  // 🔴 Tener sesión no es tener permiso. Es el gate de la sección Clientes, y va por
  // `puedeVerAlguna` y no por `puedeVer` pelado para que la cuenta fija siga valiendo.
  if (!puedeVerAlguna(perfil, MARCA, ['clientes'])) {
    return res.status(403).json({ error: 'No tenés acceso a Clientes.' });
  }

  const crudos = Array.isArray((req.body || {}).ids) ? req.body.ids : null;
  if (!crudos) return res.status(400).json({ error: 'falta ids (una lista de client_id)' });

  // Sólo enteros. No es paranoia de tipos: estos ids se concatenan en el `in.(…)` de PostgREST, y
  // ahí cualquier cosa que no sea un número es una inyección en la query string.
  const ids = [...new Set(crudos.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return res.status(200).json({ ok: true, clientes: [] });

  const url = process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!key) return res.status(500).json({ error: 'Falta la clave de Supabase de BDI en el entorno.' });
  const supabase = createClient(url, key);

  try {
    const lotes = [];
    for (let i = 0; i < ids.length; i += LOTE) lotes.push(ids.slice(i, i + LOTE));

    // Por id, no un array a secas: un id repetido entre lotes no puede pasar (ya vienen únicos),
    // pero el mapa además deja la respuesta estable para el `Record` que arma el cliente.
    const porId = new Map();
    for (let i = 0; i < lotes.length; i += EN_VUELO) {
      const tanda = await Promise.all(
        lotes.slice(i, i + EN_VUELO).map((l) => supabase.from('clientes').select(COLUMNAS).in('id', l)),
      );
      for (const { data, error } of tanda) {
        if (error) throw new Error(error.message);
        for (const c of data || []) porId.set(c.id, c);
      }
    }

    const cuerpo = JSON.stringify({ ok: true, clientes: [...porId.values()] });
    if (cuerpo.length > TOPE_RESPUESTA) {
      return res.status(500).json({
        ok: false,
        error: `El padrón ya no entra en una respuesta (${(cuerpo.length / 1024 / 1024).toFixed(1)} MB contra un techo de 4,5). Hay que paginar api/_crm.js.`,
      });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(cuerpo);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
