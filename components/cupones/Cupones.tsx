'use client'

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { useCupones } from './useCupones'
import { crearCupon, descuento, dias, editarCupon, filtrar, mensajeRecordatorio } from '@/lib/cupones/core'
import type { Cupon, EstadoCupon, FiltroCupon, TipoDescuento } from '@/lib/cupones/tipos'
import { HeaderAcciones } from '@/components/layout/acciones'
import { BuscarInput, Button, Chips, EmptyState, FilterBar, TBody, THead, TableWrap, Td, Th, Tr, color, font, useConfirmar, useToast } from '@/components/ui'

const hoyISO = () => new Date().toISOString().slice(0, 10)
const nuevoId = () => 'c' + Date.now() + '_' + Math.floor(Math.random() * 100000)

const BADGES: Record<EstadoCupon, [string, string, string]> = {
  vigente: [color.successInk, color.successBg, 'Vigente'],
  porvencer: [color.warningInk, color.warningBg, 'Por vencer'],
  vencido: [color.dangerInk, color.dangerBg, 'Vencido'],
  usado: [color.ink2, color.line, 'Usado'],
  anulado: [color.mut, color.bg2, 'Anulado'],
}

export function Cupones() {
  const { confirmar, avisar } = useConfirmar()
  const toast = useToast()
  const { marca, perfil } = useSesion()
  const usuario = perfil?.name || ''
  const puedeCrear = puedeSub(perfil, marca, 'cupones', 'crear') // puedeSub ya devuelve true para admin
  const admin = esAdmin(perfil)
  const cup = useCupones(marca)

  // null = form cerrado · 'nuevo' = alta · Cupon = editando ese cupón.
  const [form, setForm] = useState<Cupon | 'nuevo' | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroCupon>('vigentes')

  const hoy = hoyISO()
  const data = useMemo(() => cup.data ?? [], [cup.data])
  const lista = useMemo(() => filtrar(data, filtro, busqueda, hoy), [data, filtro, busqueda, hoy])
  const porVencerN = useMemo(() => data.filter((c) => filtrar([c], 'porvencer', '', hoy).length).length, [data, hoy])

  const onGuardar = async (datos: Parameters<typeof crearCupon>[0]) => {
    if (form === 'nuevo') {
      const r = crearCupon(datos, { id: nuevoId(), hoy, usuario })
      if (!r.ok) return void toast.error(r.error)
      const ok = await cup.persistir((l) => [r.cupon, ...l])
      if (ok) setForm(null)
    } else if (form) {
      const r = editarCupon(form, datos)
      if (!r.ok) return void toast.error(r.error)
      const ok = await cup.persistir((l) => l.map((c) => (c.id === form.id ? r.cupon : c)))
      if (ok) setForm(null)
    }
  }
  const mutar = (id: string, fn: (c: Cupon) => Cupon) => cup.persistir((l) => l.map((c) => (c.id === id ? fn(c) : c)))
  const onMarcarUsado = (id: string) => void mutar(id, (c) => ({ ...c, usado: true, usadoFecha: hoy }))
  const onDesmarcarUsado = (id: string) => void mutar(id, (c) => ({ ...c, usado: false, usadoFecha: '' }))
  const onAnular = async (id: string) => {
    if (!puedeCrear) return
    const okAnular = await confirmar({
      titulo: 'Anular el cupón',
      tono: 'danger',
      ok: 'Anular',
      mensaje: 'El cupón deja de funcionar en la tienda al instante. Si alguien lo tiene, ya no le va a aplicar.',
    })
    if (!okAnular) return
    void mutar(id, (c) => ({ ...c, anulado: true }))
  }
  const onReactivar = (id: string) => {
    if (!puedeCrear) return
    void mutar(id, (c) => ({ ...c, anulado: false }))
  }
  const onBorrar = async (id: string) => {
    if (!admin) {
      await avisar('Solo un administrador puede borrar cupones.')
      return
    }
    const okBorrar = await confirmar({
      titulo: 'Borrar de la lista',
      tono: 'danger',
      ok: 'Borrar',
      mensaje: 'Se saca de la lista del monitor. Si el cupón sigue activo en la tienda, esto NO lo anula.',
    })
    if (!okBorrar) return
    void cup.persistir((l) => l.filter((c) => c.id !== id))
  }
  const onRecordar = async (c: Cupon) => {
    try {
      await navigator.clipboard.writeText(mensajeRecordatorio(c))
      toast.ok('Mensaje copiado: pegalo en WhatsApp.')
    } catch {
      prompt('Copiá el mensaje:', mensajeRecordatorio(c))
    }
  }

  return (
    <>
      <HeaderAcciones>
        {puedeCrear ? (
          <Button variant="solid" tone="brand" onClick={() => setForm((v) => (v === 'nuevo' ? null : 'nuevo'))}>
            Generar cupón
          </Button>
        ) : (
          <span style={{ fontSize: font.sm, color: color.mut2 }}>Generar cupones: solo con permiso.</span>
        )}
      </HeaderAcciones>

      <div>
        {form && puedeCrear && (
          <FormCupon usuario={usuario} cuponInicial={form === 'nuevo' ? undefined : form} onGuardar={onGuardar} onCancelar={() => setForm(null)} />
        )}

        <FilterBar>
          <BuscarInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre o código…" />
          <Chips<FiltroCupon>
            value={filtro}
            onChange={setFiltro}
            opciones={[
              { key: 'vigentes', label: 'Vigentes' },
              { key: 'porvencer', label: 'Por vencer', n: porVencerN || undefined },
              { key: 'usados', label: 'Usados' },
              { key: 'vencidos', label: 'Vencidos' },
              { key: 'todos', label: 'Todos' },
            ]}
          />
        </FilterBar>

        {lista.length ? (
          <TableWrap maxHeight={620}>
            <THead>
              <Tr>
                <Th>Cliente</Th>
                <Th>Descuento</Th>
                <Th>Vence</Th>
                <Th>Estado</Th>
                <Th>Motivo / código</Th>
                <Th>Generó</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
                {lista.map(({ c, e }) => {
                  const venceTxt = c.vence ? c.vence.split('-').reverse().join('/') : '—'
                  const d = dias(c.vence, hoy)
                  return (
                    <Tr key={c.id} style={e === 'porvencer' ? { background: color.warningBg } : undefined}>
                      <Td tall strong>
                        {c.nombre}
                        {c.telefono && <div style={{ fontSize: font.xs, color: color.mut2, fontWeight: 400 }}>{c.telefono}</div>}
                      </Td>
                      <Td tall style={{ fontWeight: 700, color: color.ink }}>
                        {descuento(c)}
                        {(+(c.minimo || 0) > 0) && <div style={{ fontSize: font.xs, color: color.mut2, fontWeight: 400 }}>desde ${Math.round(+(c.minimo || 0)).toLocaleString('es-AR')}</div>}
                      </Td>
                      <Td tall>
                        {venceTxt}
                        {e === 'porvencer' && d != null && <div style={{ fontSize: font.xs, color: color.warningInk }}>{d <= 0 ? 'vence hoy' : `en ${d}d`}</div>}
                      </Td>
                      <Td><Badge e={e} /></Td>
                      <Td wrap style={{ color: color.mut }}>
                        {c.motivo || '—'}
                        {c.codigo && <span style={{ color: color.mut2 }}> · {c.codigo}</span>}
                        {!c.unSoloUso && <span style={{ color: color.mut2 }}> · reutilizable</span>}
                      </Td>
                      <Td style={{ color: color.mut2, fontSize: font.xs }}>{c.creadoPor || '—'}</Td>
                      <Td align="right">
                        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          {c.unSoloUso && (e === 'vigente' || e === 'porvencer') && (
                            <button onClick={() => onMarcarUsado(c.id)} title="Marcar como usado" style={btnUsado}>✔ Usado</button>
                          )}
                          {e === 'usado' && (
                            <button onClick={() => onDesmarcarUsado(c.id)} title="Deshacer usado" style={btnGris}>↺</button>
                          )}
                          {(e === 'porvencer' || e === 'vigente') && (
                            <button onClick={() => onRecordar(c)} title="Copiar recordatorio para WhatsApp" style={btnGris}>📋 Recordar</button>
                          )}
                          {puedeCrear && !c.anulado && (
                            <button onClick={() => setForm(c)} title="Editar" style={btnGris}>✏️</button>
                          )}
                          {puedeCrear && (c.anulado
                            ? <button onClick={() => onReactivar(c.id)} title="Reactivar" style={btnGris}>Reactivar</button>
                            : <button onClick={() => onAnular(c.id)} title="Anular" style={{ border: 'none', background: 'none', color: color.danger, cursor: 'pointer', fontSize: 13 }}>✕</button>)}
                          {admin && (
                            <button onClick={() => onBorrar(c.id)} title="Borrar (solo admin)" style={{ border: 'none', background: 'none', color: color.mut2, cursor: 'pointer', fontSize: 14 }}>🗑</button>
                          )}
                        </span>
                      </Td>
                    </Tr>
                  )
                })}
            </TBody>
          </TableWrap>
        ) : (
          <EmptyState icon="🎟️" title="No hay cupones en este filtro" hint={puedeCrear ? 'Tocá “Generar cupón” para crear uno.' : undefined} dashed />
        )}
      </div>
    </>
  )
}

function FormCupon({ usuario, cuponInicial, onGuardar, onCancelar }: { usuario: string; cuponInicial?: Cupon; onGuardar: (d: Parameters<typeof crearCupon>[0]) => void; onCancelar: () => void }) {
  const editando = !!cuponInicial
  const [nombre, setNombre] = useState(cuponInicial?.nombre ?? '')
  const [telefono, setTelefono] = useState(cuponInicial?.telefono ?? '')
  const [tipo, setTipo] = useState<TipoDescuento>(cuponInicial?.tipo ?? 'porcentaje')
  const [valor, setValor] = useState(cuponInicial ? String(cuponInicial.valor) : '')
  const [vence, setVence] = useState(cuponInicial?.vence ?? '')
  const [minimo, setMinimo] = useState(cuponInicial?.minimo ? String(cuponInicial.minimo) : '')
  const [codigo, setCodigo] = useState(cuponInicial?.codigo ?? '')
  const [motivo, setMotivo] = useState(cuponInicial?.motivo ?? '')
  const [por, setPor] = useState(cuponInicial?.creadoPor || usuario)
  // Default: un solo uso (reutilizable apagado). En los datos viaja como unSoloUso = !reutilizable.
  const [reutilizable, setReutilizable] = useState(cuponInicial ? !cuponInicial.unSoloUso : false)

  const guardar = () => onGuardar({ nombre, telefono, tipo, valor, codigo, minimo, motivo, unSoloUso: !reutilizable, vence, creadoPor: por })

  return (
    <div style={{ border: `1px solid ${color.line}`, background: color.bg, borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ fontWeight: 700 }}>{editando ? 'Editar cupón' : 'Nuevo cupón'}</div>
      <div style={{ fontSize: 12, color: color.mut2, margin: '2px 0 14px' }}>Descuento para clientes del <b>local</b> — no toca la tienda online.</div>

      {/* Cliente */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
        <label style={lbl}>Nombre y apellido *<input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Ana Pérez" style={inp} /></label>
        <label style={lbl}>Teléfono (opcional)<input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Para recordarle" style={inp} /></label>
      </div>

      {/* Descuento: tipo (botones) + monto de la opción elegida */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...lbl, marginBottom: 5 }}>Descuento *</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <TipoBtn on={tipo === 'porcentaje'} onClick={() => setTipo('porcentaje')}>% Porcentaje</TipoBtn>
            <TipoBtn on={tipo === 'monto'} onClick={() => setTipo('monto')}>$ Monto</TipoBtn>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${color.line2}`, borderRadius: 7, background: '#fff', overflow: 'hidden' }}>
            {tipo === 'monto' && <span style={{ padding: '0 4px 0 9px', color: color.mut, fontSize: 14 }}>$</span>}
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              type="number"
              min={1}
              max={tipo === 'porcentaje' ? 100 : undefined}
              placeholder={tipo === 'porcentaje' ? '15' : '1500'}
              style={{ width: 96, padding: '8px 8px', border: 'none', outline: 'none', textAlign: 'right', fontSize: 14 }}
            />
            {tipo === 'porcentaje' && <span style={{ padding: '0 9px 0 4px', color: color.mut, fontSize: 14 }}>%</span>}
          </div>
        </div>
      </div>

      {/* Vigencia + compra mínima + código */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
        <label style={lbl}>Vale hasta *<input value={vence} onChange={(e) => setVence(e.target.value)} type="date" style={inp} /></label>
        <div style={lbl}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            Compra mínima (opcional)
            <InfoPopover titulo="Compra mínima">El cupón solo aplica si la compra supera este monto. Dejalo vacío o en 0 para que aplique siempre.</InfoPopover>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${color.line2}`, borderRadius: 6, marginTop: 2, background: '#fff', boxSizing: 'border-box', width: '100%' }}>
            <span style={{ padding: '0 4px 0 8px', color: color.mut }}>$</span>
            <input value={minimo} onChange={(e) => setMinimo(e.target.value)} type="number" min={0} placeholder="0" style={{ flex: 1, minWidth: 0, padding: '6px 8px 6px 4px', border: 'none', outline: 'none' }} />
          </span>
        </div>
        <div style={lbl}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            Código (opcional)
            <InfoPopover titulo="Código">Un código corto para identificar el cupón (ej. ANA15). Opcional; igual lo podés buscar por el nombre del cliente.</InfoPopover>
          </span>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej: ANA15" style={inp} />
        </div>
      </div>

      {/* Extras */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
        <label style={lbl}>Motivo (opcional)<input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Reactivación, cumpleaños…" style={inp} /></label>
        <label style={lbl}>Generado por<input value={por} onChange={(e) => setPor(e.target.value)} style={inp} /></label>
      </div>

      {/* Usos: por default un solo uso; se opta por reutilizable. */}
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 14 }}>
        <input type="checkbox" checked={reutilizable} onChange={(e) => setReutilizable(e.target.checked)} />
        Se puede usar más de una vez
        <InfoPopover titulo="Usos del cupón">Por default el cupón es de <b>un solo uso</b>: se marca como usado al aplicarlo. Tildá esto solo si el cliente lo puede usar varias veces (reutilizable).</InfoPopover>
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" onClick={guardar}>✓ {editando ? 'Guardar cambios' : 'Guardar cupón'}</button>
        <button className="btn-sm" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

function TipoBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="mo-btn mo-btn--md"
      style={{
        '--_bg': on ? color.brandSolid : color.surface,
        '--_fg': on ? '#fff' : color.ink2,
        '--_bd': on ? color.brandSolid : color.line2,
        '--_bg-hover': on ? 'var(--mo-brand-solid-hover)' : color.bg2,
      } as CSSProperties}
    >
      {children}
    </button>
  )
}

function Badge({ e }: { e: EstadoCupon }) {
  const [col, bg, txt] = BADGES[e] || BADGES.vigente
  return <span style={{ background: bg, color: col, borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{txt}</span>
}

const lbl: CSSProperties = { fontSize: 12, color: color.ink2 }
const inp: CSSProperties = { width: '100%', padding: '6px 8px', border: `1px solid ${color.line2}`, borderRadius: 6, marginTop: 2, boxSizing: 'border-box' }
const btnUsado: CSSProperties = { border: `1px solid ${color.successBorder}`, background: color.successBg, color: color.successInk, borderRadius: 6, padding: '2px 8px', fontSize: 12, cursor: 'pointer' }
const btnGris: CSSProperties = { border: `1px solid ${color.line2}`, background: '#fff', color: color.mut, borderRadius: 6, padding: '2px 8px', fontSize: 12, cursor: 'pointer' }
