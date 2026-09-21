'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Notice, color, font, space, useToast, weight } from '@/components/ui'
import { descargarXlsx } from '@/lib/excel'
import { buscarEnDeposito, coberturaPorCat, filasBuscar, resumenBuscar, sinCategoriaSinVer, HEADER_BUSCAR } from '@/lib/exhib/balance'
import { guardarCobertura } from '@/lib/exhib/cliente'
import { normCat } from '@/lib/exhib/core'
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
  const [elegidas, setElegidas] = useState<string[]>(cobertura?.cats ?? [])
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

  const cats = useMemo(() => coberturaPorCat(escaneos, items), [escaneos, items])
  const lista = useMemo(() => buscarEnDeposito(escaneos, items, elegidas), [escaneos, items, elegidas])
  const sinCat = useMemo(() => sinCategoriaSinVer(escaneos, items), [escaneos, items])
  const resumen = resumenBuscar(lista)

  // Sin una sola categoría tocada ⛔ no hay nada que balancear (un recorrido de puros códigos que no
  // cruzaron, por ejemplo). Decirlo es más honesto que mostrar una caja vacía.
  if (!cats.length) return null

  const alternar = (cat: string) =>
    setElegidas((prev) => (prev.some((c) => normCat(c) === normCat(cat)) ? prev.filter((c) => normCat(c) !== normCat(cat)) : [...prev, cat]))

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

  const sinGuardar = JSON.stringify(elegidas.map(normCat).sort()) !== JSON.stringify((cobertura?.cats ?? []).map(normCat).sort())

  return (
    <Notice tone="brand" icon="📋" style={{ marginBottom: space[4] }}>
      <div style={{ fontWeight: weight.bold, fontSize: font.base }}>Balance del sector</div>
      <div style={{ fontSize: font.sm, marginBottom: space[3] }}>
        Marcá las categorías que este recorrido caminó <b>enteras</b>. Con eso se arma la lista de lo que hay que ir a buscar al
        depósito del local. Si sólo se caminó un mueble suelto, dejalo sin marcar.
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

      {cats.map((c) => {
        const puesta = elegidas.some((x) => normCat(x) === normCat(c.cat))
        const pct = Math.round(c.cubierto * 100)
        return (
          <label
            key={c.cat}
            style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', padding: '8px 2px', borderBottom: `1px solid ${color.line}`, cursor: 'pointer' }}
          >
            <input type="checkbox" checked={puesta} onChange={() => alternar(c.cat)} style={{ width: 20, height: 20, marginTop: 2, flex: '0 0 auto' }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: color.ink }}>{c.cat}</span>
              <span style={{ display: 'block', fontSize: font.sm, color: color.mut }}>
                {/* 🔴 El número con el que se decide. Va en palabras de local: «de las N que el sistema
                    dice que hay acá», ⛔ no «universo». */}
                Pasaron por el lector <b>{c.vistas}</b> de las <b>{c.universo}</b> que el sistema tiene en el local ({pct}%)
                {c.universo > c.vistas && <> · quedan <b>{c.unidadesSinVer}</b> {c.unidadesSinVer === 1 ? 'unidad' : 'unidades'} sin ver</>}
              </span>
            </span>
          </label>
        )
      })}

      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', margin: `${space[3]}px 0 0` }}>
        <Button size="sm" variant="solid" tone="brand" onClick={() => void guardar()} loading={guardando} disabled={!sinGuardar}>
          {sinGuardar ? 'Guardar el balance' : 'Balance guardado'}
        </Button>
        {!!lista.length && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void descargarXlsx(filasBuscar(lista), {
                archivo: `buscar-en-deposito-${marca}-${new Date().toISOString().slice(0, 10)}.xlsx`,
                hoja: 'Buscar en depósito',
                anchos: [40, 18, 18, 18, 14, 28],
              })
            }
          >
            Descargar el mandado
          </Button>
        )}
      </div>

      {/* 🔑 Quién lo declaró y cuándo: es una lista que manda a mover mercadería, y dentro de un mes
          hay que poder saber de quién fue la afirmación. */}
      {cobertura?.por && !sinGuardar && (
        <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[2] }}>
          Lo declaró {cobertura.por} el {new Date(cobertura.cuando).toLocaleDateString('es-AR')}.
        </div>
      )}

      {!!elegidas.length && (
        <div style={{ marginTop: space[4] }}>
          <div style={{ fontWeight: weight.bold }}>
            Buscar en el depósito del local: {resumen.productos} {resumen.productos === 1 ? 'prenda' : 'prendas'} · {resumen.variantes}{' '}
            {resumen.variantes === 1 ? 'color/talle' : 'colores o talles'} · {resumen.unidades} {resumen.unidades === 1 ? 'unidad' : 'unidades'}
          </div>
          {!lista.length ? (
            <div style={{ fontSize: font.sm }}>No falta nada: todo lo que el sistema tiene en el local de esas categorías pasó por el lector.</div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto', marginTop: space[2] }}>
              {lista.map((b) => (
                <div key={b.it.barcode || b.it.productId + '|' + b.it.size} style={{ padding: '6px 2px', borderBottom: `1px solid ${color.line}` }}>
                  <div style={{ fontSize: font.base, color: color.ink }}>
                    {b.it.name} <span style={{ color: color.mut }}>· {b.it.size || '—'}</span>{' '}
                    <b>{b.it.qty}</b> <span style={{ color: color.mut }}>{b.it.qty === 1 ? 'unidad' : 'unidades'}</span>
                  </div>
                  {/* Explica por qué aparece algo que no parece del sector, en vez de esconderlo: el
                      bolsón «TOPS Y BODIES» se come 5 corsets y un saquito. */}
                  {!!b.tambienEn.length && <div style={{ fontSize: font.xs, color: color.mut }}>también está en {b.tambienEn.join(' / ')}</div>}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[2] }}>
            El Excel lleva {HEADER_BUSCAR.length} columnas, con el código de barras para buscarlas con el lector.
          </div>
        </div>
      )}

      {/* 🔴 Lo que el balance ⛔ NO puede juzgar, dicho siempre. Callarlo haría leer el mandado como
          completo cuando ⛔ no lo es, y nadie va a buscar algo que la lista ⛔ no nombró. */}
      {!!sinCat.length && (
        <div style={{ fontSize: font.sm, marginTop: space[3], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
          ⚠️ Hay <b>{sinCat.length}</b> {sinCat.length === 1 ? 'prenda' : 'prendas'} con stock en el local <b>sin categoría en Tienda Nube</b> que no pasaron
          por el lector ({new Set(sinCat.map((i) => i.productId)).size} productos). No entran en esta cuenta ni para bien ni para mal: para que entren,
          hay que vincularles una categoría en Tienda Nube.
        </div>
      )}
    </Notice>
  )
}
