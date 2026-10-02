'use client'

/**
 * La cuenta de Mercado Pago en la que cobra el local, y cómo cambiarla. Sólo para admin: el
 * servidor rechaza cualquier cambio de quien no lo es (`api/_pagos-recibidos.js`).
 *
 * 🔑 Cargar una llave es en dos pasos —verificar y después guardar— para que se vea **de quién es
 * la cuenta** antes de ponerla en uso. Pegar la llave de otra cuenta por error dejaría al local
 * mirando pagos que no son suyos, y la pantalla no lo notaría.
 */

import { useState } from 'react'
import { Badge, Button, Field, Input, Modal, Notice, SectionCard, color, font, space, useConfirmar, useToast } from '@/components/ui'
import type { Marca } from '@/lib/nav.datos'
import { cargarLlave, usarCuenta, verificarLlave, type Cuenta } from '@/lib/pagos-recibidos/cliente'

const fecha = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(iso))

export function CuentaDeCobro({ marca, cuentas, onCambio }: { marca: Marca; cuentas: Cuenta[]; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [llave, setLlave] = useState('')
  const [verificada, setVerificada] = useState<{ cuenta_id: number; nombre: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirmar } = useConfirmar()
  const toast = useToast()

  const enUso = cuentas.find((c) => c.enUso) || null
  const otras = cuentas.filter((c) => !c.enUso)

  function cerrar() {
    setAbierto(false)
    setLlave('')
    setVerificada(null)
    setError(null)
  }

  async function verificar() {
    setOcupado(true)
    setError(null)
    try {
      setVerificada(await verificarLlave(marca, llave))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo verificar la llave.')
    } finally {
      setOcupado(false)
    }
  }

  async function guardar() {
    setOcupado(true)
    setError(null)
    try {
      await cargarLlave(marca, llave)
      toast.ok(`Desde ahora se cobra en ${verificada?.nombre}.`)
      cerrar()
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la cuenta.')
    } finally {
      setOcupado(false)
    }
  }

  async function usar(c: Cuenta) {
    const ok = await confirmar({
      titulo: `¿Cobrar en ${c.nombre} desde ahora?`,
      mensaje: 'La pantalla del local va a mostrar los pagos que entren a esta cuenta. Los días anteriores se siguen buscando en la cuenta que se usaba cada día.',
      ok: 'Usar esta cuenta',
    })
    if (!ok) return
    try {
      await usarCuenta(marca, c.cuenta_id)
      toast.ok(`Desde ahora se cobra en ${c.nombre}.`)
      cerrar()
      onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar la cuenta.')
    }
  }

  return (
    <>
      <SectionCard
        title="Cuenta de cobro"
        subtitle={
          enUso
            ? `${enUso.nombre}${enUso.ultimaVez ? ` · en uso desde el ${fecha(enUso.ultimaVez)}` : ''}`
            : 'Todavía no se cargó ninguna cuenta de Mercado Pago para este local.'
        }
        actions={
          <Button size="sm" variant={enUso ? 'outline' : undefined} onClick={() => setAbierto(true)}>
            {enUso ? 'Cambiar cuenta' : 'Cargar cuenta'}
          </Button>
        }
      >
        <div style={{ fontSize: font.sm, color: color.mut }}>Sólo lo ven los admin. Las empleadas ven los pagos, no la cuenta.</div>
      </SectionCard>

      <Modal
        abierto={abierto}
        onCerrar={cerrar}
        cerrarConFondo={false}
        titulo={enUso ? 'Cambiar la cuenta de cobro' : 'Cargar la cuenta de cobro'}
        pie={
          <>
            <Button variant="outline" onClick={cerrar}>
              Cancelar
            </Button>
            {verificada ? (
              <Button onClick={guardar} loading={ocupado}>
                Guardar y usar desde ahora
              </Button>
            ) : (
              <Button onClick={verificar} loading={ocupado} disabled={!llave.trim()}>
                Verificar
              </Button>
            )}
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
          {otras.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
              <div style={{ fontWeight: 600 }}>Volver a una cuenta ya cargada</div>
              {otras.map((c) => (
                <div key={c.cuenta_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
                  <span>
                    {c.nombre}
                    {c.ultimaVez && <span style={{ color: color.mut }}> · usada por última vez el {fecha(c.ultimaVez)}</span>}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => usar(c)}>
                    Usar esta
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            <div style={{ fontWeight: 600 }}>{otras.length ? 'O cargar una cuenta nueva' : 'Cargar una cuenta'}</div>
            <Field
              label="Llave de la cuenta (Access Token)"
              hint="En developers.mercadopago.com, con la cuenta del local: Tus integraciones → la aplicación → Credenciales de producción. Empieza con APP_USR-."
            >
              <Input
                value={llave}
                onChange={(e) => {
                  setLlave(e.target.value)
                  setVerificada(null)
                }}
                placeholder="APP_USR-…"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            {verificada && (
              <Notice tone="success">
                Esta llave es de la cuenta <strong>{verificada.nombre}</strong>. Si es la correcta, guardala.
                {enUso && enUso.cuenta_id === verificada.cuenta_id && (
                  <>
                    {' '}
                    <Badge tone="neutral">Es la que ya está en uso</Badge>
                  </>
                )}
              </Notice>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
          </div>
        </div>
      </Modal>
    </>
  )
}
