'use client'

/**
 * ERP › Reglas. Las REGLAS COMERCIALES por forma de pago de cada tienda (❓ 15, Bruno 15/16-oct: «dinámica según el fin
 * comercial que haya»): cada fin comercial es una regla —«efectivo siempre −15 %», «liquidación: efectivo a precio final»,
 * «finde jeans −20 %»— y se cargan, corrigen y apagan acá. El SIMULADOR cobra una venta con las 4 formas de pago y dice
 * qué regla ganó; una regla a medio cargar se prueba ahí antes de guardarla.
 *
 * 🔑 Lo que decidió Bruno (16-oct): la campaña reemplaza a las de temporada en SUS prendas; entre dos reglas gana la MEJOR
 * para la clienta (no se suman); el % de la forma de pago va sobre el precio de campaña; online no hereda las del local.
 * La cuenta la hace el motor (`motor/venta/reglas.mjs`): la pantalla no calcula ningún %.
 *
 * 🔑 Parte 3 (17-oct): «la Caja cobra con estas reglas» se prende POR MARCA acá. Apagada, la Caja sigue con su
 * configuración y la pantalla compara las dos y dice dónde no coinciden; prendida, la Caja saca el % de las reglas (de
 * una copia que se rehace en cada cambio) y la pantalla dice con qué copia cobra y qué reglas la Caja no puede cobrar.
 */

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Field, Input, MenuAcciones, MoneyText, Notice, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, color, font, space, useConfirmar, type AccionMenu } from '@/components/ui'
import { ListaTrabajo, type ColumnaLista } from '@/components/ui/ListaTrabajo'
import { BuscadorLista, ChipEstado, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { normal } from '@/lib/erp/stock-lista.core.js'
import { TiraConfiguracion, type PiezaConfiguracion } from './TiraConfiguracion'
import {
  buscarPrendas, guardarRegla, leerReglas, prenderCajaReglas, simularReglas, traerReglasDeCaja,
  type CopiaEnCaja, type FormaSimulada, type MarcaErp, type MedioRegla, type PrendaASimular, type ReglaComercial, type ReglasDeMarca, type Simulacion,
} from '@/lib/erp/cliente'
import { resumenDeRegla } from '@/lib/erp/reglas.core.js'
import { traerAudit } from '@/lib/tn-audit'
import { indexarTn, matchTn, type IndiceTn, type TnProducto } from '@/lib/tn'
import { ofertaVigente } from '@/lib/tienda.core.js'
import { validarRegla } from '@/motor/venta/reglas.mjs'
import { esStunned } from '@/lib/lineas'
import { useTiendaErp } from '@/lib/erp/linea-erp'

const MARCAS: Array<{ key: MarcaErp; label: string }> = [{ key: 'zattia', label: 'Zattia' }, { key: 'bdi', label: 'BDI' }]
const MEDIOS: Array<{ key: MedioRegla; label: string }> = [
  { key: 'efectivo', label: 'Efectivo' }, { key: 'transferencia', label: 'Transferencia' }, { key: 'debito', label: 'Débito' }, { key: 'credito', label: 'Crédito' },
]
const EFECTOS = [
  { key: 'descuento', label: 'Descuento %' }, { key: 'recargo', label: 'Recargo %' }, { key: 'final', label: 'Precio final (sin descuento)' }, { key: 'no', label: 'No se acepta' },
] as const
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const TEMPORADA = ''

/** El día argentino de una fecha guardada, para el `<input type=date>` y para mostrar. */
const diaAR = (iso: string | null) => (iso ? new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10) : '')
const aIso = (dia: string) => (dia ? `${dia}T03:00:00.000Z` : null)
const corto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const hoyAR = () => diaAR(new Date().toISOString())

/**
 * Las LÍNEAS con reglas propias dentro de una marca (Bruno, 17-oct: «cada negocio dentro del ERP puede configurar sus
 * propias reglas»): Stunned se cobra en la Caja de Zattia, con las suyas; sin ninguna, con las de Zattia.
 */
const COLUMNAS_REGLAS: ColumnaLista[] = [
  { key: 'regla', titulo: 'Regla', ancho: 'minmax(200px, 1.4fr)', movil: 'titulo' },
  { key: 'hace', titulo: 'Qué hace', ancho: 'minmax(200px, 1.4fr)', movil: 'oculta' },
  { key: 'prendas', titulo: 'En qué productos', ancho: 'minmax(150px, 1fr)', movil: 'oculta' },
  { key: 'campania', titulo: 'Campaña', ancho: '130px', movil: 'oculta' },
  { key: 'canal', titulo: 'Canal', ancho: '76px', movil: 'chico' },
  { key: 'cuando', titulo: 'Cuándo', ancho: '140px', movil: 'chico' },
  { key: 'estado', titulo: 'Estado', ancho: '124px', movil: 'chico' },
]

const LINEAS: Partial<Record<MarcaErp, Array<{ key: string; label: string }>>> = { zattia: [{ key: 'zattia', label: 'Zattia' }, { key: 'stunned', label: 'Stunned' }] }

const VACIA: ReglaComercial = {
  nombre: '', fin: null, canal: 'local', campania: null, alcance: 'todo', alcance_ids: [], medios: [], banco: null, cuotas: null,
  monto_minimo: null, efecto: 'descuento', pct: null, desde: null, hasta: null, dias: null, activa: true,
}

function vigenciaEnTexto(r: ReglaComercial) {
  const partes = []
  if (r.desde || r.hasta) partes.push(r.desde && r.hasta ? `${corto(diaAR(r.desde))} al ${corto(diaAR(r.hasta))}` : r.desde ? `desde ${corto(diaAR(r.desde))}` : `hasta ${corto(diaAR(r.hasta))}`)
  if (r.dias) partes.push(r.dias.map((d) => DIAS[d]).join(' '))
  return partes.length ? partes.join(' · ') : 'Siempre'
}

function alcanceEnTexto(r: ReglaComercial) {
  if (r.alcance === 'todo') return r.campania ? 'Los productos de la campaña' : 'Toda la tienda'
  if (r.alcance === 'categorias') return r.alcance_ids.join(', ')
  return `${r.alcance_ids.length} ${r.alcance === 'productos' ? 'producto' : 'variante'}${r.alcance_ids.length === 1 ? '' : 's'}`
}

export function ReglasComerciales({ ir }: { ir?: (p: PiezaConfiguracion) => void }) {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const [datos, setDatos] = useState<ReglasDeMarca | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [editando, setEditando] = useState<ReglaComercial | null>(null)
  // La línea que se mira (Stunned adentro de Zattia); en una marca sin líneas, la marca.
  // La línea es la del selector del menú (⛔ un selector de otra marca adentro: Bruno, 28-oct). Cambiarla remonta (`key` en `Erp`).
  const linea: string = useTiendaErp()
  const [vista, setVista] = useState('prendidas')
  const [q, setQ] = useState('')
  const { confirmar } = useConfirmar()
  // 🔑 Las categorías son las de TIENDA NUBE (las mismas que mira la Caja: `matchTn` sobre el catálogo), por nombre.
  const [tn, setTn] = useState<{ marca: MarcaErp; idx: IndiceTn; categorias: string[] } | null>(null)
  useEffect(() => {
    let vivo = true
    traerAudit<TnProducto>(marca).then((ps) => {
      if (!vivo) return
      const categorias = [...new Set(ps.flatMap((p) => p.categories ?? []))].sort((a, b) => a.localeCompare(b, 'es'))
      setTn({ marca, idx: indexarTn(ps), categorias })
    }).catch(() => vivo && setTn({ marca, idx: indexarTn([]), categorias: [] }))
    return () => { vivo = false }
  }, [marca])
  const catalogo = tn && tn.marca === marca ? tn : null

  async function correr(fn: () => Promise<void>, fallo: string) {
    setTrabajando(true)
    try {
      await fn()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : fallo)
    } finally {
      setTrabajando(false)
    }
  }

  const recargar = () => correr(async () => setDatos(await leerReglas(marca)), 'No se pudieron leer las reglas.')

  // La marca es la del menú (el `key` de Erp vuelve a montar la pantalla al cambiarla).
  useEffect(() => {
    let vivo = true
    leerReglas(marca).then((r) => { if (vivo) setDatos(r) })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer las reglas.'))
    return () => { vivo = false }
  }, [marca])

  const nombreCampania = (id: string | null) => (id ? datos?.campanias.find((c) => c.id === id)?.nombre ?? id : 'Temporada')

  async function traerDeCaja() {
    await correr(async () => {
      const seco = await traerReglasDeCaja(marca, false)
      const ok = await confirmar({
        titulo: `Traer las reglas de la Caja de ${MARCAS.find((m) => m.key === marca)?.label}`,
        mensaje: (
          <div>
            <p>Lo que la Caja cobra hoy, como reglas ({seco.reglas.length}):</p>
            <ul style={{ margin: `${space[2]} 0`, paddingLeft: space[5] }}>
              {seco.reglas.map((r, i) => <li key={i}>{r.campania ? `${nombreCampania(r.campania)} · ` : ''}{resumenDeRegla(r)}</li>)}
            </ul>
            {seco.avisos.map((a) => <p key={a} style={{ color: 'var(--warning-text, #92400e)' }}>{a}</p>)}
            <p style={{ marginTop: space[3] }}>Se traen una sola vez. La promo bancaria no se trae: se lee de la Agenda.</p>
          </div>
        ),
        ok: 'Traer',
      })
      if (!ok) return
      const r = await traerReglasDeCaja(marca, true)
      setHecho(r.sembradas ? `Se trajeron ${r.sembradas} reglas de la Caja.` : `Ya estaban (${r.yaEstaban}).`)
      dijoLaCaja(r.caja)
      await recargar()
    }, 'No se pudieron traer las reglas de la Caja.')
  }

  /** Lo que pasó con la copia de la Caja después de guardar: si ⛔ se pudo copiar, la Caja sigue con la anterior. */
  const dijoLaCaja = (c: CopiaEnCaja) => { if (c && 'error' in c) setError(c.error) }

  async function cajaConReglas(prender: boolean) {
    const nombre = MARCAS.find((m) => m.key === marca)?.label
    const faltan = datos?.caja.diferencias.faltan ?? []
    const ok = await confirmar({
      titulo: prender ? `Que la Caja de ${nombre} cobre con estas reglas` : `Que la Caja de ${nombre} vuelva a su configuración`,
      mensaje: prender ? (
        <div>
          <p>Desde ahora, el descuento de cada forma de pago en la Caja sale de las reglas prendidas de esta pantalla (y de la promo bancaria de la Agenda). La cuenta de Gestión Nube de cada pago no cambia.</p>
          {faltan.length > 0 && <p style={{ color: 'var(--warning-text, #92400e)' }}>Ojo: la Caja hoy cobra esto y ninguna regla prendida lo dice: {faltan.join(' · ')}. Con las reglas, eso deja de aplicarse.</p>}
          <p>Cada vez que se guarda una regla, la Caja la toma (las pantallas abiertas, al recargar).</p>
        </div>
      ) : <p>La Caja vuelve a cobrar con Formas de pago y Productos en oferta. Las reglas quedan guardadas.</p>,
      ok: prender ? 'Prender' : 'Volver',
      tono: 'warning',
    })
    if (!ok) return
    await correr(async () => {
      const r = await prenderCajaReglas(marca, prender)
      setHecho(r.prendida ? `La Caja de ${nombre} cobra con las reglas (${r.copiadas ?? 0}).` : `La Caja de ${nombre} volvió a su configuración.`)
      await recargar()
    }, 'No se pudo cambiar con qué cobra la Caja.')
  }

  async function prenderApagar(r: ReglaComercial) {
    const ok = await confirmar({
      titulo: `${r.activa ? 'Apagar' : 'Prender'} «${r.nombre}»`,
      mensaje: <p>{r.activa ? 'La regla deja de aplicarse (queda guardada y se puede volver a prender).' : 'La regla vuelve a aplicarse.'}</p>,
      ok: r.activa ? 'Apagar' : 'Prender',
      tono: r.activa ? 'warning' : undefined,
    })
    if (!ok) return
    await correr(async () => {
      const g = await guardarRegla(marca, { ...r, activa: !r.activa })
      setHecho(`«${r.nombre}» ${r.activa ? 'apagada' : 'prendida'}.`)
      dijoLaCaja(g.caja)
      await recargar()
    }, 'No se pudo guardar la regla.')
  }

  const lineas = LINEAS[marca] ?? null
  const deLinea = lineas ? linea : marca
  const nombreLinea = lineas?.find((l) => l.key === deLinea)?.label ?? deLinea
  const esLinea = deLinea !== marca
  const guardadas = (datos?.reglas ?? []).filter((r) => (r.marca ?? marca) === deLinea)
  // ¿La línea tiene reglas propias? Las que cuentan son las prendidas del local (como en la Caja, `deLaLinea` del motor).
  const lineaSinReglas = esLinea && !guardadas.some((r) => r.activa && r.canal === 'local')
  const cc = datos?.cobraConReglas
  // Prendida, comparar con la configuración vieja de la Caja ya no dice nada: la Caja cobra con las reglas.
  // La comparación con la Caja es de las reglas de la MARCA (la Caja de hoy ⛔ distingue Stunned).
  const dif = cc?.prendida || esLinea ? null : datos?.caja.diferencias

  // Una lista con vistas (diseño §3): Prendidas · Apagadas · Promos bancarias (las lee de la Agenda) · Todas. La campaña
  // es una columna (antes, una tabla por campaña).
  const t = normal(q)
  const agenda = esLinea ? [] : datos?.agenda ?? []
  const buscar = (rs: ReglaComercial[]) => (t ? rs.filter((r) => normal([r.nombre, r.fin, resumenDeRegla(r), nombreCampania(r.campania ?? null)].filter(Boolean).join(' ')).includes(t)) : rs)
  const porVista: Record<string, ReglaComercial[]> = {
    prendidas: buscar(guardadas.filter((r) => r.activa)), apagadas: buscar(guardadas.filter((r) => !r.activa)), agenda: buscar(agenda), todas: buscar(guardadas),
  }
  const VISTAS_REGLAS = [['prendidas', 'Prendidas'], ['apagadas', 'Apagadas'], ...(agenda.length ? [['agenda', 'Promos bancarias']] : []), ['todas', 'Todas']] as Array<[string, string]>
  const enVista = VISTAS_REGLAS.some(([k]) => k === vista) ? vista : 'prendidas'
  const conteo = Object.fromEntries(VISTAS_REGLAS.map(([k]) => [k, porVista[k].length]))
  const deAgenda = enVista === 'agenda'

  const celda = (r: ReglaComercial, k: string): React.ReactNode => {
    if (k === 'regla') return <span title={[r.nombre, r.fin].filter(Boolean).join(' · ')}><b style={{ color: color.ink }}>{r.nombre}</b>{r.fin && <span style={{ color: color.mut }}> · {r.fin}</span>}</span>
    if (k === 'hace') return <span style={{ color: color.ink2 }} title={resumenDeRegla(r)}>{resumenDeRegla(r)}</span>
    if (k === 'prendas') return <span style={{ color: color.ink2 }} title={alcanceEnTexto(r)}>{alcanceEnTexto(r)}</span>
    if (k === 'campania') return <span style={{ color: r.campania ? color.ink : color.mut }}>{nombreCampania(r.campania ?? null)}</span>
    if (k === 'canal') return <span style={{ color: color.ink2 }}>{r.canal === 'local' ? 'Local' : 'Online'}</span>
    if (k === 'cuando') return <span style={{ color: color.mut }}>{vigenciaEnTexto(r)}</span>
    if (k === 'estado') return deAgenda ? <ChipEstado mapa={{ x: ['brand', 'De la Agenda'] }} k="x" /> : <ChipEstado mapa={{ x: r.activa ? ['success', 'Prendida'] : ['neutral', 'Apagada'] }} k="x" />
    return null
  }
  const acciones = (r: ReglaComercial) => {
    if (deAgenda) return null
    const menu: AccionMenu[] = [
      { key: 'editar', label: 'Editar la regla', icono: 'lapiz', onClick: () => setEditando(r), disabled: trabajando },
      { key: 'prender', label: r.activa ? 'Apagar' : 'Prender', icono: r.activa ? 'pausa' : 'play', tone: r.activa ? 'warning' : undefined, onClick: () => void prenderApagar(r), disabled: trabajando },
    ]
    return <MenuAcciones acciones={menu} etiqueta={`Más acciones de «${r.nombre}»`} vertical alinear="izquierda" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <TiraConfiguracion activa="reglas" ir={ir} />
      <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, flex: '1 1 320px', color: color.mut }}>
          Cada fin comercial es una regla: cuánto descuenta cada forma de pago, en qué productos y cuándo. En una campaña, sus reglas
          reemplazan a las de temporada en sus productos; entre dos reglas gana la mejor para la clienta.
        </p>
        <Button onClick={() => setEditando({ ...VACIA, marca: deLinea })} disabled={!datos || trabajando}>Agregar regla</Button>
      </div>

      {cc && !cc.prendida && (
        <Notice tone="warning">
          La Caja todavía cobra con su configuración (Formas de pago y Productos en oferta). Estas reglas se cargan y se prueban acá.{' '}
          <Button size="sm" onClick={() => cajaConReglas(true)} disabled={trabajando || !!datos?.caja.diferencias.sinTraer}>Que la Caja cobre con estas reglas</Button>
        </Notice>
      )}
      {cc?.prendida && (
        <Notice tone={cc.alDia ? 'success' : 'danger'}>
          {cc.alDia
            ? <>La Caja cobra con estas reglas{cc.copiadasEn ? ` (tomadas el ${cuandoCorto(cc.copiadasEn)}${cc.por ? ` por ${cc.por}` : ''})` : ''}.{' '}</>
            : <>La Caja cobra con una copia VIEJA de las reglas: lo que se cambió después no lo cobra.{' '}<Button size="sm" onClick={() => cajaConReglas(true)} disabled={trabajando}>Pasarle las de ahora</Button>{' '}</>}
          <Button size="sm" variant="outline" onClick={() => cajaConReglas(false)} disabled={trabajando}>Volver a la configuración de la Caja</Button>
        </Notice>
      )}
      {cc && cc.noCobra.length > 0 && (
        <Notice tone="warning">Estas reglas están prendidas pero la Caja no las puede cobrar: {cc.noCobra.map((r) => `«${r.nombre}» (${r.porque})`).join(' · ')}</Notice>
      )}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho}</Notice>}
      {dif?.sinTraer && (
        <Notice tone="action">
          Todavía no se trajeron las reglas de hoy de la Caja.{' '}
          <Button size="sm" onClick={traerDeCaja} disabled={trabajando}>Traer las reglas de la Caja</Button>
        </Notice>
      )}
      {dif && !dif.sinTraer && (dif.faltan.length > 0 || dif.sobran.length > 0) && (
        <Notice tone="warning">
          {dif.faltan.length > 0 && <div>La Caja cobra esto y ninguna regla prendida lo dice: {dif.faltan.join(' · ')}</div>}
          {dif.sobran.length > 0 && <div>Las reglas dicen esto y la Caja todavía no lo cobra: {dif.sobran.join(' · ')}</div>}
        </Notice>
      )}
      {(datos?.caja.avisos ?? []).map((a) => <Notice key={a} tone="neutral">{a}</Notice>)}
      {datos && lineaSinReglas && (
        <Notice tone="neutral">
          {nombreLinea} no tiene reglas propias: sus productos se cobran con las de {MARCAS.find((m) => m.key === marca)?.label}. Con la primera regla prendida de {nombreLinea}, sus productos se cobran sólo con las de {nombreLinea}.
        </Notice>
      )}

      {!datos && !error && <EmptyState title="Leyendo las reglas…" />}
      {datos && (
        <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
          <VistasLista vistas={VISTAS_REGLAS} valor={enVista} conteo={conteo} onCambio={setVista} />
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
            <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en las reglas" placeholder="Regla, medio o campaña" />
          </div>
          {deAgenda && <div style={{ padding: '0 16px 10px', fontSize: font.sm, color: color.mut }}>Las promos bancarias se cargan en la Agenda: acá sólo se ven.</div>}
          <ListaTrabajo
            columnas={COLUMNAS_REGLAS} filas={porVista[enVista]} claveDe={(r) => r.id ?? r.nombre} celda={celda}
            acciones={deAgenda ? undefined : acciones} anchoAcciones={40}
            activa={editando?.id ?? null} onAbrir={deAgenda ? undefined : (r) => setEditando(r)} etiquetaFila={(r) => `la regla «${r.nombre}»`}
            vacio={<div style={{ padding: space[6] }}><EmptyState title={q ? 'Nada con esa búsqueda.' : guardadas.length ? 'Ninguna en esta vista.' : 'Sin reglas'} hint={!q && !guardadas.length ? 'Traé las de la Caja o agregá una.' : undefined} /></div>}
          />
          <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
            {nombreLinea} · {guardadas.filter((r) => r.activa).length} prendidas de {guardadas.length} · una regla no se elimina: se apaga
          </div>
        </div>
      )}

      {editando && datos && (
        <FormRegla
          key={editando.id ?? 'nueva'} inicial={editando} datos={datos} categorias={catalogo?.categorias ?? []} marca={editando.marca ?? marca} trabajando={trabajando}
          onCancelar={() => setEditando(null)}
          onGuardar={(r) => correr(async () => {
            const g = await guardarRegla(marca, r)
            setHecho(g.nueva ? `Regla «${g.regla.nombre}» agregada.` : `Regla «${g.regla.nombre}» guardada.`)
            dijoLaCaja(g.caja)
            setEditando(null)
            await recargar()
          }, 'No se pudo guardar la regla.')}
        />
      )}

      {datos && <Simulador key={marca} marca={marca} datos={datos} borrador={editando} idx={catalogo?.idx ?? null} />}
    </div>
  )
}

/** El formulario de una regla. Valida con el MISMO núcleo que el servidor (`validarRegla`): mismo texto. */
function FormRegla({ inicial, datos, categorias, marca, trabajando, onCancelar, onGuardar }: {
  inicial: ReglaComercial; datos: ReglasDeMarca; categorias: string[]; marca: string; trabajando: boolean; onCancelar: () => void; onGuardar: (r: ReglaComercial) => void
}) {
  const [r, setR] = useState<ReglaComercial>(inicial)
  const [pct, setPct] = useState(inicial.pct == null ? '' : String(inicial.pct).replace('.', ','))
  const [productos, setProductos] = useState(inicial.alcance === 'productos' ? inicial.alcance_ids.join(', ') : '')
  const [minimo, setMinimo] = useState(inicial.monto_minimo == null ? '' : String(inicial.monto_minimo))
  const [falta, setFalta] = useState<string | null>(null)
  const cambiar = (x: Partial<ReglaComercial>) => setR((v) => ({ ...v, ...x }))
  const conPct = r.efecto === 'descuento' || r.efecto === 'recargo'
  const tarjeta = r.medios.length > 0 && r.medios.every((m) => m === 'credito' || m === 'debito')

  function armar(): ReglaComercial {
    return {
      ...r,
      pct: conPct ? Number(pct.replace(',', '.')) : null,
      alcance_ids: r.alcance === 'productos' ? productos.split(/[\s,;]+/).filter(Boolean) : r.alcance === 'todo' ? [] : r.alcance_ids,
      monto_minimo: minimo.trim() ? Number(minimo.replace(/\./g, '').replace(',', '.')) : null,
      banco: tarjeta ? r.banco : null,
      cuotas: tarjeta ? r.cuotas : null,
    }
  }
  function guardar() {
    const x = armar()
    const v = validarRegla({ ...x, marca })
    if ('error' in v) { setFalta(v.error.mensaje); return }
    setFalta(null)
    onGuardar(x)
  }
  // El borrador viaja al simulador al tipear (se prueba antes de guardar).
  useEffect(() => { window.dispatchEvent(new CustomEvent('erp-regla-borrador', { detail: armar() })) })

  return (
    <SectionCard title={inicial.id ? `Editar «${inicial.nombre}»` : 'Agregar regla'} subtitle="Mientras la cargás, el simulador de abajo la prueba sin guardarla.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: space[3] }}>
        <Field label="Nombre" required><Input value={r.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} placeholder="Finde jeans efectivo" /></Field>
        <Field label="Fin comercial" hint="Para qué es (opcional)"><Input value={r.fin ?? ''} onChange={(e) => cambiar({ fin: e.target.value || null })} placeholder="Empujar jeans" /></Field>
        <Field label="Canal" required>
          <Select value={r.canal} onChange={(e) => cambiar({ canal: e.target.value as 'local' | 'online' })}>
            <option value="local">Local</option><option value="online">Online</option>
          </Select>
        </Field>
        <Field label="Juego" hint="En una campaña, la regla vale sólo en sus productos y mientras tenga reglas">
          <Select value={r.campania ?? TEMPORADA} onChange={(e) => cambiar({ campania: e.target.value || null })}>
            <option value={TEMPORADA}>Temporada (siempre)</option>
            {datos.campanias.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.feria ? ' (en oferta en la Caja)' : ''}</option>)}
          </Select>
        </Field>
        <Field label="Qué hace" required>
          <Select value={r.efecto} onChange={(e) => cambiar({ efecto: e.target.value as ReglaComercial['efecto'] })}>
            {EFECTOS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </Select>
        </Field>
        {conPct && <Field label="Porcentaje" required><Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="15" /></Field>}
        <Field label="En qué productos">
          <Select value={r.alcance} onChange={(e) => cambiar({ alcance: e.target.value as ReglaComercial['alcance'], alcance_ids: [] })}>
            <option value="todo">{r.campania ? 'Todas las de la campaña' : 'Toda la tienda'}</option>
            <option value="categorias">Algunas categorías</option>
            <option value="productos">Algunos productos</option>
          </Select>
        </Field>
        {r.alcance === 'categorias' && (
          <Field label="Categorías (de Tienda Nube)" hint={categorias.length ? 'Ctrl o ⌘ para elegir varias' : 'Cargando el catálogo de Tienda Nube…'}>
            <select multiple value={r.alcance_ids} onChange={(e) => cambiar({ alcance_ids: [...e.target.selectedOptions].map((o) => o.value) })} style={{ minHeight: 120, width: '100%' }}>
              {[...new Set([...r.alcance_ids, ...categorias])].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        )}
        {r.alcance === 'productos' && <Field label="Productos" hint="Los números de producto de Gestión Nube, separados por coma"><Input value={productos} onChange={(e) => setProductos(e.target.value)} placeholder="571449, 1131616" /></Field>}
        <Field label="Desde"><Input type="date" value={diaAR(r.desde)} onChange={(e) => cambiar({ desde: aIso(e.target.value) })} /></Field>
        <Field label="Hasta" hint="El día entero"><Input type="date" value={diaAR(r.hasta)} onChange={(e) => cambiar({ hasta: aIso(e.target.value) })} /></Field>
        {tarjeta && <Field label="Banco" hint="Sólo con tarjeta de ese banco"><Input value={r.banco ?? ''} onChange={(e) => cambiar({ banco: e.target.value || null })} placeholder="Payway" /></Field>}
        {tarjeta && <Field label="Cuotas"><Input inputMode="numeric" value={r.cuotas ?? ''} onChange={(e) => cambiar({ cuotas: e.target.value ? Number(e.target.value) : null })} placeholder="6" /></Field>}
        <Field label="Compra mayor a" hint="Opcional, en pesos"><Input inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="250000" /></Field>
      </div>
      <div style={{ marginTop: space[3] }}>
        <div style={{ marginBottom: space[1] }}>Formas de pago</div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          {MEDIOS.map((m) => (
            <label key={m.key} style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
              <input type="checkbox" checked={r.medios.includes(m.key)} onChange={(e) => cambiar({ medios: e.target.checked ? [...r.medios, m.key] : r.medios.filter((x) => x !== m.key) })} />
              {m.label}
            </label>
          ))}
        </div>
        <div style={{ margin: `${space[3]} 0 ${space[1]}` }}>Días de la semana (ninguno = todos)</div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          {DIAS.map((d, i) => (
            <label key={d} style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
              <input type="checkbox" checked={!!r.dias?.includes(i)} onChange={(e) => {
                const dias = e.target.checked ? [...(r.dias ?? []), i] : (r.dias ?? []).filter((x) => x !== i)
                cambiar({ dias: dias.length ? dias.sort() : null })
              }} />
              {d}
            </label>
          ))}
        </div>
      </div>
      {falta && <Notice tone="danger" style={{ marginTop: space[3] }}>{falta}</Notice>}
      <div style={{ display: 'flex', gap: space[2], marginTop: space[4] }}>
        <Button onClick={guardar} disabled={trabajando}>Guardar</Button>
        <Button variant="ghost" onClick={onCancelar} disabled={trabajando}>Cancelar</Button>
      </div>
    </SectionCard>
  )
}

type Prenda = PrendaASimular & { clave: string }

/** EL SIMULADOR: prendas + día ⇒ cuánto con cada forma de pago y por qué regla (lo calcula el motor en el servidor). */
function Simulador({ marca, datos, borrador, idx }: { marca: MarcaErp; datos: ReglasDeMarca; borrador: ReglaComercial | null; idx: IndiceTn | null }) {
  const [prendas, setPrendas] = useState<Prenda[]>([])
  const [texto, setTexto] = useState('')
  const [encontradas, setEncontradas] = useState<Array<{ producto: string; nombre: string | null; sku: string | null }> | null>(null)
  const [fecha, setFecha] = useState(hoyAR())
  const [canal, setCanal] = useState<'local' | 'online'>('local')
  const [banco, setBanco] = useState('')
  const [cuotas, setCuotas] = useState('')
  const [rebaja, setRebaja] = useState('')
  const [probarNueva, setProbarNueva] = useState(true)
  const [res, setRes] = useState<Simulacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [enVivo, setEnVivo] = useState<ReglaComercial | null>(null)
  // La línea es la del menú (Bruno, 28-oct): ⛔ se elige Zattia o Stunned por producto; uno escrito a mano es de esa línea.
  const tienda = useTiendaErp()
  const conLineas = !!LINEAS[marca]

  useEffect(() => {
    const oir = (e: Event) => setEnVivo((e as CustomEvent<ReglaComercial>).detail)
    window.addEventListener('erp-regla-borrador', oir)
    return () => window.removeEventListener('erp-regla-borrador', oir)
  }, [])
  const regla = borrador ? enVivo ?? borrador : null

  async function correr(fn: () => Promise<void>, fallo: string) {
    setTrabajando(true)
    try { await fn(); setError(null) } catch (e) { setError(e instanceof Error ? e.message : fallo) } finally { setTrabajando(false) }
  }
  const buscar = () => correr(async () => {
    const r = await buscarPrendas(marca, texto)
    const por = new Map<string, { producto: string; nombre: string | null; sku: string | null }>()
    // Sólo los de la línea del menú (Bruno, 28-oct): en Stunned ⛔ aparecen los de Zattia, ni al revés.
    const deLaLinea = (sku: string | null) => !conLineas || (tienda === 'stunned') === esStunned(sku)
    for (const v of r.variantes) if (!por.has(v.producto) && deLaLinea(v.sku)) por.set(v.producto, { producto: v.producto, nombre: v.nombre, sku: v.sku })
    setEncontradas([...por.values()])
  }, 'No se pudo buscar.')
  // Precio (el de TN con su oferta, editable) y categorías de TN de la prenda encontrada.
  const deTn = (e: { producto: string; nombre: string | null; sku: string | null }): Partial<Prenda> => {
    const t = idx ? matchTn({ sku: e.sku, name: e.nombre }, idx) : null
    const precio = t ? ofertaVigente(t.price, t.promo_price).aCobrar : null
    // La línea por el SKU, como la Caja: la prenda de Stunned se simula con las reglas de Stunned.
    return { producto: e.producto, nombre: e.nombre ?? `Producto ${e.producto}`, precio: precio ? String(precio) : '', categorias: t?.categories ?? [], ...(conLineas && esStunned(e.sku) ? { linea: 'stunned' as const } : {}) }
  }
  const agregar = (p: Partial<Prenda>) => setPrendas((xs) => [...xs, { producto: null, nombre: '', precio: '', cantidad: 1, ...(tienda === 'stunned' ? { linea: 'stunned' as const } : {}), ...p, clave: `${Date.now()}-${xs.length}` }])
  const cambiar = (clave: string, x: Partial<Prenda>) => setPrendas((xs) => xs.map((p) => (p.clave === clave ? { ...p, ...x } : p)))

  const simular = () => correr(async () => {
    const r = await simularReglas(marca, {
      renglones: prendas.map(({ clave: _c, ...p }) => p), fecha, canal,
      ...(banco.trim() ? { banco: banco.trim() } : {}), ...(cuotas ? { cuotas: Number(cuotas) } : {}),
      rebaja: rebaja.trim() ? (rebaja.trim().endsWith('%') ? { tipo: 'pct', valor: rebaja.replace('%', '').trim() } : { tipo: 'pesos', valor: rebaja.trim() }) : null,
      borrador: regla && probarNueva ? regla : null,
    })
    setRes(r)
  }, 'No se pudo simular.')

  const nombreCampania = (id: string) => datos.campanias.find((c) => c.id === id)?.nombre ?? id

  return (
    <SectionCard title="Simulador" subtitle="Armá una venta y mirá cuánto se cobra con cada forma de pago y qué regla lo decide. El precio de campaña lo pone el servidor.">
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Buscar producto" hint="código o nombre"><Input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && texto.trim()) void buscar() }} /></Field>
        <Button onClick={buscar} disabled={!texto.trim() || trabajando}>Buscar</Button>
        <Button variant="outline" onClick={() => agregar({ nombre: 'Producto sin código' })}>Agregar un producto sin código</Button>
      </div>
      {encontradas && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[2] }}>
          {!encontradas.length && <span>No se encontró.</span>}
          {encontradas.slice(0, 12).map((e) => <Button key={e.producto} size="sm" variant="soft" onClick={() => { agregar(deTn(e)); setEncontradas(null) }}>{e.nombre ?? e.producto}</Button>)}
        </div>
      )}
      {prendas.length > 0 && (
        <TableWrap style={{ marginTop: space[3] }}>
          <table>
            <THead><Tr><Th>Producto</Th><Th>Precio</Th><Th>Cantidad</Th><Th>Categorías</Th><Th>Campaña (producto sin código)</Th><Th /></Tr></THead>
            <TBody>
              {prendas.map((p) => (
                <Tr key={p.clave}>
                  <Td>{p.producto ? p.nombre : <Input value={p.nombre} onChange={(e) => cambiar(p.clave, { nombre: e.target.value })} />}</Td>
                  <Td><Input inputMode="decimal" value={p.precio} onChange={(e) => cambiar(p.clave, { precio: e.target.value })} style={{ width: 120 }} /></Td>
                  <Td><Input inputMode="numeric" value={String(p.cantidad)} onChange={(e) => cambiar(p.clave, { cantidad: Number(e.target.value) || 1 })} style={{ width: 64 }} /></Td>
                  <Td>{p.producto ? (p.categorias?.length ? p.categorias.join(', ') : <span style={{ opacity: 0.7 }}>Sin categoría en Tienda Nube</span>) : (
                    <Input value={(p.categorias ?? []).join(', ')} onChange={(e) => cambiar(p.clave, { categorias: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="JEANS" />
                  )}</Td>
                  <Td>
                    {p.producto ? <span style={{ opacity: 0.7 }}>La sabe Liquidación</span> : (
                      <Select value={p.campanias?.[0] ?? ''} onChange={(e) => cambiar(p.clave, { campanias: e.target.value ? [e.target.value] : [] })}>
                        <option value="">Ninguna</option>
                        {datos.campanias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </Select>
                    )}
                  </Td>
                  <Td><Button size="sm" variant="ghost" onClick={() => setPrendas((xs) => xs.filter((x) => x.clave !== p.clave))}>Sacar</Button></Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableWrap>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: space[3], marginTop: space[3] }}>
        <Field label="Día"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
        <Field label="Canal"><Select value={canal} onChange={(e) => setCanal(e.target.value as 'local' | 'online')}><option value="local">Local</option><option value="online">Online</option></Select></Field>
        <Field label="Banco de la tarjeta" hint="Para las promos bancarias"><Input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Payway" /></Field>
        <Field label="Cuotas"><Input inputMode="numeric" value={cuotas} onChange={(e) => setCuotas(e.target.value)} placeholder="6" /></Field>
        <Field label="Descuento a la venta" hint="En pesos, o con % (10%)"><Input value={rebaja} onChange={(e) => setRebaja(e.target.value)} /></Field>
      </div>
      {regla && (
        <label style={{ display: 'flex', gap: space[2], alignItems: 'center', marginTop: space[3] }}>
          <input type="checkbox" checked={probarNueva} onChange={(e) => setProbarNueva(e.target.checked)} />
          Probar con «{regla.nombre || 'la regla nueva'}» sin guardar
        </label>
      )}
      <div style={{ marginTop: space[3] }}><Button onClick={simular} disabled={!prendas.length || trabajando}>Simular</Button></div>
      {error && <Notice tone="danger" style={{ marginTop: space[3] }}>{error}</Notice>}
      {res && (
        <div style={{ marginTop: space[4] }}>
          {res.renglones.some((r) => r.precioDeCampania != null || r.campanias.length) && (
            <Notice tone="neutral" style={{ marginBottom: space[3] }}>
              {res.renglones.filter((r) => r.campanias.length).map((r) => (
                <div key={r.nombre + r.precio}>{r.nombre}: campaña {r.campanias.map(nombreCampania).join(' + ')}{r.precioDeCampania != null ? <> a <MoneyText value={r.precioDeCampania} /> (en vez de <MoneyText value={r.precioCargado} />)</> : null}</div>
              ))}
            </Notice>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: space[3] }}>
            {res.formas.map((f) => <FormaCobrada key={f.medio} f={f} renglones={res.renglones} />)}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

function FormaCobrada({ f, renglones }: { f: FormaSimulada; renglones: Simulacion['renglones'] }) {
  const nombre = MEDIOS.find((m) => m.key === f.medio)?.label
  if (!f.ok) return <Notice tone="danger"><strong>{nombre}</strong>: {f.error}</Notice>
  return (
    <div style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: space[3] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{nombre}</strong><strong><MoneyText value={f.total} /></strong></div>
      {f.pagos.map((p, i) => (
        <div key={i} style={{ marginTop: space[2], fontSize: '0.9em' }}>
          {f.pagos.length > 1 && <div>{p.renglones.map((k) => renglones[k]?.nombre).join(', ')}: <MoneyText value={p.monto} /></div>}
          <div style={{ opacity: 0.8 }}>
            {p.regla ? `${p.regla.nombre}: ${p.pct > 0 ? `−${p.pct} %` : p.pct < 0 ? `+${-p.pct} %` : 'precio final'}` : 'Sin regla: sin descuento'}
            {p.juego !== 'temporada' ? ' · de la campaña' : ''}
          </div>
          {p.perdieron.length > 0 && <div style={{ opacity: 0.6 }}>No ganaron: {p.perdieron.map((x) => `${x.nombre} (${x.efecto})`).join(', ')}</div>}
        </div>
      ))}
      {f.aVenta > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: space[2] }}>Descuento a la venta: <MoneyText value={f.aVenta} /></div>}
    </div>
  )
}

