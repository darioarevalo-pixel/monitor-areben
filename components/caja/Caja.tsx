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
import { esAdmin } from '@/lib/permisos'
import { billetesDe } from '@/lib/caja/conteo.core.js'
import { puedeUsarPOS } from '@/lib/caja/cierre.core.js'
import { leerConfig, leerPendientes, leerTurno, type Config, type Turno, type Venta } from '@/lib/caja/cliente'
import { ButtonLink, Notice, color, font, space, weight } from '@/components/ui'
import { Bajadas, DeteccionTransferencias, LogoDelTicket, Pendientes, PoliticaCambio, ProductosFeria, TurnoCaja, UltimosTurnos } from '@/components/caja/partes'
import { VistaTicket } from '@/components/caja/VistaTicket'
import { PromosCaja } from '@/components/caja/PromosCaja'

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
  const abrirPOS = esMio ? (
    <ButtonLink href="/pos" variant="solid" tone="brand">
      Abrir POS
    </ButtonLink>
  ) : null

  return (
    <div className={admin && config ? 'caja-grilla con-ticket' : 'caja-grilla'} style={{ display: 'grid', gap: space[4], maxWidth: 1240, alignItems: 'start' }}>
      {/* Una columna debajo de 1100 px; arriba, la vista previa del ticket a la derecha (sólo admin). */}
      <style>{`@media (min-width: 1100px) { .caja-grilla.con-ticket { grid-template-columns: minmax(0, 1fr) 320px; } .caja-ticket { position: sticky; top: 0; } }`}</style>
      <div style={{ display: 'grid', gap: space[3], minWidth: 0 }}>
        {errTurno && <Notice tone="danger">No se pudo leer el turno: {errTurno}</Notice>}
        {turno && !esMio && <Notice tone="neutral">Turno de {turno.abierto_por ?? 'otra cuenta'}: POS sólo para esa cuenta.</Notice>}
        {otras.length > 0 && <Pendientes ventas={otras} onCambio={refrescarPendientes} />}
        {esperando > 0 && <Notice tone="warning">Transferencias en espera: {esperando}. Se siguen en el POS (ticket al llegar).</Notice>}
        {turno !== undefined && (
          <TurnoCaja
            turno={turno}
            billetes={billetesDe(config?.reglas)}
            esMio={esMio}
            antes={abrirPOS}
            onCambio={(t) => (t === undefined ? refrescarTurno() : setTurno(t))}
            onCerrado={refrescarTurno}
          />
        )}
        {admin && config?.reglas.medios && <Bajadas reglas={config.reglas} onGuardadas={(rg) => setConfig({ ...config, reglas: rg })} />}
        <DeteccionTransferencias admin={admin} />
        {config?.reglas.medios && <PromosCaja reglas={config.reglas} admin={admin} onGuardadas={(rg) => setConfig({ ...config, reglas: rg })} />}
        {admin && config?.reglas.medios && <ProductosFeria reglas={config.reglas} onGuardadas={(rg) => setConfig({ ...config, reglas: rg })} />}
        {admin && config && <LogoDelTicket inicial={config.ticket_logo ?? null} onGuardado={(l) => setConfig({ ...config, ticket_logo: l })} />}
        {admin && config && <PoliticaCambio inicial={config.politica_cambio} onGuardada={(t) => setConfig({ ...config, politica_cambio: t })} />}
        <UltimosTurnos ultimos={ultimosTurnos} />
      </div>
      {admin && config && (
        <aside className="caja-ticket" style={{ display: 'grid', gap: space[2] + 2 }}>
          <h3 style={{ margin: 0, fontSize: font.base, color: color.mut, fontWeight: weight.semibold }}>Así sale el ticket (80 mm)</h3>
          <VistaTicket logo={config.ticket_logo ?? null} politica={config.politica_cambio} />
        </aside>
      )}
    </div>
  )
}
