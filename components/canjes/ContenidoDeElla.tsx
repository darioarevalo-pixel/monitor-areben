'use client'

/**
 * **Lo que subió ella**: las fotos y los videos que la creadora dejó desde su link.
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
 * ⚠️ **Sólo se mira y se baja.** No hay borrar: el archivo vive en el Blob y borrar la fila lo
 * dejaría arriba, huérfano y pago — que es exactamente lo que le pasó a la galería de Ingresos
 * durante meses. Qué hacer con el archivo cuando el material ya está archivado en Drive se decide
 * junto con esa conexión, que es la tanda que sigue.
 */

import { Button, EmptyState, SectionCard, color, font, space, weight } from '@/components/ui'
import type { CanjeEvidencia } from '@/lib/canjes/tipos'

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

export function ContenidoDeElla({ evidencias }: { evidencias: CanjeEvidencia[] }) {
  const suyas = contenidoDeElla(evidencias)

  return (
    <SectionCard
      title="Lo que subió ella"
      subtitle="Las fotos y los videos que dejó desde su link, tal cual los mandó"
      actions={suyas.length > 0 ? <BajarTodo archivos={suyas} /> : undefined}
    >
      {!suyas.length ? (
        <EmptyState
          dashed
          title="Todavía no subió nada"
          hint="Le aparece en su link apenas el pedido figura entregado. Si hace falta, el recordatorio se lo nombra."
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: space[2] }}>
          {suyas.map((e) => (
            <div key={e.id}>
              <a href={e.archivo_url!} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                {e.archivo_tipo === 'video' ? (
                  // `preload="metadata"` dibuja el primer cuadro sin bajar el video entero: una
                  // ficha con ocho reels arriba bajaría cientos de megas al abrirse.
                  <video
                    src={e.archivo_url!}
                    preload="metadata"
                    muted
                    playsInline
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, background: color.line, display: 'block' }}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element -- el Blob no pasa por el
                     optimizador de Next, y acá se quiere el archivo original, sin recomprimir. */
                  <img
                    src={e.archivo_url!}
                    alt=""
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, background: color.line, display: 'block' }}
                  />
                )}
              </a>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[1], marginTop: 4, fontSize: font.sm }}>
                <span style={{ color: color.mut2 }}>{e.archivo_tipo === 'video' ? 'Video' : 'Foto'}</span>
                <a
                  href={paraBajar(e.archivo_url!)}
                  style={{ marginLeft: 'auto', color: color.brand, fontWeight: weight.medium }}
                >
                  Bajar
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

/**
 * Baja los archivos de a uno, con una pausa corta entre cada click.
 *
 * ⚠️ **No arma un ZIP**: eso pediría bajar todo al navegador y volver a comprimirlo, o una función
 * nueva —y el proyecto está en el tope del plan Hobby—. Lo que hace es disparar las descargas una
 * atrás de otra. El navegador puede pedir permiso para «descargar varios archivos» la primera vez;
 * es un click y después no vuelve a preguntar en ese sitio.
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
