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
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Field, Input, Notice, SectionCard, color, space } from '@/components/ui'
import { escribir, type ParadaViva } from '@/lib/prm/cliente'
import { abiertosOrdenados, nuevoId } from '@/lib/prm/core'
import { subirBlob } from '@/lib/imagenes'

type Props = {
  marca: string
  parada: ParadaViva
  hoy: string
  onVolver: () => void
  onCambio: () => void
}

type Borrador = { opinion: string; puntaje: string; compre: boolean; queCompre: string }
const VACIO: Borrador = { opinion: '', puntaje: '', compre: false, queCompre: '' }

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

export function Parada({ marca, parada, hoy, onVolver, onCambio }: Props) {
  const local = parada.local
  const [b, setB] = useState<Borrador>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fotos, setFotos] = useState<string[]>([])
  const [subiendo, setSubiendo] = useState(false)

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

  async function sumarFoto(archivo: File | null) {
    if (!archivo) return
    setSubiendo(true)
    setError(null)
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(String(fr.result))
        fr.onerror = () => rej(new Error('No se pudo leer la foto.'))
        fr.readAsDataURL(archivo)
      })
      const url = await subirBlob(dataUrl, 'prm')
      setFotos((f) => [...f, url])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto.')
    } finally {
      setSubiendo(false)
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
        parada_id: parada.id,
        fecha: hoy,
        opinion: b.opinion,
        puntaje: b.puntaje || null,
        compre: b.compre,
        que_compre: b.queCompre,
        fotos,
      })
      // Recién ahora: mientras el servidor no confirmó, lo tipeado sigue siendo lo único que existe.
      borrarBorrador(parada.id)
      setB(VACIO)
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
      <Button variant="ghost" onClick={onVolver} style={{ justifySelf: 'start' }}>← Volver a la recorrida</Button>

      <div>
        <h2 style={{ margin: 0, fontSize: 20 }}>{local.nombre}</h2>
        <div style={{ color: color.mut, fontSize: 13 }}>
          {[local.galeria, local.direccion, local.entre_calles].filter(Boolean).join(' · ') || 'Sin dirección cargada'}
        </div>
        {comoLlegar && (
          <a href={comoLlegar} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
            Cómo llegar
          </a>
        )}
      </div>

      {parada.intereses.length > 0 && (
        <SectionCard title="Qué me interesa de acá">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {parada.intereses.map((i) => (
              <li key={i.id} style={{ fontSize: 13, marginBottom: 4 }}>
                {i.descripcion}
                {i.precio_visto != null && (
                  <span style={{ color: color.mut }}>
                    {' '}— ${i.precio_visto} el {i.visto_en}
                  </span>
                )}
              </li>
            ))}
          </ul>
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

          <div>
            <label>
              <Button variant="outline" disabled={subiendo}>
                {subiendo ? 'Subiendo…' : `Agregar foto${fotos.length ? ` (${fotos.length})` : ''}`}
              </Button>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => void sumarFoto(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {error && <Notice tone="danger">{error}</Notice>}

          <Button onClick={() => void anotar()} disabled={guardando} fullWidth size="lg">
            {guardando ? 'Guardando…' : 'Guardar la visita'}
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}
