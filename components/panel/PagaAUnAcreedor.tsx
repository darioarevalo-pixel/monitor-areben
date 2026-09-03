'use client'

/**
 * "Que le pague a un acreedor" — adentro del panel de WhatsApp, en la ficha del cliente.
 *
 * # Por qué acá y no sólo en la sección
 *
 * Porque esto se arregla HABLANDO. El momento en que se decide es la charla: "te debo el pedido" /
 * "dale, en vez de pagarme a mí, transferile al contador, te paso el alias". Si para anotarlo hay
 * que salir del chat, abrir otra sección y volver a escribir quién es el cliente, no se anota.
 *
 * Acá el cliente ya está identificado: viene de la ficha, con su id de Gestión Nube y su nombre.
 * Lo único que se elige es a QUIÉN le va a transferir y CUÁNTO.
 *
 * # ⛔ Lo que todavía NO muestra: cuánto debe el cliente
 *
 * El planteo pide "debe en GN − ya comprometido = lo que se le puede pedir". La mitad derecha está
 * (las promesas viven acá). La izquierda **no existe todavía**: `total_due` viene por venta en
 * `GET /ventas` y el sync del espejo lo descarta, así que hoy no hay de dónde leerlo sin salir a
 * preguntarle a GN. Es la sección "Deudas de clientes", que va aparte.
 *
 * Mientras tanto la pantalla dice lo que sí sabe —cuánto ya se le pidió a este cliente— y no
 * inventa la otra mitad. Un número de deuda sacado del espejo estaría desactualizado y se
 * prometería contra un saldo que ya no existe.
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui'
import { color, font, radius, space } from '@/components/ui/tokens'
import { crearCompromiso, type PuedeCompromisos } from '@/lib/compromisos/cliente'
import { estaAbierto, prometidoPorAcreedor, prometidoPorCliente, sePuedePrometer, type Compromiso } from '@/lib/compromisos/core'
import type { Acreedor } from '@/lib/acreedores/cliente'

const plata = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

export function PagaAUnAcreedor({ cliente, acreedores, compromisos, puede, onCambio }: {
  cliente: { id: number; name: string }
  acreedores: Acreedor[]
  compromisos: Compromiso[]
  puede: PuedeCompromisos
  onCambio: () => void
}) {
  const [elegido, setElegido] = useState<string | null>(null)
  const [monto, setMonto] = useState('')
  const [titular, setTitular] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<string | null>(null)

  const idCliente = String(cliente.id)
  const prometidoAcreedor = useMemo(() => prometidoPorAcreedor(compromisos), [compromisos])
  const yaLePedimos = prometidoPorCliente(compromisos).get(idCliente) ?? 0
  const susPromesas = compromisos.filter((c) => c.cliente_id === idCliente && estaAbierto(c))

  // Sólo los que tienen deuda a la que imputar: prometerle a uno saldado rebota en la puerta.
  const conDeuda = acreedores
    .map((a) => ({ a, puedePedirse: sePuedePrometer(a.disponible, prometidoAcreedor.get(a.id) ?? 0) }))
    .filter((x) => x.puedePedirse > 0)

  if (!puede.prometer) return null

  const sel = conDeuda.find((x) => x.a.id === elegido) ?? null
  const cuenta = sel?.a.cuentas.find((c) => c.sugerida) ?? sel?.a.cuentas[0] ?? null
  const n = Number(String(monto).replace(/\./g, '').replace(',', '.'))
  const sePasa = !!sel && Number.isFinite(n) && n > sel.puedePedirse + 0.005
  const puedeGuardar = !!sel && Number.isFinite(n) && n > 0 && !sePasa && !guardando

  return (
    <section
      style={{
        background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg,
        padding: `${space[2]}px ${space[3]}px ${space[3]}px`, margin: `0 ${space[2]}px ${space[2]}px`,
      }}
    >
      <div style={{ fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, color: color.mut2, textTransform: 'uppercase', marginBottom: 6 }}>
        Que le pague a un acreedor
      </div>

      {yaLePedimos > 0 && (
        <div style={{ fontSize: font.sm, color: color.mut2, marginBottom: 6 }}>
          Ya le pedimos <b style={{ color: color.ink }}>{plata(yaLePedimos)}</b> en{' '}
          {susPromesas.length === 1 ? 'una transferencia' : `${susPromesas.length} transferencias`} que
          todavía no entraron.
        </div>
      )}

      {conDeuda.length === 0 ? (
        <div style={{ fontSize: font.sm, color: color.mut2 }}>
          {acreedores.length === 0
            ? 'No se pudo leer a quién le debemos. Probá de nuevo en un rato.'
            : 'No hay ninguna deuda con acreedores a la que se pueda mandar plata ahora.'}
        </div>
      ) : (
        <>
          {/* A quién. Cada opción dice cuánto se le puede pedir: es el número que decide. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {conDeuda.map(({ a, puedePedirse }) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setElegido(a.id === elegido ? null : a.id); setError(null); setListo(null) }}
                style={{
                  border: `1px solid ${a.id === elegido ? color.brandBorder : color.line}`,
                  background: a.id === elegido ? color.brandBg : color.bg,
                  color: a.id === elegido ? color.brand : color.ink,
                  borderRadius: radius.md, padding: '6px 10px', fontSize: font.sm, cursor: 'pointer',
                }}
              >
                {a.nombre} · hasta {plata(puedePedirse)}
              </button>
            ))}
          </div>

          {sel && (
            <>
              {cuenta ? (
                <div style={{ fontSize: font.sm, color: color.mut2, marginBottom: 8, lineHeight: 1.5 }}>
                  Pasale <b style={{ color: color.ink }}>{cuenta.alias || cuenta.cbu}</b>
                  {cuenta.banco ? ` · ${cuenta.banco}` : ''}
                  {cuenta.titular ? ` · a nombre de ${cuenta.titular}` : ''}
                  {cuenta.alias && cuenta.cbu ? (
                    <div style={{ fontFamily: 'monospace', fontSize: font.xs }}>CBU {cuenta.cbu}</div>
                  ) : null}
                </div>
              ) : (
                <div style={{ fontSize: font.sm, color: color.warningInk, marginBottom: 8 }}>
                  Ojo: {sel.a.nombre} no tiene ninguna cuenta cargada, así que no hay alias que pasarle.
                  Se carga en el dashboard, en Finanzas → Acreedores.
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={monto}
                  onChange={(e) => { setMonto(e.target.value); setError(null) }}
                  inputMode="decimal"
                  placeholder={`¿cuánto? hasta ${plata(sel.puedePedirse)}`}
                  style={{
                    flex: '1 1 150px', minWidth: 0, padding: '7px 9px', fontSize: font.sm,
                    border: `1px solid ${sePasa ? color.dangerBorder : color.line}`,
                    borderRadius: radius.md, background: color.bg, color: color.ink,
                  }}
                />
                <input
                  value={titular}
                  onChange={(e) => setTitular(e.target.value)}
                  placeholder="¿transfiere a nombre de otro?"
                  style={{
                    flex: '1 1 150px', minWidth: 0, padding: '7px 9px', fontSize: font.sm,
                    border: `1px solid ${color.line}`, borderRadius: radius.md,
                    background: color.bg, color: color.ink,
                  }}
                />
                <Button
                  size="sm"
                  disabled={!puedeGuardar}
                  onClick={async () => {
                    setGuardando(true); setError(null)
                    try {
                      await crearCompromiso({
                        acreedor_id: sel.a.id,
                        acreedor_nombre: sel.a.nombre,
                        cuenta_alias: cuenta?.alias ?? null,
                        cuenta_cbu: cuenta?.cbu ?? null,
                        cuenta_banco: cuenta?.banco ?? null,
                        cuenta_titular: cuenta?.titular ?? null,
                        cliente_id: idCliente,
                        cliente_nombre: cliente.name,
                        titular_real: titular.trim() || null,
                        monto: n,
                      })
                      setListo(`Listo: quedó la promesa de ${plata(n)} a ${sel.a.nombre}.`)
                      setMonto(''); setTitular(''); setElegido(null)
                      onCambio()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
                    } finally {
                      setGuardando(false)
                    }
                  }}
                >
                  {guardando ? 'Guardando…' : 'Crear la promesa'}
                </Button>
              </div>

              {sePasa && (
                <div style={{ fontSize: font.xs, color: color.dangerInk, marginTop: 6 }}>
                  Es más de lo que se le debe a {sel.a.nombre} sin prometer. Si va a mandar más, el
                  resto va como otra promesa a otro acreedor.
                </div>
              )}
            </>
          )}
        </>
      )}

      {error && <div style={{ fontSize: font.xs, color: color.dangerInk, marginTop: 6 }}>{error}</div>}
      {listo && <div style={{ fontSize: font.xs, color: color.successInk, marginTop: 6 }}>{listo}</div>}
    </section>
  )
}
