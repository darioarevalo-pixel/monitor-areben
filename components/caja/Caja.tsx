'use client'

/**
 * Caja (key `caja`, área Local, Zattia y BDI): el INFORMATIVO DEL TURNO (fase C, Bruno 5-oct).
 * 🔑 V4 (12-oct): la marca es la del shell; cada una con su caja, su configuración y sus formas de pago.
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
import { nombreParaTicket } from '@/lib/caja/core.core.js'
import { leerConfig, leerPendientes, leerTurno, type Config, type Turno, type Venta } from '@/lib/caja/cliente'
import { Button, ButtonLink, Notice, color, font, space, weight } from '@/components/ui'
import { DeteccionTransferencias, LogoDelTicket, Pendientes, PoliticaCambio, ProductosFeria, TransferenciasEnEspera, TurnoCaja, UltimosTurnos, VentasDelTurno, diaAr } from '@/components/caja/partes'
import { VistaTicket } from '@/components/caja/VistaTicket'
import { PromosCaja } from '@/components/caja/PromosCaja'
import { PromosFormaDePago } from '@/components/caja/PromosFormaDePago'
import { GiftCards } from '@/components/caja/GiftCards'
import { FormasDePago } from '@/components/caja/FormasDePago'
import { MARCA_CAJA, marcaParaPOS, usarMarcaCaja } from '@/lib/caja/marca'
import { ModalVarianteContext } from '@/components/ui/Modal'

export function Caja() {
  const { marca } = useSesion()
  // La marca de la Caja ANTES de pedir nada (`cliente.ts` la lee en cada pedido). `key`: otra marca = otra caja.
  const store = marcaParaPOS(null, marca)
  usarMarcaCaja(store)
  return <CajaDeMarca key={store} store={store} />
}

function CajaDeMarca({ store }: { store: string }) {
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

  // Ventas del turno, venta por venta (Bruno, 11-oct): el abierto (sin id) o uno de «Últimos turnos».
  const [verVentas, setVerVentas] = useState<{ turnoId?: string; titulo: string } | null>(null)

  if (errCarga) return <Notice tone="danger">{errCarga}</Notice>
  const esMio = !!turno && puedeUsarPOS(turno, perfil)
  const otras = pendientes.filter((v) => v.estado !== 'esperando_pago')
  const esperando = pendientes.length - otras.length
  const abrirPOS = esMio ? (
    <ButtonLink href={`/pos?marca=${store}`} variant="solid" tone="brand">
      Abrir POS
    </ButtonLink>
  ) : null
  const antes = turno ? (
    <>
      {abrirPOS}
      <Button variant="outline" onClick={() => setVerVentas({ titulo: 'Ventas de la caja abierta' })}>
        Ventas
      </Button>
    </>
  ) : abrirPOS

  // Los diálogos del turno con el aspecto del POS (X, pie gris), igual que en `/pos`.
  return (
    <ModalVarianteContext.Provider value="pos">
    <div className={admin && config ? 'caja-grilla con-ticket' : 'caja-grilla'} style={{ display: 'grid', gap: space[4], maxWidth: 1240, alignItems: 'start' }}>
      {/* Una columna debajo de 1100 px; arriba, la vista previa del ticket a la derecha (sólo admin). */}
      <style>{`@media (min-width: 1100px) { .caja-grilla.con-ticket { grid-template-columns: minmax(0, 1fr) 320px; } .caja-ticket { position: sticky; top: 0; } }`}</style>
      <div style={{ display: 'grid', gap: space[3], minWidth: 0 }}>
        {errTurno && <Notice tone="danger">No se pudo leer la caja: {errTurno}</Notice>}
        {turno && !esMio && <Notice tone="neutral">Caja de {turno.abierto_por ?? 'otra cuenta'}: POS sólo para esa cuenta.</Notice>}
        {otras.length > 0 && <Pendientes ventas={otras} admin={admin} esMio={esMio} onCambio={() => { refrescarPendientes(); refrescarTurno() }} />}
        {/* B3: el admin confirma a mano la que el cruce ⛔ ve; el resto, sólo el aviso. */}
        {admin ? (
          <TransferenciasEnEspera ventas={pendientes.filter((v) => v.estado === 'esperando_pago')} onCambio={() => { refrescarPendientes(); refrescarTurno() }} />
        ) : (
          esperando > 0 && <Notice tone="warning">Transferencias en espera: {esperando}. Se siguen en el POS (ticket al llegar).</Notice>
        )}
        {turno !== undefined && (
          <TurnoCaja
            turno={turno}
            billetes={billetesDe(config?.reglas)}
            reglas={config?.reglas ?? null}
            esMio={esMio}
            admin={admin}
            antes={antes}
            onCambio={(t) => (t === undefined ? refrescarTurno() : setTurno(t))}
            onCerrado={refrescarTurno}
          />
        )}
        <DeteccionTransferencias admin={admin} reglas={config?.reglas ?? null} onGuardadas={(rg, v) => config && setConfig({ ...config, reglas: rg, versiones: v ?? config.versiones })} />
        {config?.reglas.medios && <PromosCaja reglas={config.reglas} admin={admin} version={config.versiones?.promos} onGuardadas={(rg, v) => setConfig({ ...config, reglas: rg, versiones: v ?? config.versiones })} />}
        {config?.reglas.medios && <PromosFormaDePago reglas={config.reglas} />}
        {admin && config?.reglas.medios && <ProductosFeria reglas={config.reglas} version={config.versiones?.feriaProductos} campanias={config.campaniasLiq ?? []} onGuardadas={(rg, v) => setConfig({ ...config, reglas: rg, versiones: v ?? config.versiones })} />}
        {admin && config?.reglas.medios && <FormasDePago reglas={config.reglas} onGuardadas={(rg, v) => setConfig({ ...config, reglas: rg, versiones: v ?? config.versiones })} />}
        {admin && config && <LogoDelTicket marca={store} nombre={MARCA_CAJA.nombre} tienda={config.marca?.tienda ?? null} inicial={config.ticket_logo ?? null} onGuardado={(l) => setConfig({ ...config, ...l })} />}
        {/* Stunned es una línea de Zattia (SKU `STU…`): su logo sólo en la Caja de Zattia. */}
        {admin && config && store === 'zattia' && <LogoDelTicket marca="stunned" nombre="Stunned" inicial={config.ticket_logo_stunned ?? null} onGuardado={(l) => setConfig({ ...config, ...l })} />}
        {admin && <GiftCards />}
        {admin && config && <PoliticaCambio inicial={config.politica_cambio} onGuardada={(t) => setConfig({ ...config, politica_cambio: t })} />}
        <UltimosTurnos ultimos={ultimosTurnos} onVerVentas={(t) => setVerVentas({ turnoId: t.id, titulo: `Ventas de la caja del ${diaAr(t.abierto_en)}${t.abierto_por ? ` · ${t.abierto_por}` : ''}` })} />
        {verVentas && <VentasDelTurno turnoId={verVentas.turnoId} titulo={verVentas.titulo} nombreCuenta={(id) => nombreParaTicket(id, config?.reglas ?? null)} onCerrar={() => setVerVentas(null)} />}
      </div>
      {admin && config && (
        <aside className="caja-ticket" style={{ display: 'grid', gap: space[2] + 2 }}>
          <h3 style={{ margin: 0, fontSize: font.base, color: color.mut, fontWeight: weight.semibold }}>Así sale el ticket (80 mm)</h3>
          <VistaTicket logo={config.ticket_logo ?? null} politica={config.politica_cambio} />
        </aside>
      )}
    </div>
    </ModalVarianteContext.Provider>
  )
}
