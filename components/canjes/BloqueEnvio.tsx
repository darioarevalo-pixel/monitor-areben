'use client'

/**
 * La compra y el envío.
 *
 * ⚠️ **El monitor no crea la orden en Tienda Nube y no puede hacerlo**: no hay credenciales de TN
 * en este repo, todo lo de TN pasa por `bdi-catalogo`, que escribe categorías, visibilidad, stock
 * de variante e imágenes — **cero escritura de órdenes**. Por eso la orden con 100% de descuento
 * se crea A MANO en el admin, y acá sólo se registra el número y se *verifica* leyéndola.
 *
 * La pantalla lo dice como paso del checklist en vez de esconderlo: un botón que parece crear la
 * orden y no la crea es peor que no tenerlo.
 */

import { useState } from 'react'
import {
  Button, Field, Input, Notice, SectionCard, Select, StatusPill,
  color, font, space, weight, useToast, type Tone,
} from '@/components/ui'
import { numeroEM, etiquetaEM, trackingUrl } from '@/lib/reclamos/tipos'
import { marcarAvisada, marcarEntregado, registrarCompra, registrarEnvio, verificarOrden } from '@/lib/canjes/cliente'
import { mensajeDespacho } from '@/lib/canjes/mensajes'
import { normalizeArgPhone } from '@/lib/crm/core'
import {
  VIAS_ENVIO, VIA_ENVIO_LABEL, pideSeguimiento,
  type CanjePersona, type CanjeRow, type ViaEnvio,
} from '@/lib/canjes/tipos'

const PENDIENTE_TONE: Record<string, Tone> = { pendiente: 'warning', hecho: 'success', no_aplica: 'neutral' }

export function BloqueEnvio({
  canje, persona, onCambio,
}: {
  canje: CanjeRow
  persona: CanjePersona | null
  onCambio: () => void
}) {
  const toast = useToast()

  const [orden, setOrden] = useState(canje.tn_orden ?? '')
  const [gnVenta, setGnVenta] = useState(canje.gn_venta_number ?? '')
  const [verificando, setVerificando] = useState(false)
  const [avisoOrden, setAvisoOrden] = useState<string | null>(null)

  const [via, setVia] = useState<ViaEnvio>((canje.envio_via as ViaEnvio) || 'correo')
  const [seguimiento, setSeguimiento] = useState(canje.envio_seguimiento ?? '')
  const [costo, setCosto] = useState<string>(canje.envio_costo == null ? '' : String(canje.envio_costo))
  const [guardando, setGuardando] = useState(false)

  const cerrado = canje.estado === 'cerrado' || canje.estado === 'cancelado'
  const link = canje.envio_seguimiento ? trackingUrl(canje.envio_via as never, canje.envio_seguimiento) : null

  async function verificar() {
    if (!orden.trim()) return
    setVerificando(true)
    setAvisoOrden(null)
    try {
      const v = await verificarOrden(canje.store, orden.trim())
      if (!v.encontrada) setAvisoOrden('No se encontró esa orden en Tienda Nube. Ojo que sólo se encuentran las recientes.')
      else if (v.aviso) setAvisoOrden(v.aviso)
      else toast.ok('La orden existe y va en $0, como corresponde a un canje.')
    } catch (e) {
      // Si la lectura no anda, el número se guarda igual y se verifica mirando el admin: es una
      // ayuda, no un requisito.
      setAvisoOrden(`No se pudo verificar contra Tienda Nube (${(e as Error)?.message}). Guardala igual y chequeala en el admin.`)
    } finally {
      setVerificando(false)
    }
  }

  async function guardarCompra() {
    setGuardando(true)
    try {
      await registrarCompra(canje.store, canje.id, { tn_orden: orden.trim(), gn_venta_number: gnVenta.trim() || undefined })
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  async function guardarEnvio() {
    setGuardando(true)
    try {
      await registrarEnvio(canje.store, canje.id, {
        envio_via: via,
        // El `EM` es fijo y lo pone la pantalla: se guarda sólo el número. Sin esto, en GN salía
        // `EM EM1234`. Se reusa el helper de Reclamos en vez de copiarlo.
        envio_seguimiento: pideSeguimiento(via) ? numeroEM(seguimiento) || null : null,
        envio_costo: costo === '' ? null : Number(costo),
      })
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  function avisarPorWhatsApp() {
    if (!persona) return
    const tel = normalizeArgPhone(persona.telefono)
    const texto = mensajeDespacho(persona, canje, link)
    const url = tel
      ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`
    window.open(url, '_blank', 'noopener')
    void marcarAvisada(canje.store, canje.id).then(onCambio).catch(() => {})
  }

  return (
    <SectionCard
      title="Compra y envío"
      subtitle="La orden se crea a mano en el admin de Tienda Nube: el monitor no puede crearla, sólo verificarla."
      actions={
        <div style={{ display: 'flex', gap: space[2] }}>
          <StatusPill tone={PENDIENTE_TONE[canje.compra_estado]} label={canje.compra_estado === 'hecho' ? 'Comprado' : 'Falta comprar'} />
          <StatusPill tone={PENDIENTE_TONE[canje.envio_estado]} label={canje.envio_estado === 'hecho' ? 'Despachado' : 'Falta despachar'} />
        </div>
      }
    >
      {/* ── Paso 1: la orden ── */}
      <div style={{ marginBottom: space[5] }}>
        <div style={{ fontWeight: weight.semibold, fontSize: font.md, marginBottom: space[2] }}>
          1. Creá la orden en Tienda Nube
        </div>
        <div style={{ color: color.mut, fontSize: font.sm, marginBottom: space[2] }}>
          Con la dirección de ella, 100% de descuento y el envío a nuestro cargo. Después pegá acá el número.
          La orden cae sola en Gestión Nube y descuenta el stock por el camino normal.
        </div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Nº de orden de Tienda Nube" width={200}>
            <Input value={orden} onChange={(e) => setOrden(e.target.value)} disabled={cerrado} />
          </Field>
          <Field label="Nº de venta en GN" hint="Opcional" width={180}>
            <Input value={gnVenta} onChange={(e) => setGnVenta(e.target.value)} disabled={cerrado} />
          </Field>
          <Button variant="outline" onClick={() => void verificar()} loading={verificando} disabled={!orden.trim() || cerrado}>
            Verificar
          </Button>
          <Button variant="outline" onClick={() => void guardarCompra()} loading={guardando} disabled={!orden.trim() || cerrado}>
            {canje.compra_estado === 'hecho' ? 'Actualizar' : 'Marcar comprado'}
          </Button>
        </div>
        {avisoOrden && (
          <div style={{ marginTop: space[2] }}>
            <Notice tone="warning">{avisoOrden}</Notice>
          </div>
        )}
      </div>

      {/* ── Paso 2: el despacho ── */}
      <div style={{ marginBottom: space[5] }}>
        <div style={{ fontWeight: weight.semibold, fontSize: font.md, marginBottom: space[2] }}>2. Despachalo</div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Cómo va" width={180}>
            <Select value={via} onChange={(e) => setVia(e.target.value as ViaEnvio)} disabled={cerrado}>
              {VIAS_ENVIO.map((v) => <option key={v} value={v}>{VIA_ENVIO_LABEL[v]}</option>)}
            </Select>
          </Field>
          {/* Sólo Correo y Andreani tienen código que seguir. Pedirle uno a un cadete es pedir un
              dato que no existe. */}
          {pideSeguimiento(via) && (
            <Field label="Nº de seguimiento" hint="Sin el EM: lo pone el sistema" width={180}>
              <Input value={seguimiento} onChange={(e) => setSeguimiento(e.target.value)} disabled={cerrado} />
            </Field>
          )}
          <Field label="Costo del envío" hint="Sin esto el balance miente" width={150}>
            <Input type="number" value={costo} onChange={(e) => setCosto(e.target.value)} disabled={cerrado} />
          </Field>
          <Button variant="outline" onClick={() => void guardarEnvio()} loading={guardando} disabled={cerrado}>
            {canje.envio_estado === 'hecho' ? 'Actualizar' : 'Marcar despachado'}
          </Button>
        </div>
        {canje.envio_seguimiento && (
          <div style={{ marginTop: space[2], color: color.mut, fontSize: font.sm }}>
            {etiquetaEM(canje.envio_seguimiento)}
            {link && (
              <>
                {' · '}
                <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: color.brand }}>Seguir el envío</a>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Paso 3: avisarle y marcar que llegó ── */}
      <div>
        <div style={{ fontWeight: weight.semibold, fontSize: font.md, marginBottom: space[2] }}>3. Avisale y esperá</div>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="outline" onClick={avisarPorWhatsApp} disabled={canje.envio_estado !== 'hecho' || !persona}>
            {canje.aviso_estado === 'hecho' ? 'Volver a avisarle' : 'Avisarle que salió'}
          </Button>
          {/* ⚠️ Es el pivote del módulo: acá el servidor CONGELA el vencimiento de cada entregable.
              Hasta que no llega el pedido no hay plazo que contar. */}
          <Button
            variant="outline"
            onClick={() => void marcarEntregado(canje.store, canje.id).then(onCambio).catch((e) => toast.error(String(e?.message || e)))}
            disabled={canje.envio_estado !== 'hecho' || !!canje.entregado_at || cerrado}
          >
            Marcar que le llegó
          </Button>
          {canje.entregado_at && (
            <span style={{ color: color.mut, fontSize: font.sm }}>
              Llegó el {canje.entregado_at.slice(0, 10)} — desde ahí corren los plazos.
            </span>
          )}
        </div>
      </div>
    </SectionCard>
  )
}
