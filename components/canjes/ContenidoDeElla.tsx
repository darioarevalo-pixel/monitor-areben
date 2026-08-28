'use client'

/**
 * **Lo que subió ella**: las fotos y los videos que la creadora dejó desde su link, y el botón que
 * los manda al archivo definitivo de la marca en Google Drive.
 *
 * # Por qué es un bloque aparte y no una evidencia más
 *
 * Vive en la misma tabla que la prueba de publicación (`canje_evidencias`, con
 * `subido_por: 'persona'`), pero **no es lo mismo y no se maneja igual**:
 *
 *  - Una **evidencia** es la prueba de que publicó: la carga el equipo, se verifica, y sin
 *    verificar no cuenta para el cumplimiento.
 *  - Esto es **material crudo**. Ella no declara qué entregable cumple —eso es un juicio, y los
 *    juicios los hace el equipo—, así que estas filas nacen sueltas y sin verificar. Mezcladas con
 *    las otras se leían como «Sin entregable asociado · Sólo captura», que no dice nada de lo que
 *    son.
 *
 * # 🔴 El buzón no es el archivo: mandar a Drive BORRA la copia del Blob
 *
 * Vercel Blob es donde ella deja el material, y la cuota es la del Vercel de Darío: con videos de
 * creadoras deja de ser teórica rápido. Por eso «Enviar a Drive» no es una copia de respaldo — es
 * **una mudanza**: apenas Drive confirma cada archivo, el servidor lo borra del buzón y la ficha
 * pasa a mostrar el link de Drive en vez de la miniatura. Eso es lo único que le pone techo al
 * espacio, y lo decidió Bruno el 21-ago-2026 sabiendo que se pierden las miniaturas.
 *
 * 🆕 **Y desde el 24-ago-2026 se puede borrar a secas**, que antes no: lo que faltaba no era el
 * botón sino que el servidor borrara **también el archivo del Blob**. Sacar sólo la fila deja los
 * bytes arriba, huérfanos y pagos —lo que le pasó a la galería de Ingresos durante meses—, así que
 * el verbo se arregló en `evidencia-borrar` y recién después apareció acá.
 *
 * ⛔ **No se ofrece sobre lo que ya está en Drive**: ahí el Blob ya se vació y lo único que quedaría
 * por borrar es el registro de dónde fue a parar el material, que es justo lo que no hay que perder.
 */

import { useState } from 'react'
import { Barra, Button, EmptyState, Notice, SectionCard, color, font, space, useConfirmar, weight } from '@/components/ui'
import { archivadaEnDrive, borrarEvidencia, numeroDe } from '@/lib/canjes/cliente'
import { nombreArchivoDrive, nombreCarpetaCanje } from '@/lib/canjes/drive'
import { type CanjeConfig, type CanjeEvidencia, type CanjePersona, type CanjeRow, type CanjeStore } from '@/lib/canjes/tipos'
import { idDeCarpetaDrive } from '@/lib/drive/archivos'
import { carpetaDelCanje, mandarADrive, tokenDeDrive, type AvanceDrive } from '@/lib/drive/subir'

/**
 * Vercel Blob sirve el archivo con `Content-Disposition: attachment` cuando la URL lleva
 * `?download=1`. Sin eso el navegador abre el video en la pestaña en vez de guardarlo, que es justo
 * lo contrario de lo que se quiere acá.
 */
const paraBajar = (url: string) => `${url}${url.includes('?') ? '&' : '?'}download=1`

/** Las que subió ella y traen archivo. El resto de las evidencias no pasa por acá. */
export function contenidoDeElla(evidencias: CanjeEvidencia[]): CanjeEvidencia[] {
  return evidencias.filter((e) => e.subido_por === 'persona' && !!e.archivo_url)
}

type EnCurso = { id: number; fase: AvanceDrive['fase']; pct: number | null }

export function ContenidoDeElla({
  store, canje, persona, config, evidencias, onCambio,
}: {
  store: CanjeStore
  canje: CanjeRow
  persona: CanjePersona | null
  config: CanjeConfig | null
  evidencias: CanjeEvidencia[]
  onCambio: () => void
}) {
  // El orden manda: es el que numera los archivos en Drive (`01-`, `02-`) y tiene que ser el mismo
  // siempre, también cuando se archiva en dos tandas porque un video llegó después.
  const suyas = [...contenidoDeElla(evidencias)].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const pendientes = suyas.filter((e) => !e.drive_url)
  const carpetaMarca = idDeCarpetaDrive(config?.drive_url)

  const [enCurso, setEnCurso] = useState<EnCurso | null>(null)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [mandando, setMandando] = useState(false)
  const { confirmar } = useConfirmar()

  /**
   * Sacar uno del buzón. **Borra el archivo, no la fila sola** (lo hace el servidor), así que la
   * confirmación dice lo que de verdad pasa: no se puede deshacer y el material no está en ningún
   * otro lado todavía.
   */
  async function borrar(e: CanjeEvidencia) {
    const ok = await confirmar({
      titulo: '¿Eliminar este archivo?',
      mensaje: 'Se elimina del buzón y no se puede recuperar: todavía no está en Drive. '
        + 'Si lo que querés es archivarlo, usá «Enviar a Drive».',
      ok: 'Eliminar',
      tono: 'danger',
    })
    if (!ok) return
    setMotivo(null)
    try {
      await borrarEvidencia(store, canje.id, e.id)
      onCambio()
    } catch (err) {
      setMotivo((err as Error)?.message || 'No se pudo eliminar ese archivo.')
    }
  }

  async function mandar() {
    if (!carpetaMarca || !pendientes.length) return
    setMandando(true)
    setMotivo(null)
    try {
      const token = await tokenDeDrive()
      const nombreCarpeta = nombreCarpetaCanje(
        (suyas[0]?.created_at || '').slice(0, 10),
        persona?.instagram || '',
        numeroDe(canje),
      )
      const carpeta = await carpetaDelCanje(carpetaMarca, nombreCarpeta, canje.drive_carpeta_id, token)
      if (!carpeta.ok) { setMotivo(carpeta.motivo); return }

      for (const e of pendientes) {
        setEnCurso({ id: e.id, fase: 'bajando', pct: null })
        // El número sale de la posición en TODA la lista, no entre los pendientes: si no, un archivo
        // que se manda después empezaría otra vez en `01-` y pisaría al primero.
        const nombre = nombreArchivoDrive(suyas.indexOf(e) + 1, e.archivo_url!)
        const r = await mandarADrive(e.archivo_url!, nombre, carpeta.id, token, (a) => setEnCurso({ id: e.id, ...a }))
        if (!r.ok) { setMotivo(r.motivo); return }
        // 🔴 Se avisa **archivo por archivo**, recién cuando Drive confirmó ése: es lo que dispara el
        // borrado del buzón. De a tandas, un corte a la mitad borraría lo que nunca llegó.
        await archivadaEnDrive(store, canje.id, e.id, r.link, carpeta.id)
      }
    } catch (err) {
      setMotivo((err as Error)?.message || 'No se pudo enviar a Drive.')
    } finally {
      setEnCurso(null)
      setMandando(false)
      // Siempre, también cuando algo falló: lo que sí entró ya está archivado y la pantalla tiene
      // que mostrarlo así. Sin esto, reintentar volvería a mandar lo que ya está en Drive.
      onCambio()
    }
  }

  return (
    <SectionCard
      title="Lo que subió ella"
      subtitle="Las fotos y los videos que dejó desde su link, tal cual los mandó"
      actions={
        suyas.length > 0 ? (
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
            {pendientes.length > 0 && carpetaMarca && (
              <Button variant="solid" tone="brand" size="sm" onClick={() => void mandar()} loading={mandando}>
                Mandar a Drive ({pendientes.length})
              </Button>
            )}
            {pendientes.length > 0 && <BajarTodo archivos={pendientes} />}
          </div>
        ) : undefined
      }
    >
      {!suyas.length ? (
        <EmptyState
          dashed
          title="Todavía no subió nada"
          hint="Le aparece en su link apenas el pedido figura entregado. Si hace falta, el recordatorio se lo nombra."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {!carpetaMarca && pendientes.length > 0 && (
            <Notice tone="warning">
              <b>Falta la carpeta de Drive de esta marca.</b> Se carga una vez en Ajustes, pegando el
              link de la carpeta; recién ahí aparece el botón para archivar. Mientras tanto el
              material vive en el buzón, que no es el archivo definitivo.
            </Notice>
          )}
          {motivo && <Notice tone="danger">{motivo}</Notice>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: space[2] }}>
            {suyas.map((e) => (
              <Archivo
                key={e.id}
                ev={e}
                enCurso={enCurso?.id === e.id ? enCurso : null}
                onBorrar={mandando ? undefined : () => void borrar(e)}
              />
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

/**
 * Un archivo, en uno de dos estados que **no son intercambiables**: mientras está en el buzón se ve
 * la miniatura; una vez archivado el archivo ya no existe ahí, así que dibujar la miniatura sería
 * un cuadrado roto. Por eso el archivado muestra el link a Drive y nada más.
 */
function Archivo({
  ev, enCurso, onBorrar,
}: {
  ev: CanjeEvidencia
  enCurso: EnCurso | null
  /** `undefined` mientras se está archivando: borrar a mitad de una tanda es pedir un archivo perdido. */
  onBorrar?: () => void
}) {
  const esVideo = ev.archivo_tipo === 'video'

  if (ev.drive_url) {
    return (
      <div>
        <a
          href={ev.drive_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
            width: '100%', aspectRatio: '1', borderRadius: 8, background: color.bg2,
            border: `1px dashed ${color.line}`, color: color.mut, fontSize: font.sm, padding: space[2],
          }}
        >
          Está en Drive
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[1], marginTop: 4, fontSize: font.sm }}>
          <span style={{ color: color.mut2 }}>{esVideo ? 'Video' : 'Foto'}</span>
          <a href={ev.drive_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', color: color.brand, fontWeight: weight.medium }}>
            Abrir
          </a>
        </div>
      </div>
    )
  }

  return (
    <div>
      <a href={ev.archivo_url!} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
        {esVideo ? (
          // `preload="metadata"` dibuja el primer cuadro sin bajar el video entero: una ficha con
          // ocho reels arriba bajaría cientos de megas al abrirse.
          <video
            src={ev.archivo_url!}
            preload="metadata"
            muted
            playsInline
            style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, background: color.line, display: 'block' }}
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- el Blob no pasa por el
             optimizador de Next, y acá se quiere el archivo original, sin recomprimir. */
          <img
            src={ev.archivo_url!}
            alt=""
            style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, background: color.line, display: 'block' }}
          />
        )}
      </a>
      {enCurso ? (
        <div style={{ marginTop: 4 }}>
          <Barra pct={enCurso.pct ?? 0} tono={color.brand} />
          <span style={{ fontSize: font.sm, color: color.mut2 }}>
            {enCurso.fase === 'bajando' ? 'Bajando…' : 'Subiendo a Drive…'}
            {enCurso.pct != null ? ` ${enCurso.pct}%` : ''}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginTop: 4, fontSize: font.sm }}>
          <span style={{ color: color.mut2 }}>{esVideo ? 'Video' : 'Foto'}</span>
          <a href={paraBajar(ev.archivo_url!)} style={{ marginLeft: 'auto', color: color.brand, fontWeight: weight.medium }}>
            Bajar
          </a>
          {onBorrar && (
            <button
              type="button"
              onClick={onBorrar}
              title="Eliminar este archivo del buzón"
              style={{
                border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                color: color.danger, fontFamily: 'inherit', fontSize: font.sm, fontWeight: weight.medium,
              }}
            >
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Baja los archivos de a uno, con una pausa corta entre cada click.
 *
 * ⚠️ **No arma un ZIP**: eso pediría bajar todo al navegador y volver a comprimirlo, o una función
 * nueva —y el proyecto está en el tope del plan Hobby—. Lo que hace es disparar las descargas una
 * atrás de otra. El navegador puede pedir permiso para «descargar varios archivos» la primera vez;
 * es un click y después no vuelve a preguntar en ese sitio.
 *
 * Sólo ofrece **lo que sigue en el buzón**: lo archivado ya no tiene bytes de este lado.
 */
function BajarTodo({ archivos }: { archivos: CanjeEvidencia[] }) {
  async function bajar() {
    for (const e of archivos) {
      const a = document.createElement('a')
      a.href = paraBajar(e.archivo_url!)
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Sin la pausa, Chrome descarta las descargas que llegan en el mismo tick.
      await new Promise((r) => setTimeout(r, 350))
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={() => void bajar()}>
      Bajar todo ({archivos.length})
    </Button>
  )
}
