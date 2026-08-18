'use client'

import { LABEL_LINEA } from '@/lib/memo/tipos'
import type { Pyl, PylFila } from '@/lib/norte/tipos'
import { EmptyState, SectionCard, TBody, THead, TableWrap, Td, Th, Tr, color, font, space } from '@/components/ui'

/**
 * El **P&L «por arriba» por línea**: la misma plata de la contribución por canal, leída como un
 * estado de resultados y abierta por negocio (`bdi` · `zattia` · `stunned`).
 *
 * ## Por qué las líneas son COLUMNAS y los renglones son FILAS
 *
 * Porque un P&L se lee de arriba hacia abajo: facturado, lo que se le resta, las netas, el costo,
 * el margen. Puesto al revés —una fila por línea— cada renglón queda a lo ancho y la cuenta deja de
 * verse como una cuenta: hay que ir y volver entre columnas para seguir una resta. Es la misma
 * forma que tiene el P&L del dashboard, a propósito: son los dos números que alguien va a querer
 * cotejar renglón contra renglón el día que no coincidan.
 *
 * ⛔ **Termina en la contribución.** Los gastos fijos —la estructura, $25-30M por mes de las tres
 * marcas— viven en el dashboard y no tienen endpoint. Estimarlos para «completar» el P&L sería
 * inventar justo el número que decide si una línea da o no da.
 */
export function PylLinea({ pyl }: { pyl: Pyl }) {
  const lineas = pyl.lineas || []
  // Con una sola línea la columna de total es la misma columna dos veces. En BDI es el caso siempre.
  const conTotal = lineas.length > 1
  const columnas: PylFila[] = conTotal && pyl.total ? [...lineas, pyl.total] : lineas

  return (
    <SectionCard
      title="Cuánto deja cada línea"
      subtitle={
        pyl.ventana
          ? `P&L por arriba, del ${pyl.ventana.desde} al ${pyl.ventana.hasta} — hasta la contribución, sin gastos fijos`
          : 'P&L por arriba, hasta la contribución'
      }
    >
      {!pyl.disponible || columnas.length === 0 ? (
        <EmptyState
          title="Todavía no hay P&L"
          hint={pyl.motivo || 'No hay ventas con costo y cuenta de cobro para armarlo.'}
        />
      ) : (
        <TableWrap>
          <THead>
            <Tr>
              <Th>Renglón</Th>
              {columnas.map((c) => (
                <Th key={c.linea} align="right">
                  {c.linea === 'total' ? 'Total' : LABEL_LINEA[c.linea]}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {RENGLONES.map((r) => (
              <Tr key={r.titulo} style={r.subtotal ? { background: color.bg2 } : undefined}>
                <Td strong={r.subtotal} title={r.ayuda}>
                  {r.titulo}
                </Td>
                {columnas.map((c) => (
                  <Td key={c.linea} align="right" mono strong={r.subtotal}>
                    {r.valor(c)}
                  </Td>
                ))}
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      )}
      <NotaPyl pyl={pyl} />
    </SectionCard>
  )
}

/**
 * Un renglón de la cascada, **con el signo con el que entra a la cuenta**.
 *
 * 🔑 El descuento se muestra restando aunque en la base pueda ser **negativo** (existe: son ajustes
 * de precio hacia arriba). Mostrar el campo crudo obligaría a saber de memoria si en este renglón
 * un número positivo suma o resta; mostrar su efecto no.
 */
type Renglon = {
  titulo: string
  valor: (f: PylFila) => string
  subtotal?: boolean
  ayuda?: string
}

/** `−$1.234` / `$1.234`, redondeado. El signo va adelante del peso, como se lee en castellano. */
function pesos(n: number): string {
  const r = Math.round(n)
  return `${r < 0 ? '−' : ''}$${Math.abs(r).toLocaleString('es-AR')}`
}

const RENGLONES: Renglon[] = [
  { titulo: 'Facturado', valor: (f) => pesos(f.mercaderia), ayuda: 'La suma de los renglones de venta, con IVA adentro.' },
  { titulo: 'Descuentos', valor: (f) => pesos(-f.descuentos) },
  { titulo: 'Envíos cobrados', valor: (f) => pesos(f.envios), ayuda: 'Lo que pagó el cliente por el envío: es un ingreso.' },
  { titulo: 'IVA', valor: (f) => pesos(-f.iva), ayuda: 'Sólo de las ventas que entraron por una cuenta de cobro que factura.' },
  { titulo: 'Ventas netas', valor: (f) => pesos(f.netas), subtotal: true },
  { titulo: 'CMV', valor: (f) => pesos(-f.cmv), ayuda: 'El costo de la mercadería vendida, como lo trae Gestión Nube.' },
  { titulo: 'Margen bruto', valor: (f) => pesos(f.margenBruto), subtotal: true },
  { titulo: 'Comisiones', valor: (f) => pesos(-f.comisiones), ayuda: 'Del medio de pago, con el porcentaje que tiene cargado el dashboard.' },
  { titulo: 'Costo de envíos', valor: (f) => pesos(-f.costoEnvios), ayuda: 'Por default es lo cobrado: netea contra el ingreso de arriba.' },
  { titulo: 'Contribución', valor: (f) => pesos(f.contribucion), subtotal: true },
  {
    titulo: '% sobre netas',
    // Sin netas no hay porcentaje: un 0% afirma «no deja nada», y eso es otra cosa.
    valor: (f) => (f.pctContribucion === null ? '—' : `${(f.pctContribucion * 100).toFixed(1)}%`),
  },
  { titulo: 'Unidades', valor: (f) => f.unidades.toLocaleString('es-AR') },
  {
    titulo: 'Deja por unidad',
    valor: (f) => (f.contribUnidad === null ? '—' : pesos(f.contribUnidad)),
  },
  {
    titulo: 'Ventas',
    // ⚠️ La fila NO suma a lo ancho: una venta mixta cuenta en las dos líneas. El total viene
    // contado aparte por el núcleo, no de sumar esta fila.
    valor: (f) => f.ventas.toLocaleString('es-AR'),
    ayuda: 'Una venta mixta cuenta en las dos líneas: la fila no suma al total.',
  },
]

/**
 * Lo que hay que saber para poder creerle a la tabla de arriba.
 *
 * 🔑 **Callarse también miente**, y acá hay un motivo de exclusión que la contribución por canal no
 * tiene: una venta sin renglones no tiene línea a la que ir. No se la manda a la más grande —eso
 * movería plata real de un negocio al otro—, así que queda afuera y hay que decirlo.
 */
function NotaPyl({ pyl }: { pyl: Pyl }) {
  const chico = { marginTop: space[2], color: color.mut, fontSize: font.sm }
  const c = pyl.cobertura
  if (!pyl.disponible || !c) return null

  const afuera = c.sinCuenta + c.sinCosto + c.sinReparto
  const pct = c.ventas > 0 ? Math.round((c.usadas / c.ventas) * 100) : 0

  return (
    <div style={chico}>
      {afuera > 0 && (
        <div style={{ marginBottom: space[1] }}>
          🔴 Calculado sobre{' '}
          <strong>
            {c.usadas} de {c.ventas} ventas ({pct}%)
          </strong>{' '}
          de la ventana.
          {c.sinCuenta > 0 && ` ${c.sinCuenta} no tienen cuenta de cobro clasificada.`}
          {c.sinCosto > 0 && ` ${c.sinCosto} no tienen costo cargado.`}
          {c.sinReparto > 0 && (
            <>
              {' '}
              {c.sinReparto} no tienen renglones con qué saber de qué línea son —casi siempre devoluciones— y no se
              las manda a la más grande: eso movería plata de un negocio al otro.{' '}
              <strong>Cargan {pesos(c.sinRepartoContribucion)} de contribución</strong>, que la contribución por canal sí
              cuenta: es exactamente la diferencia entre los dos totales.
            </>
          )}
        </div>
      )}
      <div>
        ⛔ <strong>Es «por arriba»: termina en la contribución.</strong> No descuenta los gastos fijos —la estructura de
        las tres marcas—, que viven en el dashboard y no tienen API. Tampoco IIBB ni impuesto al cheque.
        {!c.comisionesCargadas && ' ⚠️ Las comisiones de cobro están en 0% en el dashboard, así que no están descontadas.'}
      </div>
      <div style={{ marginTop: space[1] }}>
        En una venta mixta —una compra de Zattia que lleva una funda Stunned— el descuento, el envío y el costo se
        reparten <strong>por el peso de lo facturado de cada línea</strong>. Es el mismo criterio con el que el
        dashboard reparte una venta entre marcas.
      </div>
    </div>
  )
}
