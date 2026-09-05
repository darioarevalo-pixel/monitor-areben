'use client'

/**
 * La tabla de CELDAS: una fila por conjunto, con su veredicto y sus botones al lado.
 *
 * # Por qué la unidad es la celda y no la pieza
 *
 * Es donde vive el presupuesto, donde vive el aprendizaje y donde se ejerce la decisión. La pieza es
 * el otro eje —y el que explica el desgaste— pero no se puede pausar una pieza: se pausa la caja.
 * **Abriendo la fila están sus avisos, con su cara y con qué parte de la caja se lleva cada uno.**
 * ⚠️ Hasta el 26-ago-2026 esa frase era MENTIRA: el detalle mostraba el embudo y el día a día y ni
 * un aviso. Se arregló haciendo cierto el comentario, ⛔ no borrándolo.
 *
 * # 🔴 La cara va en la FILA, no adentro del plegable (30-ago-2026)
 *
 * *«¿Dónde están los anuncios con sus miniaturas? Sería esencial verlo para saber qué anuncio está
 * activo sin hacer movimientos de más.»* Estaban — adentro de la fila abierta, que es exactamente
 * donde ⛔ no sirven: la pregunta «¿cuál es cuál?» se hace **mientras se recorre la tabla**, y un
 * nombre como `AD02 - GIRLHOOD COLLECTION` ⛔ no la contesta.
 *
 * 🔑 Va la del aviso que **más gastó** de la caja, con un `+N` si hay más. ⛔ No las N: una fila con
 * cuatro miniaturas vuelve a ser el problema que se acaba de arreglar con los botones.
 *
 * # 🔴 De ONCE columnas a SEIS (5-sep-2026)
 *
 * Bruno: *«la vista está menos alargada horizontalmente [en Totales por cuenta]… muy larga,
 * comprimida toda hacia la de veredicto, no me convence nada»*. Eran once columnas sin un solo
 * `width` declarado, y la de veredicto llevaba pill + una frase de hasta diez palabras + badges
 * dentro de 320 px: el resto de la tabla se aplastaba contra ella.
 *
 * 🔑 **Y el hallazgo que ordenó el recorte: en 7 de las 8 ramas, `porque[0]` es la versión en PROSA
 * de columnas que están dibujadas al lado.** *«compra a $4.850 contra un techo de $6.668 (73%)»* con
 * las columnas `Costo` y `% techo` a diez píxeles. Era el mismo dato dos veces, y encima `avisar()`
 * empuja una frase por desgaste, otra por aprendizaje y otra por reinicio ⇒ **casi toda fila eran
 * DOS `<tr>`**, el segundo diciendo sólo «y 2 razones más — abrí la fila».
 *
 * ⇒ la regla escrita —*«un veredicto sin el número que lo sostiene es un renglón que nadie
 * aprieta»*— **se cumple MEJOR con el número en su columna**: alineado, comparable entre filas y
 * sin repetir. La prosa entera baja al detalle.
 *
 * # 🔑 Lo que NO se perdió al sacar columnas
 *
 *  - **`%diario`** baja al pie del **Gasto**, que es de lo que es un porcentaje. Sigue separando
 *    las dos cosas que se confunden todo el tiempo: una celda que no gasta **porque no le alcanza
 *    la caja** y una que **no la usa** — las dos se ven igual y la acción es la contraria.
 *  - **`%techo`** baja al pie del **Costo**, por lo mismo.
 *  - **`CTRΔ` y `CPMΔ`** bajan al detalle, pero **su conclusión se queda en la fila**: la firma del
 *    desgaste ya está calculada (`pieza` / `subasta`) y se dibuja como badge. La fila lleva la
 *    conclusión; el detalle lleva la evidencia, con los cuatro absolutos que hasta hoy se
 *    calculaban y ⛔ no se dibujaban en ningún lado.
 *
 * # 🔴 El pill se dibuja SÓLO donde hay una MANO
 *
 * Con el piso de evidencia el reparto real de la cuenta es 2 pautas caras, 2 que rinden y el resto
 * `sin-prueba`. Un pill por fila sería un muro gris que ⛔ no señala nada. ⇒ rojo = plata que se va
 * hoy · índigo = plata que falta soltar · **vacío = nada que hacer**. El ESTADO (sustantivo) va
 * siempre, como badge al lado del nombre; la MANO (infinitivo) sólo cuando la hay.
 * 🔑 Y con dos rojos entre doce, **ordenar pesa más que pintar**: de eso se ocupa `ordenarCeldas`.
 */

import { Fragment, useState } from 'react'
import { BotonesAccion } from '@/components/meta-ads/acciones'
import { Insistencia, useAccionarHallazgo } from '@/components/meta-ads/reglas/HallazgosPanel'
import type { Hallazgo } from '@/lib/meta-ads/reglas'
import type { Acciones } from '@/components/meta-ads/acciones/tipos'
import type { AvisoDeCelda, Celda, Veredicto } from '@/lib/meta-ads/rendimiento'
import { ESTADO_DE_CLASE, MANO_DE_ACCION, TONO_DE_CLASE } from '@/lib/meta-ads/rendimiento'
import type { PiezaAviso } from '@/lib/meta-ads/biblioteca'
import { entero, plata } from '@/lib/meta-ads/formato'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import {
  Badge, Button, StatusPill, TBody, TableWrap, Td, Th, THead, Tr, color, font, space, weight,
} from '@/components/ui'
import { AvisosDeCelda } from '@/components/meta-ads/zona/AvisosDeCelda'
import { Cara } from '@/components/meta-ads/zona/Cara'
import { usePiezas } from '@/components/meta-ads/zona/usePiezas'

/**
 * **Cuántas columnas tiene la tabla.** El `colSpan` del detalle sale de acá y ⛔ no de un número
 * tipeado: estaba clavado en `11` a mano y era lo primero que se despegaba al tocar una columna.
 */
const COLUMNAS = 6

/** Un delta con signo. `null` se dibuja «—», ⛔ nunca 0%: no medir no es no haber cambiado. */
function Delta({ v, invertido = false }: { v: number | null; invertido?: boolean }) {
  if (v == null) return <span style={{ color: color.mut2 }}>—</span>
  const malo = invertido ? v > 0 : v < 0
  return (
    <span style={{ color: Math.abs(v) < 5 ? color.mut : malo ? color.dangerInk : color.successInk, fontWeight: weight.medium }}>
      {v >= 0 ? '+' : ''}{Math.round(v)}%
    </span>
  )
}

export function TablaCeldas({ celdas, moneda, acciones, cuenta, dias, hallazgosDe, quitarHallazgo }: {
  celdas: Celda[]
  moneda: string | null
  acciones: Acciones
  /** La cuenta publicitaria, para traerle las caras a los avisos. `null` ⇒ se listan sin foto. */
  cuenta: string | null
  /** Sobre cuántos días son las MÉTRICAS. Sirve para rotular el juicio cuando ⛔ no coinciden. */
  dias: number
  /** Lo que las automatizaciones encontraron sobre ESTA celda —o sobre un aviso de adentro—. */
  hallazgosDe: (celdaId: string) => Hallazgo[] | null
  quitarHallazgo: (id: number) => void
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  // 🔑 Las que nacen abiertas por tener un hallazgo se pueden CERRAR, y por eso hace falta el
  // negativo: con un solo `abierta` no habría forma de cerrar una que arrancó abierta sola.
  const [cerradas, setCerradas] = useState<Set<string>>(() => new Set())
  const alternar = (id: string, estaAbierta: boolean) => {
    if (estaAbierta) {
      setAbierta((x) => (x === id ? null : x))
      setCerradas((s) => new Set(s).add(id))
    } else {
      setCerradas((s) => { const n = new Set(s); n.delete(id); return n })
      setAbierta(id)
    }
  }
  // 🔴 Se enciende AL MONTAR y ⛔ no al abrir una fila: la cara de cada celda vive en la fila. El
  // porqué —y el cupo medido, `call_count` en 2 sobre 100— está en el docblock de `usePiezas`.
  const piezas = usePiezas(cuenta, true)
  return (
    <TableWrap>
      <THead>
        <Tr>
          {/* Sin rótulo: la columna es la cara, y «Pieza» arriba de una imagen es ruido. */}
          <Th width={56}> </Th>
          <Th>Pauta</Th>
          <Th align="right" width={120}>Gasto</Th>
          <Th align="right" width={90}>Compras</Th>
          <Th align="right" width={150}>Costo</Th>
          <Th width={200}>Qué hacer</Th>
        </Tr>
      </THead>
      <TBody>
        {celdas.map((c) => {
          const v = c.veredicto
          const d = c.desgaste
          const esta = abierta === c.id
          const suyos = hallazgosDe(c.id)
          // 🔑 **La fila con un hallazgo nace ABIERTA.** Es la misma regla que antes auto-abría con
          // `porque.length > 1` —que abría casi todas—, apuntada a lo que sí importa: con 2-4
          // hallazgos en vez de 19, abrirlos es «lo que hay que decidir se ve sin un clic», y sin
          // partir la mano en dos lugares.
          const abiertaDeVerdad = esta || (!cerradas.has(c.id) && !!suyos?.length)
          return (
            <Fragment key={c.id}>
              {/* 🔑 Click en CUALQUIER lado de la fila, que es literal lo que pidió Bruno: *«si
                  tocás en cualquier lado de la fila, que abra la información adicional importante
                  para tomar decisiones»*. Antes abría un `▾` de doce píxeles adentro de una celda.
                  Los hijos que hacen otra cosa cortan la propagación — ver `<NoAbre>`. */}
              <Tr activa={abiertaDeVerdad} onClick={() => alternar(c.id, abiertaDeVerdad)}>
                <Td>
                  <CaraDeCelda celda={c} piezaDe={piezas.piezaDe} cargando={piezas.cargando} />
                </Td>
                <Td strong wrap>
                  <div style={{ display: 'flex', gap: space[1], alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span>{c.nombre}</span>
                    <Badge tone={TONO_DE_CLASE[v.clase]}>{ESTADO_DE_CLASE[v.clase]}</Badge>
                    {d.firma === 'pieza' && <Badge tone="warning">Se gasta la pieza</Badge>}
                    {d.firma === 'subasta' && <Badge tone="neutral">Subió la subasta</Badge>}
                    {!!suyos?.length && <Badge tone="warning">Para decidir</Badge>}
                    {suyos?.[0] && <Insistencia h={suyos[0]} />}
                    {/* ⛔ Un `<span>` y ⛔ no un `<button>`: es una afordancia, la fila entera ya es
                        el control. Un botón crudo más entraría a `tests/boton-crudo-altura.test.ts`
                        sin agregar nada que se pueda apretar. */}
                    <span aria-hidden style={{ color: color.mut2 }}>{abiertaDeVerdad ? '▾' : '▸'}</span>
                  </div>
                  <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2, fontWeight: weight.normal }}>
                    {c.diasConGasto} {c.diasConGasto === 1 ? 'día' : 'días'} con entrega
                    {c.diario != null && ` · ${plata(c.diario)}/día`}
                  </div>
                </Td>
                <Td align="right">
                  {plata(c.spend)}
                  {v.pctDiario != null && (
                    <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2 }}>
                      {Math.round(v.pctDiario)}% de su diario
                    </div>
                  )}
                </Td>
                <Td align="right">{entero(c.compras)}</Td>
                {/* ⛔ Un costo sin denominador se dibuja vacío, NUNCA 0: un 0 en una columna de
                    costos se lee como «esas compras salieron gratis». */}
                <Td align="right">
                  {c.compras ? plata(c.costo) : <span style={{ color: color.mut2 }}>—</span>}
                  <PieDelTecho v={v} dias={dias} />
                </Td>
                <Td wrap>
                  {/* El pill SÓLO cuando hay mano. Ver el docblock de arriba. */}
                  {v.accion && <StatusPill tone={TONO_DE_CLASE[v.clase]} label={MANO_DE_ACCION[v.accion]} />}
                  <NoAbre style={{ display: 'block', marginTop: v.accion ? 4 : 0 }}>
                    <BotonesAccion
                      objeto={{
                        nivel: 'conjunto',
                        id: c.id,
                        nombre: c.nombre,
                        linea: (c.linea === 'sin-linea' ? null : c.linea) as LineaPauta | null,
                        moneda: moneda || c.moneda || 'ARS',
                        campania: c.campaignId || undefined,
                      }}
                      estado={c.estado}
                      diarioCrudo={c.diario == null ? 0 : Math.round(c.diario * 100)}
                      sinPresupuesto={c.diario == null}
                      acciones={acciones}
                    />
                  </NoAbre>
                </Td>
              </Tr>
              {abiertaDeVerdad && (
                <Tr>
                  <Td colSpan={COLUMNAS} style={{ padding: 0, background: color.bg, height: 'auto' }}>
                    <Detalle celda={c} piezas={piezas} hallazgos={suyos} quitarHallazgo={quitarHallazgo} />
                  </Td>
                </Tr>
              )}
            </Fragment>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

/**
 * **El pie de la columna Costo: el % del techo, con su banda y con su ventana.**
 *
 * 🔴 Las tres cosas van juntas o el número miente:
 *  - **el `%`** solo se lee como una afirmación exacta cuando puede salir de dos compras;
 *  - **la banda (`±`)** dice cuánto de ese número lo puede haber puesto la muestra. Se dibuja en
 *    TODAS las filas y ⛔ no sólo en las grises: un `90% ±71%` ⛔ no es «rinde», y sin el `±` se lee
 *    igual que un `90% ±12%`;
 *  - **la ventana**, cuando el juicio se estiró. Las MÉTRICAS de la fila son de los días que se
 *    están mirando y el veredicto puede ser de treinta: sin decirlo, alguien divide el gasto por
 *    las compras de al lado, le da otro número y deja de creerle a la pantalla.
 */
function PieDelTecho({ v, dias }: { v: Veredicto; dias: number }) {
  if (v.pctTecho == null) return null
  const caro = v.umbralPct != null && v.pctTecho > v.umbralPct
  return (
    <div style={{ fontSize: font.xs, marginTop: 2, color: caro ? color.dangerInk : color.mut2 }}>
      {Math.round(v.pctTecho)}% del techo
      {v.ruido != null && ` ±${Math.round(v.ruido * 100)}%`}
      {v.n != null && v.ventanaJuicio != null && v.ventanaJuicio !== dias && (
        <div style={{ color: color.mut2 }}>sobre {v.ventanaJuicio} días · {entero(v.n)} compras</div>
      )}
    </div>
  )
}

/**
 * Un envoltorio para lo que vive adentro de la fila y ⛔ NO tiene que abrirla.
 *
 * 🔑 Existe como componente y ⛔ no como un `onClick` copiado en cada lugar: es la línea que se
 * rompe al replicar el patrón de fila clickeable, y romperla significa que apretar «Pausar» además
 * despliega el detalle — o peor, que el detalle se coma el click del botón.
 */
function NoAbre({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span style={style} onClick={(e) => e.stopPropagation()}>{children}</span>
}

/** Un bloque del detalle: rótulo chico en mayúsculas y su contenido. Seis iguales, una sola forma. */
function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut, marginBottom: 4 }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

/**
 * Lo que se ve al abrir una celda: su embudo y su serie.
 *
 * 🔴 **El embudo dice cuántos días lo midieron.** Las tres columnas nacieron el 23-ago-2026 y las
 * filas anteriores están en `null` a propósito: un `0` afirmaría «no hubo ni un carrito». Dibujar el
 * total sin decir sobre cuántos días se sumó deja comparar dos celdas medidas sobre ventanas
 * distintas.
 */
function Detalle({ celda, piezas, hallazgos, quitarHallazgo }: {
  celda: Celda
  piezas: ReturnType<typeof usePiezas>
  hallazgos: Hallazgo[] | null
  quitarHallazgo: (id: number) => void
}) {
  const v = celda.veredicto
  const d = celda.desgaste
  const ap = celda.aprendizaje
  const pasos: [string, number | null, number][] = [
    ['clics', celda.clicks, celda.clicks],
    ['visitas al sitio', celda.lpv, celda.lpv ?? 0],
    ['carritos', celda.carritos, celda.carritos ?? 0],
    ['checkouts', celda.checkouts, celda.checkouts ?? 0],
    ['compras', celda.compras, celda.compras],
  ]
  return (
    <div style={{ padding: space[3], display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {/* 🔴 **El hallazgo va PRIMERO, y es lo único del detalle con un botón que ⛔ no está en la
          fila.** Por eso una fila con hallazgo nace abierta. */}
      {!!hallazgos?.length && (
        <Bloque titulo="QUÉ HAY QUE DECIDIR ACÁ">
          {hallazgos.map((h) => <MarcaDeHallazgo key={h.id} h={h} quitar={quitarHallazgo} />)}
        </Bloque>
      )}
      {/* 🔴 **Y después el POR QUÉ, entero.** ⚠️ Esto INVIERTE la decisión del 26-ago que ponía los
          avisos primero, y el motivo escrito entonces —*«la pregunta que trae a alguien a abrir una
          fila es qué hay adentro»*— cambia con el gesto: ahora la fila se abre tocando cualquier
          lado, y desde la columna «Costo» la pregunta pasa a ser «¿por qué dice eso?». */}
      <Bloque titulo="POR QUÉ">
        <ul style={{ margin: 0, paddingLeft: space[4], color: color.mut, fontSize: font.sm, lineHeight: 1.5 }}>
          {v.porque.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </Bloque>
      {/* 🔑 **Los números que hasta hoy se calculaban y ⛔ no se dibujaban en ningún lado**: los
          cuatro absolutos del desgaste —que son la evidencia de la firma que la fila ya resume— y
          sobre todo `reiniciadoEl`, la fecha en que el contador de aprendizaje arrancó de cero.
          Esa fecha es la información que hay que mirar ANTES de escalar, y sólo existía traducida
          a una frase adentro del `porque`. */}
      <Bloque titulo="LOS NÚMEROS DE ATRÁS">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: font.sm, color: color.mut }}>
          <div>
            <span style={{ color: color.mut2 }}>Desgaste · </span>
            {d.firma === 'sin-datos' ? (
              <span style={{ color: color.mut2 }}>{d.motivo || 'no hay dos ventanas completas con qué comparar'}</span>
            ) : (
              <>
                CTR <strong>{d.ctrA == null ? '—' : `${d.ctrA.toFixed(2)}%`}</strong> → <strong>{d.ctrB == null ? '—' : `${d.ctrB.toFixed(2)}%`}</strong>{' '}
                <Delta v={d.ctrDelta} /> · CPM <strong>{d.cpmA == null ? '—' : plata(d.cpmA)}</strong> → <strong>{d.cpmB == null ? '—' : plata(d.cpmB)}</strong>{' '}
                <Delta v={d.cpmDelta} invertido />
              </>
            )}
          </div>
          <div>
            <span style={{ color: color.mut2 }}>Aprendizaje · </span>
            {entero(ap.convSemana)} de {entero(ap.necesita)} compras/semana
            {ap.cpa != null && ` · costo ${plata(ap.cpa)}`}
            {ap.pide != null && ` · para cruzar pide ${plata(ap.pide)}/día`}
          </div>
          {ap.reiniciadoEl && (
            <div style={{ color: color.warningInk }}>
              ⚠️ el contador arrancó de cero el {ap.reiniciadoEl}: ahí cambió el presupuesto
            </div>
          )}
        </div>
      </Bloque>
      <AvisosDeCelda
        avisos={celda.avisos}
        piezaDe={piezas.piezaDe}
        motivo={piezas.motivo}
        cargando={piezas.cargando}
        gastoDeLaCelda={celda.spend}
      />
      <Bloque titulo="DEL CLIC A LA COMPRA">
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', fontSize: font.sm }}>
          {pasos.map(([rot, val, n]) => (
            <div key={rot}>
              <span style={{ color: color.mut }}>{rot}: </span>
              {val == null ? (
                <span style={{ color: color.mut2 }} title="Ninguna fila de la ventana lo medía. No es cero.">sin medir</span>
              ) : (
                <>
                  <strong>{entero(n)}</strong>
                  {n > 0 && <span style={{ color: color.mut2 }}> · {plata(celda.spend / n)} c/u</span>}
                </>
              )}
            </div>
          ))}
        </div>
      </Bloque>
      <Bloque titulo="DÍA A DÍA">
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', fontSize: font.xs, color: color.mut }}>
          {celda.serie.slice(-14).map((dia) => (
            <span key={dia.fecha} title={`${dia.fecha}: ${plata(dia.spend)} · ${entero(dia.compras)} compras`}>
              {dia.fecha.slice(5)} <strong style={{ color: color.ink }}>{entero(dia.compras)}</strong>
            </span>
          ))}
        </div>
      </Bloque>
    </div>
  )
}

/**
 * La cara de la celda en la fila: **la del aviso que más gastó**, con un `+N` si hay más.
 *
 * 🔑 **La del que más gasta y ⛔ no la primera.** Una caja con tres avisos casi siempre tiene uno que
 * se lleva el 80%: ésa es la pieza de la que se está hablando cuando se mira la fila. Poner la
 * primera del arreglo sería mostrar la que quedó adelante en la consulta.
 *
 * ⚠️ En la ventana viva una celda que arrancó hoy ⛔ no tiene avisos —la foto no la vio— y el marco
 * queda vacío. Es correcto: no hay pieza que mostrar, y un marco vacío ⛔ no afirma nada.
 */
function CaraDeCelda({ celda, piezaDe, cargando }: {
  celda: Celda
  piezaDe: (adId: string) => PiezaAviso | null
  cargando: boolean
}) {
  const mayor = celda.avisos.reduce<AvisoDeCelda | null>((a, x) => (!a || x.spend > a.spend ? x : a), null)
  const otros = Math.max(0, celda.avisos.length - 1)
  return (
    <div style={{ position: 'relative', width: 44 }}>
      <Cara p={mayor ? piezaDe(mayor.id) : null} lado={44} cargando={cargando} />
      {otros > 0 && (
        <span
          // Cuántas piezas más hay en la caja. Es la mitad de la respuesta a «¿de qué es esta fila?»:
          // una celda con cuatro avisos ⛔ no se explica con una sola cara.
          title={`${celda.avisos.length} avisos en esta celda`}
          style={{
            position: 'absolute', top: -4, right: -6, fontSize: 10, lineHeight: 1, padding: '2px 4px',
            borderRadius: 999, background: color.bg2, border: `1px solid ${color.line}`, color: color.mut,
          }}
        >
          +{otros}
        </span>
      )}
    </div>
  )
}

/**
 * **Lo que el motor encontró sobre esta celda, pegado a su fila y accionable ahí.**
 *
 * 🔑 Comparte `useAccionarHallazgo` con el bloque de arriba: el orden de las dos llamadas —accionar
 * primero, marcar después— es una decisión, y escrita dos veces la segunda copia la invierte.
 *
 * ⚠️ **El rótulo nombra el OBJETO de la sugerencia**, que puede ⛔ no ser la celda: un hallazgo de
 * aviso vive adentro de esta caja pero pausa el aviso. Sin el nombre, el botón parecería apagar la
 * celda entera — que es la misma plata mal apagada, con un click.
 *
 * ⛔ **Sin sugerencia ⛔ no hay botón, y el motivo igual se lee.** Hay reglas que sólo avisan (el
 * radar, la fatiga): un botón inventado ahí sería ofrecer una acción que nadie decidió.
 */
function MarcaDeHallazgo({ h, quitar }: { h: Hallazgo; quitar: (id: number) => void }) {
  const { accionar, ocupado, rotulo } = useAccionarHallazgo(h, quitar)
  const mismoObjeto = h.sugerencia && h.sugerencia.objetoId === h.objetoId && h.nivel === 'conjunto'
  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 320 }}>
      <div style={{ display: 'flex', gap: space[1], alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge tone="warning">Lo vio una automatización</Badge>
        <Insistencia h={h} />
      </div>
      <div style={{ fontSize: font.xs, color: color.mut, lineHeight: 1.4 }}>{h.motivo}</div>
      {rotulo && (
        <Button size="sm" variant="solid" tone="brand" disabled={ocupado} onClick={() => void accionar()}>
          {ocupado ? 'Un segundo…' : mismoObjeto ? rotulo : `${rotulo} «${h.objetoNombre || h.objetoId}»`}
        </Button>
      )}
    </div>
  )
}
