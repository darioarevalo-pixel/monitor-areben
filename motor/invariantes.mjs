/**
 * LAS REGLAS DEL PROPIO LIBRO (Bruno, 25-oct: «GN falla y genera diferencias; si construimos un edificio idéntico a uno
 * inclinado nos sale inclinado»). El libro de stock se valida contra SÍ MISMO, ⛔ contra GN: cada regla es una consulta que
 * devuelve las filas que la rompen. Sólo LEE (la conexión sin `--escribir` es READ ONLY) y ⛔ crea tablas.
 *
 *   falla  una regla rota es un error nuestro (movimiento duplicado, anulación que no cierra…): abre la alerta.
 *   aviso  se lista en el Summary y ⛔ alerta (un negativo hoy es normal: GN los permite; un ritmo raro es una pista).
 *
 * Lo que ⛔ cubre (un error sistemático que deja las cuentas cuadradas, p. ej. restar mal un talle): eso lo agarran los
 * CONTEOS físicos y las fuentes que no son GN (TN). Que el libro pase estas reglas es necesario, ⛔ suficiente.
 */

/** Lo que cada regla necesita para poder evaluarse: si falta una tabla, la regla se OMITE y la corrida lo dice. */
const T = { venta: 'venta', linea: 'venta_linea', anulacion: 'venta_anulacion', pendiente: 'venta_vuelta_pendiente', variante: 'variante', deposito: 'deposito', transferencia: 'stock_transferencia', transferenciaRenglon: 'stock_transferencia_renglon', cheque: 'cheque', chequeEvento: 'cheque_evento', factura: 'venta_factura' }

/** Una venta que mueve stock en el libro (`mueveStock` de lib/venta/armar.mjs): propia, ⛔ de prueba, ⛔ reflejada por GN. */
const VENTA_QUE_MUEVE = `not v.prueba and v.gn_sale_id is null and coalesce(v.detalle->>'gn_sale_id', '') = '' and v.origen <> 'gn'`
const TIPOS_DE_VENTA = `('venta', 'cambio_entra', 'cambio_sale')`

/**
 * @typedef {{ id: string, titulo: string, gravedad: 'falla' | 'aviso', necesita?: string[], usaAhora?: boolean, sql: string }} Regla
 * Cada `sql` devuelve `ref` (qué fila) y `detalle` (por qué), ⛔ más.
 */
/** @type {Regla[]} */
export const REGLAS = [
  {
    id: 'doble_conteo',
    titulo: 'Una venta de GN contada por dos fuentes a la vez',
    gravedad: 'falla',
    // La venta de GN que reclama la Caja es un traspaso (el de GN se corrige a 0): a lo sumo UN origen con neto ≠ 0.
    // `unique(origen, origen_ref)` ya impide el duplicado exacto; éste es el disfrazado (otra clave, otro origen).
    sql: `select 'venta GN ' || gn_venta_id || ' · ' || linea || ' ' || product_id || '/' || size_id || ' · ' || deposito as ref,
                 string_agg(origen || ' ' || neto, ' + ' order by origen) as detalle
          from (select gn_venta_id, linea, product_id, size_id, deposito, origen, sum(cantidad) as neto
                from stock_movimiento
                where gn_venta_id is not null and tipo in ('venta', 'anulacion', 'correccion')
                group by 1, 2, 3, 4, 5, 6 having sum(cantidad) <> 0) x
          group by gn_venta_id, linea, product_id, size_id, deposito
          having count(*) > 1`,
  },
  {
    id: 'anulacion_no_cierra',
    titulo: 'Un hecho anulado que sigue moviendo stock',
    gravedad: 'falla',
    // La suma de los movimientos de una clave es lo que el hecho movió HOY: anulado = 0. Sólo las claves que tienen venta Y anulación
    // (una anulación suelta —GN después del corte— sube el stock a propósito).
    sql: `select origen || ' ' || clave as ref, 'suma ' || sum(cantidad) || ' (tendría que ser 0)' as detalle
          from stock_movimiento
          group by origen, clave
          having bool_or(tipo = 'venta') and bool_or(tipo = 'anulacion') and sum(cantidad) <> 0`,
  },
  {
    id: 'transferencia_no_suma_cero',
    titulo: 'Una transferencia que no suma cero, que no cambia de depósito o que no tiene grupo',
    gravedad: 'falla',
    necesita: [T.transferencia, T.transferenciaRenglon],
    // Lo que el documento YA dice ⛔ es una rotura: en tránsito (salió y falta llegar) o recibida con diferencia (`recibirTransferencia`
    // la deja marcada y «la cierra un ajuste»). Sin esto, la T-10 de Stunned (prueba del corte, limpiada con 2 ajustes) abría la alerta
    // para siempre: una alerta que no se cierra tapa la próxima. El movimiento tiene que coincidir con el renglón, si no sigue saltando.
    sql: `select coalesce(m.grupo, max(m.origen_ref)) as ref,
                case when m.grupo is null then 'transferencia sin grupo: no se puede emparejar'
                     else 'suma ' || sum(m.cantidad) || ' en ' || count(distinct m.deposito) || ' depósito(s)' end as detalle
          from stock_movimiento m
          where m.tipo = 'transferencia'
          group by m.grupo, m.product_id, m.size_id, case when m.grupo is null then m.origen_ref end
          having m.grupo is null
              or ((sum(m.cantidad) <> 0 or count(distinct m.deposito) < 2)
                  and not exists (
                    select 1 from stock_transferencia t
                    join stock_transferencia_renglon r on r.transferencia_id = t.id
                    where 'transf:' || t.id::text = m.grupo and r.product_id = m.product_id and r.size_id = m.size_id
                      and sum(m.cantidad) = case t.estado when 'en_transito' then -r.enviada when 'recibida' then r.recibida - r.enviada end
                      and (count(distinct m.deposito) = 2 or coalesce(r.recibida, 0) = 0)))`,
  },
  {
    id: 'cambio_incoherente',
    titulo: 'Un movimiento de cambio que no es de un cambio, o con el signo al revés',
    gravedad: 'falla',
    necesita: [T.venta],
    // cambio_entra = la prenda vuelve (suma) · cambio_sale = se lleva otra (resta).
    sql: `select m.origen_ref as ref,
                case when v.id is null then 'no hay venta con ese grupo'
                     when v.tipo <> 'cambio' then 'la venta ' || v.numero || ' no es un cambio'
                     else m.tipo || ' con cantidad ' || m.cantidad end as detalle
          from stock_movimiento m left join venta v on v.id::text = m.grupo
          where m.tipo in ('cambio_entra', 'cambio_sale')
            and (v.id is null or v.tipo <> 'cambio' or (m.tipo = 'cambio_entra' and m.cantidad <= 0) or (m.tipo = 'cambio_sale' and m.cantidad >= 0))`,
  },
  {
    id: 'deposito_desconocido',
    titulo: 'Un movimiento en un depósito que la marca no tiene',
    gravedad: 'falla',
    necesita: [T.deposito],
    sql: `select m.linea || ' · ' || m.deposito as ref, count(*) || ' movimiento(s), primero ' || min(m.origen_ref) as detalle
          from stock_movimiento m
          where not exists (select 1 from deposito d where d.marca = m.linea and d.id = m.deposito)
          group by m.linea, m.deposito`,
  },
  {
    id: 'variante_fuera_del_catalogo',
    titulo: 'Un movimiento de una variante que no está en el catálogo',
    gravedad: 'falla',
    necesita: [T.variante],
    sql: `select m.linea || ' ' || m.product_id || '/' || m.size_id as ref, count(*) || ' movimiento(s), primero ' || min(m.origen_ref) as detalle
          from stock_movimiento m
          where not exists (select 1 from variante v where v.product_id = m.product_id and v.size_id = m.size_id)
          group by m.linea, m.product_id, m.size_id`,
  },
  {
    id: 'venta_sin_movimiento',
    titulo: 'Una venta propia que no está en el libro (o con otra cantidad, depósito o marca)',
    gravedad: 'falla',
    necesita: [T.venta, T.linea],
    sql: `select 'venta ' || v.numero || ' (' || v.marca || ') renglón ' || l.n as ref,
                case when m.id is null then 'falta el movimiento'
                     when m.cantidad <> -l.cantidad then 'cantidad ' || m.cantidad || ' en vez de ' || -l.cantidad
                     else 'depósito/marca distintos: ' || m.linea || ' ' || m.deposito || ' en vez de ' || v.marca || ' ' || v.deposito end as detalle
          from venta v join venta_linea l on l.venta_id = v.id
          left join stock_movimiento m on m.origen = 'motor' and m.clave = v.id::text || ':' || l.id::text and m.tipo in ${TIPOS_DE_VENTA}
          where ${VENTA_QUE_MUEVE}
            and (m.id is null or m.cantidad <> -l.cantidad or m.deposito <> v.deposito or m.linea <> v.marca)`,
  },
  {
    id: 'movimiento_sin_venta',
    titulo: 'Un movimiento de venta o de anulación del motor sin venta detrás',
    gravedad: 'falla',
    necesita: [T.venta, T.linea],
    sql: `select m.origen_ref as ref,
                case when m.tipo = 'anulacion' then 'anulación y la venta no está anulada' else m.tipo || ' sin renglón de venta' end as detalle
          from stock_movimiento m
          where m.origen = 'motor' and m.tipo in ('venta', 'cambio_entra', 'cambio_sale', 'anulacion')
            and not exists (
              select 1 from venta v join venta_linea l on l.venta_id = v.id
              where v.id::text || ':' || l.id::text = m.clave and (m.tipo <> 'anulacion' or v.estado = 'anulada'))`,
  },
  {
    id: 'anulada_sin_devolver',
    titulo: 'Una venta anulada cuya prenda no volvió al libro (y no está esperando que la confirmen)',
    gravedad: 'falla',
    necesita: [T.venta, T.linea, T.anulacion, T.pendiente],
    sql: `select 'venta ' || v.numero || ' (' || v.marca || ') renglón ' || l.n as ref, 'anulada y sin el movimiento que devuelve ' || l.cantidad as detalle
          from venta v join venta_linea l on l.venta_id = v.id join venta_anulacion a on a.venta_id = v.id
          where v.estado = 'anulada' and ${VENTA_QUE_MUEVE}
            and not exists (select 1 from venta_vuelta_pendiente p where p.venta_id = v.id)
            and not exists (select 1 from stock_movimiento m
                            where m.origen = 'motor' and m.tipo = 'anulacion' and m.origen_ref = v.id::text || ':' || l.id::text || ':anulacion'
                              and m.cantidad = l.cantidad)`,
  },
  {
    // Revisión 10-nov: TN cancela una venta ya FACTURADA ⇒ `anularVenta` devuelve `nc_pendiente` y nadie lo guarda: la factura
    // queda viva en ARCA, callada. Desde el corte de BDI pasa con plata real. Medido 11-nov: 0 en las dos bases (nace verde).
    // Se cierra sola cuando se emite la NC (`venta_factura` tipo `nc`).
    id: 'anulada_facturada_sin_nc',
    titulo: 'Una venta anulada que tenía factura y todavía no tiene su nota de crédito',
    gravedad: 'falla',
    necesita: [T.venta, T.factura],
    sql: `select 'venta ' || v.numero || ' (' || v.marca || ')' as ref, 'anulada con la factura ' || f.factura_id || ' y sin nota de crédito' as detalle
          from venta v join venta_factura f on f.venta_id = v.id and f.tipo = 'factura'
          where v.estado = 'anulada' and not v.prueba
            and not exists (select 1 from venta_factura n where n.venta_id = v.id and n.tipo = 'nc')`,
  },
  {
    id: 'negativo',
    titulo: 'Un nivel de stock negativo',
    // Hoy GN los permite y el libro arrastra los suyos: es AVISO. Al corte (VENTA_SIN_NEGATIVOS, la Caja pide PIN) pasa a falla con
    // `negativosFalla`. ⛔ se puede comprobar «con PIN» todavía: el PIN no queda en el movimiento.
    gravedad: 'aviso',
    sql: `select linea || ' ' || product_id || '/' || size_id || ' · ' || deposito as ref, 'nivel ' || sum(cantidad) as detalle
          from stock_movimiento
          group by linea, product_id, size_id, deposito
          having sum(cantidad) < 0`,
  },
  {
    id: 'venta_grande',
    titulo: 'Una venta de más de 100 unidades de una variante en una vez (últimos 7 días)',
    gravedad: 'aviso',
    usaAhora: true,
    sql: `select origen_ref as ref, linea || ' ' || product_id || '/' || size_id || ' · ' || deposito || ': ' || cantidad || ' u' as detalle
          from stock_movimiento
          where tipo = 'venta' and cantidad <= -100 and ocurrido_en > $1::timestamptz - interval '7 days'`,
  },
  {
    id: 'deposito_quieto',
    titulo: 'Un depósito que se movía y lleva 7 días sin un solo movimiento',
    gravedad: 'aviso',
    usaAhora: true,
    sql: `select linea || ' · ' || deposito as ref, 'último movimiento: ' || to_char(max(ocurrido_en), 'YYYY-MM-DD') as detalle
          from stock_movimiento
          where tipo <> 'apertura'
          group by linea, deposito
          having max(ocurrido_en) <= $1::timestamptz - interval '7 days' and max(ocurrido_en) > $1::timestamptz - interval '37 days'`,
  },
  // LOS CHEQUES (sql/079): el cheque y su pago a cuenta son UNA cosa; el rechazo devuelve la deuda.
  {
    id: 'cheque_sin_pago',
    titulo: 'Un cheque sin su pago a cuenta, o con otro cliente o monto',
    gravedad: 'falla',
    necesita: [T.cheque],
    sql: `select ch.marca || ' cheque ' || ch.numero || ' · ' || ch.pago_ref as ref,
                 coalesce('el pago es de ' || m.monto, 'sin pago') as detalle
          from cheque ch
          left join cuenta_movimiento m on m.empresa_id = ch.empresa_id and m.ref = ch.pago_ref and m.tipo = 'pago'
          where m.id is null or m.cliente_id <> ch.cliente_id or m.monto <> -ch.monto or m.prueba <> ch.prueba`,
  },
  {
    id: 'pago_cheque_sin_cheque',
    titulo: 'Un pago con la cuenta «Cheque» sin su cheque en la cartera',
    gravedad: 'falla',
    necesita: [T.cheque],
    sql: `select m.marca || ' · ' || m.ref as ref, 'pago de ' || -m.monto || ' sin cheque' as detalle
          from cuenta_movimiento m join cuenta_cobro c on c.id = m.cuenta_cobro_id
          where m.tipo = 'pago' and c.medio = 'cheque'
            and not exists (select 1 from cheque ch where ch.empresa_id = m.empresa_id and ch.pago_ref = m.ref)`,
  },
  {
    id: 'cheque_rechazado_sin_deuda',
    titulo: 'Un cheque rechazado cuya deuda no volvió (su pago sigue en pie)',
    gravedad: 'falla',
    necesita: [T.cheque, T.chequeEvento],
    sql: `select ch.marca || ' cheque ' || ch.numero as ref, 'rechazado el ' || to_char(e.ocurrida_en, 'YYYY-MM-DD') || ' sin anular ' || ch.pago_ref as detalle
          from cheque ch join cheque_evento e on e.cheque_id = ch.id and e.estado = 'rechazado'
          where not exists (select 1 from cuenta_movimiento a where a.empresa_id = ch.empresa_id and a.ref = ch.pago_ref || ':anulacion')`,
  },
  {
    id: 'cheque_salto_de_estado',
    titulo: 'Un cheque acreditado sin depósito, o con eventos después de anulado',
    gravedad: 'falla',
    necesita: [T.cheque, T.chequeEvento],
    sql: `select ch.marca || ' cheque ' || ch.numero as ref, string_agg(e.estado, ' + ' order by e.ocurrida_en) as detalle
          from cheque ch join cheque_evento e on e.cheque_id = ch.id
          group by ch.id, ch.empresa_id, ch.marca, ch.numero, ch.pago_ref
          having (bool_or(e.estado = 'acreditado') and not bool_or(e.estado = 'depositado'))
              or (bool_or(e.estado = 'acreditado') and bool_or(e.estado = 'rechazado'))
              or (not bool_or(e.estado = 'rechazado') and exists (select 1 from cuenta_movimiento a
                    where a.empresa_id = ch.empresa_id and a.ref = ch.pago_ref || ':anulacion'))`,
  },
  {
    id: 'cheque_vencido_en_cartera',
    titulo: 'Un cheque en cartera con más de 25 días de su fecha de pago (el banco lo toma hasta los 30)',
    gravedad: 'aviso',
    usaAhora: true,
    necesita: [T.cheque, T.chequeEvento],
    sql: `select marca || ' cheque ' || numero || ' · ' || banco as ref, 'fecha de pago ' || to_char(vence_el, 'YYYY-MM-DD') || ', $' || monto as detalle
          from cheque_estado
          where estado = 'en_cartera' and not prueba and vence_el < ($1::timestamptz at time zone 'America/Argentina/Buenos_Aires')::date - 25`,
  },
]

const EJEMPLOS = 5

/** La regla ajustada a las opciones (hoy sólo: el negativo pasa a falla al corte). */
export function reglasVigentes({ negativosFalla = false } = {}) {
  return REGLAS.map((r) => (r.id === 'negativo' && negativosFalla ? { ...r, gravedad: 'falla' } : r))
}

/** Qué tablas de las que pide la regla no están en la base. */
async function tablasQueFaltan(db, regla) {
  const faltan = []
  for (const t of regla.necesita ?? []) {
    const [{ hay }] = await db.q(`select to_regclass($1) is not null as hay`, [`public.${t}`])
    if (!hay) faltan.push(t)
  }
  return faltan
}

/**
 * Corre las reglas sobre UNA base. Devuelve una fila por regla: `{ id, titulo, gravedad, total, ejemplos }` o, si no se pudo
 * evaluar, `{ …, omitida: 'falta la tabla X' }` (la corrida lo cuenta como «no pude revisar»).
 * @param {{ q: (sql: string, p?: any[]) => Promise<any[]> }} db
 */
export async function revisarLibro(db, { ahora = new Date(), negativosFalla = false } = {}) {
  const [{ hay }] = await db.q(`select to_regclass('public.stock_movimiento') is not null as hay`)
  if (!hay) throw new Error('No existe stock_movimiento: el libro no está en esta base')
  const salida = []
  for (const regla of reglasVigentes({ negativosFalla })) {
    const base = { id: regla.id, titulo: regla.titulo, gravedad: regla.gravedad }
    const faltan = await tablasQueFaltan(db, regla)
    if (faltan.length) { salida.push({ ...base, total: 0, ejemplos: [], omitida: `falta la tabla ${faltan.join(', ')}` }); continue }
    const envuelta = `with v as (${regla.sql})
      select (select count(*)::int from v) as total,
             coalesce((select jsonb_agg(to_jsonb(x)) from (select * from v order by ref limit ${EJEMPLOS}) x), '[]'::jsonb) as ejemplos`
    const [r] = await db.q(envuelta, regla.usaAhora ? [new Date(ahora).toISOString()] : [])
    salida.push({ ...base, total: r.total, ejemplos: r.ejemplos })
  }
  return salida
}

/** Las que fallaron de verdad (gravedad `falla` y al menos una fila). */
export const fallas = (resultados) => resultados.filter((r) => r.gravedad === 'falla' && !r.omitida && r.total > 0)
/** Las que no se pudieron evaluar. */
export const omitidas = (resultados) => resultados.filter((r) => r.omitida)

/** El Summary de la corrida (Markdown). */
export function resumenTexto(base, resultados) {
  const rotas = fallas(resultados)
  const lineas = [`### Reglas del libro — ${base}`, '']
  lineas.push(rotas.length ? `🔴 **${rotas.length} regla(s) rota(s)**` : '✅ **El libro pasa todas sus reglas**')
  lineas.push('', '| regla | | filas |', '|---|---|---|')
  for (const r of resultados) {
    const marca = r.omitida ? '⏭️' : r.total === 0 ? '✅' : r.gravedad === 'falla' ? '🔴' : '⚠️'
    lineas.push(`| ${r.titulo} | ${marca} | ${r.omitida ? r.omitida : r.total} |`)
  }
  for (const r of resultados.filter((x) => !x.omitida && x.total > 0)) {
    lineas.push('', `**${r.titulo}** (${r.gravedad}) — ${r.total} fila(s), las primeras:`)
    for (const e of r.ejemplos) lineas.push(`- ${e.ref} — ${e.detalle}`)
  }
  return lineas.join('\n')
}

/** El título y el detalle de la alerta (corto: el detalle se recorta a 1000). */
export function textoDeAlerta(base, resultados) {
  const rotas = fallas(resultados)
  return {
    titulo: `El libro de ${base} rompe ${rotas.length} regla(s) propia(s): ${rotas.map((r) => r.id).join(', ')}`,
    detalle: rotas.map((r) => `${r.id}: ${r.total} (${r.ejemplos[0]?.ref ?? ''})`).join(' | '),
  }
}
