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
 * 🔴 Hasta que la Caja cobre con las reglas (parte 3) la Caja sigue con su configuración: la pantalla compara las dos
 * y dice dónde no coinciden.
 */

import { useEffect, useRef, useState } from 'react'
import { Badge, Button, EmptyState, Field, Input, MoneyText, Notice, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, space, useConfirmar } from '@/components/ui'
import {
  buscarPrendas, guardarRegla, leerReglas, simularReglas, traerReglasDeCaja,
  type FormaSimulada, type MarcaErp, type MedioRegla, type PrendaASimular, type ReglaComercial, type ReglasDeMarca, type Simulacion,
} from '@/lib/erp/cliente'
import { resumenDeRegla } from '@/lib/erp/reglas.core.js'
import { traerAudit } from '@/lib/tn-audit'
import { indexarTn, matchTn, type IndiceTn, type TnProducto } from '@/lib/tn'
import { ofertaVigente } from '@/lib/tienda.core.js'
import { validarRegla } from '@/motor/venta/reglas.mjs'

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
  if (r.alcance === 'todo') return r.campania ? 'Las prendas de la campaña' : 'Toda la tienda'
  if (r.alcance === 'categorias') return r.alcance_ids.join(', ')
  return `${r.alcance_ids.length} ${r.alcance === 'productos' ? 'producto' : 'variante'}${r.alcance_ids.length === 1 ? '' : 's'}`
}

export function ReglasComerciales() {
  const [marca, setMarca] = useState<MarcaErp>('zattia')
  const [datos, setDatos] = useState<ReglasDeMarca | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [editando, setEditando] = useState<ReglaComercial | null>(null)
  const { confirmar } = useConfirmar()
  const marcaActual = useRef(marca)
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

  const recargar = (de: MarcaErp) => correr(async () => {
    const r = await leerReglas(de)
    if (marcaActual.current === de) setDatos(r)
  }, 'No se pudieron leer las reglas.')

  // La primera lectura (la marca cambia con `elegirMarca`, que limpia y vuelve a leer).
  useEffect(() => {
    let vivo = true
    leerReglas('zattia').then((r) => { if (vivo && marcaActual.current === 'zattia') setDatos(r) })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer las reglas.'))
    return () => { vivo = false }
  }, [])
  function elegirMarca(m: MarcaErp) {
    if (m === marca) return
    marcaActual.current = m
    setMarca(m)
    setDatos(null)
    setEditando(null)
    setHecho(null)
    void recargar(m)
  }

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
      await recargar(marca)
    }, 'No se pudieron traer las reglas de la Caja.')
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
      await guardarRegla(marca, { ...r, activa: !r.activa })
      setHecho(`«${r.nombre}» ${r.activa ? 'apagada' : 'prendida'}.`)
      await recargar(marca)
    }, 'No se pudo guardar la regla.')
  }

  const guardadas = datos?.reglas ?? []
  const grupos = [...new Set(guardadas.map((r) => r.campania ?? TEMPORADA))].sort((a, b) => (a === TEMPORADA ? -1 : b === TEMPORADA ? 1 : a.localeCompare(b)))
  const dif = datos?.caja.diferencias

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard
        title="Reglas por forma de pago"
        subtitle="Cada fin comercial es una regla: cuánto descuenta cada forma de pago, en qué prendas y cuándo. En una campaña, sus reglas reemplazan a las de temporada en sus prendas; entre dos reglas gana la mejor para la clienta."
        actions={(
          <div style={{ display: 'flex', gap: space[2] }}>
            {MARCAS.map((m) => <Button key={m.key} size="sm" variant={m.key === marca ? 'solid' : 'outline'} onClick={() => elegirMarca(m.key)}>{m.label}</Button>)}
          </div>
        )}
      >
        <Notice tone="warning">La Caja todavía cobra con su configuración (Formas de pago y Productos en oferta). Estas reglas se cargan y se prueban acá; la Caja las va a usar en el próximo paso.</Notice>
        {error && <Notice tone="danger" onClose={() => setError(null)} style={{ marginTop: space[3] }}>{error}</Notice>}
        {hecho && <Notice tone="success" onClose={() => setHecho(null)} style={{ marginTop: space[3] }}>{hecho}</Notice>}
        {dif?.sinTraer && (
          <Notice tone="action" style={{ marginTop: space[3] }}>
            Todavía no se trajeron las reglas de hoy de la Caja.{' '}
            <Button size="sm" onClick={traerDeCaja} disabled={trabajando}>Traer las reglas de la Caja</Button>
          </Notice>
        )}
        {dif && !dif.sinTraer && (dif.faltan.length > 0 || dif.sobran.length > 0) && (
          <Notice tone="warning" style={{ marginTop: space[3] }}>
            {dif.faltan.length > 0 && <div>La Caja cobra esto y ninguna regla prendida lo dice: {dif.faltan.join(' · ')}</div>}
            {dif.sobran.length > 0 && <div>Las reglas dicen esto y la Caja todavía no lo cobra: {dif.sobran.join(' · ')}</div>}
          </Notice>
        )}
        {(datos?.caja.avisos ?? []).map((a) => <Notice key={a} tone="neutral" style={{ marginTop: space[3] }}>{a}</Notice>)}
      </SectionCard>

      <SectionCard
        title="Reglas"
        actions={<Button size="sm" onClick={() => setEditando({ ...VACIA })} disabled={!datos || trabajando}>Agregar regla</Button>}
      >
        {!datos && !error && <p>Leyendo…</p>}
        {datos && !guardadas.length && !datos.agenda.length && <EmptyState title="Sin reglas" hint="Traé las de la Caja o agregá una." />}
        {datos && grupos.map((g) => (
          <div key={g || 'temporada'} style={{ marginBottom: space[5] }}>
            <h4 style={{ margin: `0 0 ${space[2]}` }}>{g === TEMPORADA ? 'Temporada (siempre)' : `Campaña: ${nombreCampania(g)}`}</h4>
            <TablaReglas reglas={guardadas.filter((r) => (r.campania ?? TEMPORADA) === g)} onEditar={setEditando} onPrenderApagar={prenderApagar} trabajando={trabajando} />
          </div>
        ))}
        {datos && datos.agenda.length > 0 && (
          <div>
            <h4 style={{ margin: `0 0 ${space[2]}` }}>Promos bancarias (se cargan en la Agenda)</h4>
            <TablaReglas reglas={datos.agenda} trabajando={trabajando} />
          </div>
        )}
      </SectionCard>

      {editando && datos && (
        <FormRegla
          key={editando.id ?? 'nueva'} inicial={editando} datos={datos} categorias={catalogo?.categorias ?? []} marca={marca} trabajando={trabajando}
          onCancelar={() => setEditando(null)}
          onGuardar={(r) => correr(async () => {
            const g = await guardarRegla(marca, r)
            setHecho(g.nueva ? `Regla «${g.regla.nombre}» agregada.` : `Regla «${g.regla.nombre}» guardada.`)
            setEditando(null)
            await recargar(marca)
          }, 'No se pudo guardar la regla.')}
        />
      )}

      {datos && <Simulador key={marca} marca={marca} datos={datos} borrador={editando} idx={catalogo?.idx ?? null} />}
    </div>
  )
}

function TablaReglas({ reglas, onEditar, onPrenderApagar, trabajando }: { reglas: ReglaComercial[]; onEditar?: (r: ReglaComercial) => void; onPrenderApagar?: (r: ReglaComercial) => void; trabajando: boolean }) {
  return (
    <TableWrap>
      <table>
        <THead><Tr><Th>Regla</Th><Th>Qué hace</Th><Th>En qué prendas</Th><Th>Canal</Th><Th>Cuándo</Th><Th>Estado</Th>{onEditar && <Th />}</Tr></THead>
        <TBody>
          {reglas.map((r) => (
            <Tr key={r.id}>
              <Td>{r.nombre}{r.fin ? <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{r.fin}</div> : null}</Td>
              <Td>{resumenDeRegla(r)}</Td>
              <Td>{alcanceEnTexto(r)}</Td>
              <Td>{r.canal === 'local' ? 'Local' : 'Online'}</Td>
              <Td>{vigenciaEnTexto(r)}</Td>
              <Td>{r.activa ? <Badge tone="success" subtle>Prendida</Badge> : <Badge tone="neutral" subtle>Apagada</Badge>}</Td>
              {onEditar && (
                <Td>
                  <div style={{ display: 'flex', gap: space[2] }}>
                    <Button size="sm" variant="ghost" onClick={() => onEditar(r)} disabled={trabajando}>Editar</Button>
                    {onPrenderApagar && <Button size="sm" variant="ghost" onClick={() => onPrenderApagar(r)} disabled={trabajando}>{r.activa ? 'Apagar' : 'Prender'}</Button>}
                  </div>
                </Td>
              )}
            </Tr>
          ))}
        </TBody>
      </table>
    </TableWrap>
  )
}

/** El formulario de una regla. Valida con el MISMO núcleo que el servidor (`validarRegla`): mismo texto. */
function FormRegla({ inicial, datos, categorias, marca, trabajando, onCancelar, onGuardar }: {
  inicial: ReglaComercial; datos: ReglasDeMarca; categorias: string[]; marca: MarcaErp; trabajando: boolean; onCancelar: () => void; onGuardar: (r: ReglaComercial) => void
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
        <Field label="Juego" hint="En una campaña, la regla vale sólo en sus prendas y mientras tenga reglas">
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
        <Field label="En qué prendas">
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
        {r.alcance === 'productos' && <Field label="Productos" hint="Los números de producto de GN, separados por coma"><Input value={productos} onChange={(e) => setProductos(e.target.value)} placeholder="571449, 1131616" /></Field>}
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
    for (const v of r.variantes) if (!por.has(v.producto)) por.set(v.producto, { producto: v.producto, nombre: v.nombre, sku: v.sku })
    setEncontradas([...por.values()])
  }, 'No se pudo buscar.')
  // Precio (el de TN con su oferta, editable) y categorías de TN de la prenda encontrada.
  const deTn = (e: { producto: string; nombre: string | null; sku: string | null }): Partial<Prenda> => {
    const t = idx ? matchTn({ sku: e.sku, name: e.nombre }, idx) : null
    const precio = t ? ofertaVigente(t.price, t.promo_price).aCobrar : null
    return { producto: e.producto, nombre: e.nombre ?? `Producto ${e.producto}`, precio: precio ? String(precio) : '', categorias: t?.categories ?? [] }
  }
  const agregar = (p: Partial<Prenda>) => setPrendas((xs) => [...xs, { producto: null, nombre: '', precio: '', cantidad: 1, ...p, clave: `${Date.now()}-${xs.length}` }])
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
        <Field label="Buscar prenda" hint="SKU, código o nombre"><Input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && texto.trim()) void buscar() }} /></Field>
        <Button onClick={buscar} disabled={!texto.trim() || trabajando}>Buscar</Button>
        <Button variant="outline" onClick={() => agregar({ nombre: 'Prenda suelta' })}>Agregar prenda suelta</Button>
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
            <THead><Tr><Th>Prenda</Th><Th>Precio</Th><Th>Cantidad</Th><Th>Categorías</Th><Th>Campaña (prenda suelta)</Th><Th /></Tr></THead>
            <TBody>
              {prendas.map((p) => (
                <Tr key={p.clave}>
                  <Td>{p.producto ? p.nombre : <Input value={p.nombre} onChange={(e) => cambiar(p.clave, { nombre: e.target.value })} />}</Td>
                  <Td><Input inputMode="decimal" value={p.precio} onChange={(e) => cambiar(p.clave, { precio: e.target.value })} style={{ width: 120 }} /></Td>
                  <Td><Input inputMode="numeric" value={String(p.cantidad)} onChange={(e) => cambiar(p.clave, { cantidad: Number(e.target.value) || 1 })} style={{ width: 64 }} /></Td>
                  <Td>{p.producto ? (p.categorias?.length ? p.categorias.join(', ') : <span style={{ opacity: 0.7 }}>Sin categoría en TN</span>) : (
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

