'use client'

/**
 * Los compromisos de pago de un DESTINO, adentro de su tarjeta.
 *
 * El destino son las dos cosas a las que un cliente le puede transferir: un **acreedor** del
 * dashboard (el contador, el abogado) o una **cuenta manual** de acá (la cuota del crédito, las
 * bolsas). Este bloque es el mismo para los dos y no se duplicó a propósito —`lib/compromisos/
 * destino.ts` explica por qué—; lo que cambia es el techo, de dónde sale, y qué pasa al confirmar.
 *
 * # 🔑 El número que evita comprometer dos veces sobre la misma deuda
 *
 * El dashboard no sabe que hay plata comprometida: su saldo dice "se le debe X" aunque ya haya
 * X−Y camino a él. Por eso lo que se muestra para decidir NO es el saldo, es
 * **lo que se le puede imputar menos lo ya comprometido acá**. Sin esa resta, dos charlas con dos
 * clientes en el mismo día comprometen la misma deuda dos veces y una de las dos transferencias
 * termina siendo un saldo a favor que hay que imputar a mano.
 *
 * # Confirmar es lo único que mueve plata
 *
 * Anotar y mover de estado no tocan nada del dashboard. Confirmar escribe el pago de verdad, y por
 * eso tiene permiso propio: quien puede anotar no necesariamente puede confirmar.
 */

import { useMemo, useState } from 'react'
import { Badge, Button, Field, Input, Modal, Notice, space } from '@/components/ui'
import {
  cambiarEstado, confirmarCompromiso, crearCompromiso,
  type PuedeCompromisos,
} from '@/lib/compromisos/cliente'
import {
  estaAbierto, comprometidoPorAcreedor, sePuedeComprometer,
  // 🔑 El mismo par de siempre, no el formateador general del kit: acá los montos pueden tener
  // centavos (el resto de un cobro parcial) y `formatMoney` los corta, que es lo que escondía la
  // diferencia entre lo que la lista mostraba y lo que el casillero de confirmar tenía adentro.
  mostrar as formatMoney, paraEditar, parsearMonto, restanteTrasConfirmar,
  type Compromiso,
} from '@/lib/compromisos/core'
import type { DestinoCompromiso } from '@/lib/compromisos/destino'
import { hoyISO } from '@/lib/crm/seguimiento'

// 🔑 Tres estados a la vista: Pedido, Acreditado, Cancelado (Darío, 25-sep-2026). `transferido`
// sigue existiendo en la base; si queda alguno viejo, se muestra y se trata como Pedido.
const TONO = {
  prometido: 'warning',
  transferido: 'warning',
  confirmado: 'success',
  cancelado: 'neutral',
} as const

const ROTULO = {
  prometido: 'Pedido',
  transferido: 'Pedido',
  confirmado: 'Acreditado',
  cancelado: 'Cancelado',
} as const

export function Compromisos({ destino, compromisos, puede, onCambio }: {
  destino: DestinoCompromiso
  /** Todos los compromisos; acá se filtran los de este destino. */
  compromisos: Compromiso[]
  puede: PuedeCompromisos
  onCambio: () => void
}) {
  const esManual = destino.origen === 'manual'
  const [abriendo, setAbriendo] = useState(false)
  const [confirmando, setConfirmando] = useState<Compromiso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const mios = useMemo(
    () => compromisos.filter((c) => c.acreedor_id === destino.id),
    [compromisos, destino.id],
  )
  const abiertos = mios.filter(estaAbierto)
  const yaComprometido = comprometidoPorAcreedor(mios).get(destino.id) ?? 0
  const sePuede = sePuedeComprometer(destino.disponible, yaComprometido)

  async function correr(fn: () => Promise<void>) {
    setError(null)
    try {
      await fn()
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[2], marginTop: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13 }}>Compromisos</b>
        {yaComprometido > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>
            Pedido {formatMoney(yaComprometido)} · <b>Disponible {formatMoney(sePuede)}</b>
          </span>
        )}
        {puede.prometer && sePuede > 0 && (
          <Button size="sm" variant="soft" onClick={() => setAbriendo(true)}>
            Nuevo compromiso
          </Button>
        )}
      </div>

      {/* Cuando ya no se le puede pedir más, se dice por qué en vez de esconder el botón sin
          explicación: "no está el botón" se lee como un error del sistema. */}
      {puede.prometer && sePuede <= 0 && destino.disponible > 0 && (
        <p className="muted" style={{ fontSize: 12 }}>
          Ya está pedido todo {esManual ? 'lo que falta' : 'lo que se le debe'} ({formatMoney(yaComprometido)}).
          Para pedirle a otro cliente, primero confirmá o cancelá alguno de los compromisos de abajo.
        </p>
      )}

      {abiertos.length === 0 && mios.length === 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>Todavía no hay ningún compromiso.</p>
      ) : (
        <ul style={{ display: 'grid', gap: space[1], listStyle: 'none', padding: 0, margin: 0 }}>
          {mios.slice(0, 12).map((c) => (
            <li key={c.id} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <Badge tone={TONO[c.estado]}>{ROTULO[c.estado]}</Badge>
              <b>{formatMoney(c.estado === 'confirmado' ? Number(c.monto_confirmado ?? c.monto) : Number(c.monto))}</b>
              <span>{c.cliente_nombre}</span>
              {c.viene_de && <span className="muted">· resto de uno anterior</span>}

              {estaAbierto(c) && puede.confirmar && (
                <Button size="sm" onClick={() => setConfirmando(c)}>Confirmar</Button>
              )}
              {estaAbierto(c) && puede.prometer && (
                <Button size="sm" variant="ghost" onClick={() => correr(async () => { await cambiarEstado(c.id, 'cancelado') })}>
                  Cancelar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <Notice tone="danger"><span>{error}</span></Notice>}
      {aviso && <Notice tone="success"><span>{aviso}</span></Notice>}

      <Modal abierto={abriendo} onCerrar={() => setAbriendo(false)} titulo={`Nuevo compromiso a ${destino.nombre}`}>
        <FormCompromiso
          destino={destino}
          maximo={sePuede}
          onGuardar={async (datos) => {
            await correr(async () => {
              await crearCompromiso(datos)
              setAbriendo(false)
            })
          }}
          onCancelar={() => setAbriendo(false)}
        />
      </Modal>

      <Modal abierto={!!confirmando} onCerrar={() => setConfirmando(null)} titulo="Confirmar compromiso">
        {confirmando && (
          <FormConfirmar
            compromiso={confirmando}
            onConfirmar={async (monto, fecha) => {
              await correr(async () => {
                const r = await confirmarCompromiso(confirmando.id, monto, fecha)
                setConfirmando(null)
                // Lo primero es siempre qué pasó con la plata; lo demás se agrega sólo cuando hay
                // algo distinto que contar.
                const partes = [
                  esManual
                    ? `Listo: ${formatMoney(monto)} acreditados en ${destino.nombre}.`
                    : `Listo: ${formatMoney(monto)} acreditados y registrados en el dashboard.`,
                ]
                if (r.se_paso > 0) partes.push(`Entraron ${formatMoney(r.se_paso)} más de lo que faltaba: fijate en el banco.`)
                if (r.cuenta_completa) partes.push('Se completó el monto: la cuenta quedó pagada y en pausa.')
                if (r.nueva) partes.push(`Como entró menos de lo pedido, quedó un compromiso nuevo por ${formatMoney(Number(r.nueva.monto))}.`)
                setAviso(partes.join(' '))
              })
            }}
            onCancelar={() => setConfirmando(null)}
          />
        )}
      </Modal>
    </div>
  )
}

// ─── Anotar ───────────────────────────────────────────────────────────────────

function FormCompromiso({ destino, maximo, onGuardar, onCancelar }: {
  destino: DestinoCompromiso
  maximo: number
  onGuardar: (d: Parameters<typeof crearCompromiso>[0]) => Promise<void>
  onCancelar: () => void
}) {
  const esManual = destino.origen === 'manual'
  const sugerida = destino.cuentas.find((c) => c.sugerida) ?? destino.cuentas[0] ?? null
  const [cliente, setCliente] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  const nMonto = parsearMonto(monto)
  const sePasa = Number.isFinite(nMonto) && nMonto > maximo + 0.005
  const listo = cliente.trim().length > 0 && Number.isFinite(nMonto) && nMonto > 0 && !sePasa

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      {sugerida ? (
        <p className="muted" style={{ fontSize: 12 }}>
          Le va a transferir a <b>{sugerida.alias || sugerida.banco || 'la cuenta cargada'}</b>
          {sugerida.titular ? `, a nombre de ${sugerida.titular}` : ''}. Esa cuenta queda guardada en
          el compromiso: si mañana cambia el CBU, ésta va a seguir diciendo a dónde se mandó.
        </p>
      ) : (
        <Notice tone="warning">
          <span>
            {esManual
              ? `${destino.nombre} no tiene alias ni CBU, así que el compromiso va a quedar sin decir a dónde transferir. Se edita en la ficha de la cuenta, acá mismo.`
              : 'Este acreedor no tiene ninguna cuenta cargada, así que el compromiso va a quedar sin decir a dónde transferir. Cargala en el dashboard, en Finanzas → Acreedores.'}
          </span>
        </Notice>
      )}

      <Field label="Cliente">
        <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ej: Nazarena Luciani" autoFocus />
      </Field>
      <Field label="Número de cliente en Gestión Nube (opcional)">
        <Input value={clienteId} onChange={(e) => setClienteId(e.target.value)} placeholder="para poder cruzarlo con su deuda" />
      </Field>
      <Field
        label="Monto"
        hint={`Disponible: ${formatMoney(maximo)}.`}
      >
        <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0" />
      </Field>
      <Field label="Fecha comprometida (opcional)">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Field>
      <Field label="Nota (opcional)">
        <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: lo arreglamos por WhatsApp el martes" />
      </Field>

      {sePasa && (
        <Notice tone="danger">
          <span>
            Es más de lo disponible ({formatMoney(maximo)}). Si el
            cliente va a mandar más, creá el resto como un compromiso a otro destino: así acá no
            entra de más.
          </span>
        </Notice>
      )}

      <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button
          disabled={!listo || guardando}
          onClick={async () => {
            setGuardando(true)
            try {
              await onGuardar({
                origen: destino.origen,
                objetivo_id: destino.objetivoId,
                acreedor_id: destino.id,
                acreedor_nombre: destino.nombre,
                cuenta_alias: sugerida?.alias ?? null,
                cuenta_cbu: sugerida?.cbu ?? null,
                cuenta_banco: sugerida?.banco ?? null,
                cuenta_titular: sugerida?.titular ?? null,
                cliente_nombre: cliente.trim(),
                cliente_id: clienteId.trim() || null,
                monto: nMonto,
                fecha_prometida: fecha || null,
                notas: notas.trim() || null,
              })
            } finally {
              setGuardando(false)
            }
          }}
        >
          Crear el compromiso
        </Button>
      </div>
    </div>
  )
}

// ─── Confirmar ────────────────────────────────────────────────────────────────

function FormConfirmar({ compromiso, onConfirmar, onCancelar }: {
  compromiso: Compromiso
  onConfirmar: (monto: number, fecha: string) => Promise<void>
  onCancelar: () => void
}) {
  /**
   * 🔴 **El día LOCAL, no el de UTC.** Estaba con `toISOString()`, que a partir de las 21:00 de
   * Argentina ya devuelve el día siguiente: el formulario proponía MAÑANA como fecha de la
   * transferencia. Y no es cosmético — el cartel de abajo lo dice: **el cierre de mes imputa por
   * esta fecha**, así que un pago confirmado el 30 a la noche caía en el mes siguiente.
   *
   * El panel usa `hoyISO()` desde siempre; era esta copia la que estaba sola. Es el mismo defecto
   * que tenían dos tests de la pestaña, que se caían en la Mac y pasaban en el CI.
   */
  const hoy = hoyISO()
  // ⛔ `paraEditar` y no `String(...)`: ver el bloque de `plata.core.js`. Es el mismo casillero que
  // en el panel, y tenía el mismo bug.
  const [monto, setMonto] = useState(paraEditar(compromiso.monto))
  const [fecha, setFecha] = useState(hoy)
  const [yendo, setYendo] = useState(false)

  const n = parsearMonto(monto)
  const falta = restanteTrasConfirmar(Number(compromiso.monto), n)

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <p className="muted" style={{ fontSize: 12 }}>
        {compromiso.origen === 'manual' ? (
          <>
            Esto <b>no toca el dashboard</b>: queda anotado acá como plata que puso{' '}
            {compromiso.cliente_nombre} para {compromiso.acreedor_nombre}. El pago en sí se carga en el
            dashboard como siempre.
          </>
        ) : (
          <>
            Esto <b>escribe el pago en el dashboard</b>: baja la deuda con {compromiso.acreedor_nombre} y
            queda anotado como plata de {compromiso.cliente_nombre}.
          </>
        )}
      </p>

      <Field label="Monto acreditado" hint={`Pedido: ${formatMoney(Number(compromiso.monto))}.`}>
        <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" autoFocus />
      </Field>
      <Field label="Fecha de la transferencia" hint="No es hoy necesariamente: el cierre de mes usa esta fecha.">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Field>

      {/*
        ⛔ **"A nombre de quién vino" se sacó el 21-sep-2026, y lo pidió el mismo que lo había
        pedido.** Medido antes de sacarlo: **0 de 9 confirmaciones** lo llenaron en 18 días de uso
        real. El motivo que dio Darío es el que importa — el comprobante lo mira en el chat del
        cliente, así que el nombre del extracto no le resuelve nada y sí es una pregunta más en
        cada confirmación. La columna sigue en la base, vacía: volver atrás es dibujarlo de nuevo.
      */}
      {falta > 0 && (
        <Notice tone="brand">
          <span>
            Entró {formatMoney(falta)} menos de lo pedido. Este compromiso se acredita por lo que entró
            y queda uno nuevo por {formatMoney(falta)}.
          </span>
        </Notice>
      )}

      <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button
          disabled={!Number.isFinite(n) || n <= 0 || yendo}
          onClick={async () => { setYendo(true); try { await onConfirmar(n, fecha) } finally { setYendo(false) } }}
        >
          {yendo ? 'Registrando…' : 'Confirmar'}
        </Button>
      </div>
    </div>
  )
}
