'use client'

/**
 * La ficha de un producto: cada color con su foto en grande, uno debajo del otro.
 *
 * Es la mitad del trabajo que ninguna automatización puede hacer. La pantalla puede afirmar
 * que dos colores comparten la misma foto (es el mismo archivo) y sospechar cuando el nombre
 * del archivo desentona, pero **no puede mirar una foto y decir de qué color es**. Si alguien
 * pegó la foto de la violeta al color azul, y cada una es un archivo distinto con nombre
 * razonable, eso solo lo ve un ojo humano — y para eso hace falta ver el color y su foto
 * juntos, en grande.
 *
 * Se llega acá de dos maneras: cayendo desde la lista ordenada por impacto, o buscando el
 * producto directo. Por eso es una sola pantalla y no dos.
 *
 * Todo lo que se toca acá **escribe en la tienda en vivo**, así que cada acción se confirma
 * antes: vincular muestra la foto elegida en grande con un "Vincular" explícito, y quitar pasa
 * por el diálogo del kit.
 */

import { useState } from 'react'
import { Badge, Button, Modal, Notice, color as paleta, font, space, useConfirmar, useToast } from '@/components/ui'
import { fichaDe, huellaDe, type ColorEnFicha } from '@/lib/tncat/auditoria'
import type { IndiceStock } from '@/lib/tncat/stock-variante'
import { referenciaDe, type FilaAuditoria } from '@/lib/tncat/prioridad'
import type { ImagenFchk } from '@/lib/tncat/tipos'
import type { Marca } from '@/lib/nav'
import { linkProducto } from '@/lib/tienda'
import { FotoTn } from './FotoTn'

export type AccionFicha = {
  /** Vincula la foto al color. Devuelve el mensaje de error, o null si salió bien. */
  vincular: (color: string, imagen: ImagenFchk) => Promise<string | null>
  /** Quita la foto del color. Devuelve el mensaje de error, o null si salió bien. */
  quitar: (color: string) => Promise<string | null>
  verificar: (huella: string) => Promise<string | null>
  desverificar: () => Promise<string | null>
}

export function FichaProducto({
  fila,
  marca,
  acciones,
  stockGn,
  posicion,
  anteriorId,
  siguienteId,
  onIr,
  onCerrar,
}: {
  fila: FilaAuditoria
  marca: Marca
  acciones: AccionFicha
  /** Stock de GN por código. Sin esto la ficha sale igual, solo sin unidades. */
  stockGn?: IndiceStock
  /** Dónde está parado dentro de la lista. `null` si se llegó por fuera (el buscador). */
  posicion?: { indice: number; total: number } | null
  anteriorId?: string | null
  siguienteId?: string | null
  /** Salta a otro producto sin cerrar la ficha. */
  onIr?: (id: string) => void
  onCerrar: () => void
}) {
  const p = fila.producto
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [guardando, setGuardando] = useState(false)
  const colores = fichaDe(p, stockGn)
  const imgs = p.imagenes || []
  const libres = new Set(fila.estado.fotosLibres.map((f) => String(f.id)))
  /** Encadenar es lo que hace terminable una cola de 288: se revisa sin volver a la lista. */
  const encadena = !!(siguienteId && onIr)

  const verificar = async () => {
    // Verificar un producto que todavía tiene un error PROBADO (misma foto en dos colores, o
    // ninguna foto) no lo saca de la lista: contra un hecho el ojo no tiene nada que aportar, y
    // esconderlo bajaría el tablero sin arreglar nada. Se avisa antes para que el botón no
    // parezca roto.
    if (!fila.verificado && (fila.estado.choques.length > 0 || fila.estado.sinNingunaFoto)) {
      const ok = await confirmar({
        titulo: 'Todavía queda un problema sin arreglar',
        mensaje: fila.estado.sinNingunaFoto
          ? 'Este producto no tiene ninguna foto cargada. Se puede marcar como revisado, pero va a seguir en la lista hasta que tenga fotos.'
          : 'Este producto todavía tiene la misma foto en dos colores. Se puede marcar como revisado, pero va a seguir en la lista —y contando en el tablero— hasta que se le dé a cada color la suya.',
        ok: 'Marcar igual',
        tono: 'warning',
      })
      if (!ok) return
    }
    setGuardando(true)
    const err = fila.verificado ? await acciones.desverificar() : await acciones.verificar(huellaDe(p))
    setGuardando(false)
    if (err) return toast.error(err)
    toast.ok(fila.verificado ? 'Vuelve a la lista para revisar.' : 'Marcado como revisado.')
    if (fila.verificado) return
    // Al verificar, este producto sale de la lista. Si hay uno atrás se salta directo —el id se
    // calculó antes, así que el corrimiento no lo afecta—; si era el último, se cierra.
    if (encadena) onIr!(siguienteId!)
    else onCerrar()
  }

  const quitar = async (color: string) => {
    const ok = await confirmar({
      titulo: `Quitar la foto de ${color}`,
      mensaje:
        'La variante queda sin foto propia y la tienda pasa a mostrar la foto principal del producto, ' +
        'que en los productos con varios colores muestra la gama completa. Es mejor eso que un color equivocado.',
      ok: 'Quitar foto',
      tono: 'danger',
    })
    if (!ok) return
    setGuardando(true)
    const err = await acciones.quitar(color)
    setGuardando(false)
    if (err) toast.error(err)
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      ancho="ancho"
      titulo={
        <div>
          <div style={{ fontSize: font.lg, fontWeight: 700 }}>{p.name}</div>
          <div style={{ fontSize: font.sm, color: paleta.mut2, fontWeight: 400, marginTop: 2 }}>{referenciaDe(p)}</div>
        </div>
      }
      pie={
        <>
          <div style={{ display: 'flex', gap: space[3], alignItems: 'center', marginRight: 'auto', flexWrap: 'wrap' }}>
            {posicion && (
              <span style={{ fontSize: font.sm, color: paleta.mut2 }}>
                {posicion.indice} de {posicion.total}
              </span>
            )}
            {onIr && (anteriorId || siguienteId) && (
              <span style={{ display: 'flex', gap: 4 }}>
                <Button size="sm" variant="ghost" disabled={!anteriorId || guardando} onClick={() => onIr(anteriorId!)} title="Producto anterior">
                  ←
                </Button>
                <Button size="sm" variant="ghost" disabled={!siguienteId || guardando} onClick={() => onIr(siguienteId!)} title="Producto siguiente, sin marcar este">
                  →
                </Button>
              </span>
            )}
            {p.handle && (
              <a
                href={linkProducto(marca, p.handle) || undefined}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: font.sm, color: paleta.brand, alignSelf: 'center' }}
              >
                Ver en la tienda ↗
              </a>
            )}
          </div>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button
            tone={fila.verificado ? 'neutral' : 'success'}
            variant={fila.verificado ? 'soft' : 'solid'}
            loading={guardando}
            onClick={() => void verificar()}
          >
            {fila.verificado ? 'Marcar para revisar de nuevo' : encadena ? 'Verificado y siguiente →' : 'Verificado, está bien'}
          </Button>
        </>
      }
    >
      {fila.cambioDesdeRevision && (
        <Notice tone="warning" style={{ marginBottom: space[3] }}>
          <b>Esto cambió después de la última revisión.</b> Alguien cargó o revinculó una foto, así que lo que se dio
          por bueno ya no vale. Miralo de nuevo y volvé a marcarlo.
        </Notice>
      )}

      {fila.estado.choques.length > 0 && (
        <Notice tone="danger" style={{ marginBottom: space[3] }}>
          <b>Hay una foto repartida entre varios colores.</b> Todos menos uno están mostrando la funda equivocada —
          quien compra por color recibe otra cosa. Abajo están marcados.
        </Notice>
      )}

      {fila.estado.sinNingunaFoto ? (
        <Notice tone="danger" style={{ marginBottom: space[3] }}>
          <b>Este producto no tiene ninguna foto cargada.</b> En la tienda se ve en blanco. Hasta que tenga fotos no hay
          nada para pegarle a cada color.
        </Notice>
      ) : (
        fila.estado.cola === 'fotografia' && (
          <Notice tone="warning" style={{ marginBottom: space[3] }}>
            <b>Acá no hay nada para vincular.</b> Todas las fotos del producto ya están en uso: falta fotografiar los
            colores que quedaron sin la suya.
          </Notice>
        )
      )}

      {!colores.length ? (
        <div style={{ padding: space[4], color: paleta.mut2, fontSize: font.sm }}>
          Este producto no tiene el color adentro de la variante, así que no hay forma de que se mezcle: todas sus
          fotos son del mismo color.
        </div>
      ) : (
        colores.map((c) => (
          <RenglonColor
            key={c.color}
            c={c}
            imgs={imgs}
            libres={libres}
            deshabilitado={guardando}
            onVincular={async (img) => {
              setGuardando(true)
              const err = await acciones.vincular(c.color, img)
              setGuardando(false)
              if (err) toast.error(err)
              return !err
            }}
            onQuitar={() => void quitar(c.color)}
          />
        ))
      )}
    </Modal>
  )
}

/**
 * Los valores del segundo eje, en una línea. Con pocos se listan enteros —"iPhone 13, 14, 15"—
 * y con muchos se corta, porque la línea es una referencia y no un inventario. Si el producto
 * no trae valores (payload viejo cacheado), cae a contar variantes.
 */
const TOPE_ETIQUETAS = 6
function resumirEtiquetas(etiquetas: string[], variantes: number): string {
  if (!etiquetas.length) return variantes === 1 ? '1 variante' : `${variantes} variantes`
  if (etiquetas.length <= TOPE_ETIQUETAS) return etiquetas.join(' · ')
  return `${etiquetas.slice(0, TOPE_ETIQUETAS).join(' · ')} y ${etiquetas.length - TOPE_ETIQUETAS} más`
}

/**
 * Las variantes que quedaron sin foto, con sus unidades: `iPhone 15 (34 u), iPhone 16 (12 u)`.
 * Sin dato de stock va el nombre solo — nunca "(0 u)", que se leería como que no hay.
 */
function listarConUnidades(etiquetas: string[], porEtiqueta?: Map<string, number | undefined>): string {
  return etiquetas
    .map((e) => {
      const u = porEtiqueta?.get(e)
      return u === undefined ? e : `${e} (${u.toLocaleString('es-AR')} u)`
    })
    .join(', ')
}

/** Un color: su foto en grande a la izquierda y el estado + acciones a la derecha. */
function RenglonColor({
  c,
  imgs,
  libres,
  deshabilitado,
  onVincular,
  onQuitar,
}: {
  c: ColorEnFicha
  imgs: ImagenFchk[]
  libres: Set<string>
  deshabilitado: boolean
  onVincular: (img: ImagenFchk) => Promise<boolean>
  onQuitar: () => void
}) {
  // `null` = el elegidor cerrado. Con una imagen adentro = esperando que confirmen ESA foto.
  const [eligiendo, setEligiendo] = useState(false)
  const [candidata, setCandidata] = useState<ImagenFchk | null>(null)
  /**
   * La foto ampliada, para poder decidir de qué color es.
   *
   * Se agranda en el mismo lugar y no en un visor flotante a propósito: el `Modal` del kit
   * escucha Escape en `document`, así que un modal adentro del modal se cerraría de a dos.
   */
  const [ampliada, setAmpliada] = useState(false)
  const lado = ampliada ? 420 : 176

  // La foto que este color ya tiene, como imagen del producto (para poder re-vincularla). El
  // cruce va por URL porque es lo que trae la variante; están comprobadas idénticas.
  const fotoActual = c.foto ? (imgs.find((im) => im.src === c.foto) ?? null) : null

  const borde = c.comparteCon.length ? paleta.dangerBorder : !c.foto ? paleta.warningBorder : paleta.line
  const fondo = c.comparteCon.length ? paleta.dangerBg : !c.foto ? paleta.warningBg : paleta.surface

  return (
    <div style={{ border: `1px solid ${borde}`, background: fondo, borderRadius: 10, padding: space[3], marginBottom: space[2] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start' }}>
        {c.foto ? (
          <FotoTn
            src={c.foto}
            alt={c.color}
            ancho={lado}
            // Ampliada se pide la original: es lo que se está mirando para decidir el color.
            original={ampliada}
            title={ampliada ? 'Tocá para achicarla' : 'Tocá para verla en grande'}
            onClick={() => setAmpliada((v) => !v)}
            style={{
              width: lado,
              height: lado,
              objectFit: 'cover',
              borderRadius: 8,
              border: `2px solid ${c.comparteCon.length ? paleta.danger : paleta.successBorder}`,
              flex: '0 0 auto',
              background: paleta.bg2,
              cursor: ampliada ? 'zoom-out' : 'zoom-in',
              maxWidth: '100%',
            }}
          />
        ) : (
          <div
            style={{
              width: 176,
              height: 176,
              borderRadius: 8,
              border: `2px dashed ${paleta.line2}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: paleta.mut2,
              fontSize: font.sm,
              textAlign: 'center',
              flex: '0 0 auto',
            }}
          >
            sin foto
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: font.base, fontWeight: 700 }}>{c.color}</span>
            {/* Se listan los valores tal como los tiene la tienda —"iPhone 13", "M"— en vez de
                ponerles un nombre: el segundo eje es el modelo en fundas y el talle en ropa, y
                cualquier palabra que se elija va a estar mal en una de las dos marcas. */}
            <span style={{ fontSize: font.sm, color: paleta.mut2 }}>{resumirEtiquetas(c.etiquetas, c.variantes)}</span>
            {/* Las unidades son lo que decide si vale la pena: un color agotado y uno con 1.200
                unidades se veían exactamente igual. Salen de Gestión Nube (local + depósito), no
                del stock de TiendaNube, que es de un solo depósito y distinto por marca. */}
            {c.unidades !== undefined ? (
              <span style={{ fontSize: font.sm, color: c.unidades > 0 ? paleta.ink2 : paleta.mut2, fontWeight: c.unidades > 0 ? 600 : 400 }}>
                · {c.unidades.toLocaleString('es-AR')} u
              </span>
            ) : (
              <span style={{ fontSize: font.xs, color: paleta.mut2 }} title="No se pudo cruzar esta variante con Gestión Nube por SKU ni por código de barras">
                · sin dato de stock
              </span>
            )}
          </div>

          {c.foto && c.variantesSinFoto > 0 && (
            <div style={{ fontSize: font.sm, color: paleta.warningInk, marginTop: space[2] }}>
              {/* Cuáles, no cuántas: para completarlas hay que saber a cuáles ir. Y con las
                  unidades al lado se ve de una si alguna vale más que las otras. */}
              {c.etiquetasSinFoto.length
                ? <>Le falta esta foto a: <b>{listarConUnidades(c.etiquetasSinFoto, c.porEtiqueta)}</b>. En la tienda muestran la principal del producto.</>
                : <>A <b>{c.variantesSinFoto}</b> de {c.variantes} no se les pegó esta foto: en la tienda muestran la principal del producto.</>}
            </div>
          )}

          {c.comparteCon.length > 0 && (
            <div style={{ marginTop: space[2] }}>
              <Badge tone="danger">Comparte la foto con {c.comparteCon.join(', ')}</Badge>
              <div style={{ fontSize: font.sm, color: paleta.mut, marginTop: 3 }}>
                Solo uno de estos colores puede ser el de la foto. Miralá y dejásela al que corresponde.
              </div>
            </div>
          )}

          {c.sospecha && (
            <div style={{ marginTop: space[2] }}>
              <Badge tone="warning">El archivo se llama «{c.sospecha.archivo}»</Badge>
              <div style={{ fontSize: font.sm, color: paleta.mut, marginTop: 3 }}>
                Puede ser solo que el archivo quedó con el nombre viejo. Confirmalo mirando la foto.
              </div>
            </div>
          )}

          {!c.foto && (
            <div style={{ fontSize: font.sm, color: paleta.warningInk, marginTop: space[2] }}>
              Este color no tiene ninguna foto propia: la tienda le muestra la principal del producto.
            </div>
          )}

          <div style={{ display: 'flex', gap: space[2], marginTop: space[3], flexWrap: 'wrap' }}>
            {/* Completar los modelos que quedaron sin la foto es la acción más frecuente y la
                que no tenía botón: había que entrar a "Cambiar la foto" y volver a elegir la
                misma, que no se le ocurre a nadie. Vincular escribe sobre TODAS las variantes
                del color, así que re-pegar la que ya está llena los huecos y no toca el resto. */}
            {fotoActual && c.variantesSinFoto > 0 && (
              <Button
                size="sm"
                variant="solid"
                tone="brand"
                loading={deshabilitado}
                onClick={() => void onVincular(fotoActual)}
                title="Le pega esta misma foto a las variantes que quedaron sin ella"
              >
                Ponerle esta foto a {c.variantesSinFoto === 1 ? 'el que falta' : `los ${c.variantesSinFoto} que faltan`}
              </Button>
            )}
            <Button
              size="sm"
              variant="soft"
              disabled={deshabilitado || !imgs.length}
              onClick={() => {
                setCandidata(null)
                setEligiendo((v) => !v)
              }}
              title={imgs.length ? undefined : 'El producto no tiene ninguna foto cargada'}
            >
              {eligiendo ? 'Cancelar' : c.foto ? 'Cambiar la foto' : 'Elegir la foto'}
            </Button>
            {c.foto && (
              <Button size="sm" variant="ghost" tone="danger" disabled={deshabilitado} onClick={onQuitar}>
                Quitar foto
              </Button>
            )}
          </div>
        </div>
      </div>

      {eligiendo && (
        <div style={{ marginTop: space[3], paddingTop: space[3], borderTop: `1px solid ${paleta.line}` }}>
          {candidata ? (
            // Confirmación en el mismo lugar: la foto elegida en grande, con el botón que dice
            // exactamente qué va a pasar. Escribe en la tienda en vivo.
            <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <FotoTn
                src={candidata.src}
                ancho={260}
                style={{ width: 260, maxWidth: '100%', borderRadius: 8, border: `1px solid ${paleta.line}`, background: paleta.bg2 }}
              />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: font.sm, color: paleta.ink2, marginBottom: space[2] }}>
                  ¿Esta es la foto de <b>{c.color}</b>? Se escribe en la tienda al confirmar.
                </div>
                <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                  <Button size="sm" variant="ghost" onClick={() => setCandidata(null)}>
                    Elegir otra
                  </Button>
                  <Button
                    size="sm"
                    variant="solid"
                    tone="brand"
                    loading={deshabilitado}
                    onClick={async () => {
                      if (await onVincular(candidata)) {
                        setCandidata(null)
                        setEligiendo(false)
                      }
                    }}
                  >
                    Vincular a {c.color}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: font.sm, color: paleta.mut, marginBottom: space[2] }}>
                Tocá la foto de <b>{c.color}</b>. Las marcadas en índigo no las está usando ningún color.
              </div>
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                {imgs.map((im) => (
                  <FotoTn
                    key={im.id}
                    src={im.src}
                    ancho={96}
                    onClick={() => setCandidata(im)}
                    title={libres.has(String(im.id)) ? 'Ningún color la está usando' : 'Ya la usa otro color'}
                    style={{
                      width: 96,
                      height: 96,
                      objectFit: 'cover',
                      borderRadius: 7,
                      cursor: 'pointer',
                      border: `2px solid ${libres.has(String(im.id)) ? paleta.brandSolid : paleta.line2}`,
                      flex: '0 0 auto',
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
