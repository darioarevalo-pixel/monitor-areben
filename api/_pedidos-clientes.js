// "Faltantes" — tabla `pedidos_clientes` (ver sql/migrate-pedidos-clientes.sql).
//
//   GET  ?recurso=pedidos-clientes&store=bdi|zattia          → { ok, pedidos, puede }
//   POST { recurso, store, action:'guardar', pedido }         → alta o edición
//   POST { recurso, store, action:'estado', id, estado }      → conseguido | descartado | pedido
//   POST { recurso, store, action:'borrar', id }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=pedidos-clientes`. El plan
// Hobby de Vercel admite 12 funciones y hay 7 usadas. Si alguien crea `api/pedidos-clientes.js`
// "por prolijidad", **frena todos los deploys sin error visible**. Ya pasó una vez.
//
// # Los dos permisos, que no son el mismo y ésa es toda la idea de la sección
//
// 🔑 **Anotar entra con `atencion`; decidir pide `pedidos-clientes`.** El alta vive adentro de
// «Atención al cliente», que es la pantalla abierta mientras se atiende — si anotar pidiera el
// permiso de la sección, la única persona que escucha el pedido sería la única que no puede
// anotarlo, y la lista queda vacía para siempre. Al revés, mover una fila a `conseguido` o
// `descartado` **borra demanda de la vista del que compra**, así que eso sí pide la sección.
//
// Borrar es el caso del medio: quien sólo tiene `atencion` puede borrar **lo que anotó él** (el
// error de tipeo de hace un minuto) y nada más. Sin eso, el camino corto de corregir sería anotar
// de nuevo, y el ranking contaría dos veces lo mismo.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { baseDeLinea } from '../lib/lineas.core.js';
import { ESTADOS, filaDe, validarPedido } from '../lib/pedidos-clientes/reglas.core.js';

/**
 * La base de CADA marca, al revés que el buzón (que es uno solo). Lo que se decide con esta tabla
 * es qué compra cada marca: dos plata distintas y dos compradores distintos. Mismo criterio que
 * `_atencion.js`.
 */
function cfgFor(store) {
  if (baseDeLinea(store) === 'zattia') {
    return {
      url: process.env.ZATTIA_SUPABASE_URL,
      key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY,
    };
  }
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

const TABLA = 'pedidos_clientes';

/** Las secciones que abren este endpoint para LEER y ANOTAR. */
const PARA_ANOTAR = ['pedidos-clientes', 'atencion'];
/** La que hace falta para DECIDIR (mover el estado). */
const PARA_DECIDIR = ['pedidos-clientes'];

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  // ⛔ Sólo las dos marcas. `stunned` es una línea que se separa por prefijo de SKU, y un producto
  // que NO tenemos no tiene SKU: pedir la línea acá sería pedir un dato que no existe.
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  if (!puedeVerAlguna(perfil, store, PARA_ANOTAR)) {
    return res.status(403).json({ error: 'No tenés acceso a los faltantes de esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  // El cliente se crea tarde y una sola vez: un pedido mal formado no tiene por qué abrir una
  // conexión con la service key, y así el 400 se puede probar sin base (ver
  // `tests/handlers-autorizacion.test.ts`, que mockea `createClient` para que explote si lo tocan).
  let sb = null;
  const db = () => {
    if (!sb) sb = createClient(cfg.url, cfg.key);
    return sb;
  };
  const yo = perfil.name || perfil.email || null;
  const decide = puedeVerAlguna(perfil, store, PARA_DECIDIR);

  try {
    if (req.method === 'GET') {
      // Se devuelve la lista entera y la ventana la aplica el núcleo en la pantalla: ver el
      // docblock de `leerPedidos` en `lib/pedidos-clientes/cliente.ts`. Sin las filas viejas, el
      // cartel que separa "nadie pide" de "nadie carga" no se puede escribir.
      const { data, error } = await db()
        .from(TABLA)
        .select('*')
        .eq('store', store)
        .order('creado_en', { ascending: false })
        .limit(2000);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, pedidos: data || [], puede: { decidir: decide } });
    }

    if (req.method === 'POST') {
      const b = req.body || {};

      if (b.action === 'guardar') {
        const p = { ...(b.pedido || {}), store };
        const mal = validarPedido(p);
        if (mal) return res.status(400).json({ error: mal });
        // 🔴 El estado NO viaja por el alta de quien no decide. `filaDe` lo dejaría pasar —tiene que
        // dejarlo, porque la sección sí edita filas enteras— así que el candado va acá: sin esto,
        // quien sólo tiene `atencion` manda `estado:'descartado'` en el alta y esquiva el gate de
        // abajo escribiendo lo mismo por otra puerta.
        if (!decide && p.estado != null && String(p.estado) !== 'pedido') {
          return res.status(403).json({ error: 'Anotar sí; decidir si se consigue o se descarta lo hace Compras.' });
        }
        const fila = filaDe(p, yo, new Date().toISOString());
        // Al editar, `creado_por` no se pisa: la firma es de quien lo escuchó, y `actualizado_por`
        // guarda quién lo tocó después.
        if (p.id) delete fila.creado_por;
        const { error } = await db().from(TABLA).upsert(fila, { onConflict: 'id' });
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, id: fila.id });
      }

      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      if (!['estado', 'borrar'].includes(String(b.action))) {
        return res.status(400).json({ error: 'acción desconocida' });
      }
      if (b.action === 'estado' && !ESTADOS.includes(String(b.estado))) {
        return res.status(400).json({ error: `estado inválido (usá ${ESTADOS.join(', ')})` });
      }
      if (b.action === 'estado' && !decide) {
        return res.status(403).json({ error: 'Decidir si un faltante se consigue o se descarta lo hace Compras.' });
      }

      // Se lee la fila antes de escribirla: sin esto, un id de la otra marca se tocaría igual, y
      // además hace falta `creado_por` para la regla de borrado de abajo.
      const { data: actual, error: eLeer } = await db().from(TABLA).select('store, creado_por').eq('id', id).maybeSingle();
      if (eLeer) throw new Error(eLeer.message);
      if (!actual) return res.status(404).json({ error: 'ese faltante ya no está.' });
      if (actual.store !== store) return res.status(403).json({ error: 'ese faltante no es de esta marca.' });

      if (b.action === 'estado') {
        const { error } = await db()
          .from(TABLA)
          .update({ estado: String(b.estado), actualizado_en: new Date().toISOString(), actualizado_por: yo })
          .eq('id', id);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      // Borrar. Quien no decide sólo puede borrar lo suyo: es para deshacer el error de tipeo, no
      // para sacar de la lista lo que anotó otro.
      if (!decide && (!actual.creado_por || actual.creado_por !== yo)) {
        return res.status(403).json({ error: 'Sólo podés borrar lo que anotaste vos.' });
      }
      const { error } = await db().from(TABLA).delete().eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
