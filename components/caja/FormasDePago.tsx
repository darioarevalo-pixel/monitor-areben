'use client'

/**
 * «Formas de pago» de la pestaña Caja (V4, Bruno 12-oct), sólo admin: qué cuenta de Gestión Nube va detrás
 * de cada forma de pago y con qué descuento, las 6 cuotas, las cuentas de la oferta y si la transferencia
 * se verifica en Mercado Pago. Son DATO DE LA TIENDA (`caja_config` de su marca): BDI nació con las mismas
 * de Zattia, con SUS cuentas de GN.
 *
 * La lógica (formulario ⇄ reglas, y qué es válido) vive en `lib/caja/formas-pago.core.js`, la MISMA que
 * vuelve a validar el servidor contra las cuentas de GN de la marca. Acá sólo se elige.
 */

import { useEffect, useMemo, useState } from 'react'
import { aplicarFormasDePago, formasDePagoDe, type FormasDePago as Formas } from '@/lib/caja/formas-pago.core.js'
import { guardarFormasDePago, leerCuentas, type CuentaGN, type Reglas, type Versiones } from '@/lib/caja/cliente'
import { Button, Field, Input, Notice, Plegable, Select, color, font, space, weight } from '@/components/ui'
import { SiNo } from '@/components/caja/partes'

type Fila = { clave: keyof Formas; rotulo: string; ayuda?: string; pct?: 'efectivo' | 'debito' | 'credito' | 'creditoPromo' | 'transferencia'; opcional?: boolean }

/** El orden de la pantalla. `pct`: de qué línea es el % (las dos transferencias comparten uno). */
const FILAS: Fila[] = [
  { clave: 'efectivo', rotulo: 'Efectivo', pct: 'efectivo' },
  { clave: 'transferenciaAreben', rotulo: 'Transferencia a Areben Comercial', pct: 'transferencia', opcional: true },
  { clave: 'transferenciaCG', rotulo: 'Transferencia a Darío o Bruno', pct: 'transferencia', opcional: true },
  { clave: 'debito', rotulo: 'Tarjeta de débito', pct: 'debito' },
  { clave: 'credito', rotulo: 'Tarjeta de crédito', pct: 'credito' },
  { clave: 'creditoPromo', rotulo: 'Crédito con promo bancaria del día', ayuda: 'Sólo los días de la Agenda, si la tarjeta es de ese banco.', pct: 'creditoPromo' },
  { clave: 'seisCuotas', rotulo: '6 cuotas sin interés', opcional: true },
  { clave: 'efectivoOferta', rotulo: 'Efectivo en oferta (precio final)', opcional: true },
  { clave: 'transferenciaOferta', rotulo: 'Transferencia en oferta (precio final)', opcional: true },
  { clave: 'tarjetaOferta', rotulo: 'Tarjeta en oferta (con recargo)', opcional: true },
]

const cuentaDe = (f: Formas, k: keyof Formas): number | null => {
  const v = f[k] as unknown
  return v && typeof v === 'object' ? (v as { cuenta: number | null }).cuenta : (v as number | null)
}

export function FormasDePago({ reglas, onGuardadas }: { reglas: Reglas; onGuardadas: (r: Reglas, v?: Versiones) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState<Formas>(() => formasDePagoDe(reglas))
  const [cuentas, setCuentas] = useState<CuentaGN[] | null>(null)
  const [errCuentas, setErrCuentas] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ tono: 'success' | 'danger'; texto: string } | null>(null)
  // Las cuentas de GN de ESTA tienda: se piden al abrir (cada lectura gasta cupo de GN).
  useEffect(() => {
    if (!abierto || cuentas || errCuentas) return
    leerCuentas()
      .then((r) => setCuentas(r.cuentas))
      .catch((e) => setErrCuentas((e as Error).message))
  }, [abierto, cuentas, errCuentas])
  // Otra pantalla guardó (o se guardó acá): el formulario vuelve a lo guardado. Ajuste al dibujar, ⛔ efecto.
  const [base, setBase] = useState(reglas)
  if (base !== reglas) {
    setBase(reglas)
    setF(formasDePagoDe(reglas))
  }

  const guardada = useMemo(() => JSON.stringify(formasDePagoDe(reglas)), [reglas])
  const cambio = JSON.stringify(f) !== guardada
  // El mismo chequeo del servidor, sin las cuentas de GN: el error se ve antes de guardar.
  const invalido = useMemo(() => {
    try {
      aplicarFormasDePago(reglas, f, null)
      return null
    } catch (e) {
      return (e as Error).message
    }
  }, [reglas, f])

  const ponerCuenta = (k: keyof Formas, v: string) => {
    const n = v ? Number(v) : null
    const actual = f[k] as unknown
    setF({ ...f, [k]: actual && typeof actual === 'object' ? { ...(actual as object), cuenta: n } : n })
  }
  const pctDe = (p: NonNullable<Fila['pct']>): string => String(p === 'transferencia' ? f.transferenciaDescuento : f[p].descuento)
  const ponerPct = (p: NonNullable<Fila['pct']>, v: string) => {
    const n = v.trim() === '' ? ('' as unknown as number) : Number(v.replace(',', '.'))
    setF(p === 'transferencia' ? { ...f, transferenciaDescuento: n } : { ...f, [p]: { ...f[p], descuento: n } })
  }
  async function guardar() {
    setGuardando(true)
    setMsg(null)
    try {
      const r = await guardarFormasDePago(f)
      onGuardadas(r.reglas, r.versiones)
      setMsg({ tono: 'success', texto: 'Guardado: el POS lo toma al abrir el próximo cobro.' })
    } catch (e) {
      setMsg({ tono: 'danger', texto: (e as Error).message })
    } finally {
      setGuardando(false)
    }
  }
  const nombre = (id: number | null) => (id == null ? '—' : (cuentas?.find((c) => c.id === id)?.nombre ?? reglas.cuentas[id]?.nombre ?? `Cuenta ${id}`))
  const transferencias = [f.transferenciaAreben, f.transferenciaCG].filter((x): x is number => x != null)

  return (
    <Plegable variante="tarjeta" abierto={abierto} onToggle={() => setAbierto(!abierto)} titulo="Formas de pago" ayuda="La cuenta de Gestión Nube y el descuento de cada forma de pago de esta tienda. Sólo lo cambia un admin.">
      <div style={{ display: 'grid', gap: space[3], maxWidth: 720 }}>
        {errCuentas && <Notice tone="warning">No se pudieron leer las cuentas de Gestión Nube ({errCuentas}): se ven los ids guardados.</Notice>}
        <div style={{ display: 'grid', gap: space[2] }}>
          {FILAS.map((fila) => {
            const id = cuentaDe(f, fila.clave)
            return (
              <div key={fila.clave} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ width: 230, fontSize: font.base }}>
                  {fila.rotulo}
                  {fila.ayuda && <span style={{ display: 'block', fontSize: font.xs, color: color.mut }}>{fila.ayuda}</span>}
                </span>
                {cuentas ? (
                  <Select value={id == null ? '' : String(id)} disabled={guardando} onChange={(e) => ponerCuenta(fila.clave, e.target.value)} style={{ maxWidth: 300 }} aria-label={`Cuenta de ${fila.rotulo}`}>
                    <option value="">{fila.opcional ? 'No tiene' : 'Elegir la cuenta…'}</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span style={{ minWidth: 300, color: color.ink2 }}>{id == null ? (fila.opcional ? 'No tiene' : '—') : nombre(id)}</span>
                )}
                {fila.pct && (fila.pct !== 'transferencia' || fila.clave === 'transferenciaAreben') && (
                  <Input value={pctDe(fila.pct)} disabled={guardando} onChange={(e) => ponerPct(fila.pct!, e.target.value)} inputMode="decimal" autoComplete="off" aria-label={`Descuento de ${fila.rotulo}`} style={{ width: 70, textAlign: 'right' }} />
                )}
                {fila.pct && (fila.pct !== 'transferencia' || fila.clave === 'transferenciaAreben') && <span style={{ color: color.mut }}>% de descuento{fila.pct === 'transferencia' ? ' (las dos)' : ''}</span>}
              </div>
            )
          })}
          {f.seisCuotas != null && (
            <Field label="6 cuotas: compras de más de ($)">
              <Input value={String(f.minSeisCuotas)} disabled={guardando} onChange={(e) => setF({ ...f, minSeisCuotas: Number(e.target.value.replace(/\D/g, '')) || 0 })} inputMode="numeric" style={{ width: 140, textAlign: 'right' }} />
            </Field>
          )}
        </div>
        <SiNo pregunta="¿La transferencia se verifica en Mercado Pago antes de dar la venta por cobrada?" valor={f.verificarTransferencia} onCambio={(v) => setF({ ...f, verificarTransferencia: v })} />
        {/* V4 (Bruno, 12-oct): también con la espera prendida, mientras la tienda ⛔ tiene cuenta de MP conectada. */}
        {(
          <Field label={f.verificarTransferencia ? 'Sin cuenta de Mercado Pago conectada, las transferencias van a' : 'Sin verificar, las transferencias van a'}>
            <Select value={f.transferenciaFija == null ? '' : String(f.transferenciaFija)} disabled={guardando} onChange={(e) => setF({ ...f, transferenciaFija: e.target.value ? Number(e.target.value) : null })} style={{ maxWidth: 300 }}>
              <option value="">{f.verificarTransferencia ? 'Ninguna (sin cuenta de MP, la transferencia no se cobra)' : 'Elegir…'}</option>
              {transferencias.map((t) => (
                <option key={t} value={t}>
                  {nombre(t)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <span style={{ color: color.mut, fontSize: font.sm }}>
          {f.verificarTransferencia
            ? 'La venta por transferencia queda esperando hasta que el pago aparece en la cuenta de Mercado Pago de «Las transferencias se detectan en». Si la tienda todavía no tiene cuenta conectada, la cajera mira el comprobante y toca «Transferencia confirmada».'
            : 'La venta por transferencia se da por cobrada al confirmar, como el efectivo: la cajera mira el comprobante.'}
        </span>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="sm" loading={guardando} disabled={!cambio || !!invalido || !cuentas} onClick={guardar}>
            Guardar
          </Button>
          {cambio && (
            <Button size="sm" variant="ghost" disabled={guardando} onClick={() => setF(formasDePagoDe(reglas))}>
              Cancelar
            </Button>
          )}
          {cambio && invalido && <span style={{ color: color.dangerInk, fontSize: font.sm, fontWeight: weight.semibold }}>{invalido}</span>}
        </div>
        {msg && <Notice tone={msg.tono}>{msg.texto}</Notice>}
      </div>
    </Plegable>
  )
}
