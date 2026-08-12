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
 * 🔴 **Sin `sandbox`, y la garantía vive en la PUERTA.**
 *
 * El plan era `sandbox` sin `allow-scripts` y que el navegador se ocupara. Medido en producción,
 * con `sandbox` **el marco queda en blanco**: con el informe entero, con 3 KB, con y sin `<style>`,
 * por `srcdoc` y por blob. Sin `sandbox` se ve siempre. Un aislamiento que no deja ver nada no es
 * aislamiento, es la pantalla rota.
 *
 * Así que el «no corre JavaScript» se sostiene donde sí se puede sostener: `validarInforme()`
 * **rechaza** un informe que traiga `<script>`, un manejador en línea, una URL `javascript:` o un
 * marco anidado. Es una condición sobre el texto, se prueba, y no depende de que un atributo se
 * comporte igual en cada navegador. Ver `RIESGOS` en `informes.core.js`.
 *
 * ⚠️ Volver a poner `sandbox` «por las dudas» rompe la pantalla sin un solo error: no hay nada en
 * consola ni en el CI. Se ve mirando, y sólo si uno sabe que ahí tenía que haber algo.
 *
 * El documento entra por `src` con un blob y no por `srcDoc`, porque el blob **declara su
 * codificación**: sin `charset=utf-8` el «·» del informe se lee «Â·».
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
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

/** El charset va SIEMPRE: el blob no hereda la codificación del padre. Ver el encabezado. */
const TIPO_HTML = 'text/html;charset=utf-8'

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

  /** El informe como documento propio. Ver el encabezado: por `srcDoc` el marco sale en blanco. */
  const urlMarco = useMemo(
    () => (abierto ? URL.createObjectURL(new Blob([abierto.html], { type: TIPO_HTML })) : null),
    [abierto],
  )
  // Un blob vive hasta que se lo suelta. Sin esto, leer diez informes deja diez documentos de 40 KB
  // colgados en memoria hasta recargar la pantalla.
  useEffect(() => () => { if (urlMarco) URL.revokeObjectURL(urlMarco) }, [urlMarco])

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
    const url = URL.createObjectURL(new Blob([inf.html], { type: TIPO_HTML }))
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
                {/* ⛔ Sin `sandbox`: con él el marco sale en blanco. El JavaScript lo frena la puerta
                    al guardar, no el navegador al dibujar — ver el encabezado. El `key` fuerza un
                    marco nuevo por informe en vez de mutarle el `src` a uno que ya navegó. */}
                <iframe
                  key={abierto.id}
                  title={abierto.titulo}
                  src={urlMarco ?? undefined}
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
