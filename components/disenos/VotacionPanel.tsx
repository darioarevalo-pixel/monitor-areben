'use client'

/**
 * Las rondas de votación: abrir una, pasar el link, y leer quién puso qué.
 *
 * 🔑 **Es una pestaña, no un modal.** Hasta ago-2026 esto se abría con un botón de la barra y los
 * resultados quedaban dos clics adentro de un diálogo. Y se notó: la única ronda que existía tuvo
 * 10 votantes y un ranking limpio de 5,00 a 1,29 — y **ningún diseño se movió a Confirmado**. El
 * resultado no llegaba a ser una decisión porque no estaba donde se decide.
 *
 * Por eso además de salir del modal, la tabla de resultados gana **«Confirmar los N mejores»**: el
 * verbo que convierte el ranking en una decisión, que es lo único que no existía.
 *
 * ⛔ **Los resultados NO se escriben en el documento del diseño.** Son derivados: viven en
 * `disenos_votos` y se calculan al leer. Esto es a propósito y arregla el defecto de la votación
 * anterior, que al traer los votos **pisaba** los 👍/👎 que el equipo había puesto a mano en la
 * oficina. Son dos cosas distintas: los 👍/👎 son el voto rápido de la mesa, esto es la ronda.
 * De paso evita devolver el tablero entero —con las fotos— a la base en cada refresco.
 */

import { useCallback, useEffect, useState } from 'react'
import { promedio as calcPromedio, quienesVotaron, ranking, resumen, sinNingunVoto, MAX_PUNTAJE } from '@/lib/disenos/votacion.core.js'
import {
  borrarRonda,
  cerrarRonda,
  crearRonda,
  estaAbierta,
  leerResultados,
  leerRondas,
  leerToken,
  linkDeVotacion,
  type Boleta,
  type Ronda,
  type RondaConDisenos,
} from '@/lib/disenos/votacion'
import { textoPromedio } from '@/lib/disenos/core'
import type { Diseno } from '@/lib/disenos/tipos'
import type { Marca } from '@/lib/nav.datos'
import { Badge, Button, CopyButton, EmptyState, Input, Notice, Select, TBody, THead, TableWrap, Td, Th, Tr, color, space, useConfirmar, useToast } from '@/components/ui'

type Vista = { modo: 'lista' } | { modo: 'nueva' } | { modo: 'resultados'; ronda: RondaConDisenos; boletas: Boleta[] }

export function VotacionPanel({
  marca,
  disenos,
  onCambio,
  onConfirmar,
}: {
  marca: Marca
  disenos: Diseno[]
  /** Crear, cerrar o borrar una ronda cambia el ★ del tablero: se avisa para que se recargue. */
  onCambio: () => void
  /** Manda los ids al tablero como confirmados. Es la salida del ranking. */
  onConfirmar: (ids: string[]) => void
}) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [rondas, setRondas] = useState<Ronda[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>({ modo: 'lista' })
  const [titulo, setTitulo] = useState('')
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [linkNuevo, setLinkNuevo] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    try {
      const rs = await leerRondas(marca)
      setRondas(rs)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [marca])

  // El setState va dentro del await y no en el cuerpo del effect: el linter del repo rechaza el
  // setState síncrono ahí (dispara renders en cascada). Mismo patrón que el resto de las secciones.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      await recargar()
      if (vivo) setCargando(false)
    })()
    return () => { vivo = false }
  }, [recargar])

  const empezarNueva = () => {
    setTitulo(`Diseños ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long' })}`)
    // Arranca con los "por revisar" tildados: es lo que se manda a votar el 90% de las veces, y
    // el que quiera otra cosa destilda. Si no hay ninguno, arranca vacío y elige a mano.
    setElegidos(new Set(disenos.filter((d) => d.estado === 'revisar').map((d) => d.id)))
    setLinkNuevo(null)
    setVista({ modo: 'nueva' })
  }

  const crear = async () => {
    setCreando(true)
    try {
      const { link } = await crearRonda(
        marca,
        titulo,
        disenos.map((d) => ({ id: d.id, name: d.name, url: d.url })),
        [...elegidos],
      )
      setLinkNuevo(link)
      await recargar()
      onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setCreando(false)
    }
  }

  const verResultados = async (r: Ronda) => {
    try {
      const { ronda, boletas } = await leerResultados(marca, r.id)
      setVista({ modo: 'resultados', ronda, boletas })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const cerrar = async (r: Ronda) => {
    const ok = await confirmar({
      titulo: 'Cerrar la votación',
      tono: 'warning',
      ok: 'Cerrar',
      mensaje: 'El link deja de abrir para todo el mundo y nadie más puede votar ni corregir su voto. Los votos que ya están quedan y los seguís viendo acá.',
    })
    if (!ok) return
    try {
      await cerrarRonda(marca, r.id)
      await recargar()
      onCambio()
      toast.ok('Votación cerrada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const borrar = async (r: Ronda) => {
    const ok = await confirmar({
      titulo: 'Borrar la ronda',
      tono: 'danger',
      ok: `Borrar y perder ${r.votantes} ${r.votantes === 1 ? 'voto' : 'votos'}`,
      mensaje: `Se borra la ronda "${r.titulo || 'sin título'}" y ${r.votantes === 0 ? 'no hay votos que perder' : `los votos de ${r.votantes} ${r.votantes === 1 ? 'persona' : 'personas'}`}. No se puede deshacer. Los diseños del tablero no se tocan.`,
    })
    if (!ok) return
    try {
      await borrarRonda(marca, r.id)
      setVista({ modo: 'lista' })
      await recargar()
      onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      {error && <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>{error}</Notice>}

      {vista.modo === 'nueva' && (
        <Nueva
          titulo={titulo}
          setTitulo={setTitulo}
          disenos={disenos}
          elegidos={elegidos}
          setElegidos={setElegidos}
          creando={creando}
          link={linkNuevo}
          onCrear={() => void crear()}
          onVolver={() => setVista({ modo: 'lista' })}
        />
      )}

      {vista.modo === 'resultados' && (
        <Resultados
          ronda={vista.ronda}
          boletas={vista.boletas}
          onVolver={() => setVista({ modo: 'lista' })}
          onRefrescar={() => void verResultados(vista.ronda)}
          onConfirmar={onConfirmar}
        />
      )}

      {vista.modo === 'lista' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3] }}>
            <div style={{ fontSize: 13, color: color.ink2 }}>
              Generá un link, pasalo por WhatsApp y el equipo puntúa cada diseño del 1 al {MAX_PUNTAJE} desde el celular.
            </div>
            <Button variant="solid" tone="brand" onClick={empezarNueva} style={{ marginLeft: 'auto', flex: 'none' }}>
              Nueva ronda
            </Button>
          </div>

          {cargando && !rondas.length ? (
            <div style={{ color: color.mut2, fontSize: 13, padding: space[3] }}>Cargando rondas…</div>
          ) : !rondas.length ? (
            <EmptyState icon="🗳" title="Todavía no hay ninguna ronda" hint="Creá una para que el equipo puntúe los diseños desde su celular." dashed />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
              {rondas.map((r) => (
                <Fila
                  key={r.id}
                  r={r}
                  marca={marca}
                  expandida={abierta === r.id}
                  onExpandir={() => setAbierta(abierta === r.id ? null : r.id)}
                  onResultados={() => void verResultados(r)}
                  onCerrar={() => void cerrar(r)}
                  onBorrar={() => void borrar(r)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

function Fila({ r, marca, expandida, onExpandir, onResultados, onCerrar, onBorrar }: { r: Ronda; marca: Marca; expandida: boolean; onExpandir: () => void; onResultados: () => void; onCerrar: () => void; onBorrar: () => void }) {
  const viva = estaAbierta(r)
  const vence = new Date(r.token_vence)
  return (
    <div style={{ border: `1px solid ${color.line}`, borderRadius: 10, padding: space[3], background: color.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{r.titulo || 'Sin título'}</div>
          <div style={{ fontSize: 12, color: color.mut }}>
            {r.nDisenos} {r.nDisenos === 1 ? 'diseño' : 'diseños'} ·{' '}
            {/* El cero afirma: "nadie votó todavía" no es lo mismo que "0 votos" perdido en una fila. */}
            {r.votantes === 0 ? 'nadie votó todavía' : `${r.votantes} ${r.votantes === 1 ? 'persona votó' : 'personas votaron'}`}
            {r.creada_por ? ` · la abrió ${r.creada_por}` : ''}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {viva ? (
            <Badge tone="success" subtle>Abierta · vence el {vence.toLocaleDateString('es-AR')}</Badge>
          ) : (
            <Badge tone="neutral" subtle>{r.cerrada_at ? 'Cerrada' : 'Vencida'}</Badge>
          )}
          <Button size="sm" variant="outline" onClick={onResultados}>Resultados</Button>
          <Button size="sm" variant="ghost" onClick={onExpandir}>{expandida ? 'Ocultar' : 'Más'}</Button>
        </div>
      </div>

      {expandida && (
        <div style={{ marginTop: space[3], display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {viva ? (
            <>
              {/* El token no viaja en el listado: se pide de a uno, y sólo cuando alguien va a
                  copiar el link. Mismo criterio que el link del cliente en Reclamos. */}
              <CopyButton
                label="Copiar el link"
                share
                getText={async () => linkDeVotacion(await leerToken(marca, r.id))}
              />
              <Button size="sm" variant="ghost" tone="warning" onClick={onCerrar}>Cerrar la votación</Button>
            </>
          ) : (
            <div style={{ fontSize: 12, color: color.mut }}>El link ya no abre. Los votos quedan y se ven en Resultados.</div>
          )}
          <Button size="sm" variant="ghost" tone="danger" onClick={onBorrar} style={{ marginLeft: 'auto' }}>Borrar la ronda</Button>
        </div>
      )}
    </div>
  )
}

function Nueva({ titulo, setTitulo, disenos, elegidos, setElegidos, creando, link, onCrear, onVolver }: { titulo: string; setTitulo: (v: string) => void; disenos: Diseno[]; elegidos: Set<string>; setElegidos: (s: Set<string>) => void; creando: boolean; link: string | null; onCrear: () => void; onVolver: () => void }) {
  const alternar = (id: string) => {
    const s = new Set(elegidos)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setElegidos(s)
  }

  if (link) {
    return (
      <div>
        <Notice tone="success" icon="✓" style={{ marginBottom: space[3] }}>
          Ronda creada con {elegidos.size} {elegidos.size === 1 ? 'diseño' : 'diseños'}. Pasá este link por WhatsApp: quien lo abra puntúa desde el celular, sin cuenta.
        </Notice>
        <div style={{ display: 'flex', gap: 6 }}>
          <input readOnly value={link} onClick={(e) => e.currentTarget.select()} style={{ flex: 1, fontSize: 12, padding: 9, border: `1px solid ${color.line2}`, borderRadius: 8 }} />
          <CopyButton label="Copiar" share getText={() => link} />
        </div>
        <Button variant="outline" onClick={onVolver} style={{ marginTop: space[3] }}>Ver las rondas</Button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: space[3] }}>
        <label htmlFor="vot-titulo" style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Título de la ronda</label>
        <Input id="vot-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Lo ve quien abre el link" maxLength={120} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2], flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          Qué diseños entran{' '}
          <span style={{ fontWeight: 400, color: color.mut }}>
            ({elegidos.size} de {disenos.length} elegidos)
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Button size="sm" variant="ghost" onClick={() => setElegidos(new Set(disenos.filter((d) => d.estado === 'revisar').map((d) => d.id)))}>Los por revisar</Button>
          <Button size="sm" variant="ghost" onClick={() => setElegidos(new Set(disenos.map((d) => d.id)))}>Todos</Button>
          <Button size="sm" variant="ghost" onClick={() => setElegidos(new Set())}>Ninguno</Button>
        </div>
      </div>

      {!disenos.length ? (
        <EmptyState icon="🖼" title="El tablero está vacío" hint="Cargá diseños antes de armar una ronda." dashed />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8, maxHeight: 320, overflowY: 'auto', padding: 2 }}>
          {disenos.map((d) => {
            const on = elegidos.has(d.id)
            return (
              <button
                key={d.id}
                onClick={() => alternar(d.id)}
                aria-pressed={on}
                style={{ padding: 0, border: `2px solid ${on ? color.brandSolid : color.line}`, borderRadius: 9, overflow: 'hidden', background: color.surface, cursor: 'pointer', textAlign: 'left', opacity: on ? 1 : 0.55 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.url} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block', background: color.bg2 }} />
                <div style={{ fontSize: 11, padding: '4px 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.name}>
                  {on ? '✓ ' : ''}{d.name || '—'}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: space[2], marginTop: space[3] }}>
        <Button variant="ghost" onClick={onVolver}>Volver</Button>
        <Button variant="solid" tone="brand" onClick={onCrear} disabled={!elegidos.size || creando} style={{ marginLeft: 'auto' }}>
          {creando ? 'Creando…' : `Crear el link con ${elegidos.size}`}
        </Button>
      </div>
    </div>
  )
}

function Resultados({ ronda, boletas, onVolver, onRefrescar, onConfirmar }: { ronda: RondaConDisenos; boletas: Boleta[]; onVolver: () => void; onRefrescar: () => void; onConfirmar: (ids: string[]) => void }) {
  const { confirmar } = useConfirmar()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [cuantos, setCuantos] = useState(10)
  const res = ranking(resumen(ronda, boletas))
  const sinVotos = sinNingunVoto(res)
  const nombres = quienesVotaron(boletas)
  // El promedio de la ronda entera: sirve para saber si el lote gustó o no, más allá del orden.
  const general = calcPromedio(boletas.flatMap((b) => Object.values(b.puntajes || {})))
  // ⛔ Los que nadie votó no son candidatos: un promedio nulo no es un cero, es "no se sabe".
  const conVotos = res.filter((d) => d.promedio != null)
  const tope = Math.min(cuantos, conVotos.length)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3], flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{ronda.titulo || 'Sin título'}</div>
          <div style={{ fontSize: 12, color: color.mut }}>
            {/* Qué se contó, y qué le falta adentro. Sin esto un ranking de 14 con 3 sin votar se
                lee como si los 14 hubieran competido. */}
            {boletas.length === 0
              ? 'Todavía no votó nadie.'
              : `Votaron ${boletas.length} ${boletas.length === 1 ? 'persona' : 'personas'}${nombres.length ? `: ${nombres.join(', ')}` : ''}.`}
            {' '}
            {res.length} {res.length === 1 ? 'diseño' : 'diseños'} en la ronda
            {sinVotos ? ` · ${sinVotos} sin ningún voto` : ''}
            {general != null ? ` · promedio general ${textoPromedio(general)}` : ''}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Button size="sm" variant="outline" onClick={onRefrescar}>Refrescar</Button>
          <Button size="sm" variant="ghost" onClick={onVolver}>Volver</Button>
        </div>
      </div>

      {/*
        🔑 La salida del ranking, y el único agregado de verdad de esta pantalla.
        Sin esto, la votación termina en una tabla que hay que trasladar a mano al tablero de a un
        clic por diseño — y medido: con 10 votantes y 34 diseños puntuados, no se trasladó ninguno.
        Los que nadie votó NO entran nunca, por más que se pida un número más grande que la lista.
      */}
      {conVotos.length > 0 && (
        <Notice tone="brand" style={{ marginBottom: space[3] }}>
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Pasar al tablero como <b>confirmados</b> los</span>
            <Select
              value={String(tope)}
              onChange={(e) => setCuantos(Number(e.target.value))}
              style={{ width: 90 }}
              aria-label="Cuántos confirmar"
            >
              {[3, 5, 10, 15, 20, conVotos.length].filter((n, i, a) => n <= conVotos.length && a.indexOf(n) === i).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
            <span>mejores de la ronda.</span>
            <span style={{ color: color.mut, fontSize: 12 }}>
              {tope === conVotos.length ? 'Son todos los que alguien votó' : `Del ★ ${textoPromedio(conVotos[0].promedio)} al ★ ${textoPromedio(conVotos[tope - 1].promedio)}`}
              {sinVotos ? ` · los ${sinVotos} sin votos no entran` : ''}
            </span>
            <Button
              size="sm"
              variant="solid"
              tone="brand"
              style={{ marginLeft: 'auto' }}
              onClick={() => void (async () => {
                const elegidos = conVotos.slice(0, tope)
                const ok = await confirmar({
                  titulo: `Confirmar ${tope} ${tope === 1 ? 'diseño' : 'diseños'}`,
                  ok: `Confirmar ${tope === 1 ? 'el mejor' : 'los ' + tope}`,
                  mensaje: `Pasan a «Confirmados» en el tablero, para todo el equipo: ${elegidos.map((d) => d.name || 'sin nombre').join(', ')}.`,
                })
                if (ok) onConfirmar(elegidos.map((d) => d.id))
              })()}
            >
              Confirmar {tope === 1 ? 'el mejor' : 'los ' + tope}
            </Button>
          </div>
        </Notice>
      )}

      {!res.length ? (
        <EmptyState icon="🗳" title="La ronda no tiene diseños" dashed />
      ) : (
        <TableWrap maxHeight={420}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead>
              <Tr>
                <Th width={44}>#</Th>
                <Th>Diseño</Th>
                <Th align="right" width={90}>Promedio</Th>
                <Th align="right" width={70}>Votos</Th>
                <Th width={130}>Cómo se repartió</Th>
                <Th width={70} />
              </Tr>
            </THead>
            <TBody>
              {res.map((d, i) => [
                <Tr key={d.id}>
                  <Td>{d.promedio == null ? '—' : i + 1}</Td>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.url} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 5, background: color.bg2, flex: 'none' }} />
                      <span style={{ fontWeight: 500 }}>{d.name || '—'}</span>
                    </div>
                  </Td>
                  <Td align="right" strong>
                    {d.promedio == null ? <span style={{ color: color.mut2, fontWeight: 400 }}>sin votos</span> : `★ ${textoPromedio(d.promedio)}`}
                  </Td>
                  <Td align="right">{d.n}</Td>
                  <Td><Reparto dist={d.distribucion} n={d.n} /></Td>
                  <Td>
                    {d.n > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => setAbierto(abierto === d.id ? null : d.id)}>
                        {abierto === d.id ? 'Ocultar' : 'Quién'}
                      </Button>
                    )}
                  </Td>
                </Tr>,
                // El desglose va en un renglón PROPIO y a todo el ancho, no adentro de la última
                // celda: ahí entra en 70 px y con cuatro votantes se lee cortado.
                abierto === d.id ? (
                  <Tr key={d.id + '-quien'}>
                    <Td colSpan={6}>
                      <div style={{ fontSize: 12, color: color.ink2, lineHeight: 1.6, padding: '2px 0 6px' }}>
                        {boletas
                          .filter((b) => b.puntajes?.[d.id])
                          .sort((a, b) => (b.puntajes[d.id] || 0) - (a.puntajes[d.id] || 0))
                          .map((b) => `${b.nombre || 'Sin nombre'} ★${b.puntajes[d.id]}`)
                          .join('  ·  ')}
                      </div>
                    </Td>
                  </Tr>
                ) : null,
              ])}
            </TBody>
          </table>
        </TableWrap>
      )}
    </div>
  )
}

/** La distribución 1–5. Un 4,0 parejo y un 4,0 de "la mitad lo ama y la mitad lo odia" son el
 *  mismo promedio, y esta barrita es lo único que los distingue. */
function Reparto({ dist, n }: { dist: number[]; n: number }) {
  if (!n) return <span style={{ color: color.mut2, fontSize: 11 }}>—</span>
  const tonos = [color.danger, color.warning, color.mut2, color.brandSolid, color.success]
  return (
    <div style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden', background: color.bg2 }} title={dist.map((c, i) => `${i + 1}★: ${c}`).join(' · ')}>
      {dist.map((c, i) => (c ? <div key={i} style={{ width: `${(c / n) * 100}%`, background: tonos[i] }} /> : null))}
    </div>
  )
}
