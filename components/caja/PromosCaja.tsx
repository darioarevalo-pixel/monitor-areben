'use client'

/**
 * Caja · W5 — las PROMOS del local, en la pestaña Caja (Bruno, 4 y 5-oct-2026). Las carga un admin;
 * el resto las ve. Se guarda la lista ENTERA en `caja_config.reglas.promos` (acción `promos`); el
 * servidor la valida con `normalizarPromos` y la regla de cobro vive en `lib/caja/promos.core.js`:
 * acá ⛔ se calcula nada.
 */

import { useEffect, useMemo, useState } from 'react'
import { useTnPromo } from '@/components/productos/useTnImages'
import { NOMBRE_TIPO, normCategoria } from '@/lib/caja/promos.core.js'
import { hoyIso } from '@/lib/agenda'
import { plata } from '@/lib/caja/ticket'
import { buscarNombre, guardarPromos, type AlcancePromo, type ProductoLista, type PromoCaja, type Reglas, type TipoPromo, type Versiones } from '@/lib/caja/cliente'
import { Badge, Button, Field, Input, Notice, Plegable, Select, color, font, radius, space } from '@/components/ui'
import { storeCaja } from '@/lib/caja/marca'

const TIPOS: TipoPromo[] = ['nxm', 'segunda_unidad', 'pct', 'cantidad', 'llevando', 'monto_minimo']

/** dd/mm de una fecha `AAAA-MM-DD`. */
const dm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

/** Lo que dice la promo, en una línea: «3x2 · Jeans · del 06/10 al 31/10». */
function resumen(p: PromoCaja): string {
  const que =
    p.tipo === 'nxm' ? `${p.lleva}x${p.paga}`
    : p.tipo === 'segunda_unidad' ? `2ª unidad al ${p.pct}%`
    : p.tipo === 'pct' ? `${p.pct}% de descuento`
    : p.tipo === 'llevando' ? `${p.pct}% llevando ${p.requiere ? queAlcance(p.requiere) : '—'}`
    : p.tipo === 'cantidad' ? (p.escalones ?? []).map((e, i, l) => `${e.desde}${i === l.length - 1 ? ' o más' : ''}: ${e.pct}%`).join(' · ')
    : `${plata(p.pesos ?? 0)} de descuento desde ${plata(p.minimo ?? 0)}`
  const donde = p.tipo === 'monto_minimo' ? null : (p.tipo === 'llevando' ? 'en ' : '') + queAlcance(p.alcance)
  const cuando = p.hasta ? `del ${dm(p.desde)} al ${dm(p.hasta)}` : `desde el ${dm(p.desde)}`
  return [que, donde, cuando].filter(Boolean).join(' · ')
}

/** «FUNDAS (menos TEMPLADO 9D)», «todo el local», o los productos. */
function queAlcance(a: AlcancePromo): string {
  const nombreProd = (x: { id: number; nombre: string }) => x.nombre || `Producto ${x.id}`
  const sin = a.tipo !== 'productos' && a.excluidos?.length ? ` (menos ${a.excluidos.map(nombreProd).join(', ')})` : ''
  return (a.tipo === 'todo' ? 'todo el local' : a.tipo === 'categorias' ? a.categorias.join(', ') : a.productos.map(nombreProd).join(', ')) + sin
}

function estado(p: PromoCaja, hoy: string): { tono: 'success' | 'neutral' | 'warning'; texto: string } {
  if (!p.activa) return { tono: 'neutral', texto: 'Pausada' }
  if (p.desde > hoy) return { tono: 'warning', texto: 'Programada' }
  if (p.hasta && p.hasta < hoy) return { tono: 'neutral', texto: 'Vencida' }
  return { tono: 'success', texto: 'Vigente' }
}

type Productos = Array<{ id: number; nombre: string }>
/** Un alcance mientras se edita: a qué productos (lo que se descuenta, o lo que hay que llevar). */
type FormAlcance = { tipo: AlcancePromo['tipo']; categorias: string[]; productos: Productos; excluidos: Productos }
type Form = { nombre: string; tipo: TipoPromo; lleva: string; paga: string; pct: string; minimo: string; pesos: string; escalones: Array<{ desde: string; pct: string }>; alcance: FormAlcance; requiere: FormAlcance; desde: string; hasta: string }
const alcanceVacio = (): FormAlcance => ({ tipo: 'todo', categorias: [], productos: [], excluidos: [] })
const formVacio = (): Form => ({ nombre: '', tipo: 'nxm', lleva: '3', paga: '2', pct: '', minimo: '', pesos: '', escalones: [{ desde: '2', pct: '' }], alcance: alcanceVacio(), requiere: { ...alcanceVacio(), tipo: 'categorias' }, desde: hoyIso(), hasta: '' })

function aAlcance(a: FormAlcance): AlcancePromo {
  const resta = a.excluidos.length ? { excluidos: a.excluidos } : {}
  return a.tipo === 'todo' ? { tipo: 'todo', ...resta } : a.tipo === 'categorias' ? { tipo: 'categorias', categorias: a.categorias, ...resta } : { tipo: 'productos', productos: a.productos }
}

function aPromo(f: Form): PromoCaja {
  const alcance: AlcancePromo = f.tipo === 'monto_minimo' ? { tipo: 'todo' } : aAlcance(f.alcance)
  const p: PromoCaja = { id: `pr${Date.now().toString(36)}`, nombre: f.nombre.trim(), tipo: f.tipo, alcance, desde: f.desde, hasta: f.hasta || null, activa: true }
  if (f.tipo === 'nxm') Object.assign(p, { lleva: Number(f.lleva), paga: Number(f.paga) })
  if (f.tipo === 'segunda_unidad' || f.tipo === 'pct' || f.tipo === 'llevando') p.pct = Number(f.pct)
  if (f.tipo === 'llevando') p.requiere = aAlcance(f.requiere)
  if (f.tipo === 'monto_minimo') Object.assign(p, { minimo: Number(f.minimo), pesos: Number(f.pesos) })
  if (f.tipo === 'cantidad') p.escalones = f.escalones.map((e) => ({ desde: Number(e.desde), pct: Number(e.pct) }))
  return p
}

export function PromosCaja({ reglas, admin, version, onGuardadas }: { reglas: Reglas; admin: boolean; /** La de la lista que se está editando: si otro admin la cambió, el servidor contesta 409 (⛔ se pisa). */ version?: string; onGuardadas: (r: Reglas, v?: Versiones) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const lista = reglas.promos ?? []
  const hoy = hoyIso()

  async function guardar(nueva: PromoCaja[], despues?: () => void) {
    setGuardando(true)
    setMsg(null)
    try {
      const r = await guardarPromos(nueva, version)
      onGuardadas(r.reglas, r.versiones)
      despues?.()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Plegable
      variante="tarjeta"
      abierto={abierto}
      onToggle={() => setAbierto(!abierto)}
      titulo="Promociones"
      ayuda="Se aplican solas en el POS: una por producto, la que más ahorra, y además el descuento de la forma de pago. Los productos en oferta y los que tienen descuento a mano quedan afuera. Sólo las carga un admin."
    >
      <div style={{ display: 'grid', gap: space[3], maxWidth: 720 }}>
        {lista.length === 0 ? (
          <span style={{ color: color.mut, fontSize: font.sm }}>Ninguna promoción cargada.</span>
        ) : (
          <div style={{ display: 'grid', gap: space[1.5] }}>
            {lista.map((p) => {
              const e = estado(p, hoy)
              return (
                <div key={p.id} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', border: `1px solid ${color.line}`, borderRadius: radius.md, padding: `${space[1.5]}px ${space[2] + 2}px` }}>
                  <Badge tone={e.tono}>{e.texto}</Badge>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                    <div style={{ color: color.mut, fontSize: font.sm }}>{resumen(p)}</div>
                  </div>
                  {admin && (
                    <>
                      <Button size="sm" variant="ghost" disabled={guardando} onClick={() => guardar(lista.map((x) => (x.id === p.id ? { ...x, activa: !x.activa } : x)))}>
                        {p.activa ? 'Pausar' : 'Activar'}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={guardando} onClick={() => guardar(lista.filter((x) => x.id !== p.id))}>
                        Eliminar
                      </Button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {admin && !form && (
          <div>
            <Button size="sm" variant="outline" onClick={() => setForm(formVacio())}>
              Agregar promo
            </Button>
          </div>
        )}
        {admin && form && <FormPromo form={form} setForm={setForm} guardando={guardando} onCancelar={() => setForm(null)} onGuardar={() => guardar([...lista, aPromo(form)], () => setForm(null))} />}
        {msg && <Notice tone="danger">{msg}</Notice>}
      </div>
    </Plegable>
  )
}

function FormPromo({ form, setForm, guardando, onCancelar, onGuardar }: { form: Form; setForm: (f: Form) => void; guardando: boolean; onCancelar: () => void; onGuardar: () => void }) {
  const cambiar = (c: Partial<Form>) => setForm({ ...form, ...c })
  const tnIdx = useTnPromo(storeCaja())
  // Las categorías de Tienda Nube, las mismas que lee el POS (la de GN está vacía en el 85 %).
  const categorias = useMemo(() => {
    if (!tnIdx) return []
    const set = new Set<string>()
    for (const p of Object.values(tnIdx.bySku)) for (const c of p.categories ?? []) set.add(normCategoria(c))
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'))
  }, [tnIdx])
  const num = (s: string) => s.replace(/[^\d]/g, '')
  const escalon = (i: number, c: Partial<{ desde: string; pct: string }>) => cambiar({ escalones: form.escalones.map((e, j) => (j === i ? { ...e, ...c } : e)) })

  return (
    <div style={{ display: 'grid', gap: space[2], border: `1px solid ${color.line}`, borderRadius: radius.md, padding: space[3] }}>
      <Field label="Nombre (sale en el pedido y en el ticket)">
        <Input value={form.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} placeholder="3x2 en remeras" maxLength={60} />
      </Field>
      <Field label="Tipo">
        <Select value={form.tipo} onChange={(e) => cambiar({ tipo: e.target.value as TipoPromo })}>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {NOMBRE_TIPO[t]}
            </option>
          ))}
        </Select>
      </Field>
      {form.tipo === 'nxm' && (
        <div style={{ display: 'flex', gap: space[2] }}>
          <Field label="Lleva">
            <Input inputMode="numeric" value={form.lleva} onChange={(e) => cambiar({ lleva: num(e.target.value) })} style={{ width: 80 }} />
          </Field>
          <Field label="Paga">
            <Input inputMode="numeric" value={form.paga} onChange={(e) => cambiar({ paga: num(e.target.value) })} style={{ width: 80 }} />
          </Field>
        </div>
      )}
      {(form.tipo === 'segunda_unidad' || form.tipo === 'pct' || form.tipo === 'llevando') && (
        <Field label={form.tipo === 'segunda_unidad' ? 'Descuento de la 2ª unidad (%)' : 'Descuento (%)'}>
          <Input inputMode="numeric" value={form.pct} onChange={(e) => cambiar({ pct: num(e.target.value) })} style={{ width: 100 }} />
        </Field>
      )}
      {form.tipo === 'cantidad' && (
        <Field label="Escalones: desde cuántas unidades, qué % a todas">
          <div style={{ display: 'grid', gap: space[1.5] }}>
            {form.escalones.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
                <span>Desde</span>
                <Input inputMode="numeric" aria-label="Unidades" value={e.desde} onChange={(ev) => escalon(i, { desde: num(ev.target.value) })} style={{ width: 70 }} />
                <span>unidades:</span>
                <Input inputMode="numeric" aria-label="Descuento (%)" value={e.pct} onChange={(ev) => escalon(i, { pct: num(ev.target.value) })} style={{ width: 70 }} />
                <span>%</span>
                {form.escalones.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => cambiar({ escalones: form.escalones.filter((_, j) => j !== i) })}>
                    Sacar
                  </Button>
                )}
              </div>
            ))}
            {form.escalones.length < 10 && (
              <div>
                <Button size="sm" variant="outline" onClick={() => cambiar({ escalones: [...form.escalones, { desde: String((Number(form.escalones[form.escalones.length - 1]?.desde) || 1) + 1), pct: '' }] })}>
                  Agregar escalón
                </Button>
              </div>
            )}
            <span style={{ color: color.mut, fontSize: font.sm }}>Vale el escalón más alto al que llega la venta, sobre todas las unidades. Los productos con descuento a mano o en oferta no cuentan.</span>
          </div>
        </Field>
      )}
      {form.tipo === 'monto_minimo' && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <Field label="Compra desde ($)">
            <Input inputMode="numeric" value={form.minimo} onChange={(e) => cambiar({ minimo: num(e.target.value) })} style={{ width: 140 }} />
          </Field>
          <Field label="Descuento ($)">
            <Input inputMode="numeric" value={form.pesos} onChange={(e) => cambiar({ pesos: num(e.target.value) })} style={{ width: 140 }} />
          </Field>
        </div>
      )}
      {form.tipo !== 'monto_minimo' && (
        <ElegirAlcance titulo={form.tipo === 'llevando' ? 'Qué productos tienen el descuento' : 'A qué productos'} valor={form.alcance} onCambiar={(alcance) => cambiar({ alcance })} categorias={categorias} cargando={!tnIdx} />
      )}
      {form.tipo === 'llevando' && (
        <>
          <ElegirAlcance titulo="Llevando alguno de estos productos" valor={form.requiere} onCambiar={(requiere) => cambiar({ requiere })} categorias={categorias} cargando={!tnIdx} />
          <span style={{ color: color.mut, fontSize: font.sm }}>Cada producto que se lleva habilita el descuento en uno solo (el más caro). Cuentan también los que tienen otra promo, descuento a mano o están en oferta. Un producto con el descuento nunca habilita a otro.</span>
        </>
      )}
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        <Field label="Desde">
          <Input type="date" value={form.desde} onChange={(e) => cambiar({ desde: e.target.value })} style={{ width: 160 }} />
        </Field>
        <Field label="Hasta (opcional)">
          <Input type="date" value={form.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} style={{ width: 160 }} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: space[2] }}>
        <Button size="sm" tone="success" variant="solid" loading={guardando} onClick={onGuardar}>
          Guardar promo
        </Button>
        <Button size="sm" variant="ghost" disabled={guardando} onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

/** A qué productos: todo el local, categorías de Tienda Nube (con «menos estos») o productos. */
function ElegirAlcance({ titulo, valor, onCambiar, categorias, cargando }: { titulo: string; valor: FormAlcance; onCambiar: (a: FormAlcance) => void; categorias: string[]; cargando: boolean }) {
  const cambiar = (c: Partial<FormAlcance>) => onCambiar({ ...valor, ...c })
  return (
    <>
      <Field label={titulo}>
        <Select value={valor.tipo} onChange={(e) => cambiar({ tipo: e.target.value as AlcancePromo['tipo'] })}>
          <option value="todo">Todo el local</option>
          <option value="categorias">Categorías de Tienda Nube</option>
          <option value="productos">Productos</option>
        </Select>
      </Field>
      {valor.tipo === 'categorias' && (
        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
          {cargando && <span style={{ color: color.mut, fontSize: font.sm }}>Cargando las categorías de Tienda Nube…</span>}
          {categorias.map((c) => {
            const on = valor.categorias.includes(c)
            return (
              <Button key={c} size="sm" variant={on ? 'solid' : 'outline'} onClick={() => cambiar({ categorias: on ? valor.categorias.filter((x) => x !== c) : [...valor.categorias, c] })}>
                {c}
              </Button>
            )
          })}
        </div>
      )}
      {valor.tipo === 'productos' && <ListaProductos lista={valor.productos} onCambiar={(productos) => cambiar({ productos })} />}
      {valor.tipo !== 'productos' && (
        <Field label="Menos estos productos (opcional)">
          <ListaProductos lista={valor.excluidos} onCambiar={(excluidos) => cambiar({ excluidos })} />
        </Field>
      )}
    </>
  )
}

/** Los productos elegidos y el buscador para sumar más (los de la promo, o los que se restan). */
function ListaProductos({ lista, onCambiar }: { lista: Array<{ id: number; nombre: string }>; onCambiar: (l: Array<{ id: number; nombre: string }>) => void }) {
  const [q, setQ] = useState('')
  const [resultado, setResultado] = useState<ProductoLista[] | null>(null)
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) return
    let vivo = true
    const reloj = setTimeout(() => {
      buscarNombre(t)
        .then((r) => vivo && setResultado([...r.conStock, ...r.sinStock]))
        .catch(() => vivo && setResultado([]))
    }, 250)
    return () => {
      vivo = false
      clearTimeout(reloj)
    }
  }, [q])
  const ids = new Set(lista.map((p) => p.id))
  return (
    <div style={{ display: 'grid', gap: space[1.5] }}>
      {lista.map((p) => (
        <div key={p.id} style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{p.nombre}</span>
          <Button size="sm" variant="ghost" onClick={() => onCambiar(lista.filter((x) => x.id !== p.id))}>
            Sacar
          </Button>
        </div>
      ))}
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar un producto por nombre" autoComplete="off" spellCheck={false} />
      {q.trim().length >= 2 &&
        resultado?.map((p) => (
          <div key={p.product_id} style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{p.product_name}</span>
            {!ids.has(p.product_id) && (
              <Button size="sm" variant="outline" onClick={() => onCambiar([...lista, { id: p.product_id, nombre: p.product_name }])}>
                Agregar
              </Button>
            )}
          </div>
        ))}
    </div>
  )
}
