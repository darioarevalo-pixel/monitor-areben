// Insumos: el catálogo, el libro y el ritmo (`/api/datos?recurso=insumos`).
//
//   GET  ?recurso=insumos&store=bdi|zattia
//   POST { recurso:'insumos', action:'guardar-insumo', insumo }
//   POST { recurso:'insumos', action:'borrar-insumo', id }
//   POST { recurso:'insumos', action:'guardar-movimiento', movimiento }
//   POST { recurso:'insumos', action:'trasladar', insumoId, origen, destino, cantidad, fecha, nota }
//   POST { recurso:'insumos', action:'borrar-movimiento', id }
//
// ## Siempre la base de BDI, tenga la sesión la marca que tenga
//
// Acá no hay marca: una caja de bolsas de consorcio no es de BDI ni de Zattia, y Zattia no tiene
// service key. Que un insumo sea de una marca sola se dice con su columna `marcas`, que es una
// lista. Mismo criterio que `_agenda.js` y `_sistema.js`.
//
// ## Lo único que sale de la otra base son las VENTAS del ritmo
//
// 🔴 Y son **cuentas de pedidos, sin un peso**: `comprasPorDia` cuenta filas de `ventas`. El
// endpoint que sí lleva plata (`_ventas-diarias.js`) pide el permiso `ventas-mensuales` justamente
// por eso, y colgarse de él le daría la facturación a quien sólo tiene que saber cuántas bolsas se
// gastan. `tests/insumos-handler.test.ts` fija que la respuesta no traiga plata.
//
// ⚠️ Si falta la credencial de una marca —pasa en local, donde sólo está la de BDI— esa marca sale
// en `sinRitmo` y la pantalla lo dice. **Callarse también miente**: sin eso, un insumo de Zattia se
// vería igual que uno que nadie configuró.
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12 funciones
// por deploy y cada archivo de ruta cuenta una.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { leerTodo } from '../lib/supabase/paginar.core.js';
import { motivoInsumoInvalido, motivoMovimientoInvalido, patasDeTraslado, CLAVES_UBICACION } from '../lib/insumos/core.core.js';
import { comprasPorDia } from '../lib/insumos/consumo.core.js';
import { sumarDias } from '../lib/fechas/dia.core.js';
import { diaArgentino } from '../lib/envios/portal.core.js';

/** Los días de ventas que se traen para medir el ritmo. `core.ts` mide sobre 30 + hoy, que no cuenta. */
const DIAS_RITMO = 31;

const MARCAS = ['bdi', 'zattia'];

/** Siempre BDI: acá no hay marca. Ver el encabezado. */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

/** Mismo `cfgFor` que `_ventas-diarias.js` y `_memo.js`. */
function clienteDe(store) {
  const cfg = store === 'zattia'
    ? { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY }
    : cfgMaestra();
  if (!cfg.url || !cfg.key) return null;
  return createClient(cfg.url, cfg.key);
}

const nuevoId = (p) => `${p}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const COLS_INSUMO = 'id, nombre, tipo, unidad, bulto, por_bulto, marcas, minimo, dias_reposicion, consumo, activo, nota, autor, created_at, updated_at';
const COLS_MOV = 'id, insumo_id, tipo, ubicacion, cantidad, fecha, precio_total, proveedor, comprobante, grupo, usuario, nota, datos, created_at';

const salidaInsumo = (f) => ({
  id: f.id,
  nombre: f.nombre,
  tipo: f.tipo,
  unidad: f.unidad,
  bulto: f.bulto ?? null,
  porBulto: f.por_bulto == null ? null : Number(f.por_bulto),
  marcas: Array.isArray(f.marcas) ? f.marcas : [],
  minimo: Number(f.minimo),
  diasReposicion: f.dias_reposicion == null ? null : Number(f.dias_reposicion),
  consumo: f.consumo || {},
  activo: !!f.activo,
  nota: f.nota ?? null,
  autor: f.autor ?? null,
  creado: f.created_at,
  actualizado: f.updated_at,
});

const salidaMov = (f) => ({
  id: f.id,
  insumoId: f.insumo_id,
  tipo: f.tipo,
  ubicacion: f.ubicacion,
  cantidad: Number(f.cantidad),
  fecha: f.fecha,
  // 🔑 `null` viaja como `null`: un 0 acá diría «salió gratis» y entraría al promedio de referencia.
  precioTotal: f.precio_total == null ? null : Number(f.precio_total),
  proveedor: f.proveedor ?? null,
  comprobante: f.comprobante ?? null,
  grupo: f.grupo ?? null,
  pata: (f.datos && f.datos.pata) || null,
  usuario: f.usuario ?? null,
  nota: f.nota ?? null,
  creado: f.created_at,
});

/**
 * Lo que la persona escribió, saneado.
 *
 * 🔴 **Un campo vacío llega como `null`, ⛔ nunca como 0.** `Number('')` es 0 y `Number(null)` es 0:
 * dejar pasar cualquiera de los dos convertiría «no sé cuánto salió» en «salió gratis», que después
 * hunde el precio de referencia sin que nadie lo vea. Ya mordió en este repo con `offsetDias`.
 */
function numeroOpcional(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const textoOpcional = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
};

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String(req.query?.store || (req.body && req.body.store) || 'bdi');
  // 🔑 `puedeVerAlguna` y no `puedeVer` pelado: la `store` la elige el request, y `puedeVer` no
  // aplica la cuenta fija. Va ANTES de crear ningún cliente de Supabase.
  if (!puedeVerAlguna(perfil, store, ['insumos'])) {
    return res.status(403).json({ error: 'No tenés acceso a Insumos.' });
  }

  const yo = perfil.name || null;
  if (!yo) return res.status(400).json({ error: 'La sesión no tiene nombre; volvé a entrar.' });

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const sb = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const insumos = (await leerTodo(sb, 'insumo', (q) => q.select(COLS_INSUMO).order('nombre'))).map(salidaInsumo);
      const movimientos = (await leerTodo(sb, 'insumo_movimiento', (q) => q.select(COLS_MOV).order('fecha'))).map(salidaMov);

      // Sólo se van a buscar las ventas de las marcas que algún insumo prendido necesita: si nadie
      // ató un insumo a las ventas, no hay ninguna consulta que hacer.
      const necesarias = new Set();
      for (const i of insumos) {
        if (!i.activo || i.consumo?.modo !== 'por-venta') continue;
        for (const m of i.marcas.length ? i.marcas : MARCAS) necesarias.add(m);
      }

      const hasta = diaArgentino(Date.now());
      const desde = sumarDias(hasta, -(DIAS_RITMO - 1));
      const comprasPorMarca = {};
      const sinRitmo = [];
      for (const marca of MARCAS) {
        if (!necesarias.has(marca)) continue;
        const cli = clienteDe(marca);
        if (!cli) {
          sinRitmo.push(marca);
          continue;
        }
        // ⚠️ `channel_id` sólo se pide en BDI: la tabla de Zattia no tiene esa columna y PostgREST
        // rechaza el select ENTERO por una columna que no existe. Mismo recaudo que `_norte.js`.
        const cols = `date_sale, channel${marca === 'bdi' ? ', channel_id' : ''}`;
        try {
          const ventas = await leerTodo(cli, 'ventas', (q) =>
            q.select(cols).gte('date_sale', desde).lte('date_sale', hasta).order('date_sale'));
          comprasPorMarca[marca] = comprasPorDia(ventas, desde, hasta);
        } catch {
          // Una marca que no contesta ⛔ no puede tumbar la sección entera: sale en `sinRitmo` y la
          // pantalla dice que ese ritmo no se pudo medir.
          sinRitmo.push(marca);
        }
      }

      return res.status(200).json({ ok: true, insumos, movimientos, comprasPorMarca, sinRitmo, desde, hasta });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const b = req.body || {};
    const action = String(b.action || '');

    if (action === 'guardar-insumo') {
      const i = b.insumo || {};
      const motivo = motivoInsumoInvalido(i);
      if (motivo) return res.status(400).json({ error: motivo });
      const id = String(i.id || '') || nuevoId('in');
      const fila = {
        id,
        nombre: i.nombre.trim(),
        tipo: i.tipo,
        unidad: i.unidad,
        bulto: textoOpcional(i.bulto),
        por_bulto: i.porBulto ?? null,
        marcas: i.marcas,
        minimo: i.minimo,
        dias_reposicion: i.diasReposicion ?? null,
        consumo: i.consumo || {},
        activo: i.activo !== false,
        nota: textoOpcional(i.nota),
        autor: yo,
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from('insumo').upsert(fila);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true, id });
    }

    if (action === 'borrar-insumo') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      // El libro se va con él (`on delete cascade`): un movimiento sin insumo no se puede leer, y
      // dejar el insumo apagado en vez de borrarlo es lo que hace el tilde `activo`.
      const { error } = await sb.from('insumo').delete().eq('id', id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'guardar-movimiento') {
      const m = b.movimiento || {};
      // 🔴 Un traslado no entra por acá: son DOS filas y las arma `patasDeTraslado`. Si entrara,
      // quedaría media mitad de un traslado y el stock del otro lado nunca se enteraría.
      if (m.tipo === 'traslado') return res.status(400).json({ error: 'Un traslado se guarda con la acción trasladar.' });
      const limpio = {
        ...m,
        cantidad: Number(m.cantidad),
        precioTotal: numeroOpcional(m.precioTotal),
      };
      const motivo = motivoMovimientoInvalido(limpio);
      if (motivo) return res.status(400).json({ error: motivo });
      const id = String(m.id || '') || nuevoId('mv');
      const { error } = await sb.from('insumo_movimiento').upsert({
        id,
        insumo_id: limpio.insumoId,
        tipo: limpio.tipo,
        ubicacion: limpio.ubicacion,
        cantidad: limpio.cantidad,
        fecha: limpio.fecha,
        precio_total: limpio.precioTotal,
        proveedor: textoOpcional(m.proveedor),
        comprobante: textoOpcional(m.comprobante),
        grupo: textoOpcional(m.grupo),
        usuario: yo,
        nota: textoOpcional(m.nota),
      });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true, id });
    }

    if (action === 'trasladar') {
      const origen = String(b.origen || '');
      const destino = String(b.destino || '');
      if (!CLAVES_UBICACION.includes(origen) || !CLAVES_UBICACION.includes(destino)) {
        return res.status(400).json({ error: 'De dónde y adónde tienen que ser dos lugares de la lista.' });
      }
      if (origen === destino) return res.status(400).json({ error: 'El origen y el destino son el mismo lugar.' });
      const patas = patasDeTraslado({
        insumoId: String(b.insumoId || ''),
        origen,
        destino,
        cantidad: Number(b.cantidad),
        fecha: String(b.fecha || ''),
        usuario: yo,
        nota: textoOpcional(b.nota),
      });
      for (const p of patas) {
        const motivo = motivoMovimientoInvalido(p);
        if (motivo) return res.status(400).json({ error: motivo });
      }
      const filas = patas.map((p) => ({
        id: nuevoId('mv'),
        insumo_id: p.insumoId,
        tipo: 'traslado',
        ubicacion: p.ubicacion,
        cantidad: p.cantidad,
        fecha: p.fecha,
        grupo: p.grupo,
        usuario: yo,
        nota: p.nota,
        datos: { pata: p.pata },
      }));
      const { error } = await sb.from('insumo_movimiento').insert(filas);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true, grupo: patas[0].grupo });
    }

    if (action === 'borrar-movimiento') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const { data, error: e1 } = await sb.from('insumo_movimiento').select('id, tipo, grupo').eq('id', id).maybeSingle();
      if (e1) return res.status(400).json({ error: e1.message });
      if (!data) return res.status(404).json({ error: 'Ese movimiento ya no existe.' });
      // 🔴 **Borrar media pata de un traslado deja la mercadería duplicada o desaparecida.** Si la
      // fila es de un traslado, se van las dos.
      const q = data.tipo === 'traslado' && data.grupo
        ? sb.from('insumo_movimiento').delete().eq('grupo', data.grupo)
        : sb.from('insumo_movimiento').delete().eq('id', id);
      const { error } = await q;
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `acción inválida: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'error inesperado' });
  }
}
