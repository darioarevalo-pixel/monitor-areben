'use client'

/**
 * Los controles de la calculadora de rentabilidad: **la mitad izquierda de la pantalla**.
 *
 * Sólo dibuja y avisa el cambio. Los valores de arranque salen de `DEFAULTS`
 * (`lib/meta-ads/rentabilidad`) y no están escritos acá: un default tipeado dos veces es un default
 * que se desincroniza.
 *
 * 🔑 **Deslizador para lo que no se sabe, campo numérico para lo que sí.** El raspa, el mix, las
 * unidades por pedido y el reparto son supuestos que se mueven para ver qué pasa: se arrastran. El
 * IVA, el costo y las comisiones son datos: se tipean. La forma del control dice de qué tipo de
 * número se trata sin ponerle un cartel.
 */

import { useState } from 'react'
import { NumberField, color, font, space, weight } from '@/components/ui'
import type { Supuestos } from '@/lib/meta-ads/rentabilidad'

/** Cambiar un supuesto sin perder los otros. */
export type Cambiar = <K extends keyof Supuestos>(k: K, v: Supuestos[K]) => void

const panel: React.CSSProperties = {
  border: `1px solid ${color.line}`,
  borderRadius: 10,
  padding: space[4],
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
  background: color.surface,
}

const titulo: React.CSSProperties = {
  fontSize: font.sm,
  fontWeight: weight.semibold,
  color: color.ink2,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}

/** Un campo numérico con su rótulo a la izquierda y una pista opcional. */
function Campo({ label, pista, children }: { label: string; pista?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
      <span style={{ fontSize: font.sm, color: color.ink2 }}>
        {label}
        {pista && <span style={{ color: color.mut2, fontSize: font.xs, marginLeft: 6 }}>{pista}</span>}
      </span>
      {children}
    </label>
  )
}

/** Las claves de `Supuestos` que llevan un número. Deja afuera a `acumulan`, que es el conmutador. */
type ClaveNumerica = { [K in keyof Supuestos]: Supuestos[K] extends number ? K : never }[keyof Supuestos]

export function PanelesDeSupuestos({ s, cambiar, soloLectura = false }: {
  s: Supuestos
  cambiar: Cambiar
  /**
   * ⚠️ **`soloLectura` deshabilita los controles, NO esconde los números.**
   *
   * Quien no puede guardar igual tiene que poder leer con qué está calculado el techo contra el que
   * se le juzga la campaña. Esconderlo dejaría el umbral como un número caído del cielo.
   */
  soloLectura?: boolean
}) {
  /**
   * 🔑 **Qué campos están momentáneamente en blanco, y por qué el blanco NO viaja al modelo.**
   *
   * Borrar un campo para reescribirlo tiene que dejarlo vacío —si el `''` se guardara como 0, el
   * campo mostraría un `0` que hay que borrar antes de poder tipear—, pero el modelo es de números
   * y **un 0 en el medio no es «todavía nada», es un precio de cero**: con el precio en blanco, el
   * techo pasaba a `$ -2.210` y el ROAS a `∞×`, que se leen como una respuesta y no como un campo a
   * medio llenar.
   *
   * Así que el campo se dibuja vacío y **la cuenta sigue con el último número bueno** hasta que
   * entre uno nuevo. Al salir del campo se levanta la marca, y vuelve a mostrarse lo que se está
   * usando: nunca queda un campo en blanco cuyo valor viejo sigue contando en silencio.
   */
  const [vacios, setVacios] = useState<ReadonlySet<string>>(new Set())
  const marcar = (k: string, vacio: boolean) =>
    setVacios((prev) => {
      if (prev.has(k) === vacio) return prev
      const sig = new Set(prev)
      if (vacio) sig.add(k)
      else sig.delete(k)
      return sig
    })

  const num = (k: ClaveNumerica, extra?: { min?: number; max?: number; step?: number; prefix?: string; width?: number }) => (
    // `onBlur` va en el envoltorio y no en el input: React lo implementa con `focusout`, que sí
    // burbujea, y así no hay que tocar el `NumberField` del kit —que lo comparten otras secciones—
    // para un comportamiento que necesita ésta.
    <span onBlur={() => marcar(k, false)}>
      <NumberField
        value={vacios.has(k) ? '' : s[k]}
        onChange={(n) => {
          marcar(k, n === '')
          if (n !== '') cambiar(k, n)
        }}
        min={extra?.min ?? 0}
        max={extra?.max}
        step={extra?.step ?? 0.1}
        prefix={extra?.prefix}
        width={extra?.width ?? 104}
        disabled={soloLectura}
      />
    </span>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={panel}>
        <div style={titulo}>Precio y descuentos</div>
        <Campo label="Precio de lista" pista="por unidad">{num('precio', { step: 10, prefix: '$', width: 116 })}</Campo>
        <Rango
          label="Descuento del raspa" valor={`${fmt(s.raspa)}%`} min={0} max={20} step={0.5}
          value={s.raspa} izq="0%" der="20%" onChange={(n) => cambiar('raspa', n)} soloLectura={soloLectura}
        />
        <Rango
          label="Compradores que lo usan" valor={`${Math.round(s.usaRaspa)}%`} min={0} max={100} step={5}
          value={s.usaRaspa} izq="nadie" der="todos" onChange={(n) => cambiar('usaRaspa', n)} soloLectura={soloLectura}
        />
        <Campo label="Descuento por transferencia">{num('transf', { max: 100, step: 1, prefix: '%' })}</Campo>
        <Campo label="¿Se acumulan?" pista="raspa + transferencia">
          <Conmutador si={s.acumulan} onChange={(v) => cambiar('acumulan', v)} soloLectura={soloLectura} />
        </Campo>
        <Rango
          label="Ventas por transferencia" valor={`${Math.round(s.mix)}%`} min={0} max={100} step={5}
          value={s.mix} izq="todo tarjeta" der="todo transferencia" onChange={(n) => cambiar('mix', n)} soloLectura={soloLectura}
        />
      </div>

      <div style={panel}>
        <div style={titulo}>Costos, impuestos y comisiones</div>
        <Campo label="Costo del producto" pista="sin IVA">{num('costo', { step: 50, prefix: '$', width: 116 })}</Campo>
        <Campo label="IVA">{num('iva', { max: 100, step: 0.5, prefix: '%' })}</Campo>
        <Campo label="Ingresos Brutos" pista="Santa Fe">{num('iibb', { max: 100, prefix: '%' })}</Campo>
        <Campo label="Impuesto al cheque">{num('cheque', { max: 100, prefix: '%' })}</Campo>
        <div style={{ ...titulo, fontSize: font.xs, marginTop: space[1] }}>Con tarjeta</div>
        <Campo label="Tienda Nube">{num('tnTarjeta', { max: 100, prefix: '%' })}</Campo>
        <Campo label="Pasarela" pista="con cuotas">{num('pasTarjeta', { max: 100, prefix: '%' })}</Campo>
        <div style={{ ...titulo, fontSize: font.xs, marginTop: space[1] }}>Con transferencia</div>
        <Campo label="Tienda Nube" pista="bonificada">{num('tnTransf', { max: 100, prefix: '%' })}</Campo>
        <Campo label="Pasarela">{num('pasTransf', { max: 100, prefix: '%' })}</Campo>
      </div>

      <div style={panel}>
        <div style={titulo}>El pedido y el objetivo</div>
        <Rango
          label="Unidades por pedido" valor={fmt(s.unidades)} min={1} max={6} step={0.1}
          value={s.unidades} izq="1" der="6" onChange={(n) => cambiar('unidades', n)} soloLectura={soloLectura}
        />
        <Rango
          label="De la ganancia, a la pauta" valor={`${Math.round(s.reparto)}%`} min={10} max={100} step={5}
          value={s.reparto} izq="conservador" der="al hueso" onChange={(n) => cambiar('reparto', n)} soloLectura={soloLectura}
        />
        <Campo label="Ventas por día" pista="el objetivo">{num('ventasDia', { step: 5, width: 116 })}</Campo>
        <Campo label="Stock" pista="unidades">{num('stock', { step: 100, width: 116 })}</Campo>
        <Campo label="Lo que pagás hoy" pista="por compra">{num('costoHoy', { step: 50, prefix: '$', width: 116 })}</Campo>
      </div>
    </div>
  )
}

/** Un número con a lo sumo un decimal, en castellano. */
function fmt(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

/**
 * Un deslizador con su valor a la vista y los dos extremos rotulados.
 *
 * Los extremos van con palabras y no con números («todo tarjeta» / «todo transferencia»): lo que
 * hay que entender de un slider es qué significa correrlo, no hasta dónde llega.
 */
function Rango({ label, valor, min, max, step, value, izq, der, onChange, soloLectura }: {
  label: string
  valor: string
  min: number
  max: number
  step: number
  value: number
  izq: string
  der: string
  onChange: (n: number) => void
  soloLectura?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: font.sm, color: color.ink2 }}>{label}</span>
        <span style={{ fontSize: font.sm, fontWeight: weight.semibold, color: color.brandSolid }}>{valor}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={soloLectura}
        style={{ width: '100%', accentColor: color.brandSolid }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.xs, color: color.mut2 }}>
        <span>{izq}</span>
        <span>{der}</span>
      </div>
    </div>
  )
}

/** Sí / No, en dos botones pegados. */
function Conmutador({ si, onChange, soloLectura }: { si: boolean; onChange: (v: boolean) => void; soloLectura?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', border: `1px solid ${color.line2}`, borderRadius: 8, overflow: 'hidden' }}>
      {([true, false] as const).map((v) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={si === v}
          onClick={() => onChange(v)}
          disabled={soloLectura}
          style={{
            border: 'none',
            padding: '4px 14px',
            fontSize: font.sm,
            cursor: soloLectura ? 'default' : 'pointer',
            background: si === v ? color.brandSolid : 'transparent',
            color: si === v ? '#fff' : color.mut,
            fontWeight: si === v ? weight.semibold : weight.normal,
          }}
        >
          {v ? 'Sí' : 'No'}
        </button>
      ))}
    </span>
  )
}
