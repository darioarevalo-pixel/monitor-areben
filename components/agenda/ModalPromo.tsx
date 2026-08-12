'use client'

/**
 * El alta de una promoción bancaria.
 *
 * La regla se arma con controles y nunca se tipea el JSON: eso lo resuelve `EditorRegla`, que es el
 * mismo que usa el alta del pendiente rutinario. Acá queda lo que es propio del banco —el beneficio,
 * la ventana de vigencia, los canales, la letra chica y cómo se cobra.
 *
 * El servidor vuelve a validar todo (`motivoReglaInvalida`, el beneficio por rama, la ventana): esta
 * pantalla evita el viaje, no es la que decide.
 */

import { useState } from 'react'
import { Button, Field, Input, Modal, Notice, Select, color, font, space, weight } from '@/components/ui'
import { hoyIso, type Beneficio, type Canal, type MedioPago, type Promo } from '@/lib/agenda'
import { CANALES, MEDIOS, TIPOS_BENEFICIO } from '@/lib/agenda/tipos'
import { nuevoIdPromo } from '@/lib/agenda/cliente'
import type { Marca } from '@/lib/nav.datos'
import { EditorRegla, Tilde, toggleEnLista } from './EditorRegla'

const MARCAS: { key: Marca; label: string }[] = [
  { key: 'bdi', label: 'BDI' },
  { key: 'zattia', label: 'Zattia' },
]

export function promoVacia(): Promo {
  return {
    id: nuevoIdPromo(),
    banco: '',
    medio: 'credito',
    beneficio: { tipo: 'descuento', pct: 10 },
    regla: { tipo: 'semanal', dias: [] },
    desde: hoyIso(),
    hasta: null,
    condiciones: [],
    pasos: null,
    canales: ['mostrador'],
    marcas: [],
    activa: true,
    autor: null,
    creado: null,
  }
}

export function ModalPromo({
  inicial,
  onCerrar,
  onGuardar,
}: {
  inicial: Promo
  onCerrar: () => void
  onGuardar: (p: Promo) => Promise<void>
}) {
  const [p, setP] = useState<Promo>(inicial)
  const [condicionesTexto, setCondicionesTexto] = useState(inicial.condiciones.join('\n'))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const set = <K extends keyof Promo>(k: K, v: Promo[K]) => setP((x) => ({ ...x, [k]: v }))

  const cambiarTipoBeneficio = (tipo: Beneficio['tipo']) => {
    const nuevo: Record<Beneficio['tipo'], Beneficio> = {
      descuento: { tipo: 'descuento', pct: 10 },
      reintegro: { tipo: 'reintegro', pct: 20, tope: null },
      cuotas: { tipo: 'cuotas', n: 3, sinInteres: true },
    }
    set('beneficio', nuevo[tipo])
  }

  const guardar = async () => {
    setError(null)
    setGuardando(true)
    try {
      await onGuardar({
        ...p,
        banco: p.banco.trim(),
        condiciones: condicionesTexto.split('\n').map((c) => c.trim()).filter(Boolean),
        pasos: p.pasos && p.pasos.trim() ? p.pasos : null,
      })
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const b = p.beneficio

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={inicial.creado ? 'Editar promoción' : 'Nueva promoción bancaria'}
      ancho="ancho"
      // Un clic al costado no puede tirar un formulario largo con los pasos ya tipeados.
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[4] }}>
        {error && <Notice tone="danger">{error}</Notice>}

        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Banco o emisor" required width={240}>
            <Input
              value={p.banco}
              onChange={(e) => set('banco', e.target.value)}
              placeholder="Banco Nación"
            />
          </Field>
          <Field label="Se paga con" width={200}>
            <Select value={p.medio} onChange={(e) => set('medio', e.target.value as MedioPago)}>
              {MEDIOS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </Select>
          </Field>
        </div>

        <div>
          <div style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium, marginBottom: 4 }}>
            Qué le dan al cliente
          </div>
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field width={160}>
              <Select value={b.tipo} onChange={(e) => cambiarTipoBeneficio(e.target.value as Beneficio['tipo'])}>
                {TIPOS_BENEFICIO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </Field>

            {(b.tipo === 'descuento' || b.tipo === 'reintegro') && (
              <Field label="%" width={90}>
                <Input
                  type="number"
                  value={String(b.pct)}
                  onChange={(e) => set('beneficio', { ...b, pct: Number(e.target.value) } as Beneficio)}
                />
              </Field>
            )}

            {/*
              El tope sólo existe en el reintegro y va acá, al lado del porcentaje: es la parte del
              beneficio que cambia lo que se le promete al cliente, no letra chica. Vacío = sin tope.
            */}
            {b.tipo === 'reintegro' && (
              <Field label="Tope de reintegro ($)" hint="Vacío = sin tope" width={180}>
                <Input
                  type="number"
                  value={b.tope === null ? '' : String(b.tope)}
                  onChange={(e) =>
                    set('beneficio', { ...b, tope: e.target.value === '' ? null : Number(e.target.value) })
                  }
                />
              </Field>
            )}

            {b.tipo === 'cuotas' && (
              <>
                <Field label="Cuotas" width={90}>
                  <Input
                    type="number"
                    value={String(b.n)}
                    onChange={(e) => set('beneficio', { ...b, n: Number(e.target.value) })}
                  />
                </Field>
                <Tilde
                  puesto={b.sinInteres}
                  label="Sin interés"
                  onToggle={() => set('beneficio', { ...b, sinInteres: !b.sinInteres })}
                />
              </>
            )}
          </div>
        </div>

        <EditorRegla regla={p.regla} onChange={(r) => set('regla', r)} />

        {/*
          La vigencia va aparte de la regla y no es redundante: "los martes" es la regla, "de agosto"
          es la ventana. Sin `hasta`, la promo sigue viva — es sin fin anunciado, no vencida.
        */}
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Desde" required width={170}>
            <Input type="date" value={p.desde} onChange={(e) => set('desde', e.target.value)} />
          </Field>
          <Field label="Hasta" hint="Vacío = sin fin anunciado" width={200}>
            <Input type="date" value={p.hasta ?? ''} onChange={(e) => set('hasta', e.target.value || null)} />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: space[6], flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium, marginBottom: 4 }}>
              Dónde corre
            </div>
            <div style={{ display: 'flex', gap: space[2] }}>
              {CANALES.map((c) => (
                <Tilde
                  key={c.key}
                  puesto={p.canales.includes(c.key)}
                  label={c.label}
                  onToggle={() => set('canales', toggleEnLista(p.canales, c.key) as Canal[])}
                />
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium, marginBottom: 4 }}>
              Marcas <span style={{ fontWeight: weight.normal }}>(ninguna tildada = las dos)</span>
            </div>
            <div style={{ display: 'flex', gap: space[2] }}>
              {MARCAS.map((m) => (
                <Tilde
                  key={m.key}
                  puesto={p.marcas.includes(m.key)}
                  label={m.label}
                  onToggle={() => set('marcas', toggleEnLista(p.marcas, m.key) as Marca[])}
                />
              ))}
            </div>
          </div>
        </div>

        <Field label="Condiciones" hint="Una por renglón. Es la letra chica que hay que poder leer al cobrar.">
          <textarea
            value={condicionesTexto}
            onChange={(e) => setCondicionesTexto(e.target.value)}
            rows={3}
            placeholder={'Tope por cliente y por mes\nNo acumulable con otras promociones'}
            style={{
              width: '100%', padding: space[2], borderRadius: 8,
              border: `1px solid ${color.line2}`, fontSize: font.base, fontFamily: 'inherit',
              background: 'transparent', color: color.ink, resize: 'vertical',
            }}
          />
        </Field>

        <Field label="Cómo se cobra" hint="El paso a paso en el posnet o en la app. Se lee con el cliente delante.">
          <textarea
            value={p.pasos ?? ''}
            onChange={(e) => set('pasos', e.target.value)}
            rows={4}
            placeholder={'1. Elegir «Crédito» en el posnet\n2. Plan «Ahora 3»'}
            style={{
              width: '100%', padding: space[2], borderRadius: 8,
              border: `1px solid ${color.line2}`, fontSize: font.base, fontFamily: 'inherit',
              background: 'transparent', color: color.ink, resize: 'vertical',
            }}
          />
        </Field>

        <Tilde puesto={p.activa} label={p.activa ? 'Prendida' : 'Apagada'} onToggle={() => set('activa', !p.activa)} />
      </div>
    </Modal>
  )
}
