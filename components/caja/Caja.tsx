'use client'

/**
 * Caja (key `caja`, área Local, sólo Zattia): el INFORMATIVO DEL TURNO (fase C, Bruno 5-oct).
 *
 * Acá se abre el turno (con la calculadora de billetes), se ve qué cobró por cuenta, los cobros de
 * GN, las salidas y los conteos, y se cierra. También la configuración del cobro y las ventas que
 * ⛔ llegaron a Gestión Nube.
 *
 * 🔑 **Se cobra en el POS (`/pos`, `CajaPOS.tsx`)**: una pantalla sin menú, con el formato del POS de
 * GN. Se entra con «Abrir POS», que ve sólo la cuenta que abrió la caja (`puedeUsarPOS`, la misma
 * regla que el servidor). 🔑 **La caja se cierra desde los dos lados**: desde acá cualquiera con
 * permiso de Caja; desde el POS, la cuenta que la abrió.
 */

import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import { esAdmin } from '@/lib/permisos'
import { billetesDe } from '@/lib/caja/conteo.core.js'
import { puedeUsarPOS } from '@/lib/caja/cierre.core.js'
import { leerConfig, leerPendientes, leerTurno, type Config, type Turno, type Venta } from '@/lib/caja/cliente'
import { ButtonLink, Notice, space } from '@/components/ui'
import { Bajadas, DeteccionTransferencias, LogoDelTicket, Pendientes, PoliticaCambio, ProductosFeria, TurnoCaja } from '@/components/caja/partes'

export function Caja() {
  const { perfil } = useSesion()
  const admin = esAdmin(perfil)

  const [config, setConfig] = useState<Config | null>(null)
  const [errCarga, setErrCarga] = useState<string | null>(null)
  useEffect(() => {
    leerConfig()
      .then(setConfig)
      .catch((e) => setErrCarga(e.message))
  }, [])

  const [pendientes, setPendientes] = useState<Venta[]>([])
  const refrescarPendientes = useCallback(() => {
    leerPendientes()
      .then((r) => setPendientes(r.ventas))
      .catch(() => {})
  }, [])
  useEffect(() => {
    refrescarPendientes()
    const t = setInterval(refrescarPendientes, 60_000)
    return () => clearInterval(t)
  }, [refrescarPendientes])

  // `undefined` = todavía ⛔ se leyó; `null` = ⛔ hay turno abierto (⛔ se cobra).
  const [turno, setTurno] = useState<Turno | null | undefined>(undefined)
  const [ultimosTurnos, setUltimosTurnos] = useState<Turno[]>([])
  const [errTurno, setErrTurno] = useState<string | null>(null)
  const refrescarTurno = useCallback(() => {
    leerTurno()
      .then((r) => {
        setTurno(r.turno)
        setUltimosTurnos(r.ultimos)
        setErrTurno(null)
      })
      .catch((e) => setErrTurno((e as Error).message))
  }, [])
  useEffect(() => {
    refrescarTurno()
    // El POS cobra en otra pantalla: el resumen se refresca solo.
    const t = setInterval(refrescarTurno, 60_000)
    return () => clearInterval(t)
  }, [refrescarTurno])

  if (errCarga) return <Notice tone="danger">{errCarga}</Notice>
  const esMio = !!turno && puedeUsarPOS(turno, perfil)
  const otras = pendientes.filter((v) => v.estado !== 'esperando_pago')
  const esperando = pendientes.length - otras.length

  return (
    <div style={{ display: 'grid', gap: space[4], maxWidth: 1100 }}>
      {esMio && (
        <HeaderAcciones>
          <ButtonLink href="/pos" variant="solid" tone="brand">
            Abrir POS
          </ButtonLink>
        </HeaderAcciones>
      )}
      {errTurno && <Notice tone="danger">No se pudo leer el turno: {errTurno}</Notice>}
      <DeteccionTransferencias admin={admin} />
      {turno && !esMio && <Notice tone="neutral">Turno de {turno.abierto_por ?? 'otra cuenta'}: POS sólo para esa cuenta.</Notice>}
      {turno !== undefined && (
        <TurnoCaja
          turno={turno}
          ultimos={ultimosTurnos}
          billetes={billetesDe(config?.reglas)}
          esMio={esMio}
          onCambio={(t) => (t === undefined ? refrescarTurno() : setTurno(t))}
          onCerrado={refrescarTurno}
        />
      )}
      {esperando > 0 && (
        <Notice tone="warning">
          Transferencias en espera: {esperando}. Se siguen en el POS (ticket al llegar).
        </Notice>
      )}
      {otras.length > 0 && <Pendientes ventas={otras} onCambio={refrescarPendientes} />}
      {admin && config?.reglas.medios && <Bajadas reglas={config.reglas} onGuardadas={(rg) => setConfig({ ...config, reglas: rg })} />}
      {admin && config?.reglas.medios && <ProductosFeria reglas={config.reglas} onGuardadas={(rg) => setConfig({ ...config, reglas: rg })} />}
      {admin && config && <PoliticaCambio inicial={config.politica_cambio} onGuardada={(t) => setConfig({ ...config, politica_cambio: t })} />}
      {admin && config && <LogoDelTicket inicial={config.ticket_logo ?? null} onGuardado={(l) => setConfig({ ...config, ticket_logo: l })} />}
    </div>
  )
}
