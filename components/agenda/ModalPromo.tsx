'use client'

/**
 * El alta de una promoción bancaria.
 *
 * 🔑 **La regla se arma con controles, nunca se tipea el JSON.** Lo que se guarda es
 * `{tipo:'semanal',dias:[2,5]}`, pero quien carga elige "ciertos días de la semana" y tilda martes y
 * viernes. Es la misma razón por la que la lista muestra `rotuloRegla()`: una regla que no se puede
 * leer no se puede revisar, y una que no se puede armar sin saber el formato no se carga.
 *
 * El servidor vuelve a validar todo (`motivoReglaInvalida`, el beneficio por rama, la ventana): esta
 * pantalla evita el viaje, no es la que decide.
 */

import { useState } from 'react'
import { Button, Field, Input, Modal, Notice, Select, color, font, space, weight } from '@/components/ui'
import { hoyIso, TIPOS_REGLA, type Beneficio, type Canal, type MedioPago, type Promo, type Regla } from '@/lib/agenda'
import { CANALES, MEDIOS, TIPOS_BENEFICIO } from '@/lib/agenda/tipos'
import { nuevoIdPromo } from '@/lib/agenda/cliente'
import type { Marca } from '@/lib/nav.datos'

/** 0 = domingo, como `getDay()` y como la regla. El orden de la fila arranca en lunes, que es como se lee. */
const DIAS_TILDE: { valor: number; label: string }[] = [
  { valor: 1, label: 'Lun' },
  { valor: 2, label: 'Mar' },
  { valor: 3, label: 'Mié' },
  { valor: 4, label: 'Jue' },
  { valor: 5, label: 'Vie' },
  { valor: 6, label: 'Sáb' },
  { valor: 0, label: 'Dom' },
]

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

function Tilde({ puesto, label, onToggle }: { puesto: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        height: 'auto',
        padding: `${space[1.5]}px ${space[3]}px`,
        borderRadius: 999,
        cursor: 'pointer',
        fontSize: font.sm,
        fontWeight: weight.semibold,
        border: `1px solid ${puesto ? color.brand : color.line2}`,
        background: puesto ? color.brandBg : 'transparent',
        color: puesto ? color.brand : color.mut,
      }}
    >
      {label}
    </button>
  )
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

  const cambiarTipoRegla = (tipo: Regla['tipo']) => {
    // Cada tipo estrena su propio esqueleto: conservar los campos del anterior dejaría una
    // `{tipo:'diaria', dias:[2]}` que el validador rechaza por un campo que la pantalla ya no muestra.
    const nueva: Record<Regla['tipo'], Regla> = {
      unica: { tipo: 'unica', fecha: hoyIso() },
      rango: { tipo: 'rango', desde: hoyIso(), hasta: hoyIso() },
      diaria: { tipo: 'diaria' },
      semanal: { tipo: 'semanal', dias: [] },
      mensual: { tipo: 'mensual', dia: 1 },
    }
    set('regla', nueva[tipo])
  }

  const cambiarTipoBeneficio = (tipo: Beneficio['tipo']) => {
    const nuevo: Record<Beneficio['tipo'], Beneficio> = {
      descuento: { tipo: 'descuento', pct: 10 },
      reintegro: { tipo: 'reintegro', pct: 20, tope: null },
      cuotas: { tipo: 'cuotas', n: 3, sinInteres: true },
    }
    set('beneficio', nuevo[tipo])
  }

  const toggleEnLista = <T,>(lista: T[], v: T): T[] =>
    lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]

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

  const r = p.regla
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

        <div>
          <div style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium, marginBottom: 4 }}>
            Qué días corre
          </div>
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field width={240}>
              <Select value={r.tipo} onChange={(e) => cambiarTipoRegla(e.target.value as Regla['tipo'])}>
                {TIPOS_REGLA.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </Field>

            {r.tipo === 'unica' && (
              <Field label="El día" width={170}>
                <Input type="date" value={r.fecha} onChange={(e) => set('regla', { ...r, fecha: e.target.value })} />
              </Field>
            )}

            {r.tipo === 'rango' && (
              <>
                <Field label="Del" width={170}>
                  <Input type="date" value={r.desde} onChange={(e) => set('regla', { ...r, desde: e.target.value })} />
                </Field>
                <Field label="Al" width={170}>
                  <Input type="date" value={r.hasta} onChange={(e) => set('regla', { ...r, hasta: e.target.value })} />
                </Field>
              </>
            )}

            {r.tipo === 'mensual' && (
              <Field label="Día del mes" hint="Del 29 en adelante, usá «el último»" width={170}>
                <Select
                  value={String(r.dia)}
                  onChange={(e) =>
                    set('regla', { ...r, dia: e.target.value === 'ultimo' ? 'ultimo' : Number(e.target.value) })
                  }
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={String(d)}>{d}</option>
                  ))}
                  <option value="ultimo">el último día del mes</option>
                </Select>
              </Field>
            )}
          </div>

          {r.tipo === 'semanal' && (
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[3] }}>
              {DIAS_TILDE.map((d) => (
                <Tilde
                  key={d.valor}
                  puesto={r.dias.includes(d.valor)}
                  label={d.label}
                  onToggle={() => set('regla', { ...r, dias: toggleEnLista(r.dias, d.valor) })}
                />
              ))}
            </div>
          )}
        </div>

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
