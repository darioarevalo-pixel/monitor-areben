'use client'

/**
 * "Que le pague a un acreedor" — el formulario, adentro de la pestaña **Pagos** del panel.
 *
 * # Por qué está en el panel y no sólo en la sección
 *
 * Porque esto se arregla HABLANDO. El momento en que se decide es la charla: "te debo el pedido" /
 * "dale, en vez de pagarme a mí, transferile al contador, te paso el alias". Si para anotarlo hay
 * que salir del chat, abrir otra sección y volver a escribir quién es el cliente, no se anota.
 *
 * Acá el cliente ya está identificado: viene de la ficha del chat abierto, con su id de Gestión
 * Nube y su nombre. Lo único que se elige es a QUIÉN le va a transferir y CUÁNTO.
 *
 * # 🔑 También sirve para el que TODAVÍA NO está en Gestión Nube
 *
 * Un mayorista nuevo compra por WhatsApp y se carga al ERP después, cuando se arma el pedido — pero
 * el cobro se arregla en esa misma charla. Hasta el 3-sep-2026 esos chats no tenían nada que
 * ofrecer: sin ficha no había cliente, y sin cliente no había compromiso (lo levantó Darío usándolo).
 *
 * Ahora el que paga llega en dos formas (`QuienPaga`): el de la ficha, con su id de GN, y el que
 * **todavía no existe**, del que se sabe el nombre escrito a mano y —lo que importa— **el teléfono
 * del chat**. Ese número es lo que después permite reengancharla de un clic cuando el cliente
 * aparece en GN; el nombre no alcanza, se escribe distinto cada vez.
 *
 * ⚠️ Y es también con lo que se cuenta "cuánto ya le pedimos" mientras no tenga id
 * (`comprometidoPorTelefono`): sin eso, al mismo mayorista nuevo se le puede pedir dos veces la misma
 * plata en dos charlas.
 *
 * # ⛔ Acá NO se pregunta a nombre de quién viene la transferencia
 *
 * Se preguntaba, y era pedir una adivinanza (lo levantó Darío el 3-sep-2026): **el compromiso es del
 * cliente**, pero la plata la manda muy seguido otro —el novio, el socio, la razón social— y en
 * medio de la charla nadie sabe cuál. Ese nombre se pregunta al **confirmar**, que es cuando se
 * está mirando el extracto: ahí se lee en vez de predecirse.
 *
 * # ⛔ Lo que todavía NO muestra: cuánto debe el cliente
 *
 * El planteo pide "debe en GN − ya comprometido = lo que se le puede pedir". La mitad derecha está
 * (los compromisos viven acá). La izquierda **no existe todavía**: `total_due` viene por venta en
 * `GET /ventas` y el sync del espejo lo descarta, así que hoy no hay de dónde leerlo sin salir a
 * preguntarle a GN. Es la sección "Deudas de clientes", que va aparte.
 *
 * Mientras tanto la pantalla dice lo que sí sabe —cuánto ya se le pidió a este cliente— y no
 * inventa la otra mitad. Un número de deuda sacado del espejo estaría desactualizado y se
 * comprometería contra un saldo que ya no existe.
 *
 * # 🔑 No pide nada por su cuenta
 *
 * Los datos llegan por props: los pide una sola vez la pestaña (`Pagos.tsx`), que es la que se
 * monta recién cuando alguien la toca. Es lo que quedó del episodio del 3-sep-2026, cuando este
 * bloque vivía adentro de la ficha y consultaba al abrir cada chat: la ficha del cliente dejó de
 * abrir y no había ninguna pista de dónde (ver `Aislado.tsx`).
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui'
import { color, font, radius } from '@/components/ui/tokens'
import type { Acreedor } from '@/lib/acreedores/cliente'
import { crearCompromiso, type PuedeCompromisos } from '@/lib/compromisos/cliente'
import {
  estaAbierto, comprometidoPorAcreedor, comprometidoPorCliente, comprometidoPorTelefono, sePuedeComprometer,
  type Compromiso,
} from '@/lib/compromisos/core'

const plata = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

/**
 * De quién es la plata que va a entrar.
 *
 * Las dos formas existen porque la charla no espera al ERP: `erp` es el cliente que el panel
 * encontró en Gestión Nube, y `sin-cargar` es el que compró recién y todavía no se cargó. Lo que
 * los une es el teléfono del chat, que en el segundo caso es la única llave que queda.
 */
export type QuienPaga =
  | { tipo: 'erp'; id: number; nombre: string; telefono: string | null }
  | { tipo: 'sin-cargar'; nombre: string; telefono: string }

export function NuevoCompromiso({ cliente, acreedores, compromisos, puede, cargando, onCreado }: {
  /** Quién va a transferir. Sin chat abierto no hay a quién pedirle, y la pestaña dice eso en vez de mostrar esto. */
  cliente: QuienPaga
  acreedores: Acreedor[]
  compromisos: Compromiso[]
  puede: PuedeCompromisos
  cargando: boolean
  onCreado: (texto: string) => void
}) {
  const [elegido, setElegido] = useState<string | null>(null)
  const [monto, setMonto] = useState('')
  /** Sólo para el que no está en Gestión Nube: ahí el nombre se escribe, no se sabe. */
  const [nombre, setNombre] = useState(cliente.tipo === 'sin-cargar' ? cliente.nombre : '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const comprometidoAcreedor = useMemo(() => comprometidoPorAcreedor(compromisos), [compromisos])
  // La misma cuenta con la llave que haya: el id de GN si existe, el teléfono del chat si no.
  const yaLePedimos = cliente.tipo === 'erp'
    ? comprometidoPorCliente(compromisos).get(String(cliente.id)) ?? 0
    : comprometidoPorTelefono(compromisos).get(cliente.telefono) ?? 0
  const susCompromisos = compromisos.filter(
    (c) => estaAbierto(c) && (cliente.tipo === 'erp'
      ? c.cliente_id === String(cliente.id)
      : !c.cliente_id && c.cliente_telefono === cliente.telefono),
  )
  const nombreFinal = cliente.tipo === 'erp' ? cliente.nombre : nombre.trim()

  // Sólo los que tienen deuda a la que imputar: comprometerle a uno saldado rebota en la puerta.
  const conDeuda = acreedores
    .map((a) => ({ a, puedePedirse: sePuedeComprometer(a.disponible, comprometidoAcreedor.get(a.id) ?? 0) }))
    .filter((x) => x.puedePedirse > 0)

  const sel = conDeuda.find((x) => x.a.id === elegido) ?? null
  const cuenta = sel?.a.cuentas.find((c) => c.sugerida) ?? sel?.a.cuentas[0] ?? null
  const n = Number(String(monto).replace(/\./g, '').replace(',', '.'))
  const sePasa = !!sel && Number.isFinite(n) && n > sel.puedePedirse + 0.005
  const puedeGuardar = !!sel && Number.isFinite(n) && n > 0 && !sePasa && !guardando && !!nombreFinal

  if (!puede.prometer) {
    return (
      <div style={{ fontSize: font.sm, color: color.mut2 }}>
        Tu usuario puede ver los compromisos pero no crearlos. Se activa en Usuarios.
      </div>
    )
  }

  return (
    <>
      {cliente.tipo === 'erp' ? (
        <div style={{ fontSize: font.sm, color: color.mut2, marginBottom: 8 }}>
          Que <b style={{ color: color.ink }}>{cliente.nombre || `#${cliente.id}`}</b> le transfiera a
          un acreedor nuestro. Con una transferencia se cancelan dos deudas.
        </div>
      ) : (
        <>
          <div style={{ fontSize: font.sm, color: color.mut2, marginBottom: 6 }}>
            Este número todavía no está en el sistema. Se puede anotar el cobro igual: queda con el
            nombre que pongas y con este teléfono, y cuando lo cargues en Gestión Nube se engancha
            solo desde acá.
          </div>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="¿Cómo se llama?"
            aria-label="¿Cómo se llama?"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '7px 9px', fontSize: font.sm,
              marginBottom: 8, border: `1px solid ${color.line}`, borderRadius: radius.md,
              background: color.bg, color: color.ink,
            }}
          />
        </>
      )}

      {yaLePedimos > 0 && (
        <div style={{ fontSize: font.sm, color: color.mut2, marginBottom: 8 }}>
          Ya le pedimos <b style={{ color: color.ink }}>{plata(yaLePedimos)}</b> en{' '}
          {susCompromisos.length === 1 ? 'una transferencia' : `${susCompromisos.length} transferencias`} que
          todavía no entraron.
        </div>
      )}

      {cargando ? (
        <div style={{ fontSize: font.sm, color: color.mut2 }}>Buscando a quién le debemos…</div>
      ) : conDeuda.length === 0 ? (
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
                onClick={() => { setElegido(a.id === elegido ? null : a.id); setError(null) }}
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
                        // 🔑 Sin id cuando todavía no está en Gestión Nube: el compromiso se guarda
                        // igual y queda esperando el vínculo, que lo da el teléfono.
                        cliente_id: cliente.tipo === 'erp' ? String(cliente.id) : null,
                        cliente_nombre: nombreFinal,
                        cliente_telefono: cliente.telefono || null,
                        monto: n,
                      })
                      setMonto(''); setElegido(null)
                      onCreado(`Listo: quedó el compromiso de ${plata(n)} a ${sel.a.nombre}.`)
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
                    } finally {
                      setGuardando(false)
                    }
                  }}
                >
                  {guardando ? 'Guardando…' : 'Crear el compromiso'}
                </Button>
              </div>

              {!nombreFinal && (
                <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 6 }}>
                  Poné un nombre arriba: es con lo que la vas a reconocer en la lista.
                </div>
              )}

              {sePasa && (
                <div style={{ fontSize: font.xs, color: color.dangerInk, marginTop: 6 }}>
                  Es más de lo que se le debe a {sel.a.nombre} sin comprometer. Si va a mandar más, el
                  resto va como otro compromiso a otro acreedor.
                </div>
              )}
            </>
          )}
        </>
      )}

      {error && <div style={{ fontSize: font.xs, color: color.dangerInk, marginTop: 6 }}>{error}</div>}
    </>
  )
}
