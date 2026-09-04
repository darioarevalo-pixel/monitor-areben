'use client'

/**
 * Los compromisos de pago de un acreedor, adentro de su tarjeta.
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
import { Badge, Button, Field, Input, Modal, Notice, formatMoney, space } from '@/components/ui'
import {
  cambiarEstado, confirmarCompromiso, crearCompromiso,
  type PuedeCompromisos,
} from '@/lib/compromisos/cliente'
import { estaAbierto, comprometidoPorAcreedor, sePuedeComprometer, type Compromiso } from '@/lib/compromisos/core'
import type { Acreedor } from '@/lib/acreedores/cliente'

const TONO = {
  prometido: 'warning',
  transferido: 'brand',
  confirmado: 'success',
  cancelado: 'neutral',
} as const

const ROTULO = {
  prometido: 'se lo pedimos',
  transferido: 'dice que ya transfirió',
  confirmado: 'entró',
  cancelado: 'se cayó',
} as const

export function Compromisos({ acreedor, compromisos, puede, onCambio }: {
  acreedor: Acreedor
  /** Todas los compromisos; acá se filtran las de este acreedor. */
  compromisos: Compromiso[]
  puede: PuedeCompromisos
  onCambio: () => void
}) {
  const [abriendo, setAbriendo] = useState(false)
  const [confirmando, setConfirmando] = useState<Compromiso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const mios = useMemo(
    () => compromisos.filter((c) => c.acreedor_id === acreedor.id),
    [compromisos, acreedor.id],
  )
  const abiertos = mios.filter(estaAbierto)
  const yaComprometido = comprometidoPorAcreedor(mios).get(acreedor.id) ?? 0
  const sePuede = sePuedeComprometer(acreedor.disponible, yaComprometido)

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
        <b style={{ fontSize: 13 }}>Compromisos de pago</b>
        {yaComprometido > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>
            hay {formatMoney(yaComprometido)} comprometidos y sin entrar ·{' '}
            <b>se le puede pedir {formatMoney(sePuede)} más</b>
          </span>
        )}
        {puede.prometer && sePuede > 0 && (
          <Button size="sm" variant="soft" onClick={() => setAbriendo(true)}>
            Crear un compromiso
          </Button>
        )}
      </div>

      {/* Cuando ya no se le puede pedir más, se dice por qué en vez de esconder el botón sin
          explicación: "no está el botón" se lee como un error del sistema. */}
      {puede.prometer && sePuede <= 0 && acreedor.disponible > 0 && (
        <p className="muted" style={{ fontSize: 12 }}>
          Ya está comprometido todo lo que se le debe ({formatMoney(yaComprometido)}). Para pedirle a otro
          cliente, primero confirmá o cancelá alguna de los compromisos de abajo.
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
              {c.titular_real && c.titular_real !== c.cliente_nombre && (
                <span className="muted">(transfiere {c.titular_real})</span>
              )}
              {c.viene_de && <span className="muted">· resto de una anterior</span>}

              {estaAbierto(c) && puede.confirmar && (
                <Button size="sm" onClick={() => setConfirmando(c)}>Ya entró</Button>
              )}
              {c.estado === 'prometido' && puede.prometer && (
                <Button size="sm" variant="soft" onClick={() => correr(async () => { await cambiarEstado(c.id, 'transferido') })}>
                  Dice que transfirió
                </Button>
              )}
              {estaAbierto(c) && puede.prometer && (
                <Button size="sm" variant="ghost" onClick={() => correr(async () => { await cambiarEstado(c.id, 'cancelado') })}>
                  Se cayó
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <Notice tone="danger"><span>{error}</span></Notice>}
      {aviso && <Notice tone="success"><span>{aviso}</span></Notice>}

      <Modal abierto={abriendo} onCerrar={() => setAbriendo(false)} titulo={`Nuevo compromiso a ${acreedor.nombre}`}>
        <FormCompromiso
          acreedor={acreedor}
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

      <Modal abierto={!!confirmando} onCerrar={() => setConfirmando(null)} titulo="¿Cuánta plata entró?">
        {confirmando && (
          <FormConfirmar
            compromiso={confirmando}
            onConfirmar={async (monto, fecha, titular) => {
              await correr(async () => {
                const r = await confirmarCompromiso(confirmando.id, monto, fecha, titular)
                setConfirmando(null)
                setAviso(
                  r.nueva
                    ? `Listo: se registraron ${formatMoney(monto)} en el dashboard. Como entró menos de lo comprometido, quedó un compromiso nuevo por ${formatMoney(Number(r.nueva.monto))}.`
                    : `Listo: se registraron ${formatMoney(monto)} en el dashboard.`,
                )
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

function FormCompromiso({ acreedor, maximo, onGuardar, onCancelar }: {
  acreedor: Acreedor
  maximo: number
  onGuardar: (d: Parameters<typeof crearCompromiso>[0]) => Promise<void>
  onCancelar: () => void
}) {
  const sugerida = acreedor.cuentas.find((c) => c.sugerida) ?? acreedor.cuentas[0] ?? null
  const [cliente, setCliente] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  const nMonto = Number(String(monto).replace(/\./g, '').replace(',', '.'))
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
            Este acreedor no tiene ninguna cuenta cargada, así que el compromiso va a quedar sin decir a
            dónde transferir. Cargala en el dashboard, en Finanzas → Acreedores.
          </span>
        </Notice>
      )}

      <Field label="¿Qué cliente va a transferir?">
        <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ej: Nazarena Luciani" autoFocus />
      </Field>
      <Field label="Número de cliente en Gestión Nube (opcional)">
        <Input value={clienteId} onChange={(e) => setClienteId(e.target.value)} placeholder="para poder cruzarlo con su deuda" />
      </Field>
      <Field label="¿Cuánto va a transferir?" hint={`Como mucho ${formatMoney(maximo)}, que es lo que se le debe y todavía no está comprometido.`}>
        <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0" />
      </Field>
      <Field label="¿Para cuándo lo se comprometió? (opcional)">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Field>
      <Field label="Nota (opcional)">
        <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: lo arreglamos por WhatsApp el martes" />
      </Field>

      {sePasa && (
        <Notice tone="danger">
          <span>
            Es más de lo que se le debe sin comprometer ({formatMoney(maximo)}). Si el cliente va a
            mandar más, creá el resto como un compromiso a otro acreedor: así no se le manda de más a
            éste.
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
                acreedor_id: acreedor.id,
                acreedor_nombre: acreedor.nombre,
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
  onConfirmar: (monto: number, fecha: string, titular: string | null) => Promise<void>
  onCancelar: () => void
}) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [monto, setMonto] = useState(String(compromiso.monto))
  const [fecha, setFecha] = useState(hoy)
  const [otro, setOtro] = useState(!!compromiso.titular_real && compromiso.titular_real !== compromiso.cliente_nombre)
  const [titular, setTitular] = useState(compromiso.titular_real || '')
  const [yendo, setYendo] = useState(false)

  const n = Number(String(monto).replace(/\./g, '').replace(',', '.'))
  const falta = Math.max(0, Math.round((Number(compromiso.monto) - n) * 100) / 100)

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <p className="muted" style={{ fontSize: 12 }}>
        Esto <b>escribe el pago en el dashboard</b>: baja la deuda con {compromiso.acreedor_nombre} y
        queda anotado como plata de {compromiso.cliente_nombre}.
      </p>

      <Field label="¿Cuánto entró de verdad?" hint={`Se había comprometido ${formatMoney(Number(compromiso.monto))}.`}>
        <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" autoFocus />
      </Field>
      <Field label="¿Qué día transfirió?" hint="No es hoy necesariamente: el cierre de mes usa esta fecha.">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Field>

      {/*
        🔑 A nombre de quién vino se pregunta ACÁ y no al prometer: el compromiso es del cliente, pero
        la plata la manda muy seguido otro, y en la charla eso es una adivinanza. Mirando el
        extracto se lee. El default es el cliente, así que el caso normal no obliga a escribir nada.
      */}
      {otro ? (
        <Field label="¿A nombre de quién vino la transferencia?" hint="Es lo que muestra el extracto del banco.">
          <Input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Ej: Luciani SRL" autoFocus />
          <Button variant="ghost" size="sm" style={{ marginTop: 4 }} onClick={() => { setOtro(false); setTitular('') }}>
            No, transfirió {compromiso.cliente_nombre}
          </Button>
        </Field>
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>
          Va a quedar como que transfirió <b>{compromiso.cliente_nombre}</b>.{' '}
          <Button variant="ghost" size="sm" onClick={() => setOtro(true)}>Vino a nombre de otro</Button>
        </p>
      )}

      {falta > 0 && (
        <Notice tone="brand">
          <span>
            Entró {formatMoney(falta)} menos de lo comprometido. Este compromiso se va a cerrar por lo que
            entró, y se va a crear una nueva por {formatMoney(falta)} para poder seguir reclamándolo.
          </span>
        </Notice>
      )}

      <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button
          disabled={!Number.isFinite(n) || n <= 0 || (otro && !titular.trim()) || yendo}
          onClick={async () => { setYendo(true); try { await onConfirmar(n, fecha, otro ? titular.trim() : null) } finally { setYendo(false) } }}
        >
          {yendo ? 'Registrando…' : 'Sí, entró'}
        </Button>
      </div>
    </div>
  )
}
