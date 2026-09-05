import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TablaCeldas } from '@/components/meta-ads/zona/TablaCeldas'
import { veredictoDeCelda, type Celda } from '@/lib/meta-ads/rendimiento'
import type { Acciones } from '@/components/meta-ads/acciones/tipos'

/**
 * **LA TABLA DE PAUTAS, dibujada.**
 *
 * 🔴 **Este archivo nace tapando un hueco, ⛔ no cubriendo algo nuevo.** Hasta el 5-sep-2026
 * `TablaCeldas` ⛔ no se renderizaba en NINGÚN test: ni sus columnas, ni su orden, ni los títulos de
 * veredicto que dibuja. `FilaDeKpis` sí se testeaba, y se exportó a propósito para poder hacerlo
 * —*«el defecto vivía en qué tarjeta lee qué objeto, que es cableado de pantalla»*—; a la tabla ⛔ no
 * se le dio ese tratamiento, y es la que tiene el veredicto y los botones que mueven plata.
 *
 * 🔑 Lo que se fija acá es lo que se acaba de cambiar y lo que se puede despegar solo:
 *  1. la fila cerrada **⛔ no repite `porque[0]`** — era el mismo dato dos veces y lo que aplastaba
 *     la tabla contra la columna de veredicto;
 *  2. **el dato ⛔ no se perdió** al sacar las columnas `% techo` y `% diario`: siguen dibujados;
 *  3. **el `colSpan` del detalle es igual a la cantidad de `<th>`** — estaba clavado en `11` a mano
 *     y era lo primero que se despegaba al tocar una columna;
 *  4. un costo sin compras dibuja `—` y ⛔ **nunca `$0`**, invariante viejo que ⛔ no tenía test.
 */

/** `puede: false` a propósito: acá se mira el PILL, y sin botones ⛔ no se confunde con ellos. */
const ACCIONES = {
  puede: () => false,
  enCurso: null,
  onEstado: () => {},
  onPresupuesto: () => {},
  onNombre: () => {},
  onDuplicar: () => {},
  onCrear: () => {},
  onEscalar: () => {},
} as unknown as Acciones

/** Una pauta con lo mínimo, y con el veredicto que le corresponde de verdad al núcleo. */
function celda(over: Partial<Celda> & { spend: number; compras: number }, techo = 7000): Celda {
  const base = {
    id: 'a1',
    nombre: 'GIRLHOOD FRIO - INTERESES 1',
    linea: 'bdi',
    campaignId: 'c1',
    cuentaId: '1',
    moneda: 'ARS',
    estado: 'ACTIVE',
    estadoReal: 'entregando',
    diario: 9000,
    impresiones: 40000,
    clicks: 900,
    revenue: 100000,
    carritos: 30,
    checkouts: 12,
    lpv: 700,
    link_clicks: 800,
    diasConEmbudo: { carritos: 7, checkouts: 7, lpv: 7, link_clicks: 7 },
    ctr: 2.2,
    cpc: 40,
    cpm: 1500,
    roas: 2,
    dias: 7,
    diasConGasto: 7,
    desde: '2026-08-29',
    hasta: '2026-09-04',
    serie: [],
    desgaste: { firma: 'sano', motivo: '', ctrDelta: -2, cpmDelta: -1, ctrA: 2.3, ctrB: 2.2, cpmA: 1520, cpmB: 1500 },
    aprendizaje: { convSemana: 13, necesita: 50, faltan: 37, cruza: false, pide: 60000, cpa: 5000, reiniciadoEl: null },
    avisos: [],
    ...over,
  } as unknown as Celda
  return { ...base, costo: base.compras ? base.spend / base.compras : 0, veredicto: veredictoDeCelda(base, { techo }) }
}

const pinta = (celdas: Celda[], dias = 7) =>
  renderToStaticMarkup(
    <TablaCeldas
      celdas={celdas}
      moneda="ARS"
      acciones={ACCIONES}
      cuenta={null}
      dias={dias}
      hallazgosDe={() => null}
      quitarHallazgo={() => {}}
    />,
  )

describe('la tabla de pautas', () => {
  it('🔴 tiene SEIS columnas — eran once y la de veredicto aplastaba al resto', () => {
    const m = pinta([celda({ spend: 60000, compras: 12 })])
    expect((m.match(/<th[ >]/g) || []).length).toBe(6)
    expect(m).toContain('Pauta')
    expect(m).toContain('Qué hacer')
    // Las cuatro que se fueron: dos bajaron al pie de su número y dos al detalle.
    expect(m).not.toContain('>% techo<')
    expect(m).not.toContain('>% diario<')
    expect(m).not.toContain('>Veredicto<')
    expect(m).not.toContain('>Acciones<')
  })

  it('🔴 la fila cerrada ⛔ NO repite `porque[0]`: era el mismo dato que las columnas de al lado', () => {
    const c = celda({ spend: 84000, compras: 12 })
    // El núcleo lo sigue calculando —el detalle lo usa entero—, pero la fila ⛔ no lo dibuja.
    expect(c.veredicto.porque[0]).toContain('contra un techo de')
    expect(pinta([c])).not.toContain('contra un techo de')
  })

  it('🔑 el dato ⛔ NO se perdió al sacar las columnas: el % del techo y el % del diario siguen', () => {
    const m = pinta([celda({ spend: 84000, compras: 12 })])
    expect(m).toContain('% del techo')
    expect(m).toContain('% de su diario')
  })

  it('la banda del ruido se dibuja en TODAS las filas, ⛔ no sólo en las dudosas', () => {
    // 2 compras ⇒ ±71%. Sin el `±`, un «90% del techo» sobre dos compras se lee como una afirmación.
    expect(pinta([celda({ spend: 12600, compras: 2 })])).toContain('±71%')
  })

  it('⛔ un costo sin compras dibuja «—» y NUNCA $0: un 0 ahí se lee «salieron gratis»', () => {
    const m = pinta([celda({ spend: 3000, compras: 0 }, 100000)])
    expect(m).toContain('—')
    expect(m).not.toContain('$ 0<')
  })

  it('🔑 el `colSpan` del detalle es igual a la cantidad de columnas — estaba clavado en 11 a mano', () => {
    const ths = (pinta([celda({ spend: 60000, compras: 12 })]).match(/<th[ >]/g) || []).length
    // La fila abierta sólo aparece con un hallazgo o con un clic; se fuerza con `hallazgosDe`.
    const m = renderToStaticMarkup(
      <TablaCeldas
        celdas={[celda({ spend: 60000, compras: 12 })]}
        moneda="ARS"
        acciones={ACCIONES}
        cuenta={null}
        dias={7}
        hallazgosDe={() => ([{ id: 1, motivo: 'algo', sugerencia: null, objetoId: 'a1', objetoNombre: 'x', nivel: 'conjunto', veces: 1 }] as never)}
        quitarHallazgo={() => {}}
      />,
    )
    // React lo emite en minúscula y sin comillas cuando es número: se busca la forma real.
    const cs = m.match(/colspan="?(\d+)"?/i)
    expect(cs, 'la fila de detalle tiene que existir').toBeTruthy()
    expect(Number(cs![1])).toBe(ths)
  })

  it('🔑 una pauta con hallazgo NACE ABIERTA: es «lo que hay que decidir se ve sin un clic»', () => {
    const c = celda({ spend: 60000, compras: 12 })
    const sinHallazgo = pinta([c])
    const conHallazgo = renderToStaticMarkup(
      <TablaCeldas
        celdas={[c]}
        moneda="ARS"
        acciones={ACCIONES}
        cuenta={null}
        dias={7}
        hallazgosDe={() => ([{ id: 1, motivo: 'gastó de más', sugerencia: null, objetoId: 'a1', objetoNombre: 'x', nivel: 'conjunto', veces: 1 }] as never)}
        quitarHallazgo={() => {}}
      />,
    )
    expect(sinHallazgo).not.toContain('QUÉ HAY QUE DECIDIR ACÁ')
    expect(conHallazgo).toContain('QUÉ HAY QUE DECIDIR ACÁ')
    expect(conHallazgo).toContain('POR QUÉ')
    // Y la fila madre lo DICE, ⛔ no sólo se pinta: `aria-expanded` viaja con el fondo.
    expect(conHallazgo).toContain('aria-expanded="true"')
  })

  it('🔴 el pill se dibuja SÓLO donde hay una mano — si no, doce filas serían un muro gris', () => {
    // Rinde clarito ⇒ ⛔ ningún pill de acción, pero el ESTADO sí, como badge al lado del nombre.
    const rinde = pinta([celda({ spend: 21000, compras: 12 })])
    expect(rinde).not.toContain('Pausar')
    expect(rinde).toContain('Rinde')
    // Cara de verdad (2 compras al 200%, arriba del ruido) ⇒ el pill con la MANO, en infinitivo.
    const cara = pinta([celda({ spend: 28000, compras: 2 })])
    expect(cara).toContain('Pausar')
    expect(cara).toContain('Cara')
  })

  it('🔑 cuando el juicio se estiró, la fila DICE sobre cuántos días la juzgó', () => {
    const c = celda({ spend: 60000, compras: 12 })
    // Se simula lo que hace `armarZona`: el veredicto viene de una ventana más larga que la mirada.
    const estirada = { ...c, veredicto: { ...c.veredicto, ventanaJuicio: 30 } } as Celda
    expect(pinta([estirada], 7)).toContain('sobre 30 días')
    // Y con la misma ventana ⛔ no se dice nada: sería ruido en cada fila.
    expect(pinta([c], 7)).not.toContain('sobre 7 días')
  })
})
