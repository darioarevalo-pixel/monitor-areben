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
import { marcaDePermisos } from '@/lib/canjes/marcas.js'
import { nivelesQueFirma, puedeConfigurarCanjes, veMarcaCanjes } from '@/lib/canjes/permisos'
import { STORE_LABEL, type CanjePersona, type CanjeStore } from '@/lib/canjes/tipos'
import { Ajustes } from './Ajustes'
import { FichaCanje } from './FichaCanje'
import { GuiaCanjes, LineaDeEstados } from './GuiaCanjes'
import { FichaPersona } from './FichaPersona'
import { ListaCanjes } from './ListaCanjes'
import { ListaPersonas } from './ListaPersonas'
import { ProponerCanje } from './ProponerCanje'
import { useCanjes } from './useCanjes'
import { Vitrinas } from './Vitrinas'

export function Canjes() {
  const { marca, perfil } = useSesion()
  const toast = useToast()

  // Qué marcas puede elegir. Es el espejo en UI de `marcasVisibles()` del handler; el servidor
  // vuelve a chequearlo, así que esto es comodidad, no seguridad.
  const marcasPosibles = useMemo(
    () => veMarcaCanjes(perfil),
    [perfil],
  )

  // Arranca en la marca activa del header si está entre las posibles; si no, la primera que haya.
  const [store, setStore] = useState<CanjeStore>(() =>
    marcasPosibles.includes(marca) ? marca : (marcasPosibles[0] ?? 'bdi'),
  )
  const [tab, setTab] = useState<'personas' | 'canjes' | 'aprobaciones' | 'vitrinas' | 'ajustes'>('personas')
  const [abierta, setAbierta] = useState<number | null>(null)
  const [canjeAbierto, setCanjeAbierto] = useState<number | null>(null)
  const [dandoAlta, setDandoAlta] = useState(false)
  /** A quién se le está proponiendo algo desde la lista, sin entrar a su ficha. */
  const [proponiendoA, setProponiendoA] = useState<CanjePersona | null>(null)

  const est = useCanjes(store)

  // Qué firmas tiene, para que el modal anticipe si la propuesta sale directo o va a la firma.
  const susNiveles = useMemo(() => nivelesQueFirma(perfil, marcaDePermisos(store)), [perfil, store])

  const canjeCreado = useCallback(async (id: number) => {
    setProponiendoA(null)
    await est.recargar()
    setCanjeAbierto(id)
  }, [est])

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
    { key: 'vitrinas', label: 'Vitrinas', hint: 'Lo que ella ve al abrir el link' },
    // Se muestra siempre: quien no puede editar igual necesita ver con qué números corre el módulo
    // —y sobre todo cuál es el cupón— para no preguntarlo por WhatsApp cada vez.
    { key: 'ajustes', label: 'Ajustes', hint: 'El cupón, los plazos y las firmas de esta marca' },
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

      {/* El circuito, escrito y plegado. Va antes de las pestañas porque no es de una pestaña: es
          de todas, y arranca en el padrón para terminar en el cierre. */}
      {!abierta && !canjeAbierto && <GuiaCanjes cfg={est.config} />}

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
          vitrinas={est.vitrinas}
          onVolver={() => {
            setCanjeAbierto(null)
            void est.recargar()
          }}
        />
      ) : abierta ? (
        <FichaPersona
          store={store}
          personaId={abierta}
          ctxPuntaje={est.ctxPuntaje}
          configs={est.configs}
          vitrinas={est.vitrinas}
          marcasVisibles={est.marcasVisibles}
          susNiveles={susNiveles}
          onVolver={() => {
            setAbierta(null)
            void est.recargar()
          }}
          onCambio={est.parchearPersona}
          onBorrada={async () => {
            setAbierta(null)
            await est.recargar()
            toast.ok('La sacamos del padrón.')
          }}
          onAbrirCanje={setCanjeAbierto}
          onCanjeCreado={canjeCreado}
        />
      ) : tab === 'personas' ? (
        <ListaPersonas
          personas={est.personas}
          store={store}
          onAbrir={abrir}
          onProponer={setProponiendoA}
          onBorrada={async () => {
            await est.recargar()
            toast.ok('La sacamos del padrón.')
          }}
        />
      ) : tab === 'vitrinas' ? (
        <Vitrinas store={store} />
      ) : tab === 'ajustes' ? (
        <Ajustes
          // El formulario se inicializa de la config y no se sincroniza después: remontarlo es lo
          // que hace que al cambiar de marca (o al terminar de cargar) muestre lo que corresponde.
          key={`${store}-${est.config?.updated_at ?? 'sin'}`}
          store={store}
          config={est.config}
          puedeEditar={puedeConfigurarCanjes(perfil)}
          onGuardado={() => void est.recargar()}
        />
      ) : (
        <>
          {/* Los estados en una línea: acá la pregunta no es "qué hago" sino "por qué este canje
              está en esta pila". */}
          {tab !== 'aprobaciones' && <LineaDeEstados />}
          <ListaCanjes
            canjes={est.canjes}
            personas={est.personas}
            vencidos={est.vencidos}
            soloAprobaciones={tab === 'aprobaciones'}
            onAbrir={setCanjeAbierto}
          />
        </>
      )}

      {/* La propuesta desde la LISTA, sin pasar por la ficha: el canje nace de una idea sobre
          alguien que ya está en el padrón, y hacer dos clicks para llegar es lo que hace que se
          termine anotando en otro lado. */}
      {proponiendoA && (
        <ProponerCanje
          persona={proponiendoA}
          store={store}
          configs={est.configs}
          vitrinas={est.vitrinas}
          marcasVisibles={est.marcasVisibles}
          susNiveles={susNiveles}
          onCerrar={() => setProponiendoA(null)}
          onListo={canjeCreado}
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
