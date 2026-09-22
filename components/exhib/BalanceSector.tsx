'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Notice, color, font, space, useToast, weight } from '@/components/ui'
import { descargarXlsx } from '@/lib/excel'
import {
  buscarPorTipo,
  coberturaPorTipo,
  colgadasDeMas,
  declaracionesFlojas,
  filasBuscar,
  filasSacar,
  partirRepetidas,
  partirTachadas,
  resumenBuscar,
  tocadoSinDeclarar,
  ANCHOS_BUSCAR,
  ANCHOS_SACAR,
  DECISIONES,
  MOTIVOS,
  type DecisionRepetida,
  type MotivoTachada,
  type Repetida,
  type Tachada,
} from '@/lib/exhib/balance'
import { decidirRepetida, guardarCobertura, tacharPrenda } from '@/lib/exhib/cliente'
import { exhibId, tipoDePrenda } from '@/lib/exhib/core'
import type { Cobertura, EscaneoLibre } from '@/lib/exhib/libre'
import type { ExhibItem } from '@/lib/exhib/tipos'
import type { Marca } from '@/lib/nav'
import { ultimoSyncStock } from '@/lib/sync-gn'

/**
 * **El balance del sector**, la pantalla de quien decide.
 *
 * 🔑 **Son dos personas y dos momentos** (así lo pidió Bruno el 20-sep-2026): la empleada camina el
 * sector, escanea y avisa cuando terminó; quien decide abre el recorrido después —esa tarde, al
 * otro día, desde otra máquina— y arma el mandado. Acá ⛔ no se camina nada: se mira.
 *
 * 🔴 **La app pone el NÚMERO y la persona pone la DECISIÓN.** Que un recorrido haya cubierto un
 * sector entero es un hecho del salón que la app ⛔ no puede ver: 94 escaneos ⛔ no dicen si el
 * sector tenía 94 prendas o 400. Por eso cada categoría llega con su «tocó 94 de 400 (24 %)» —un
 * 24 % grita «caminó un perchero» y un 95 % dice «caminó el sector»— y el tilde lo pone quien mira.
 * Afirmarlo sola es lo que dio los 20 corsets faltantes falsos del 19-sep.
 *
 * ⚠️ El mandado tiene una dirección concreta: **el depósito del local**. En Gestión Nube el Local es
 * una sola ubicación que junta el salón y el depósito del local, así que lo que tiene stock y ⛔ no
 * pasó por el lector **tiene que estar guardado ahí** — y si tampoco está, es un problema de stock.
 */
export function BalanceSector({
  escaneos,
  items,
  marca,
  recorridoId,
  cobertura,
  onGuardada,
  onTraerStock,
  trayendo,
}: {
  escaneos: EscaneoLibre[]
  /** El Local **con stock**: es el universo contra el que se compara. */
  items: ExhibItem[]
  marca: Marca
  recorridoId: string
  cobertura: Cobertura | null | undefined
  onGuardada: (c: Cobertura) => void
  /** Carga el stock de ahora desde Gestión Nube y recarga `items`. Tarda 2-4 minutos. */
  onTraerStock: () => Promise<void>
  trayendo: boolean
}) {
  const toast = useToast()
  const [elegidas, setElegidas] = useState<string[]>(cobertura?.tipos ?? [])
  const [guardando, setGuardando] = useState(false)

  /**
   * 🔴 **De cuándo es el stock contra el que se está comparando.** El espejo se actualiza **una vez
   * por día, a las 3 de la mañana**, y el local vende **~160 unidades por día**: un balance hecho a
   * la tarde contra esa foto manda a buscar al depósito prendas que se vendieron a la mañana. Esto
   * ⛔ no se veía en ningún lado, y el mandado salía igual de confiado.
   *
   * ⚠️ Se vuelve a preguntar cuando `items` cambia, que es lo que pasa después de traer el stock:
   * así el cartel se corrige solo en vez de quedar mostrando la hora vieja.
   */
  const [stockDe, setStockDe] = useState<{ fecha: Date; horas: number } | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    void ultimoSyncStock(marca).then((fecha) => {
      // ⚠️ La antigüedad se calcula **acá**, cuando se pregunta, y ⛔ no en el render: leer el reloj
      // mientras se dibuja da un número que cambia solo en cada re-dibujo (y el lint lo prohíbe).
      if (vivo) setStockDe(fecha ? { fecha, horas: (Date.now() - fecha.getTime()) / 36e5 } : null)
    })
    return () => {
      vivo = false
    }
  }, [marca, items])

  // 🔑 Dos horas es el corte, y sale de la venta real: a ~160 unidades por día, dos horas de local
  // abierto son unas 20 prendas que la foto ⛔ no conoce. Abajo de eso, el ruido ⛔ no cambia un
  // mandado; arriba, sí. ⚠️ Y **no saber ⛔ no es estar al día**: sin dato, se avisa igual.
  const stockViejo = !stockDe || stockDe.horas > 2

  const tipos = useMemo(() => coberturaPorTipo(escaneos, items), [escaneos, items])
  const lista = useMemo(() => buscarPorTipo(escaneos, items, elegidas), [escaneos, items, elegidas])
  /**
   * 🔴 **El seguro contra el error del 21-sep-2026**: cuántas prendas caminadas quedan fuera de lo
   * declarado. Un mandado vacío puede querer decir «no falta nada» o «declaraste cualquier cosa», y
   * hasta ese día la pantalla ⛔ no distinguía las dos.
   */
  const afuera = useMemo(() => tocadoSinDeclarar(escaneos, items, elegidas), [escaneos, items, elegidas])

  /**
   * 🔴 **El aviso que faltaba el 21-sep** (`declaracionesFlojas`): qué tipos se declararon sin que
   * el recorrido los haya caminado. El número ya estaba en pantalla —«77 %»— pero en un renglón de
   * una lista de doce, y ⛔ no se lee como «este mandado va a pedir 58 prendas que están colgadas».
   */
  const flojas = useMemo(() => declaracionesFlojas(escaneos, items, elegidas), [escaneos, items, elegidas])

  /**
   * 🔴 **Las tachadas se mudan, ⛔ no desaparecen** (`partirTachadas`): quien mira tiene que poder
   * ver por qué el número bajó de 104 a 82, y poder arrepentirse. Una lista que cambia sola es una
   * lista que se deja de mirar.
   */
  const { mandado, sacadas } = useMemo(
    () => partirTachadas(lista, (cobertura?.tachadas ?? []) as Tachada[]),
    [lista, cobertura],
  )
  const [tachando, setTachando] = useState<string | null>(null)
  /** La prenda a la que se le está eligiendo el motivo, ⛔ no un menú flotante: se elige en su renglón. */
  const [eligiendo, setEligiendo] = useState<string | null>(null)
  const resumen = resumenBuscar(mandado)

  async function tachar(varianteId: string, motivo: MotivoTachada | null) {
    setTachando(varianteId)
    try {
      onGuardada(await tacharPrenda(marca, recorridoId, varianteId, motivo))
      setEligiendo(null)
    } catch (e) {
      toast.error('No se pudo guardar: ' + (e as Error).message)
    } finally {
      setTachando(null)
    }
  }

  /**
   * 🔴 **La otra mitad del balance: lo que SOBRA en el salón** (21-sep-2026, Bruno: *«el espacio
   * del local es chico, por eso me interesa optimizar mucho eso»*). El mandado trae del depósito lo
   * que falta; esto manda al depósito lo que está colgado dos veces.
   *
   * 🔑 **⛔ No depende de los tipos declarados**, a diferencia del mandado: que una prenda esté
   * colgada dos veces es un hecho del recorrido, ⛔ no una afirmación sobre un sector. Se ve aunque
   * ⛔ no se haya declarado nada.
   */
  const repes = useMemo(() => colgadasDeMas(escaneos), [escaneos])
  const { sinDecidir, quedan, sacar } = useMemo(
    () => partirRepetidas(repes, (cobertura?.repetidas ?? []) as Repetida[]),
    [repes, cobertura],
  )
  const [decidiendo, setDecidiendo] = useState<string | null>(null)

  async function decidir(varianteId: string, decision: DecisionRepetida | null) {
    setDecidiendo(varianteId)
    try {
      onGuardada(await decidirRepetida(marca, recorridoId, varianteId, decision))
    } catch (e) {
      toast.error('No se pudo guardar: ' + (e as Error).message)
    } finally {
      setDecidiendo(null)
    }
  }

  // Sin un solo tipo tocado ⛔ no hay nada que balancear (un recorrido de puros códigos que no
  // cruzaron, por ejemplo). Decirlo es más honesto que mostrar una caja vacía.
  if (!tipos.length) return null

  const alternar = (tipo: string) =>
    setElegidas((prev) => (prev.some((t) => tipoDePrenda(t) === tipoDePrenda(tipo)) ? prev.filter((t) => tipoDePrenda(t) !== tipoDePrenda(tipo)) : [...prev, tipo]))

  async function guardar() {
    setGuardando(true)
    try {
      onGuardada(await guardarCobertura(marca, recorridoId, elegidas))
      toast.ok(elegidas.length ? 'Balance guardado' : 'Guardado: este recorrido no cubrió un sector entero')
    } catch (e) {
      toast.error('No se pudo guardar: ' + (e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  /**
   * 🔴 **Un balance declarado con el criterio VIEJO ⛔ no cuenta como declarado** (21-sep-2026).
   * Hasta esa mañana un sector se declaraba con categorías de Tienda Nube, y el primer recorrido
   * real quedó guardado así. Sin esto la pantalla abre con **⛔ ninguna casilla marcada y el botón
   * diciendo «Balance guardado»**, que es exactamente lo que le pasó a Bruno: *«no entiendo qué
   * tengo que hacer»*. Un cartel apagado que dice «ya está» cuando ⛔ no está es peor que no decir
   * nada — y lo que está guardado es justo la declaración que salió mal.
   */
  const declaradoALaVieja = !cobertura?.tipos?.length && !!cobertura?.cats?.length

  const sinGuardar =
    declaradoALaVieja || JSON.stringify(elegidas.map(tipoDePrenda).sort()) !== JSON.stringify((cobertura?.tipos ?? []).map(tipoDePrenda).sort())

  return (
    <Notice tone="brand" icon="📋" style={{ marginBottom: space[4] }}>
      <div style={{ fontWeight: weight.bold, fontSize: font.base }}>Balance del sector</div>
      <div style={{ fontSize: font.sm, marginBottom: space[3] }}>
        Marcá los tipos de prenda que este recorrido caminó <b>enteros</b> —top, blusa, corset…—. Con eso se arma la lista de lo que hay
        que ir a buscar al depósito del local. Si sólo se caminó un mueble suelto, dejalo sin marcar.
      </div>

      {/* 🔴 Va ANTES de las categorías: es la pregunta previa a cualquier tilde. Un mandado armado
          contra una foto de ayer es peor que no armarlo, porque sale con la misma cara de correcto. */}
      <div
        style={{
          fontSize: font.sm,
          padding: `${space[2]}px ${space[3]}px`,
          marginBottom: space[3],
          borderRadius: 8,
          background: stockViejo ? color.warningBg : color.successBg,
          color: color.ink,
        }}
      >
        <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            {stockDe === undefined
              ? 'Averiguando de cuándo es el stock…'
              : stockDe === null
                ? // ⛔ «No se pudo preguntar» ⛔ NO es «está al día»: de las dos formas de
                  // equivocarse, ésta es la única que ⛔ no miente.
                  '⛔ No se pudo saber de cuándo es el stock con el que se compara.'
                : stockDe.horas < 1
                  ? `✓ El stock es de recién (${stockDe.fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}).`
                  : `⚠️ El stock con el que se compara es de hace ${Math.round(stockDe.horas)} ${Math.round(stockDe.horas) === 1 ? 'hora' : 'horas'} (${stockDe.fecha.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}).`}
          </span>
          <Button size="sm" variant={stockViejo ? 'solid' : 'outline'} tone={stockViejo ? 'brand' : undefined} onClick={() => void onTraerStock()} loading={trayendo}>
            Cargar el stock de ahora
          </Button>
        </div>
        {stockViejo && stockDe !== undefined && (
          <div style={{ fontSize: font.xs, marginTop: 4 }}>
            El local vende unas 160 prendas por día. Si no lo cargás ahora, el mandado puede mandar a buscar cosas que ya se vendieron.
          </div>
        )}
      </div>

      {/* 🔴 Ordenados por lo que PASÓ POR EL LECTOR y ⛔ no por porcentaje: ver `coberturaPorTipo`.
          Con el orden por porcentaje, un tipo de 9 prendas escaneadas enteras daba 100 % y se
          plantaba arriba del sector caminado de verdad — y eso fue el mandado vacío del 21-sep. */}
      {/* 🔑 Se nombran las categorías viejas tal como se guardaron: quien mira tiene que reconocer
          su propia declaración para entender por qué le estamos pidiendo que la haga de nuevo. */}
      {declaradoALaVieja && (
        <div style={{ fontSize: font.sm, padding: `${space[2]}px ${space[3]}px`, marginBottom: space[3], borderRadius: 8, background: color.warningBg, color: color.ink }}>
          ⚠️ Este recorrido se había declarado con <b>categorías de Tienda Nube</b> ({(cobertura?.cats ?? []).join(', ')}). Ese criterio cambió: ahora se
          marca por <b>tipo de prenda</b>. Marcá abajo los que se caminaron y guardá de nuevo.
        </div>
      )}

      {tipos.map((c) => {
        const puesta = elegidas.some((x) => tipoDePrenda(x) === c.tipo)
        const pct = Math.round(c.cubierto * 100)
        return (
          <label
            key={c.tipo}
            style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', padding: '8px 2px', borderBottom: `1px solid ${color.line}`, cursor: 'pointer' }}
          >
            <input type="checkbox" checked={puesta} onChange={() => alternar(c.tipo)} style={{ width: 20, height: 20, marginTop: 2, flex: '0 0 auto' }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: color.ink }}>{c.tipo}</span>
              <span style={{ display: 'block', fontSize: font.sm, color: color.mut }}>
                {/* 🔴 El número con el que se decide. Va en palabras de local: «de las N que el sistema
                    dice que hay acá», ⛔ no «universo». */}
                Pasaron por el lector <b>{c.vistas}</b> de las <b>{c.universo}</b> que el sistema tiene en el local ({pct}%)
                {/* 🔴 Lo que falta se cuenta en PRENDAS y ⛔ no en unidades: la tarea es colgar una
                    de cada color/talle que ⛔ no está colgado. Ver `filasBuscar`. */}
                {c.universo > c.vistas && <> · faltan <b>{c.universo - c.vistas}</b> por exhibir</>}
              </span>
            </span>
          </label>
        )
      })}

      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', margin: `${space[3]}px 0 0` }}>
        <Button size="sm" variant="solid" tone="brand" onClick={() => void guardar()} loading={guardando} disabled={!sinGuardar}>
          {sinGuardar ? 'Guardar el balance' : 'Balance guardado'}
        </Button>
        {!!mandado.length && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void descargarXlsx(filasBuscar(mandado), {
                archivo: `falta-exhibir-${marca}-${new Date().toISOString().slice(0, 10)}.xlsx`,
                hoja: 'Buscar en depósito',
                // ⚠️ Los anchos se recortan con las columnas: `filasBuscar` tira la última cuando
                // ⛔ no tiene nada que decir, y un ancho de más corre todo el Excel.
                anchos: ANCHOS_BUSCAR.slice(0, filasBuscar(mandado)[0].length),
              })
            }
          >
            Descargar el mandado
          </Button>
        )}
      </div>

      {/* 🔑 Quién lo declaró y cuándo: es una lista que manda a mover mercadería, y dentro de un mes
          hay que poder saber de quién fue la afirmación. */}
      {cobertura?.por && !sinGuardar && !declaradoALaVieja && (
        <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[2] }}>
          Lo declaró {cobertura.por} el {new Date(cobertura.cuando).toLocaleDateString('es-AR')}.
        </div>
      )}

      {!!elegidas.length && (
        <div style={{ marginTop: space[4] }}>
          {/* 🔴 **VA ARRIBA DEL NÚMERO, ⛔ no abajo ni al costado.** Quien mira esto está por bajar
              el Excel y mandar a alguien al depósito: el aviso tiene que llegar antes que la lista,
              porque después de leer «faltan exhibir 82» la decisión ya está tomada. */}
          {!!flojas.length && (
            <div style={{ fontSize: font.sm, padding: `${space[2]}px ${space[3]}px`, marginBottom: space[3], borderRadius: 8, background: color.warningBg, color: color.ink }}>
              ⚠️ <b>Ojo con lo que declaraste.</b> Este recorrido ⛔ no caminó entero:
              <ul style={{ margin: `${space[2]}px 0 0`, paddingLeft: 20 }}>
                {flojas.map((f) => (
                  <li key={f.tipo}>
                    <b>{f.tipo}</b>: pasó por el lector el {Math.round(f.cubierto * 100)} %, así que <b>{f.sinVer}</b>{' '}
                    {f.sinVer === 1 ? 'prenda' : 'prendas'} con stock ⛔ no {f.sinVer === 1 ? 'pasó' : 'pasaron'} por el lector.
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: space[2] }}>
                {/* 🔑 La consecuencia dicha en palabras del local, que es lo que ⛔ no decía el «77 %». */}
                Esas prendas van a aparecer abajo como si estuvieran en el depósito, y muchas pueden estar <b>colgadas en otro mueble</b> que
                nadie caminó. Si podés, pasá el lector por esos muebles antes de mandar a buscar nada.
              </div>
            </div>
          )}

          {/* 🔴 **UN número y que sea el que importa** (21-sep-2026, Bruno: «me interesa que se
              exhiba»): cuántas prendas distintas ⛔ no están colgadas. Las unidades se sacaron —que
              el sistema tenga 8 en el depósito ⛔ no cambia la tarea, que es colgar una—. */}
          <div style={{ fontWeight: weight.bold }}>
            Faltan exhibir: {resumen.variantes} {resumen.variantes === 1 ? 'prenda' : 'prendas'}
            <span style={{ fontWeight: weight.normal, color: color.mut }}>
              {' '}(colores o talles con stock en el local que ⛔ no pasaron por el lector, de {resumen.productos}{' '}
              {resumen.productos === 1 ? 'modelo' : 'modelos'} distintos)
            </span>
          </div>
          {!mandado.length ? (
            <div style={{ fontSize: font.sm }}>No falta nada: todo lo que el sistema tiene en el local de esos tipos de prenda pasó por el lector.</div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto', marginTop: space[2] }}>
              {mandado.map((b) => {
                const id = exhibId(b.it)
                return (
                  <div key={id} style={{ padding: '6px 2px', borderBottom: `1px solid ${color.line}` }}>
                    <div style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: font.base, color: color.ink, minWidth: 0 }}>
                        {b.it.name} <span style={{ color: color.mut }}>· {b.it.size || '—'}</span>
                      </span>
                      {/* 🔑 **Dos toques y ⛔ ningún menú flotante**: el motivo se elige en el mismo
                          renglón de la prenda. Con 82 renglones, un modal por prenda es la razón por
                          la que nadie tacha nada y la lista se corrige a mano en un papel. */}
                      {eligiendo === id ? (
                        <span style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                          {(Object.keys(MOTIVOS) as MotivoTachada[]).map((m) => (
                            <Button key={m} size="sm" variant="outline" loading={tachando === id} onClick={() => void tachar(id, m)}>
                              {MOTIVOS[m]}
                            </Button>
                          ))}
                          <Button size="sm" variant="ghost" onClick={() => setEligiendo(null)}>
                            cancelar
                          </Button>
                        </span>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setEligiendo(id)}>
                          ya está colgada
                        </Button>
                      )}
                    </div>
                    {/* Explica por qué aparece algo que no parece del sector, en vez de esconderlo: el
                        bolsón «TOPS Y BODIES» se come 5 corsets y un saquito. */}
                    {!!b.tambienEn.length && <div style={{ fontSize: font.xs, color: color.mut }}>también está en {b.tambienEn.join(' / ')}</div>}
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[2] }}>
            El Excel lleva una fila por prenda a colgar, con el código de barras para buscarlas con el lector.
          </div>

          {/* 🔴 **Lo tachado se muestra, ⛔ no se borra.** Es la explicación de por qué el número
              bajó, y el único lugar desde donde alguien puede arrepentirse. Y los motivos juntos son
              el dato: muchas «en otro lugar» quieren decir que el sector ⛔ no está donde el sistema
              cree; muchas «se colgó después», que el balance se hace demasiado tarde. */}
          {!!sacadas.length && (
            <div style={{ marginTop: space[3], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
              <div style={{ fontSize: font.sm, fontWeight: weight.semibold }}>
                Sacadas del mandado: {sacadas.length} {sacadas.length === 1 ? 'prenda' : 'prendas'}
              </div>
              {sacadas.map((b) => {
                const id = exhibId(b.it)
                return (
                  <div key={id} style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 2px' }}>
                    <span style={{ fontSize: font.sm, color: color.mut, textDecoration: 'line-through' }}>
                      {b.it.name} · {b.it.size || '—'}
                    </span>
                    <span style={{ fontSize: font.xs, color: color.mut }}>
                      {MOTIVOS[b.tachada.motivo] || b.tachada.motivo}
                      {b.tachada.por ? ` · ${b.tachada.por}` : ''}
                    </span>
                    <Button size="sm" variant="ghost" loading={tachando === id} onClick={() => void tachar(id, null)}>
                      volver a ponerla
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ LA OTRA MITAD DEL BALANCE: lo que SOBRA en el salón ═══
          🔴 Va en la MISMA vista y ⛔ no en una pantalla aparte, y lo pidió así Bruno: quien está
          mirando este recorrido ya tiene el salón en la cabeza, y decidir «falta» y «sobra» en dos
          momentos distintos es releer la misma lista dos veces. */}
      {!!repes.length && (
        <div style={{ marginTop: space[4], paddingTop: space[3], borderTop: `2px solid ${color.line}` }}>
          <div style={{ fontWeight: weight.bold }}>
            Colgadas más de una vez: {repes.length} {repes.length === 1 ? 'prenda' : 'prendas'}
            <span style={{ fontWeight: weight.normal, color: color.mut }}>
              {' '}· {repes.reduce((n, c) => n + c.deMas, 0)} {repes.reduce((n, c) => n + c.deMas, 0) === 1 ? 'percha' : 'perchas'} que se podrían liberar
            </span>
          </div>
          <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>
            El mismo color y talle pasó dos veces por el lector, o apareció en dos muebles distintos. Decidí cada una: puede ser a propósito.
          </div>

          {/* 🔑 Lo no decidido primero: es el trabajo pendiente. Mezclado con lo resuelto, hay que
              releer la lista entera cada vez que se vuelve. */}
          {sinDecidir.map((c) => (
            <div key={c.variante_id} style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap', padding: '6px 2px', borderBottom: `1px solid ${color.line}` }}>
              <span style={{ fontSize: font.base, color: color.ink }}>
                <b>{c.unidades}</b> colgadas · {c.nombre} <span style={{ color: color.mut }}>· {c.size || '—'}</span>
                {/* La prenda que está en DOS muebles es el caso que ⛔ no se ve mirando uno solo. */}
                {c.lugares.length > 1 && <span style={{ color: color.mut }}> · en {c.lugares.join(' y ')}</span>}
                {/* 🔴 **Lo que la app NO puede afirmar, dicho en el renglón.** Con prendas
                    escaneadas en el medio ⛔ no hay otra explicación que dos perchas; entrando
                    pegadas, puede ser una pila de iguales o la misma pasada dos veces porque ⛔ no
                    se escuchó el pitido. Callarlo presentaría las 23 con la misma certeza, y la
                    primera que resulte falsa se lleva puesta la confianza en las otras veintidós. */}
                {c.otrasEnMedio === 0 ? (
                  <span style={{ display: 'block', fontSize: font.xs, color: color.warningInk }}>
                    ⚠ las lecturas entraron seguidas ({c.segundos} s, sin ninguna otra prenda en el medio): confirmalo mirando el perchero
                  </span>
                ) : (
                  <span style={{ display: 'block', fontSize: font.xs, color: color.mut }}>
                    escaneó {c.otrasEnMedio} {c.otrasEnMedio === 1 ? 'prenda' : 'prendas'} en el medio, así que son dos distintas
                  </span>
                )}
              </span>
              {(Object.keys(DECISIONES) as DecisionRepetida[]).map((d) => (
                <Button key={d} size="sm" variant="outline" loading={decidiendo === c.variante_id} onClick={() => void decidir(c.variante_id, d)}>
                  {DECISIONES[d]}
                </Button>
              ))}
            </div>
          ))}

          {!!sacar.length && (
            <div style={{ marginTop: space[3] }}>
              <div style={{ fontSize: font.sm, fontWeight: weight.semibold }}>
                Devolver al depósito: {sacar.reduce((n, c) => n + c.deMas, 0)}{' '}
                {sacar.reduce((n, c) => n + c.deMas, 0) === 1 ? 'unidad' : 'unidades'} de {sacar.length} {sacar.length === 1 ? 'prenda' : 'prendas'}
              </div>
              {sacar.map((c) => (
                <div key={c.variante_id} style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 2px' }}>
                  <span style={{ fontSize: font.sm, color: color.ink }}>
                    {c.nombre} · {c.size || '—'} <span style={{ color: color.mut }}>· sacar {c.deMas}</span>
                  </span>
                  <Button size="sm" variant="ghost" loading={decidiendo === c.variante_id} onClick={() => void decidir(c.variante_id, null)}>
                    deshacer
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                style={{ marginTop: space[2] }}
                onClick={() =>
                  void descargarXlsx(filasSacar(sacar), {
                    archivo: `devolver-al-deposito-${marca}-${new Date().toISOString().slice(0, 10)}.xlsx`,
                    hoja: 'Devolver al depósito',
                    anchos: ANCHOS_SACAR,
                  })
                }
              >
                Descargar lo que vuelve al depósito
              </Button>
            </div>
          )}

          {/* 🔑 Lo que se dejó a propósito también se muestra: es una decisión tomada, y el que
              vuelve dentro de un mes tiene que ver que ya se miró — si ⛔ no, la vuelve a mirar. */}
          {!!quedan.length && (
            <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[3] }}>
              Se dejaron dobles a propósito: {quedan.map((c) => `${c.nombre} ${c.size}`).join(' · ')}.{' '}
              <Button size="sm" variant="ghost" onClick={() => void decidir(quedan[0].variante_id, null)}>
                volver a decidir la primera
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 🔴 **El seguro del 21-sep-2026.** Reemplaza al cartel de «sin categoría en Tienda Nube»,
          que declarando por nombre ⛔ ya no hace falta —toda prenda tiene nombre, así que ninguna es
          invisible—. Lo que sí puede pasar es declarar de menos, y eso es lo que se dice acá. */}
      {!!elegidas.length && afuera > 0 && (
        <div style={{ fontSize: font.sm, marginTop: space[3], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
          ⚠️ Este recorrido tocó <b>{afuera}</b> {afuera === 1 ? 'prenda' : 'prendas'} de tipos que <b>no marcaste</b>. Si caminaste ese sector también,
          marcalos: no van a aparecer en el mandado.
        </div>
      )}
    </Notice>
  )
}
