'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, color, font, space, useToast, weight } from '@/components/ui'
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
  porModelo,
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
  const modelos = useMemo(() => porModelo(mandado, escaneos), [mandado, escaneos])

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

  /**
   * 🔴 **Tocar un tipo YA guarda** (26-sep-2026). Había un botón «Guardar el balance» que decía
   * «Balance guardado» con ninguna casilla marcada: parecía terminado sin estarlo. Un toque = una
   * declaración firmada por el servidor, como antes; sólo se sacó el paso del medio.
   */
  async function alternar(tipo: string) {
    const next = elegidas.some((t) => tipoDePrenda(t) === tipoDePrenda(tipo))
      ? elegidas.filter((t) => tipoDePrenda(t) !== tipoDePrenda(tipo))
      : [...elegidas, tipo]
    setElegidas(next)
    setGuardando(true)
    try {
      onGuardada(await guardarCobertura(marca, recorridoId, next))
    } catch (e) {
      toast.error('No se pudo guardar: ' + (e as Error).message)
      setElegidas(elegidas)
    } finally {
      setGuardando(false)
    }
  }

  /** Un balance declarado con el criterio viejo (categorías de TN) ⛔ cuenta como declarado. */
  const declaradoALaVieja = !cobertura?.tipos?.length && !!cobertura?.cats?.length

  const marcados = tipos.filter((c) => elegidas.some((x) => tipoDePrenda(x) === c.tipo))
  const escaneadas = marcados.reduce((n, c) => n + c.vistas, 0)
  const universo = marcados.reduce((n, c) => n + c.universo, 0)
  const perchasDeMas = sacar.reduce((n, c) => n + c.deMas, 0)

  const excelMandado = () =>
    void descargarXlsx(filasBuscar(mandado), {
      archivo: `falta-exhibir-${marca}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      hoja: 'Buscar en depósito',
      // ⚠️ Los anchos se recortan con las columnas: `filasBuscar` tira la última cuando ⛔ no tiene
      // nada que decir, y un ancho de más corre todo el Excel.
      anchos: ANCHOS_BUSCAR.slice(0, filasBuscar(mandado)[0].length),
    })

  /*
   * 🔴 **POCO TEXTO: una pregunta, tres números, dos listas** (26-sep-2026, Bruno: *«mucho texto y
   * poca definición»*). Cada bloque arrastraba su párrafo de explicación y la pantalla daba tres
   * respuestas distintas a «¿qué falta?». Lo que explica va en el `title` (el ⓘ); en pantalla queda
   * lo que se decide. ⛔ No volver a poner párrafos arriba de las listas.
   */
  return (
    <div style={{ marginBottom: space[4], padding: space[4], borderRadius: 12, border: `1px solid ${color.line}`, background: color.surface }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: weight.bold, fontSize: font.lg, color: color.ink }}>
          Balance{' '}
          <span
            title="Marcá los tipos de prenda que este recorrido caminó enteros. Con eso se arma la lista de lo que hay que ir a buscar al depósito del local. Si sólo se caminó un mueble suelto, no marques nada."
            style={{ fontSize: font.sm, color: color.mut, cursor: 'help' }}
          >
            ⓘ
          </span>
        </div>
        {/* 🔴 De cuándo es el stock: una línea y un botón. Ver `stockViejo`. */}
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', fontSize: font.sm, color: stockViejo ? color.warningInk : color.mut }}>
          <span
            title="El local vende unas 160 prendas por día: con el stock viejo, la lista puede mandar a buscar cosas que ya se vendieron."
          >
            {stockDe === undefined
              ? 'Stock…'
              : stockDe === null
                ? '⚠️ Stock de hora desconocida'
                : stockDe.horas < 1
                  ? '✓ Stock de recién'
                  : `⚠️ Stock de hace ${Math.round(stockDe.horas)} h`}
          </span>
          <Button size="sm" variant={stockViejo ? 'solid' : 'outline'} tone={stockViejo ? 'brand' : undefined} onClick={() => void onTraerStock()} loading={trayendo}>
            Actualizar stock
          </Button>
        </div>
      </div>

      {/* ── La pregunta: qué se caminó entero ── */}
      <div style={{ fontSize: font.sm, color: color.mut, margin: `${space[3]}px 0 ${space[2]}px` }}>
        ¿Qué se caminó entero?{declaradoALaVieja && <span style={{ color: color.warningInk }}> · marcalo de nuevo (se había guardado con otro criterio)</span>}
      </div>
      {/* 🔴 Ordenados por lo que PASÓ POR EL LECTOR, ⛔ por porcentaje: ver `coberturaPorTipo`. */}
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        {tipos.map((c) => {
          const puesta = elegidas.some((x) => tipoDePrenda(x) === c.tipo)
          return (
            <Button
              key={c.tipo}
              size="sm"
              variant={puesta ? 'solid' : 'outline'}
              tone={puesta ? 'brand' : 'neutral'}
              disabled={guardando}
              title={`Pasaron por el lector ${c.vistas} de las ${c.universo} que hay en el local`}
              onClick={() => void alternar(c.tipo)}
            >
              {puesta ? '✓ ' : ''}
              {c.tipo} <span style={{ opacity: 0.7, marginLeft: 4 }}>{c.vistas}/{c.universo}</span>
            </Button>
          )
        })}
      </div>

      {!!elegidas.length && (
        <>
          {/* ── Tres números ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: space[2], margin: `${space[4]}px 0` }}>
            <Numero etiqueta="Faltan colgar" valor={resumen.variantes} tono={resumen.variantes ? 'warning' : 'ok'} />
            <Numero etiqueta="Sobran" valor={perchasDeMas + sinDecidir.reduce((n, c) => n + c.deMas, 0)} tono="neutral" />
            <Numero etiqueta="Escaneadas" valor={`${escaneadas}/${universo}`} tono="neutral" />
          </div>

          {/* 🔴 El aviso va ARRIBA de la lista: después de leer «faltan 82» la decisión ya está tomada. */}
          {flojas.map((f) => (
            <div key={f.tipo} style={{ fontSize: font.sm, color: color.warningInk, marginBottom: space[2] }}>
              ⚠️ {f.tipo}: se escaneó el {Math.round(f.cubierto * 100)} %. Lo que falta puede estar en otro mueble.
            </div>
          ))}
          {afuera > 0 && (
            <div style={{ fontSize: font.sm, color: color.warningInk, marginBottom: space[2] }}>
              ⚠️ {afuera} {afuera === 1 ? 'prenda escaneada es' : 'prendas escaneadas son'} de tipos sin marcar.
            </div>
          )}

          {/* ── Faltan colgar, por modelo ── */}
          {!!mandado.length && (
            <div style={{ display: 'flex', gap: space[2], alignItems: 'center', justifyContent: 'space-between', marginTop: space[2] }}>
              <div style={{ fontWeight: weight.semibold, color: color.ink }}>
                Faltan colgar <span style={{ fontWeight: weight.normal, color: color.mut, fontSize: font.sm }}>· ⭐ otro color ya colgado</span>
              </div>
              <Button size="sm" variant="outline" onClick={excelMandado}>
                Excel
              </Button>
            </div>
          )}
          {/* 🔴 Un renglón por MODELO (26-sep-2026, Bruno: «que el mensaje sea rápido por nombre»).
              Ver `porModelo`. Cada color se toca para tacharlo; los motivos se abren en el renglón. */}
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {modelos.map((m) => {
              const abierto = m.faltan.find((b) => exhibId(b.it) === eligiendo)
              return (
                <div key={m.productId} style={{ padding: '8px 2px', borderBottom: `1px solid ${color.line}` }}>
                  <div style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: weight.semibold, fontSize: font.base, color: color.ink }}>
                      {m.hermanaColgada ? '⭐ ' : ''}
                      {m.nombre}
                    </span>
                    {m.faltan.map((b) => {
                      const id = exhibId(b.it)
                      return (
                        <Button
                          key={id}
                          size="sm"
                          variant={eligiendo === id ? 'solid' : 'outline'}
                          tone={eligiendo === id ? 'brand' : 'neutral'}
                          title="Tocalo si ya está colgado"
                          onClick={() => setEligiendo(eligiendo === id ? null : id)}
                        >
                          {b.it.size || '—'}
                        </Button>
                      )
                    })}
                  </div>
                  {abierto && (
                    <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', marginTop: space[2] }}>
                      {(Object.keys(MOTIVOS) as MotivoTachada[]).map((mo) => (
                        <Button key={mo} size="sm" variant="outline" loading={tachando === eligiendo} onClick={() => void tachar(exhibId(abierto.it), mo)}>
                          {MOTIVOS[mo]}
                        </Button>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => setEligiendo(null)}>
                        cancelar
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 🔴 Lo tachado se muestra, ⛔ se borra: es el único lugar desde donde arrepentirse. */}
          {!!sacadas.length && (
            <div style={{ marginTop: space[3] }}>
              <div style={{ fontSize: font.sm, color: color.mut }}>Ya colgadas ({sacadas.length})</div>
              {sacadas.map((b) => {
                const id = exhibId(b.it)
                return (
                  <div key={id} style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap', padding: '2px' }}>
                    <span style={{ fontSize: font.sm, color: color.mut, textDecoration: 'line-through' }}>
                      {b.it.name} · {b.it.size || '—'}
                    </span>
                    <span style={{ fontSize: font.xs, color: color.mut }}>{MOTIVOS[b.tachada.motivo] || b.tachada.motivo}</span>
                    <Button size="sm" variant="ghost" loading={tachando === id} onClick={() => void tachar(id, null)}>
                      deshacer
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ Lo que SOBRA: ⛔ depende de lo marcado, es un hecho del recorrido. ═══ */}
      {!!repes.length && (
        <div style={{ marginTop: space[4], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
          <div style={{ fontWeight: weight.semibold, color: color.ink, marginBottom: space[1] }}>
            Sobran{' '}
            <span
              title="El mismo color y talle pasó dos veces por el lector, o apareció en dos muebles. Decidí cada una: puede ser a propósito."
              style={{ fontSize: font.sm, color: color.mut, cursor: 'help' }}
            >
              ⓘ
            </span>
          </div>
          {sinDecidir.map((c) => (
            <div key={c.variante_id} style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap', padding: '6px 2px', borderBottom: `1px solid ${color.line}` }}>
              <span style={{ fontSize: font.base, color: color.ink }}>
                <b>{c.nombre}</b> <span style={{ color: color.mut }}>{c.size || '—'} · ×{c.unidades}</span>
                {c.lugares.length > 1 && <span style={{ color: color.mut }}> · en {c.lugares.join(' y ')}</span>}
                {/* 🔴 Lo que la app ⛔ puede afirmar: leídas pegadas pueden ser la misma pasada dos veces. */}
                {c.otrasEnMedio === 0 && (
                  <span style={{ fontSize: font.xs, color: color.warningInk }} title={`Las lecturas entraron seguidas (${c.segundos} s), sin otra prenda en el medio`}>
                    {' '}· ⚠ confirmalo en el perchero
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
            <div style={{ marginTop: space[2] }}>
              <div style={{ display: 'flex', gap: space[2], alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: font.sm, color: color.mut }}>Devolver al depósito ({perchasDeMas})</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void descargarXlsx(filasSacar(sacar), {
                      archivo: `devolver-al-deposito-${marca}-${new Date().toISOString().slice(0, 10)}.xlsx`,
                      hoja: 'Devolver al depósito',
                      anchos: ANCHOS_SACAR,
                    })
                  }
                >
                  Excel
                </Button>
              </div>
              {sacar.map((c) => (
                <div key={c.variante_id} style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap', padding: '2px' }}>
                  <span style={{ fontSize: font.sm, color: color.ink }}>
                    {c.nombre} · {c.size || '—'} <span style={{ color: color.mut }}>· sacar {c.deMas}</span>
                  </span>
                  <Button size="sm" variant="ghost" loading={decidiendo === c.variante_id} onClick={() => void decidir(c.variante_id, null)}>
                    deshacer
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!!quedan.length && (
            <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[2] }}>
              Quedan dobles a propósito: {quedan.map((c) => `${c.nombre} ${c.size}`).join(' · ')}.{' '}
              <Button size="sm" variant="ghost" onClick={() => void decidir(quedan[0].variante_id, null)}>
                deshacer
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Numero({ etiqueta, valor, tono }: { etiqueta: string; valor: number | string; tono: 'warning' | 'ok' | 'neutral' }) {
  const fondo = tono === 'warning' ? color.warningBg : tono === 'ok' ? color.successBg : color.bg
  return (
    <div style={{ padding: `${space[2]}px ${space[3]}px`, borderRadius: 10, background: fondo }}>
      <div style={{ fontSize: font.xs, color: color.mut }}>{etiqueta}</div>
      <div style={{ fontSize: font['2xl'], fontWeight: weight.bold, color: color.ink }}>{valor}</div>
    </div>
  )
}
