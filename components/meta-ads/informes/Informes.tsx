'use client'

/**
 * `/meta-ads/informes` — el depósito de análisis de la pauta.
 *
 * # Qué es, y sobre todo qué NO es
 *
 * Es el **archivo del diagnóstico en prosa**: el informe que alguien escribió leyendo la serie, con
 * su fecha, guardado donde lo pueda abrir el resto del equipo. Vivía en una carpeta de un solo disco
 * y como artifacts privados que veían dos personas.
 *
 * ⛔ **No calcula nada, y esa es la decisión de fondo.** Las otras nueve pantallas de la sección
 * miran números; ésta guarda el texto que los explica. Lo que se descartó al mudar el analista fue
 * *generar* el diagnóstico solo —«el mejor público se quedó sin creativo» sale de leer, no de
 * graficar—, así que el día que acá aparezca un gráfico, dejó de ser un depósito.
 *
 * # Por qué el informe va adentro de un iframe
 *
 * El HTML trae **su propio sistema de diseño** (petróleo, serif Iowan, los tres semánticos
 * escalar/mirar/cortar donde el color ES la decisión). Inyectado suelto, sus reglas y las del
 * monitor se pisan en los dos sentidos. El iframe le da su propio documento.
 *
 * Va con `sandbox` **sin `allow-scripts`**: los informes son estáticos, y el día que uno llegue con
 * un script no tiene por qué correr adentro del monitor. La contra, dicha en voz alta: **un iframe
 * sandboxeado no puede avisar su alto**, así que el informe scrollea adentro de su marco en vez de
 * estirar la página. Se eligió eso antes que abrirle la puerta a los scripts para ganar un scroll.
 *
 * 🔴 **El contenido se pone DESPUÉS de que el marco está en el DOM, y no como prop `srcDoc`.**
 *
 * Con `srcDoc` en el JSX, el marco salió a producción **en blanco**: la pantalla dibujaba, el
 * atributo estaba y medía sus 40 KB, y adentro no había nada. El motivo es que el documento se
 * carga antes de que el `sandbox` termine de aplicarse, y cuando el atributo llega Chrome descarta
 * lo que ya había cargado. Se confirmó en prod volviendo a escribir el mismo `srcdoc` sobre el
 * mismo iframe: con el sandbox ya puesto, el informe apareció entero.
 *
 * ⚠️ Por eso `srcDoc` no puede volver al JSX «para simplificar»: el defecto no da ningún error, ni
 * en consola ni en el CI. Se ve mirando la pantalla, y sólo si uno sabe que ahí tenía que haber
 * algo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  borrarInforme, publicarInforme, traerInforme, traerInformes,
} from '@/lib/meta-ads/cliente'
import { nombreArchivo } from '@/lib/meta-ads/informes'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import type { Informe, InformeResumen } from '@/lib/meta-ads/informes'
import {
  Button, EmptyState, Notice, SectionCard, StatusPill, color, font, radius, space, weight,
  useConfirmar, useToast,
} from '@/components/ui'

/** Cuánto mide el marco del informe. Alto fijo porque el iframe no puede decir el suyo (ver arriba). */
const ALTO_MARCO = 720

export function Informes() {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [lista, setLista] = useState<InformeResumen[] | null>(null)
  const [puedeEditar, setPuedeEditar] = useState<string[]>([])
  const [motivoError, setMotivoError] = useState<string | null>(null)
  const [pedido, setPedido] = useState(0)
  const [elegido, setElegido] = useState<number | null>(null)
  const [cuerpo, setCuerpo] = useState<Informe | null>(null)
  const [ocupada, setOcupada] = useState<number | null>(null)
  const marco = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let vivo = true
    traerInformes().then((r) => {
      if (!vivo) return
      if (r.ok) { setLista(r.dato.informes); setPuedeEditar(r.dato.puedeEditar || []); setMotivoError(null) }
      else setMotivoError(r.motivo)
    })
    return () => { vivo = false }
  }, [pedido])

  /**
   * 🔑 **Cuál está abierto se DEDUCE, no se guarda.** Entrar acá es casi siempre querer leer el
   * último, así que sin elección explícita manda el primero de la lista. Escribirlo en un `useState`
   * desde un efecto es una cascada de renders —y lo que el lint frena—: el default no es estado,
   * es una lectura de la lista.
   */
  const abiertoId = elegido ?? lista?.[0]?.id ?? null
  // Y el cuerpo vale sólo si es el del elegido. De ahí sale «está cargando» sin una bandera aparte,
  // que es la que se quedaba en `true` cuando la respuesta llegaba tarde y ya se había cambiado.
  const abierto = cuerpo && cuerpo.id === abiertoId ? cuerpo : null
  const cargandoCuerpo = abiertoId !== null && !abierto

  useEffect(() => {
    if (abiertoId === null) return
    let vivo = true
    traerInforme(abiertoId).then((r) => {
      if (!vivo) return
      if (r.ok) setCuerpo(r.dato.informe)
      else toast.error(r.motivo)
    })
    return () => { vivo = false }
  }, [abiertoId, toast, pedido])

  // El informe entra al marco recién acá, con el `sandbox` ya aplicado. Ver el encabezado: como
  // prop `srcDoc` el marco sale en blanco, sin un solo error que lo diga.
  useEffect(() => {
    const el = marco.current
    if (el && abierto) el.setAttribute('srcdoc', abierto.html)
  }, [abierto])

  const recargar = useCallback(() => setPedido((p) => p + 1), [])

  const cambiarEstado = useCallback(async (inf: InformeResumen) => {
    setOcupada(inf.id)
    const r = await publicarInforme(inf.id, !inf.publicado)
    setOcupada(null)
    if (!r.ok) { toast.error(r.motivo); return }
    toast.ok(inf.publicado
      ? 'Vuelve a borrador: deja de verlo el resto del equipo.'
      : 'Publicado. Ya lo puede abrir quien vea la pauta de esa marca.')
    recargar()
  }, [toast, recargar])

  const eliminar = useCallback(async (inf: InformeResumen) => {
    const ok = await confirmar({
      titulo: `¿Borrar el informe del ${inf.fecha}?`,
      mensaje: 'Se borra el texto entero y no queda copia. Si lo que querés es dejar de compartirlo, alcanza con devolverlo a borrador.',
      ok: 'Borrar',
      tono: 'danger',
    })
    if (!ok) return
    setOcupada(inf.id)
    const r = await borrarInforme(inf.id)
    setOcupada(null)
    if (!r.ok) { toast.error(r.motivo); return }
    if (abiertoId === inf.id) setElegido(null)
    toast.ok('Borrado.')
    recargar()
  }, [confirmar, toast, recargar, abiertoId])

  const descargar = useCallback((inf: Informe) => {
    const url = URL.createObjectURL(new Blob([inf.html], { type: 'text/html' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nombreArchivo(inf)
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const abiertoResumen = useMemo(
    () => (lista || []).find((x) => x.id === abiertoId) || null,
    [lista, abiertoId],
  )

  if (motivoError) return <Notice tone="danger">No se pudieron leer los informes: {motivoError}</Notice>
  // Fragmento y no `null` mientras carga: `VISTAS` de `MetaAds.tsx` exige un elemento, y una vista
  // que a veces devuelve `null` rompe el tipo del router entero.
  if (!lista) return <></>

  return (
    <SectionCard title="Informes de la pauta">
      <p style={{ margin: `0 0 ${space[3]}px`, color: color.mut, fontSize: font.sm, maxWidth: 680 }}>
        El análisis en prosa de cada fecha: qué estaba pasando con la pauta y qué se decidió hacer.
        Uno por fecha y por marca, y <b>el anterior no se toca</b> — la gracia del historial es poder
        leer qué se pensaba en agosto con lo que se sabía en agosto. Los números están en las otras
        pantallas; acá está el porqué.
      </p>

      {lista.length === 0 ? (
        <EmptyState
          dashed
          icon="📄"
          title="Todavía no hay ningún informe cargado"
          hint="Los sube el analista con scripts/informe-meta.mjs y quedan en borrador hasta que alguien los publique."
        />
      ) : (
        <div style={{ display: 'flex', gap: space[4], alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', minWidth: 260, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {lista.map((x) => (
              <FilaInforme
                key={x.id}
                inf={x}
                activo={x.id === abiertoId}
                puede={puedeEditar.includes(x.linea)}
                ocupada={ocupada === x.id}
                onAbrir={() => setElegido(x.id)}
                onEstado={() => cambiarEstado(x)}
                onBorrar={() => eliminar(x)}
              />
            ))}
          </div>

          <div style={{ flex: '2 1 520px', minWidth: 320 }}>
            {abiertoResumen && !abiertoResumen.publicado && (
              <Notice tone="neutral">
                Este informe está en <b>borrador</b>: sólo lo ve quien puede publicar. Hasta que se
                publique, el resto del equipo no lo tiene.
              </Notice>
            )}
            {cargandoCuerpo && <div style={{ color: color.mut2, fontSize: font.sm }}>Abriendo el informe…</div>}
            {abierto && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
                  <div style={{ fontSize: font.sm, color: color.mut2 }}>
                    {abierto.fecha} · {ETIQUETA_LINEA[abierto.linea]} · lo subió {abierto.quien}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => descargar(abierto)}>Descargar</Button>
                </div>
                {/* `sandbox` vacío: sin scripts, sin same-origin, sin formularios. Y el contenido
                    NO va acá — lo pone el efecto de arriba. Ver el encabezado. */}
                <iframe
                  ref={marco}
                  title={abierto.titulo}
                  sandbox=""
                  style={{
                    width: '100%', height: ALTO_MARCO, border: `1px solid ${color.line}`,
                    borderRadius: radius.lg, background: '#fff',
                  }}
                />
              </>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

function FilaInforme({
  inf, activo, puede, ocupada, onAbrir, onEstado, onBorrar,
}: {
  inf: InformeResumen
  activo: boolean
  puede: boolean
  ocupada: boolean
  onAbrir: () => void
  onEstado: () => void
  onBorrar: () => void
}) {
  return (
    <div
      style={{
        border: `1px solid ${activo ? color.brandBorder : color.line}`,
        borderRadius: radius.lg,
        padding: space[3],
        background: activo ? color.brandBg : undefined,
      }}
    >
      <button
        type="button"
        onClick={onAbrir}
        style={{
          all: 'unset', cursor: 'pointer', display: 'block', width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.sm, color: color.mut2 }}>{inf.fecha}</span>
          <span style={{ fontSize: font.sm, color: color.mut2 }}>{ETIQUETA_LINEA[inf.linea]}</span>
          {!inf.publicado && <StatusPill tone="neutral" label="Borrador" />}
        </div>
        <div style={{ fontSize: font.base, fontWeight: weight.semibold, marginTop: space[1] }}>
          {inf.titulo}
        </div>
        {/* El resumen es lo que evita que la lista sea una hilera de fechas y haya que abrirlos de
            a uno para encontrar el que se busca — el defecto que tenía la carpeta. */}
        {inf.resumen && (
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[1], lineHeight: 1.45 }}>
            {inf.resumen}
          </div>
        )}
      </button>

      {puede && (
        <div style={{ display: 'flex', gap: space[1.5], marginTop: space[2] }}>
          <Button variant="ghost" size="sm" disabled={ocupada} onClick={onEstado}>
            {ocupada ? 'Un segundo…' : inf.publicado ? 'Volver a borrador' : 'Publicar'}
          </Button>
          <Button variant="ghost" size="sm" disabled={ocupada} onClick={onBorrar}>Borrar</Button>
        </div>
      )}
    </div>
  )
}
