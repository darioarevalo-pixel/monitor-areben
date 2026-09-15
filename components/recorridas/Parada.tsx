'use client'

/**
 * **La pantalla de la calle**: una parada de la recorrida, abierta con el celular en la mano
 * adentro de la galería.
 *
 * 🔑 **Está armada para el gesto, no para leer.** Arriba lo que hay que saber parado ahí —qué me
 * interesaba de acá, qué quedó prometido y qué me pareció la última vez— y abajo cuatro botones
 * grandes. ⛔ Nada de esto pide red: todo bajó en el GET de la recorrida.
 *
 * 🔴 **Lo escrito no se pierde si falla el guardado.** En una galería de Avellaneda la señal se
 * cae, y un formulario que se vacía con un error rojo es la última vez que alguien anota algo. Lo
 * tipeado se guarda en `localStorage` por parada mientras se escribe y se limpia recién cuando el
 * servidor confirmó. ⚠️ Esto **no es offline de verdad**: una carga en frío sin señal no abre nada.
 *
 * 🔑 **Una parada puede ser «suelta»** (`recorrida_id` vacío): un local abierto desde la lista o
 * recién cargado en la calle, fuera de un viaje. Ahí la visita se guarda sin `parada_id`.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Field, Input, Lightbox, Notice, SectionCard, color, space } from '@/components/ui'
import { escribir, type ParadaViva } from '@/lib/prm/cliente'
import { abiertosOrdenados, leerPrecio, nuevoId } from '@/lib/prm/core'
import type { Interes } from '@/lib/prm/tipos'
import { SacarFoto } from './SacarFoto'

type Props = {
  marca: string
  parada: ParadaViva
  hoy: string
  onVolver: () => void
  onCambio: () => void
  volverA?: string
}

type Borrador = {
  opinion: string
  puntaje: string
  compre: boolean
  queCompre: string
  /** El producto que se está anotando: se guarda aparte, uno por uno. */
  productoQue: string
  productoPrecio: string
  productoFoto: string
}
const VACIO: Borrador = { opinion: '', puntaje: '', compre: false, queCompre: '', productoQue: '', productoPrecio: '', productoFoto: '' }

const CLAVE = (id: string) => `prm:borrador:${id}`

/** ⚠️ Todo acceso a `localStorage` va en try/catch: en una ventana privada tirar excepción. */
function leerBorrador(id: string): Borrador {
  try {
    const crudo = localStorage.getItem(CLAVE(id))
    return crudo ? { ...VACIO, ...JSON.parse(crudo) } : VACIO
  } catch {
    return VACIO
  }
}

function guardarBorrador(id: string, b: Borrador) {
  try {
    localStorage.setItem(CLAVE(id), JSON.stringify(b))
  } catch {
    /* sin borrador: el formulario sigue andando */
  }
}

function borrarBorrador(id: string) {
  try {
    localStorage.removeItem(CLAVE(id))
  } catch {
    /* nada que hacer */
  }
}

const TONO_SITUACION = { vencido: 'danger', hoy: 'warning', por_venir: 'neutral', sin_fecha: 'neutral', cumplido: 'success' } as const

const miniatura = { width: 64, height: 64, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', flexShrink: 0 } as const

const pesos = (n: number) => `$${n.toLocaleString('es-AR')}`

export function Parada({ marca, parada, hoy, onVolver, onCambio, volverA = 'Volver a la recorrida' }: Props) {
  const local = parada.local
  const [b, setB] = useState<Borrador>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [agregando, setAgregando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fotos, setFotos] = useState<string[]>([])
  // Los productos guardados en esta pantalla: se muestran ya, sin volver a pedir la recorrida.
  const [anotados, setAnotados] = useState<Interes[]>([])
  const [ampliada, setAmpliada] = useState<string | null>(null)

  // Se lee en un efecto y no en el `useState` inicial: `localStorage` no existe en el SSR y leerlo
  // ahí sería un mismatch de hidratación. Y va adentro de una IIFE con bandera `vivo` porque un
  // `setState` sincrónico en el cuerpo del efecto encadena renders y el CI lo marca — el mismo
  // molde que `components/etiquetas/Etiquetas.tsx`.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const guardado = leerBorrador(parada.id)
      if (!vivo) return
      setB(guardado)
      setFotos([])
      setAnotados([])
      setError(null)
    })()
    return () => {
      vivo = false
    }
  }, [parada.id])

  const cambiar = useCallback(
    (patch: Partial<Borrador>) => {
      setB((prev) => {
        const siguiente = { ...prev, ...patch }
        guardarBorrador(parada.id, siguiente)
        return siguiente
      })
    },
    [parada.id],
  )

  const compromisos = abiertosOrdenados(parada.compromisos, hoy)
  const intereses = [...anotados, ...parada.intereses]
  const precio = leerPrecio(b.productoPrecio)

  async function agregarProducto() {
    if (!local) return
    const descripcion = b.productoQue.trim()
    if (!descripcion) return setError('Escribí qué es el producto (por ejemplo «jean wide leg celeste»).')
    if (precio === undefined) return setError(`No entiendo el precio «${b.productoPrecio}». Escribilo como 12500 o 12.500.`)
    setAgregando(true)
    setError(null)
    const fila: Interes = {
      id: nuevoId('pi'),
      local_id: local.id,
      visita_id: null,
      descripcion,
      foto: b.productoFoto || null,
      precio_visto: precio,
      visto_en: hoy,
      marca: marca === 'bdi' || marca === 'zattia' ? marca : null,
      estado: 'mirando',
      nota: null,
      creado_en: new Date().toISOString(),
    }
    try {
      await escribir(marca, 'interes.crear', {
        id: fila.id,
        local_id: fila.local_id,
        descripcion: fila.descripcion,
        foto: fila.foto,
        precio_visto: fila.precio_visto,
        visto_en: fila.visto_en,
        marca: fila.marca,
      })
      setAnotados((a) => [fila, ...a])
      cambiar({ productoQue: '', productoPrecio: '', productoFoto: '' })
    } catch (e) {
      setError(e instanceof Error ? `${e.message} — lo que escribiste quedó acá.` : 'No se pudo guardar. Lo que escribiste quedó acá.')
    } finally {
      setAgregando(false)
    }
  }

  async function anotar() {
    if (!local) return
    setGuardando(true)
    setError(null)
    try {
      await escribir(marca, 'visita.crear', {
        id: nuevoId('pv'),
        local_id: local.id,
        // Una parada suelta no existe en `recorrida_parada`: ⛔ no se manda.
        ...(parada.recorrida_id ? { parada_id: parada.id } : {}),
        fecha: hoy,
        opinion: b.opinion,
        puntaje: b.puntaje || null,
        compre: b.compre,
        que_compre: b.queCompre,
        fotos,
      })
      // Recién ahora: mientras el servidor no confirmó, lo tipeado sigue siendo lo único que existe.
      // El producto a medio anotar ⛔ se conserva: no es parte de la visita.
      const siguiente = { ...VACIO, productoQue: b.productoQue, productoPrecio: b.productoPrecio, productoFoto: b.productoFoto }
      if (siguiente.productoQue || siguiente.productoPrecio || siguiente.productoFoto) guardarBorrador(parada.id, siguiente)
      else borrarBorrador(parada.id)
      setB(siguiente)
      setFotos([])
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Lo que escribiste quedó acá.')
    } finally {
      setGuardando(false)
    }
  }

  async function cerrarCompromiso(id: string) {
    try {
      await escribir(marca, 'compromiso.cumplir', { id, cumplido: true })
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar el compromiso.')
    }
  }

  if (!local) {
    return (
      <div style={{ padding: space[4] }}>
        <Button variant="ghost" onClick={onVolver}>← Volver</Button>
        <Notice tone="danger" style={{ marginTop: space[3] }}>Este local ya no está en el padrón.</Notice>
      </div>
    )
  }

  const comoLlegar =
    local.lat != null && local.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${local.lat},${local.lng}`
      : local.direccion
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${local.direccion}, ${local.localidad}`)}`
        : null

  return (
    <div style={{ display: 'grid', gap: space[3], padding: space[3], maxWidth: 680, margin: '0 auto' }}>
      <Button variant="ghost" onClick={onVolver} style={{ justifySelf: 'start' }}>← {volverA}</Button>

      <div>
        <h2 style={{ margin: 0, fontSize: 20 }}>{local.nombre}</h2>
        <div style={{ color: color.mut, fontSize: 13 }}>
          {[local.galeria, local.direccion, local.entre_calles].filter(Boolean).join(' · ') || 'Sin dirección cargada'}
        </div>
        <div style={{ display: 'flex', gap: space[3], fontSize: 13, marginTop: 2 }}>
          {comoLlegar && (
            <a href={comoLlegar} target="_blank" rel="noreferrer">
              Cómo llegar
            </a>
          )}
          {local.instagram && (
            <a href={`https://instagram.com/${encodeURIComponent(local.instagram)}`} target="_blank" rel="noreferrer">
              @{local.instagram}
            </a>
          )}
        </div>
      </div>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <SectionCard title="Productos que me gustaron">
        <div style={{ display: 'grid', gap: space[3] }}>
          <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
            {b.productoFoto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.productoFoto} alt="" style={miniatura} onClick={() => setAmpliada(b.productoFoto)} />
            )}
            <SacarFoto
              etiqueta={b.productoFoto ? 'Cambiar foto' : 'Sacar foto'}
              onFoto={(url) => cambiar({ productoFoto: url })}
              onError={setError}
            />
          </div>
          <Field label="Qué es">
            <Input
              value={b.productoQue}
              placeholder="jean wide leg celeste"
              onChange={(e) => cambiar({ productoQue: e.target.value })}
              style={{ fontSize: 16 }}
            />
          </Field>
          <Field
            label="Precio"
            hint={precio === undefined ? 'No lo entiendo: escribilo como 12500 o 12.500.' : precio != null ? pesos(precio) : 'Opcional.'}
          >
            <Input
              value={b.productoPrecio}
              inputMode="decimal"
              placeholder="12.500"
              invalid={precio === undefined}
              onChange={(e) => cambiar({ productoPrecio: e.target.value })}
              style={{ fontSize: 16 }}
            />
          </Field>
          <Button onClick={() => void agregarProducto()} disabled={agregando} fullWidth size="lg">
            {agregando ? 'Guardando…' : 'Agregar el producto'}
          </Button>
        </div>
      </SectionCard>

      {intereses.length > 0 && (
        <SectionCard title={`Qué me interesa de acá (${intereses.length})`}>
          <div style={{ display: 'grid', gap: space[2] }}>
            {intereses.map((i) => (
              <div key={i.id} style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
                {i.foto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.foto} alt="" style={miniatura} onClick={() => setAmpliada(i.foto)} />
                )}
                <div style={{ fontSize: 14 }}>
                  {i.descripcion}
                  <div style={{ color: color.mut, fontSize: 12 }}>
                    {i.precio_visto != null ? `${pesos(Number(i.precio_visto))} · ` : ''}visto el {i.visto_en}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {compromisos.length > 0 && (
        <SectionCard title="Lo que quedó prometido">
          {compromisos.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: 6 }}>
              <Badge tone={TONO_SITUACION[c.situacion]}>{c.de_quien === 'yo' ? 'yo' : 'ellos'}</Badge>
              <span style={{ fontSize: 13, flex: 1 }}>
                {c.que}
                <span style={{ color: color.mut, fontSize: 11 }}>
                  {' '}· hace {c.diasEsperando} día(s)
                  {c.situacion === 'vencido' && ` · vencido hace ${c.dias}`}
                </span>
              </span>
              <Button size="sm" variant="outline" onClick={() => void cerrarCompromiso(c.id)}>
                Cumplido
              </Button>
            </div>
          ))}
        </SectionCard>
      )}

      {parada.ultimaVisita && (
        <SectionCard title={`La última vez — ${parada.ultimaVisita.fecha}`}>
          <div style={{ fontSize: 13 }}>{parada.ultimaVisita.opinion || 'Sin opinión anotada.'}</div>
        </SectionCard>
      )}

      <SectionCard title="Lo de hoy">
        <div style={{ display: 'grid', gap: space[3] }}>
          <Field label="Qué me pareció">
            <textarea
              value={b.opinion}
              onChange={(e) => cambiar({ opinion: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: space[2], border: `1px solid ${color.line}`, borderRadius: 8, fontSize: 15 }}
            />
          </Field>
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Puntaje (1 a 5)" width={120}>
              <Input
                type="number"
                min={1}
                max={5}
                value={b.puntaje}
                onChange={(e) => cambiar({ puntaje: e.target.value })}
              />
            </Field>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, paddingBottom: 8 }}>
              <input type="checkbox" checked={b.compre} onChange={(e) => cambiar({ compre: e.target.checked })} />
              Compré
            </label>
          </div>
          {b.compre && (
            <Field
              label="Qué compré"
              hint="Sólo para acordarte. Las unidades y la plata llegan contadas por la orden de compra."
            >
              <Input value={b.queCompre} onChange={(e) => cambiar({ queCompre: e.target.value })} />
            </Field>
          )}

          <div style={{ display: 'grid', gap: space[2] }}>
            {fotos.length > 0 && (
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                {fotos.map((f) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f} src={f} alt="" style={miniatura} onClick={() => setAmpliada(f)} />
                ))}
              </div>
            )}
            <SacarFoto
              etiqueta={fotos.length ? `Sacar otra foto del local (${fotos.length})` : 'Sacar foto del local'}
              onFoto={(url) => setFotos((f) => [...f, url])}
              onError={setError}
            />
          </div>

          <Button onClick={() => void anotar()} disabled={guardando} fullWidth size="lg">
            {guardando ? 'Guardando…' : 'Guardar la visita'}
          </Button>
        </div>
      </SectionCard>

      <Lightbox src={ampliada} alt="" onCerrar={() => setAmpliada(null)} />
    </div>
  )
}
