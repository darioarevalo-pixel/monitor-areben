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
import { buscarNombre, guardarPromos, type AlcancePromo, type ProductoLista, type PromoCaja, type Reglas, type TipoPromo } from '@/lib/caja/cliente'
import { Badge, Button, Field, Input, Notice, Plegable, Select, color, font, radius, space } from '@/components/ui'

const TIPOS: TipoPromo[] = ['nxm', 'segunda_unidad', 'pct', 'monto_minimo']

/** dd/mm de una fecha `AAAA-MM-DD`. */
const dm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

/** Lo que dice la promo, en una línea: «3x2 · Jeans · del 06/10 al 31/10». */
function resumen(p: PromoCaja): string {
  const que =
    p.tipo === 'nxm' ? `${p.lleva}x${p.paga}`
    : p.tipo === 'segunda_unidad' ? `2ª unidad al ${p.pct}%`
    : p.tipo === 'pct' ? `${p.pct}% de descuento`
    : `${plata(p.pesos ?? 0)} de descuento desde ${plata(p.minimo ?? 0)}`
  const a = p.alcance
  const donde = p.tipo === 'monto_minimo' ? null : a.tipo === 'todo' ? 'todo el local' : a.tipo === 'categorias' ? a.categorias.join(', ') : a.productos.map((x) => x.nombre || `Producto ${x.id}`).join(', ')
  const cuando = p.hasta ? `del ${dm(p.desde)} al ${dm(p.hasta)}` : `desde el ${dm(p.desde)}`
  return [que, donde, cuando].filter(Boolean).join(' · ')
}

function estado(p: PromoCaja, hoy: string): { tono: 'success' | 'neutral' | 'warning'; texto: string } {
  if (!p.activa) return { tono: 'neutral', texto: 'Pausada' }
  if (p.desde > hoy) return { tono: 'warning', texto: 'Programada' }
  if (p.hasta && p.hasta < hoy) return { tono: 'neutral', texto: 'Vencida' }
  return { tono: 'success', texto: 'Vigente' }
}

type Form = { nombre: string; tipo: TipoPromo; lleva: string; paga: string; pct: string; minimo: string; pesos: string; alcance: AlcancePromo['tipo']; categorias: string[]; productos: Array<{ id: number; nombre: string }>; desde: string; hasta: string }
const formVacio = (): Form => ({ nombre: '', tipo: 'nxm', lleva: '3', paga: '2', pct: '', minimo: '', pesos: '', alcance: 'todo', categorias: [], productos: [], desde: hoyIso(), hasta: '' })

function aPromo(f: Form): PromoCaja {
  const alcance: AlcancePromo =
    f.tipo === 'monto_minimo' || f.alcance === 'todo' ? { tipo: 'todo' }
    : f.alcance === 'categorias' ? { tipo: 'categorias', categorias: f.categorias }
    : { tipo: 'productos', productos: f.productos }
  const p: PromoCaja = { id: `pr${Date.now().toString(36)}`, nombre: f.nombre.trim(), tipo: f.tipo, alcance, desde: f.desde, hasta: f.hasta || null, activa: true }
  if (f.tipo === 'nxm') Object.assign(p, { lleva: Number(f.lleva), paga: Number(f.paga) })
  if (f.tipo === 'segunda_unidad' || f.tipo === 'pct') p.pct = Number(f.pct)
  if (f.tipo === 'monto_minimo') Object.assign(p, { minimo: Number(f.minimo), pesos: Number(f.pesos) })
  return p
}

export function PromosCaja({ reglas, admin, onGuardadas }: { reglas: Reglas; admin: boolean; onGuardadas: (r: Reglas) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const lista = reglas.promos ?? []
  const hoy = hoyIso()
  const vigentes = lista.filter((p) => estado(p, hoy).texto === 'Vigente').length

  async function guardar(nueva: PromoCaja[], despues?: () => void) {
    setGuardando(true)
    setMsg(null)
    try {
      const r = await guardarPromos(nueva)
      onGuardadas(r.reglas)
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
      titulo={`Promos (${vigentes} vigente${vigentes === 1 ? '' : 's'})`}
      ayuda="Se aplican solas en el POS: una por prenda, la que más ahorra, y además el descuento de la forma de pago. Las prendas de feria y las que tienen descuento a mano quedan afuera. Sólo las carga un admin."
    >
      <div style={{ display: 'grid', gap: space[3], maxWidth: 720 }}>
        {lista.length === 0 ? (
          <span style={{ color: color.mut, fontSize: font.sm }}>Promos: ninguna.</span>
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
  const tnIdx = useTnPromo('zattia')
  // Las categorías de Tienda Nube, las mismas que lee el POS (la de GN está vacía en el 85 %).
  const categorias = useMemo(() => {
    if (!tnIdx) return []
    const set = new Set<string>()
    for (const p of Object.values(tnIdx.bySku)) for (const c of p.categories ?? []) set.add(normCategoria(c))
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'))
  }, [tnIdx])
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
  const num = (s: string) => s.replace(/[^\d]/g, '')
  const ids = new Set(form.productos.map((p) => p.id))

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
      {(form.tipo === 'segunda_unidad' || form.tipo === 'pct') && (
        <Field label={form.tipo === 'pct' ? 'Descuento (%)' : 'Descuento de la 2ª unidad (%)'}>
          <Input inputMode="numeric" value={form.pct} onChange={(e) => cambiar({ pct: num(e.target.value) })} style={{ width: 100 }} />
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
        <Field label="A qué prendas">
          <Select value={form.alcance} onChange={(e) => cambiar({ alcance: e.target.value as AlcancePromo['tipo'] })}>
            <option value="todo">Todo el local</option>
            <option value="categorias">Categorías de Tienda Nube</option>
            <option value="productos">Productos</option>
          </Select>
        </Field>
      )}
      {form.tipo !== 'monto_minimo' && form.alcance === 'categorias' && (
        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
          {!tnIdx && <span style={{ color: color.mut, fontSize: font.sm }}>Cargando las categorías de Tienda Nube…</span>}
          {categorias.map((c) => {
            const on = form.categorias.includes(c)
            return (
              <Button key={c} size="sm" variant={on ? 'solid' : 'outline'} onClick={() => cambiar({ categorias: on ? form.categorias.filter((x) => x !== c) : [...form.categorias, c] })}>
                {c}
              </Button>
            )
          })}
        </div>
      )}
      {form.tipo !== 'monto_minimo' && form.alcance === 'productos' && (
        <div style={{ display: 'grid', gap: space[1.5] }}>
          {form.productos.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{p.nombre}</span>
              <Button size="sm" variant="ghost" onClick={() => cambiar({ productos: form.productos.filter((x) => x.id !== p.id) })}>
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
                  <Button size="sm" variant="outline" onClick={() => cambiar({ productos: [...form.productos, { id: p.product_id, nombre: p.product_name }] })}>
                    Agregar
                  </Button>
                )}
              </div>
            ))}
        </div>
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
