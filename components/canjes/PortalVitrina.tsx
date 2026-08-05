'use client'

/**
 * El paso 1 del link de la creadora: la vitrina y lo que elige de ella.
 *
 * Sale de `CanjePortal` —que se queda con el estado (carrito, formulario) y el paso de datos—
 * porque aquel ya tenía 579 líneas. **Es un componente, no una ruta**: no cuenta como función
 * serverless, que es lo que está contado hasta el tope en este proyecto.
 *
 * Los estilos son propios y no el kit del Monitor, por lo mismo que dice el encabezado del portal:
 * esto lo abre alguien de afuera, en un teléfono, y sin sesión. Por la misma razón no se importa
 * `lib/canjes/tipos.ts` (1.091 líneas) para reusar `opcionEnCriollo`: es un helper de una línea y
 * el chunk público no tiene por qué arrastrar el panel entero.
 *
 * Tres cosas que valen la explicación:
 *
 *   - **El filtro de arriba es puro cliente.** Los `valores` de cada opción ya viajan congelados en
 *     la respuesta del portal, así que reconocer el eje (modelo de celular o talle) no cuesta ni
 *     una llamada más. Ver `facetaDeLaVitrina`.
 *   - **La hoja desde abajo** reemplaza a los chips que empujaban la grilla: con veinte productos,
 *     abrir uno movía todo lo demás de lugar. Y con el filtro puesto lista sólo lo que matchea, así
 *     que para la mayoría de las fundas es tocar el producto y "Agregar".
 *   - **El tope se dibuja acá pero lo hace cumplir el servidor** (`seVaDelTope`). Lo de esta
 *     pantalla es para que no llegue hasta el error.
 */

import { useEffect, useMemo, useState } from 'react'
import { FotoTn } from '@/components/tncat/FotoTn'
import { facetaDeLaVitrina, fotosParaVer, itemPasa, opcionPasa } from '@/lib/canjes/vitrina'
import { PortalFotos } from './PortalFotos'

/** Una variante, como la manda la tienda: `['iPhone 12']`, `['Negro', 'XS']`. */
export type Opcion = { id: string; valores: string[]; foto: string | null }

export type ProductoVitrina = {
  id: number
  nombre: string
  foto: string | null
  /** Las demás fotos del producto. Vacío en las vitrinas armadas antes del 5-ago-2026. */
  fotos?: string[]
  /** Sólo cuando el acuerdo es por monto: en modo unidades no viaja ni un peso. */
  pvp?: number | null
  opciones: Opcion[]
}

export type Vitrina = {
  titulo: string
  /** `false` = ya eligió, o el pedido ya se está preparando. Se muestra en lectura. */
  abierta: boolean
  modo: 'unidades' | 'monto'
  tope: number | null
  /** Lo ya consumido del tope, contando lo que el equipo le haya cargado. */
  usado: number
  items: ProductoVitrina[]
}

/** Lo que arma en el carrito. Se manda así: el resto lo pone el servidor desde la vitrina. */
export type Eleccion = { item_id: number; opcion_id: string; cantidad: number }

const enCriollo = (valores: string[]) => (valores || []).filter(Boolean).join(' · ')

/** Los ± del carrito. 34 px porque abajo de eso el dedo no le pega. */
const contador: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 999, border: '1px solid #d1d5db',
  background: '#fff', color: '#1c1c1e', fontSize: 18, lineHeight: 1, cursor: 'pointer',
}

/** Los del ± de la hoja, más grandes: es el único gesto de esa pantalla. */
const contadorGrande: React.CSSProperties = { ...contador, width: 42, height: 42, fontSize: 22 }

const chip = (activo: boolean): React.CSSProperties => ({
  border: `1px solid ${activo ? '#4f46e5' : '#d1d5db'}`,
  background: activo ? '#4f46e5' : '#fff',
  color: activo ? '#fff' : '#1c1c1e',
  borderRadius: 999, padding: '8px 14px', fontSize: 14, cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: activo ? 600 : 400,
})

export function PortalVitrina({
  marca, vitrina, carrito, restante, cuantosEntran, sumar, restar, onSeguir,
}: {
  marca: string
  vitrina: Vitrina
  carrito: Eleccion[]
  /** `null` = sin tope. Es lo que queda después de lo ya usado y de lo que lleva en el carrito. */
  restante: number | null
  /** Cuántos más de este producto entran en lo que queda. */
  cuantosEntran: (item: ProductoVitrina) => number
  sumar: (item: ProductoVitrina, opcion: Opcion, cantidad: number) => void
  restar: (e: Eleccion) => void
  onSeguir: () => void
}) {
  const plata = vitrina.modo === 'monto'

  /** El eje por el que puede filtrar, si se reconoce alguno. Con menos de dos valores no hay. */
  const faceta = useMemo(() => facetaDeLaVitrina(vitrina.items), [vitrina.items])
  const [elegido, setElegido] = useState<string | null>(null)

  /** El producto con la hoja abierta, la opción marcada y cuántos lleva. */
  const [abierto, setAbierto] = useState<ProductoVitrina | null>(null)
  const [opcionId, setOpcionId] = useState<string | null>(null)
  const [cuantos, setCuantos] = useState(1)

  /**
   * El producto que se está mirando en grande. Vive **acá y no adentro del visor** porque esta
   * pantalla es la dueña de las dos capas: si el visor tuviera su propio listener de Escape, los dos
   * correrían y un Escape cerraría también la hoja, con lo elegido adentro.
   */
  const [mirando, setMirando] = useState<ProductoVitrina | null>(null)
  const fotosDeLoQueMira = mirando
    ? fotosParaVer(mirando.foto, mirando.fotos, mirando.opciones.find((o) => o.id === opcionId)?.foto)
    : []

  const visibles = useMemo(
    () => vitrina.items.filter((i) => itemPasa(i, faceta, elegido)),
    [vitrina.items, faceta, elegido],
  )

  const porProducto = useMemo(() => {
    const m = new Map<number, number>()
    for (const e of carrito) m.set(e.item_id, (m.get(e.item_id) || 0) + e.cantidad)
    return m
  }, [carrito])

  const total = carrito.reduce((a, e) => a + e.cantidad, 0)

  /** Las opciones que le quedan a la vista con el filtro puesto. Si es una sola, va marcada. */
  const opcionesDeLaHoja = useMemo(
    () => (abierto ? abierto.opciones.filter((o) => opcionPasa(o.valores, faceta, elegido)) : []),
    [abierto, faceta, elegido],
  )

  const abrir = (item: ProductoVitrina) => {
    const opciones = item.opciones.filter((o) => opcionPasa(o.valores, faceta, elegido))
    setAbierto(item)
    setOpcionId(opciones.length === 1 ? opciones[0].id : null)
    setCuantos(1)
  }
  const cerrar = () => { setAbierto(null); setOpcionId(null); setCuantos(1) }

  // Escape cierra la capa de arriba: primero el visor de fotos, después la hoja. Nada de `confirm()`
  // acá ni en ningún lado del portal: un diálogo del navegador bloquea la pantalla y ella no tiene a
  // quién preguntarle qué pasó.
  //
  // ⚠️ El visor NO registra su propio listener, y por eso este `if` es la única defensa: dos
  // listeners sobre `window` corren los dos, `stopPropagation` no los separa, y un Escape cerraría
  // las dos capas de una — con lo que había elegido adentro.
  useEffect(() => {
    if (!abierto && !mirando) return
    const alTecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (mirando) setMirando(null)
      else cerrar()
    }
    window.addEventListener('keydown', alTecla)
    return () => window.removeEventListener('keydown', alTecla)
  }, [abierto, mirando])

  const topeDeLaHoja = abierto ? Math.max(1, cuantosEntran(abierto)) : 1

  const agregar = () => {
    const opcion = abierto?.opciones.find((o) => o.id === opcionId)
    if (!abierto || !opcion) return
    sumar(abierto, opcion, Math.min(cuantos, topeDeLaHoja))
    cerrar()
  }

  return (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>¡Hola! Somos {marca}</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
        Elegí lo que más te guste. Después te pedimos la dirección y listo.
      </p>

      {/* Cuánto le queda, siempre a la vista: es la única regla que tiene que entender. */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 2, background: '#eef2ff', color: '#3730a3',
        borderRadius: 10, padding: '10px 14px', fontSize: 15, fontWeight: 600, marginBottom: 16,
      }}
      >
        {vitrina.tope == null
          ? 'Elegí lo que quieras'
          : plata
            ? `Te quedan $${Math.max(0, restante ?? 0).toLocaleString('es-AR')} de $${vitrina.tope.toLocaleString('es-AR')}`
            : `Te ${(restante ?? 0) === 1 ? 'queda' : 'quedan'} ${Math.max(0, restante ?? 0)} de ${vitrina.tope}`}
      </div>

      {/* El filtro. Se nombra la faceta sólo porque se la reconoció por la forma del valor; cuando
          no se reconoce ninguna, acá no hay nada — antes que un filtro con un nombre inventado. */}
      {faceta && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
            {faceta.clase === 'modelo' ? '¿Qué celular tenés?' : '¿Qué talle usás?'}
          </div>
          {faceta.valores.length > 8 ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={elegido || ''}
                onChange={(e) => setElegido(e.target.value || null)}
                style={{
                  flex: 1, padding: 12, fontSize: 16, borderRadius: 10, border: '1px solid #d1d5db',
                  background: '#fff', color: '#1c1c1e', fontFamily: 'inherit',
                }}
              >
                <option value="">Ver todo</option>
                {faceta.valores.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button onClick={() => setElegido(null)} style={chip(!elegido)}>Ver todo</button>
              {faceta.valores.map((v) => (
                <button key={v} onClick={() => setElegido(v)} style={chip(elegido === v)}>{v}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {carrito.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Lo que elegiste</h2>
          {carrito.map((e) => {
            const item = vitrina.items.find((i) => i.id === e.item_id)
            const opcion = item?.opciones.find((o) => o.id === e.opcion_id)
            return (
              <div
                key={`${e.item_id}-${e.opcion_id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}
              >
                <div style={{ flex: 1, fontSize: 14, lineHeight: 1.35 }}>
                  {item?.nombre}
                  <div style={{ color: '#6b7280', fontSize: 13 }}>{enCriollo(opcion?.valores || [])}</div>
                </div>
                <button onClick={() => restar(e)} style={contador} aria-label="Sacar uno">−</button>
                <span style={{ minWidth: 18, textAlign: 'center', fontSize: 15 }}>{e.cantidad}</span>
              </div>
            )
          })}
        </div>
      )}

      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>{vitrina.titulo || 'Para elegir'}</h2>

      {visibles.length === 0 ? (
        <div style={{ background: '#f5f5f7', borderRadius: 10, padding: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 15, marginBottom: 10 }}>
            {faceta?.clase === 'talle' ? 'No hay nada de ese talle' : 'No hay nada para ese modelo'}
          </div>
          <button onClick={() => setElegido(null)} style={chip(false)}>Ver todo</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {visibles.map((item) => {
            const lleno = cuantosEntran(item) < 1
            const lleva = porProducto.get(item.id) || 0
            return (
              <button
                key={item.id}
                onClick={() => abrir(item)}
                disabled={lleno}
                style={{
                  position: 'relative', width: '100%', opacity: lleno ? 0.45 : 1,
                  border: `1px solid ${lleva ? '#4f46e5' : '#e5e7eb'}`,
                  background: '#fff', borderRadius: 12, padding: 6, textAlign: 'left',
                  cursor: lleno ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                <div style={{ position: 'relative', aspectRatio: '1 / 1', background: '#f5f5f7', borderRadius: 8, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                  {item.foto
                    ? <FotoTn src={item.foto} alt={item.nombre} ancho={150} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: '#9ca3af', fontSize: 12 }}>sin foto</span>}
                  {/* Ver la foto en grande sin abrir la compra. La tarjeta entera es un botón que
                      abre la hoja, así que esto frena el click; y son 40 px porque abajo de eso el
                      dedo le pega a la tarjeta y termina en el carrito sin haberlo pedido. */}
                  {item.foto && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setMirando(item) }}
                      aria-label={`Ver las fotos de ${item.nombre}`}
                      style={{
                        position: 'absolute', bottom: 6, right: 6, width: 40, height: 40,
                        borderRadius: 999, border: 'none', background: 'rgba(0,0,0,.45)', color: '#fff',
                        fontSize: 17, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
                      }}
                    >
                      ⤢
                    </button>
                  )}
                </div>
                {/* La chapita: hasta ahora no había ninguna señal de "esto ya lo elegí" y con veinte
                    fotos iguales de fundas se elegía dos veces la misma sin darse cuenta. */}
                {lleva > 0 && (
                  <span style={{
                    position: 'absolute', top: 10, right: 10, background: '#4f46e5', color: '#fff',
                    borderRadius: 999, minWidth: 24, height: 24, fontSize: 13, fontWeight: 700,
                    display: 'grid', placeItems: 'center', padding: '0 6px',
                  }}
                  >
                    {lleva}
                  </span>
                )}
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.3, color: '#1c1c1e' }}>{item.nombre}</div>
                {plata && item.pvp != null && (
                  <div style={{ fontSize: 13, color: '#6b7280' }}>${Number(item.pvp).toLocaleString('es-AR')}</div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Barra fija: con la grilla larga, el botón de seguir quedaba a diez scrolls de donde estaba
          mirando. El hueco de abajo del contenido existe para que no tape el último renglón. */}
      <div style={{ height: 90 }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 3, background: '#fff',
        borderTop: '1px solid #e5e7eb', padding: 12,
      }}
      >
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 14, color: '#6b7280' }}>
            {total ? `${total} elegido${total === 1 ? '' : 's'}` : 'Nada elegido'}
          </div>
          <button
            onClick={onSeguir}
            disabled={!total}
            style={{
              flex: 1, padding: 15, fontSize: 16, fontWeight: 600, borderRadius: 10,
              border: 'none', cursor: total ? 'pointer' : 'not-allowed',
              background: total ? '#4f46e5' : '#d1d5db', color: '#fff',
            }}
          >
            {total ? 'Seguir' : 'Elegí al menos uno'}
          </button>
        </div>
      </div>

      {/* La hoja desde abajo. Las opciones van con la palabra que usa la tienda: adentro de un
          producto el eje es desconocido y decir "modelo" o "color" sería mentira la mitad de las
          veces. La faceta de arriba es otra cosa: ahí se reconoció la forma del valor. */}
      {abierto && (
        <div
          onClick={cerrar}
          style={{
            position: 'fixed', inset: 0, zIndex: 10, background: 'rgba(0,0,0,.4)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 520, background: '#fff', borderRadius: '16px 16px 0 0',
              maxHeight: '80vh', overflowY: 'auto', padding: 18,
            }}
          >
            <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
              {/* La foto de la hoja se toca y se ve grande: acá ella ya decidió mirar este producto,
                  así que es el camino natural. La chapita ⤢ existe porque una foto que se puede
                  tocar y no lo parece es una foto que nadie toca. */}
              <button
                onClick={() => setMirando(abierto)}
                aria-label={`Ver las fotos de ${abierto.nombre}`}
                disabled={!(abierto.opciones.find((o) => o.id === opcionId)?.foto || abierto.foto)}
                style={{
                  position: 'relative', width: 120, height: 120, flexShrink: 0, background: '#f5f5f7',
                  borderRadius: 10, overflow: 'hidden', display: 'grid', placeItems: 'center',
                  border: 'none', padding: 0, cursor: 'zoom-in',
                }}
              >
                {(abierto.opciones.find((o) => o.id === opcionId)?.foto || abierto.foto)
                  ? (
                    <>
                      <FotoTn
                        src={(abierto.opciones.find((o) => o.id === opcionId)?.foto || abierto.foto) as string}
                        alt={abierto.nombre}
                        ancho={240}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <span style={{
                        position: 'absolute', bottom: 4, right: 4, width: 30, height: 30,
                        borderRadius: 999, background: 'rgba(0,0,0,.45)', color: '#fff', fontSize: 14,
                        display: 'grid', placeItems: 'center',
                      }}
                      >
                        ⤢
                      </span>
                    </>
                  )
                  : <span style={{ color: '#9ca3af', fontSize: 12 }}>sin foto</span>}
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>{abierto.nombre}</div>
                {plata && abierto.pvp != null && (
                  <div style={{ fontSize: 15, color: '#6b7280', marginTop: 4 }}>
                    ${Number(abierto.pvp).toLocaleString('es-AR')}
                  </div>
                )}
              </div>
              <button
                onClick={cerrar}
                aria-label="Cerrar"
                style={{ border: 'none', background: 'none', fontSize: 24, color: '#9ca3af', cursor: 'pointer', lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </div>

            {/* Con una sola opción no hay nada que elegir, pero sí que leer: es lo que se lleva. */}
            {opcionesDeLaHoja.length === 1 && enCriollo(opcionesDeLaHoja[0].valores) && (
              <div style={{ fontSize: 15, color: '#374151', marginBottom: 16 }}>
                {enCriollo(opcionesDeLaHoja[0].valores)}
              </div>
            )}

            {opcionesDeLaHoja.length > 1 && (
              <div style={{ marginBottom: 16 }}>
                {opcionesDeLaHoja.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setOpcionId(o.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 10,
                      marginBottom: 8, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                      textAlign: 'left', color: '#1c1c1e',
                      border: `1px solid ${opcionId === o.id ? '#4f46e5' : '#e5e7eb'}`,
                      background: opcionId === o.id ? '#eef2ff' : '#fff',
                    }}
                  >
                    <div style={{ width: 44, height: 44, flexShrink: 0, background: '#f5f5f7', borderRadius: 8, overflow: 'hidden' }}>
                      {(o.foto || abierto.foto) && (
                        <FotoTn
                          src={(o.foto || abierto.foto) as string}
                          alt={enCriollo(o.valores)}
                          ancho={90}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}
                    </div>
                    <span style={{ flex: 1, fontSize: 16 }}>{enCriollo(o.valores) || 'Elegir'}</span>
                    {opcionId === o.id && <span style={{ color: '#4f46e5', fontSize: 18 }}>✓</span>}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
              <button
                onClick={() => setCuantos((c) => Math.max(1, c - 1))}
                style={contadorGrande}
                aria-label="Uno menos"
              >
                −
              </button>
              <span style={{ minWidth: 24, textAlign: 'center', fontSize: 18, fontWeight: 600 }}>{cuantos}</span>
              <button
                onClick={() => setCuantos((c) => Math.min(topeDeLaHoja, c + 1))}
                disabled={cuantos >= topeDeLaHoja}
                style={{ ...contadorGrande, opacity: cuantos >= topeDeLaHoja ? 0.4 : 1 }}
                aria-label="Uno más"
              >
                +
              </button>
              <button
                onClick={agregar}
                disabled={!opcionId}
                style={{
                  flex: 1, padding: 15, fontSize: 16, fontWeight: 600, borderRadius: 10,
                  border: 'none', cursor: opcionId ? 'pointer' : 'not-allowed',
                  background: opcionId ? '#4f46e5' : '#d1d5db', color: '#fff',
                }}
              >
                {opcionId ? 'Agregar' : 'Elegí una opción'}
              </button>
            </div>
            {cuantos >= topeDeLaHoja && (
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>
                Es lo que te queda del acuerdo.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Encima de todo, incluida la hoja. Se cierra solo y deja la hoja como estaba, con lo que
          haya marcado: mirar una foto no puede costarle la elección. */}
      {mirando && fotosDeLoQueMira.length > 0 && (
        <PortalFotos
          fotos={fotosDeLoQueMira}
          nombre={mirando.nombre}
          onCerrar={() => setMirando(null)}
        />
      )}
    </>
  )
}
