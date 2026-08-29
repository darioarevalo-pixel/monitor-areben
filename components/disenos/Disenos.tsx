'use client'

/**
 * Diseños — el tablero donde se eligen las fundas que se van a producir.
 *
 * Este archivo es **el armador**: carga, persiste, y reparte en tres pestañas. No pinta ninguna
 * tarjeta. Las tres pestañas son los tres momentos de la dinámica real —probar, votar, y confirmar
 * para mandar la orden—, y la tercera es la que hasta ago-2026 no existía: la sección terminaba en
 * una tabla de resultados que nadie trasladaba a una decisión.
 *
 * ⛔ Antes de tocar acá, leer `docs/secciones/disenos.md`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { imgAThumbYSubir } from '@/lib/imagenes'
import { aplicarEstadoALote, conteos, marcarEnviados, pesadas } from '@/lib/disenos/core'
import { estaAbierta } from '@/lib/disenos/votacion'
import { VotacionPanel } from '@/components/disenos/VotacionPanel'
import { Tablero } from '@/components/disenos/Tablero'
import { Elegidos } from '@/components/disenos/Elegidos'
import { RevisionRapida } from '@/components/disenos/RevisionRapida'
import { ReportePDF } from '@/components/disenos/ReportePDF'
import { useResumenRonda } from '@/components/disenos/useResumenRonda'
import { PasarAImportacion } from '@/components/ingresos/PasarAImportacion'
import type { Diseno, EstadoDiseno } from '@/lib/disenos/tipos'
import {
  avisoLocalOculto,
  borrarDiseno,
  contarLocales,
  guardarDisenos,
  leerDisenos,
  ocultarAvisoLocal,
  olvidarLocales,
} from '@/lib/disenos/persistencia'
import { useSesion } from '@/components/SesionProvider'
import { Button, Card as Superficie, Lightbox, Notice, Tabs, color, font, space, useConfirmar, useFiltroUrl, useToast } from '@/components/ui'

let seq = 0
const newId = () => 'd' + Date.now() + '_' + seq++

type Pestana = 'tablero' | 'votaciones' | 'elegidos'

export function Disenos() {
  const { confirmar, avisar } = useConfirmar()
  const toast = useToast()
  const { marca, perfil } = useSesion()
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [disenos, setDisenos] = useState<Diseno[]>([])
  const [hidratado, setHidratado] = useState(false)
  const [tab, setTab] = useFiltroUrl<Pestana>('t', 'tablero')

  const [preview, setPreview] = useState<string | null>(null)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [quickOn, setQuickOn] = useState(false)
  const [quickIndex, setQuickIndex] = useState(0)
  /** Cuántos quedaron en ESTE navegador del tablero viejo. Un número, ⛔ nunca la lista (ver abajo). */
  const [locales, setLocales] = useState(0)

  const fileRef = useRef<HTMLInputElement>(null)
  /** Lo último que quedó guardado en la base, por id, para poder mandar solo lo que cambió. */
  const ultimo = useRef<Map<string, string>>(new Map())
  /** Ids cuya foto todavía está subiendo a Blob: no se persisten hasta tener la URL. */
  const subiendo = useRef<Set<string>>(new Set())

  // El ★ de cada tarjeta. Vive acá afuera del `Diseno` a propósito: ver el docblock del hook.
  const { resumen: ronda, recargar: recargarRonda } = useResumenRonda(marca)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      let d: Diseno[] = []
      try {
        d = await leerDisenos(marca)
      } catch (e) {
        if (vivo) setErrorCarga(e instanceof Error ? e.message : String(e))
      }
      if (!vivo) return
      // 🔴 Sembrar el "último guardado" con lo que se acaba de bajar, ANTES de publicarlo. Si no, el
      // efecto de persistencia se despierta con el mapa vacío y cree que cambió todo: devolvía el
      // tablero entero —con las fotos embebidas, megas— a la base en cada entrada a la sección. Y
      // al cambiar de marca, además, mandaba a borrar los ids de la marca anterior contra la nueva.
      ultimo.current = new Map(d.map((x) => [String(x.id), JSON.stringify(x)]))
      setDisenos(d)
      setLocales(avisoLocalOculto() ? 0 : contarLocales())
      setHidratado(true)
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  /**
   * Persistir en la base: SOLO lo que cambió.
   *
   * Se compara contra lo último guardado en vez de mandar el tablero entero (que con las fotos
   * embebidas son megas por vuelta) y así dos personas trabajando a la vez no se pisan: cada una
   * escribe sus diseños. Los borrados se mandan aparte.
   *
   * ⚠️ Una acción en lote termina en un solo `setDisenos`, así que confirmar 34 diseños es **un**
   * POST con 34 documentos, no 34 llamadas.
   */
  useEffect(() => {
    if (!hidratado) return
    const previo = ultimo.current
    const ahora = new Map(disenos.map((d) => [String(d.id), JSON.stringify(d)]))
    const cambiados = disenos.filter(
      (d) => !subiendo.current.has(String(d.id)) && previo.get(String(d.id)) !== ahora.get(String(d.id)),
    )
    const borrados = [...previo.keys()].filter((id) => !ahora.has(id))
    ultimo.current = ahora
    if (!cambiados.length && !borrados.length) return
    void (async () => {
      try {
        await guardarDisenos(marca, cambiados)
        for (const id of borrados) await borrarDiseno(marca, id)
      } catch (e) {
        toast.error('No se pudo guardar el tablero: ' + (e instanceof Error ? e.message : String(e)))
      }
    })()
  }, [disenos, hidratado, marca, toast])

  // ── Acciones ──
  const setNombre = useCallback((id: string, val: string) => setDisenos((ds) => ds.map((d) => (d.id === id ? { ...d, name: val } : d))), [])
  const setEstado = useCallback((id: string, estado: EstadoDiseno) => setDisenos((ds) => ds.map((d) => (d.id === id ? { ...d, estado } : d))), [])

  /**
   * Las fotos van a Vercel Blob y en el tablero queda la URL, no la imagen entera.
   *
   * El diseño aparece en pantalla al instante con el base64 local (`onPreview`), pero mientras la
   * subida está en curso queda anotado en `subiendo` y el efecto de persistencia lo saltea: si no,
   * cada foto viajaría DOS veces a la base, y la primera con los megas del base64. Si la subida
   * falla, se guarda el base64 como antes: se pierde el ahorro, no la foto.
   */
  const cargar = useCallback(
    (files: FileList | null) => {
      const arr = [...(files || [])].filter((f) => /^image\//.test(f.type))
      arr.forEach((f) => {
        const id = newId()
        const nombre = f.name.replace(/\.[a-z0-9]+$/i, '')
        // Al soltar se borra también del "último guardado": mientras estaba en vuelo el efecto lo
        // anotó ahí con su base64 aunque no lo guardó, así que sin esto el diff no lo vería como
        // pendiente y la foto no llegaría nunca a la base.
        const soltar = () => {
          subiendo.current.delete(id)
          ultimo.current.delete(id)
        }
        subiendo.current.add(id)
        imgAThumbYSubir(
          f,
          {
            onPreview: (base64) => setDisenos((ds) => [...ds, { id, name: nombre, url: base64, estado: 'revisar' }]),
            onUrl: (url) => {
              soltar()
              setDisenos((ds) => ds.map((d) => (d.id === id ? { ...d, url } : d)))
            },
            onFallback: () => {
              soltar()
              setDisenos((ds) => [...ds])
            },
            onError: () => {
              soltar()
              toast.error(`No se pudo leer la imagen "${f.name}".`)
            },
          },
          'disenos',
          600,
        )
      })
    },
    [toast],
  )

  const limpiar = async () => {
    if (!disenos.length) return
    const ok = await confirmar({
      titulo: 'Vaciar el tablero',
      tono: 'danger',
      ok: `Eliminar los ${disenos.length}`,
      mensaje: `Se eliminan los ${disenos.length} diseños del tablero, para todo el equipo. No se puede deshacer. Los votos de las rondas quedan.`,
    })
    if (!ok) return
    setDisenos([])
  }

  const borrarLocales = async () => {
    const ok = await confirmar({
      titulo: 'Eliminar el tablero viejo de esta computadora',
      tono: 'danger',
      ok: `Eliminar ${locales === 1 ? 'el diseño' : 'los ' + locales}`,
      mensaje: `Se eliminan ${locales} ${locales === 1 ? 'diseño guardado' : 'diseños guardados'} en ESTE navegador. No están en el tablero compartido y no se pueden recuperar. No se toca nada del equipo ni de ninguna marca.`,
    })
    if (!ok) return
    const n = olvidarLocales()
    setLocales(0)
    toast.ok(`Listo, ${n} ${n === 1 ? 'diseño borrado' : 'diseños borrados'} de esta computadora.`)
  }

  // ── Revisión rápida ──
  const cola = useMemo(() => disenos.filter((d) => d.estado === 'revisar'), [disenos])
  const clasificar = useCallback(
    (est: EstadoDiseno) => {
      const d = cola[Math.min(quickIndex, Math.max(0, cola.length - 1))]
      if (!d) return
      setEstado(d.id, est)
      setQuickIndex((i) => Math.min(i, Math.max(0, cola.length - 2)))
    },
    [cola, quickIndex, setEstado],
  )
  const saltar = useCallback(() => {
    if (cola.length < 2) return
    setQuickIndex((i) => (i + 1) % cola.length)
  }, [cola.length])
  const abrirQuick = async () => {
    if (!disenos.length) return avisar('Cargá diseños primero.')
    if (!cola.length) return avisar('No queda ningún diseño «por revisar».')
    setQuickIndex(0)
    setQuickOn(true)
  }

  const n = useMemo(() => conteos(disenos), [disenos])
  const rondasAbiertas = ronda.ronda && estaAbierta(ronda.ronda) ? 1 : 0
  const conBase64 = useMemo(() => pesadas(disenos).length, [disenos])
  const confirmados = useMemo(() => disenos.filter((d) => d.estado === 'confirmado'), [disenos])

  const botonesTablero = (
    <>
      <Button variant="solid" tone="brand" onClick={() => fileRef.current?.click()}>
        Cargar imágenes
      </Button>
      <Button variant="outline" onClick={() => void abrirQuick()}>
        Revisión rápida
      </Button>
      <Button variant="outline" onClick={() => (disenos.length ? setPdfOpen(true) : void avisar('Cargá diseños primero.'))}>
        Reporte PDF
      </Button>
      <Button variant="ghost" tone="danger" onClick={() => void limpiar()} disabled={!disenos.length} style={{ marginLeft: 'auto' }}>
        Vaciar tablero
      </Button>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { cargar(e.target.files); e.target.value = '' }} />
    </>
  )

  return (
    <Superficie>
      {errorCarga && (
        <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>
          No se pudo leer el tablero compartido: {errorCarga}. Lo que cargues ahora podría no guardarse — recargá antes de seguir.
        </Notice>
      )}

      {/*
        Lo que quedó en ESTE navegador de la época en que el tablero era local.
        🔑 Ya NO hay un botón de "Subirlos", y eso es el arreglo, no una simplificación: el tablero
        viejo era uno solo, sin marca, y la comparación con lo remoto sí tenía marca — parado en
        Zattia el aviso volvía para siempre y subir habría duplicado el tablero de BDI adentro de
        Zattia. Y "Ahora no" era un `useState`, así que reaparecía con cada F5. Ahora hay dos
        salidas y las dos son definitivas.
      */}
      {locales > 0 && (
        <Notice tone="neutral" style={{ marginBottom: space[3] }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>
              En esta computadora quedaron <b>{locales} {locales === 1 ? 'diseño' : 'diseños'}</b> del tablero viejo, de cuando cada navegador tenía el suyo. El tablero compartido ya no los usa.
            </span>
            <Button size="sm" variant="outline" tone="danger" style={{ marginLeft: 'auto' }} onClick={() => void borrarLocales()}>
              Eliminar {locales === 1 ? 'el diseño' : 'los ' + locales} de esta computadora
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { ocultarAvisoLocal(); setLocales(0) }}>
              Ocultar este aviso
            </Button>
          </div>
        </Notice>
      )}

      <Tabs
        style={{ marginBottom: space[3] }}
        value={tab}
        onChange={(k) => setTab(k as Pestana)}
        items={[
          { key: 'tablero', label: 'Tablero', badge: n.revisar || undefined, hint: 'Todas las fundas cargadas, para mirarlas y decidir' },
          { key: 'votaciones', label: 'Votaciones', badge: rondasAbiertas || undefined, hint: 'Las rondas por link y sus resultados' },
          // El badge va aunque valga 0: es lo único que dice "todavía no elegiste nada".
          { key: 'elegidos', label: 'Elegidos', badge: n.confirmado, hint: 'Los confirmados, listos para mandar a una importación' },
        ]}
      />

      {tab === 'tablero' && (
        <>
          {/* Un pendiente que se ve solo si existe. Las fotos en base64 viajan enteras en cada
              guardado de ese diseño y se llevan puesto el snapshot de la próxima ronda. */}
          {conBase64 > 0 && (
            <Notice tone="warning" style={{ marginBottom: space[3] }}>
              {conBase64} {conBase64 === 1 ? 'foto quedó guardada' : 'fotos quedaron guardadas'} dentro del tablero, de cuando la subida falló. Andan bien, pero pesan en cada guardado y en el link de votación.
            </Notice>
          )}
          <Tablero
            disenos={disenos}
            puntajes={ronda.puntajes}
            hayRonda={!!ronda.ronda}
            cargando={!hidratado && !errorCarga}
            onCambiar={(mutar) => setDisenos(mutar)}
            onNombre={setNombre}
            onEstado={setEstado}
            onVer={setPreview}
            onCargar={cargar}
            acciones={botonesTablero}
          />
        </>
      )}

      {tab === 'votaciones' && (
        <VotacionPanel
          marca={marca}
          disenos={disenos}
          onCambio={() => void recargarRonda()}
          onConfirmar={(ids) => {
            setDisenos((ds) => aplicarEstadoALote(ds, new Set(ids), 'confirmado'))
            setTab('elegidos')
            toast.ok(`${ids.length} ${ids.length === 1 ? 'diseño confirmado' : 'diseños confirmados'}.`)
          }}
        />
      )}

      {tab === 'elegidos' && (
        <Elegidos
          disenos={disenos}
          puntajes={ronda.puntajes}
          onVer={setPreview}
          acciones={
            <>
              <PasarAImportacion
                marca={marca}
                perfil={perfil}
                disenos={confirmados}
                onEnviados={(marcas) => setDisenos((ds) => marcarEnviados(ds, marcas))}
              />
              <Button variant="outline" onClick={() => setPdfOpen(true)}>
                Reporte PDF
              </Button>
            </>
          }
        />
      )}

      <Lightbox src={preview} onCerrar={() => setPreview(null)} />

      <ReportePDF
        abierto={pdfOpen}
        onCerrar={() => setPdfOpen(false)}
        disenos={disenos}
        orden={ronda.ronda ? 'puntaje' : 'carga'}
        puntajes={ronda.puntajes}
        tituloRonda={ronda.ronda?.titulo}
      />

      <RevisionRapida
        abierto={quickOn}
        onCerrar={() => setQuickOn(false)}
        cola={cola}
        total={disenos.length}
        index={quickIndex}
        puntajes={ronda.puntajes}
        onClasificar={clasificar}
        onSaltar={saltar}
        onNombre={setNombre}
      />

      {!disenos.length && tab === 'tablero' && (
        <div style={{ marginTop: space[3], fontSize: font.xs, color: color.mut2 }}>
          El tablero es compartido: lo que cargues acá lo ve todo el equipo de la marca.
        </div>
      )}
    </Superficie>
  )
}
