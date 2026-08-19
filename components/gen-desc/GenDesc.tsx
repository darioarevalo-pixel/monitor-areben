'use client'

import { useMemo, useState } from 'react'
import {
  Badge, Button, Card, EmptyState, Field, Input, KpiCard, Notice, Select, Toolbar, useToast,
} from '@/components/ui'
import { useSesion } from '@/components/SesionProvider'
import { useGenDesc, type FilaCola, type ProductoTn } from './useGenDesc'
import {
  ETIQUETAS, MAX_BULLET, MAX_PARRAFO, MIN_BULLETS, MAX_BULLETS, generarHtml, validarBorrador,
} from '@/lib/tn-desc/formato'
import type { Borrador } from '@/lib/tn-desc/formato'

/**
 * Redacción: la cola de descripciones de producto.
 *
 * Medido contra Zattia el 19-ago-2026 (369 publicados): **41 sin una sola palabra** —casi
 * todos NEW IN, o sea los ingresos— y **237 con menos de 120 caracteres**, las «6 o 7
 * palabras» que escribe el local. Y no había ningún formato base: de 369, UNO tenía formato
 * rico y convivían tres dialectos.
 *
 * ⛔ Esta pantalla NO escribe en TiendaNube. Guarda el insumo y el borrador aprobado en
 * `tn_descripciones`, y ahí se para. Publicar es otro verbo, en otro repo, y va en su tanda.
 */

const BORRADOR_VACIO: Borrador = { parrafo: '', bullets: [{ etiqueta: 'Tela', texto: '' }, { etiqueta: 'Calce', texto: '' }, { etiqueta: 'Detalle', texto: '' }] }

type Filtro = 'sin-desc' | 'corta' | 'con-insumo' | 'aprobados' | 'todos'

const FILTROS: { v: Filtro; label: string }[] = [
  { v: 'sin-desc', label: 'Sin descripción' },
  { v: 'corta', label: 'Descripción corta' },
  { v: 'con-insumo', label: 'Con insumo cargado' },
  { v: 'aprobados', label: 'Aprobados' },
  { v: 'todos', label: 'Todos los publicados' },
]

export function GenDesc() {
  // La marca sale de la sesión, no de una prop: así entra al registro de secciones como
  // cualquier otra pantalla (el molde es `GenTalles`).
  const { marca } = useSesion()
  const { cargando, productos, cola, puedePublicar, error, refrescar, guardar } = useGenDesc(marca)
  const [filtro, setFiltro] = useState<Filtro>('sin-desc')
  const [abierto, setAbierto] = useState<string | null>(null)
  const toast = useToast()

  const publicados = useMemo(() => productos.filter((p) => p.published), [productos])

  const stats = useMemo(
    () => ({
      sinDesc: publicados.filter((p) => p.prosa.banda === 'nada').length,
      corta: publicados.filter((p) => p.prosa.banda === 'corta').length,
      conInsumo: publicados.filter((p) => (cola[p.id]?.insumo || '').trim()).length,
      aprobados: publicados.filter((p) => cola[p.id]?.estado === 'aprobado').length,
    }),
    [publicados, cola],
  )

  const lista = useMemo(() => {
    const f = publicados.filter((p) => {
      const fila = cola[p.id]
      if (filtro === 'sin-desc') return p.prosa.banda === 'nada'
      if (filtro === 'corta') return p.prosa.banda === 'corta'
      if (filtro === 'con-insumo') return !!(fila?.insumo || '').trim()
      if (filtro === 'aprobados') return fila?.estado === 'aprobado'
      return true
    })
    // Primero los mudos: son los que hoy salen a la calle sin decir nada.
    return f.sort((a, b) => a.prosa.largo - b.prosa.largo || a.name.localeCompare(b.name))
  }, [publicados, cola, filtro])

  if (error) return <Notice tone="danger">{error}</Notice>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Notice tone="neutral">
        Acá se prepara el texto: se carga el <b>insumo</b> (3 o 4 palabras: la tela y el detalle que
        la foto no dice) y se escribe el borrador con el formato base. <b>Nada sale a la tienda desde
        esta pantalla</b> — publicar es un paso aparte que todavía no está.
      </Notice>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <KpiCard label="Sin descripción" value={stats.sinDesc} tone="danger" activo={filtro === 'sin-desc'} onClick={() => setFiltro('sin-desc')} />
        <KpiCard label="Descripción corta" value={stats.corta} tone="warning" activo={filtro === 'corta'} onClick={() => setFiltro('corta')} />
        <KpiCard label="Con insumo" value={stats.conInsumo} tone="neutral" activo={filtro === 'con-insumo'} onClick={() => setFiltro('con-insumo')} />
        <KpiCard label="Aprobados" value={stats.aprobados} tone="success" activo={filtro === 'aprobados'} onClick={() => setFiltro('aprobados')} />
      </div>

      <Toolbar>
        <Field label="Ver">
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            {FILTROS.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Button variant="outline" onClick={() => void refrescar()} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Traer de TiendaNube'}
        </Button>
        {!puedePublicar && <Badge tone="neutral">Sólo podés cargar el insumo</Badge>}
      </Toolbar>

      {cargando && !productos.length && <Card>Cargando el catálogo…</Card>}

      {!cargando && !lista.length && (
        <EmptyState title="No queda ninguno acá" hint="Probá con otro filtro." />
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {lista.slice(0, 200).map((p) => (
          <FilaProducto
            key={p.id}
            p={p}
            fila={cola[p.id]}
            abierto={abierto === p.id}
            onAbrir={() => setAbierto(abierto === p.id ? null : p.id)}
            puedePublicar={puedePublicar}
            onGuardar={async (cuerpo) => {
              const err = await guardar({ tn_id: p.id, nombre: p.name, ...cuerpo })
              toast[err ? 'error' : 'ok'](err || 'Guardado.')
              return err
            }}
          />
        ))}
      </div>
      {lista.length > 200 && <Notice tone="neutral">Se muestran 200 de {lista.length}. Afiná el filtro.</Notice>}
    </div>
  )
}

function FilaProducto({
  p, fila, abierto, onAbrir, puedePublicar, onGuardar,
}: {
  p: ProductoTn
  fila: FilaCola | undefined
  abierto: boolean
  onAbrir: () => void
  puedePublicar: boolean
  onGuardar: (cuerpo: Record<string, unknown>) => Promise<string | null>
}) {
  const [insumo, setInsumo] = useState(fila?.insumo || '')
  const [borrador, setBorrador] = useState<Borrador>(fila?.borrador || BORRADOR_VACIO)
  const [guardando, setGuardando] = useState(false)

  const problemas = useMemo(
    () => validarBorrador(borrador, { variantes: p.variantes, insumo, nombre: p.name }),
    [borrador, p.variantes, p.name, insumo],
  )
  const vacio = !borrador.parrafo.trim() && borrador.bullets.every((b) => !b.texto.trim())

  const setBullet = (i: number, campo: 'etiqueta' | 'texto', v: string) =>
    setBorrador((b) => ({ ...b, bullets: b.bullets.map((x, j) => (j === i ? { ...x, [campo]: v } : x)) }))

  const correr = async (cuerpo: Record<string, unknown>) => {
    setGuardando(true)
    await onGuardar(cuerpo)
    setGuardando(false)
  }

  return (
    <Card>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }} onClick={onAbrir}>
        {p.imagenes[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imagenes[0].src} alt="" width={44} height={55} style={{ objectFit: 'cover', borderRadius: 4 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{p.name}</b>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
            {p.prosa.banda === 'nada' ? 'sin una palabra' : `${p.prosa.largo} caracteres`}
            {p.categories.length > 0 && ` · ${p.categories.join(' / ')}`}
          </div>
        </div>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {p.prosa.banda === 'nada' && <Badge tone="danger">Sin descripción</Badge>}
          {p.prosa.banda === 'corta' && <Badge tone="warning">Corta</Badge>}
          {fila?.estado === 'aprobado' && <Badge tone="success">Aprobado</Badge>}
          {fila?.estado === 'borrador' && <Badge tone="neutral">Borrador</Badge>}
          {!!(fila?.insumo || '').trim() && fila?.estado !== 'aprobado' && <Badge tone="neutral">Con insumo</Badge>}
        </span>
      </div>

      {abierto && (
        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Lo que dice hoy en la tienda</div>
            <div style={{ fontSize: 13, color: p.prosa.largo ? '#222' : '#a00', background: '#fafafa', padding: 10, borderRadius: 6 }}>
              {p.prosa.texto || '(nada)'}
            </div>
          </div>

          <Field label="Insumo del local" hint="3 o 4 palabras: la tela y el detalle que la foto no dice. Ej: «gasa, botones nacarados».">
            <Input value={insumo} onChange={(e) => setInsumo(e.target.value)} placeholder="gasa, botones nacarados" />
          </Field>
          <div>
            <Button size="sm" disabled={guardando} onClick={() => void correr({ op: 'insumo', insumo })}>
              Guardar el insumo
            </Button>
          </div>

          {puedePublicar && (
            <>
              <hr style={{ border: 0, borderTop: '1px solid #eee' }} />
              <Field label={`Párrafo (máximo ${MAX_PARRAFO})`} hint="Una o dos frases. No nombres colores ni talles: los muestra el selector de variantes.">
                <Input value={borrador.parrafo} onChange={(e) => setBorrador((b) => ({ ...b, parrafo: e.target.value }))} />
              </Field>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  Bullets ({MIN_BULLETS} a {MAX_BULLETS}, máximo {MAX_BULLET} caracteres cada uno)
                </div>
                {borrador.bullets.map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <Select value={b.etiqueta} onChange={(e) => setBullet(i, 'etiqueta', e.target.value)} style={{ width: 130 }}>
                      {ETIQUETAS.map((et) => (
                        <option key={et} value={et}>{et}</option>
                      ))}
                    </Select>
                    <Input value={b.texto} onChange={(e) => setBullet(i, 'texto', e.target.value)} placeholder="gasa liviana con caída" />
                    <Button variant="ghost" size="sm" onClick={() => setBorrador((x) => ({ ...x, bullets: x.bullets.filter((_, j) => j !== i) }))}>
                      ✕
                    </Button>
                  </div>
                ))}
                {borrador.bullets.length < MAX_BULLETS && (
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => setBorrador((x) => ({ ...x, bullets: [...x.bullets, { etiqueta: 'Detalle', texto: '' }] }))}>
                      + Agregar bullet
                    </Button>
                  </div>
                )}
              </div>

              {!vacio && problemas.length > 0 && (
                <Notice tone="warning">
                  <b>Falta corregir:</b>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {problemas.map((x, i) => (
                      <li key={i}>
                        <b>{x.campo}</b>: {x.motivo}
                      </li>
                    ))}
                  </ul>
                </Notice>
              )}

              {!vacio && problemas.length === 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Cómo va a quedar</div>
                  <div
                    style={{ border: '1px solid #eee', borderRadius: 6, padding: 10 }}
                    dangerouslySetInnerHTML={{ __html: generarHtml(borrador) }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="outline" disabled={guardando || vacio} onClick={() => void correr({ op: 'borrador', borrador })}>
                  Guardar el borrador
                </Button>
                <Button
                  size="sm"
                  disabled={guardando || vacio || problemas.length > 0 || !fila?.borrador}
                  onClick={() => void correr({ op: 'aprobar' })}
                >
                  Aprobar
                </Button>
              </div>
              {!fila?.borrador && !vacio && (
                <div style={{ fontSize: 12, color: '#666' }}>Para aprobar, primero guardá el borrador.</div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  )
}
