'use client'

/**
 * Canjes con influencers y creadoras — la sección.
 *
 * **Fase 0: el padrón.** Alta con un solo campo (el @), la ficha de cada persona y el historial
 * cruzado de las tres marcas. Eso solo ya reemplaza la planilla; los canjes en sí (propuesta,
 * aprobación, envío, cumplimiento, cierre) entran en la Fase 1.
 *
 * ⚠️ Dos cosas que hay que saber al leer esto:
 *
 * 1. **Las marcas son tres, no dos.** Stunned no es una marca del monitor (es una línea de Zattia
 *    por prefijo de SKU `STU`) y por eso no está en el switch de marca del header; pero un canje se
 *    hace *para Stunned*, con su propia cuenta de Instagram y su propio balance. El selector de
 *    acá abajo es el que manda dentro de la sección.
 * 2. **El padrón es único y transversal.** Se ven todas las personas siempre, sin importar para qué
 *    marca trabajaron: si no, marketing de Zattia no se enteraría de que esa creadora ya laburó con
 *    BDI, que es justamente el dato que hoy se pierde. Lo que sí se oculta son los *detalles* de los
 *    canjes de otras marcas, y eso lo hace el servidor.
 */

import { useCallback, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  Button, Card, Field, Input, Modal, Notice, Tabs, useToast,
  color, font, space, type TabItem,
} from '@/components/ui'
import { crearPersona, esCiego } from '@/lib/canjes/cliente'
import { normalizarInstagram } from '@/lib/canjes/instagram'
import { veMarcaCanjes } from '@/lib/canjes/permisos'
import { STORE_LABEL, type CanjeStore } from '@/lib/canjes/tipos'
import { FichaCanje } from './FichaCanje'
import { FichaPersona } from './FichaPersona'
import { ListaCanjes } from './ListaCanjes'
import { ListaPersonas } from './ListaPersonas'
import { useCanjes } from './useCanjes'

/** Las marcas del monitor, que son dos. La tercera (Stunned) sale de `veMarcaCanjes`. */
const MARCAS_MONITOR = ['bdi', 'zattia'] as const

export function Canjes() {
  const { marca, perfil } = useSesion()
  const toast = useToast()

  // Qué marcas puede elegir. Es el espejo en UI de `marcasVisibles()` del handler; el servidor
  // vuelve a chequearlo, así que esto es comodidad, no seguridad.
  const marcasPosibles = useMemo(
    () => veMarcaCanjes(perfil, marca, [...MARCAS_MONITOR]),
    [perfil, marca],
  )

  // Arranca en la marca activa del header si está entre las posibles; si no, la primera que haya.
  const [store, setStore] = useState<CanjeStore>(() =>
    marcasPosibles.includes(marca) ? marca : (marcasPosibles[0] ?? 'bdi'),
  )
  const [tab, setTab] = useState<'personas' | 'canjes' | 'aprobaciones'>('personas')
  const [abierta, setAbierta] = useState<number | null>(null)
  const [canjeAbierto, setCanjeAbierto] = useState<number | null>(null)
  const [dandoAlta, setDandoAlta] = useState(false)

  const est = useCanjes(store)

  const abrir = useCallback((id: number) => setAbierta(id), [])

  // Cuántos esperan firma: va como badge en la pestaña, que es donde se mira sin entrar.
  const esperandoFirma = useMemo(
    () => est.canjes.filter((c) => !esCiego(c) && c.estado === 'propuesta').length,
    [est.canjes],
  )

  const tabs = useMemo<TabItem[]>(() => [
    { key: 'personas', label: 'Padrón', hint: 'Todas las personas, de todas las marcas' },
    { key: 'canjes', label: 'Canjes' },
    { key: 'aprobaciones', label: 'Aprobaciones', badge: esperandoFirma || undefined },
  ], [esperandoFirma])

  if (!marcasPosibles.length) {
    return <Notice tone="warning">No tenés acceso a los canjes de ninguna marca.</Notice>
  }

  return (
    <>
      <HeaderAcciones>
        <Button variant="outline" onClick={() => void est.recargar()} disabled={est.cargando}>
          Actualizar
        </Button>
        <Button variant="solid" tone="brand" onClick={() => setDandoAlta(true)}>
          Agregar persona
        </Button>
      </HeaderAcciones>

      {/* El selector de marca de la sección: tres opciones, no dos. */}
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[5] }}>
        <Tabs
          items={marcasPosibles.map<TabItem>((m) => ({ key: m, label: STORE_LABEL[m] }))}
          value={store}
          onChange={(k) => {
            setStore(k as CanjeStore)
            setAbierta(null)
          }}
        />
        <span style={{ color: color.mut2, fontSize: font.sm }}>
          El padrón de personas es el mismo para las tres marcas; lo que cambia es de qué marca son
          los canjes.
        </span>
      </div>

      {est.error && <Notice tone="danger">{est.error}</Notice>}

      {/* Una ficha abierta ocupa la pantalla entera: mostrar la lista debajo sería ruido, y las
          pestañas se vuelven a ver al volver. */}
      {!abierta && !canjeAbierto && (
        <div style={{ marginBottom: space[5] }}>
          <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as typeof tab)} variant="underline" />
        </div>
      )}

      {est.cargando && !est.personas.length ? (
        <Card>Cargando el padrón…</Card>
      ) : canjeAbierto ? (
        <FichaCanje
          store={store}
          canjeId={canjeAbierto}
          onVolver={() => {
            setCanjeAbierto(null)
            void est.recargar()
          }}
        />
      ) : abierta ? (
        <FichaPersona
          store={store}
          personaId={abierta}
          onVolver={() => {
            setAbierta(null)
            void est.recargar()
          }}
          onCambio={est.parchearPersona}
          onAbrirCanje={setCanjeAbierto}
          onCanjeCreado={async (id) => {
            await est.recargar()
            setCanjeAbierto(id)
          }}
        />
      ) : tab === 'personas' ? (
        <ListaPersonas personas={est.personas} onAbrir={abrir} />
      ) : (
        <ListaCanjes
          canjes={est.canjes}
          personas={est.personas}
          vencidos={est.vencidos}
          soloAprobaciones={tab === 'aprobaciones'}
          onAbrir={setCanjeAbierto}
        />
      )}

      <AltaPersona
        abierto={dandoAlta}
        store={store}
        onCerrar={() => setDandoAlta(false)}
        onListo={async (id, existia) => {
          setDandoAlta(false)
          if (existia) toast.ok('Esa persona ya estaba en el padrón: te abro su ficha.')
          await est.recargar()
          setAbierta(id)
        }}
      />
    </>
  )
}

/**
 * El alta. **Un solo campo obligatorio: el @.**
 *
 * Que dar de alta cueste un renglón es lo que hace que el padrón se llene; pedirle diez campos al
 * operador es lo que hace que siga anotando en la planilla. El resto se completa desde la ficha, o
 * lo carga ella misma por el portal (Fase 2).
 *
 * Si el @ ya existe **no es un error**: se abre la ficha que hay. Es el caso normal — la misma
 * creadora vuelve, y quien la está dando de alta muchas veces no sabe que ya estaba.
 */
function AltaPersona({
  abierto, store, onCerrar, onListo,
}: {
  abierto: boolean
  store: CanjeStore
  onCerrar: () => void
  onListo: (id: number, existia: boolean) => Promise<void>
}) {
  const toast = useToast()
  const [instagram, setInstagram] = useState('')
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)

  const normalizado = normalizarInstagram(instagram)

  const guardar = async () => {
    if (!normalizado) return
    setGuardando(true)
    try {
      const { persona, existia } = await crearPersona(store, {
        instagram,
        nombre: nombre.trim() || undefined,
      })
      setInstagram('')
      setNombre('')
      await onListo(persona.id, existia)
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Agregar una persona al padrón"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" tone="brand" onClick={() => void guardar()} loading={guardando} disabled={!normalizado}>
            Agregar
          </Button>
        </>
      }
    >
      <Field
        label="Instagram"
        required
        hint="Pegá el @ o el link del perfil, como venga. Es lo único que hace falta para empezar."
      >
        <Input
          value={instagram}
          placeholder="@lucia.mkp"
          autoFocus
          onChange={(e) => setInstagram(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && normalizado) void guardar() }}
        />
      </Field>
      {/* Se muestra cómo se va a guardar: pegar `instagram.com/lucia.mkp/?igsh=…` y ver
          `lucia.mkp` explica sin decirlo por qué no se duplican las fichas. */}
      {instagram.trim() && (
        <div style={{ color: normalizado ? color.mut : color.danger, fontSize: font.sm, marginTop: 4 }}>
          {normalizado
            ? `Se va a guardar como @${normalizado}`
            : 'De ahí no sale un usuario de Instagram. Probá con el @ o el link del perfil.'}
        </div>
      )}

      <div style={{ marginTop: space[3] }}>
        <Field label="Nombre" hint="Opcional. Si no lo sabés todavía, se completa después.">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
