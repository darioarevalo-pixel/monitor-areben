'use client'

/**
 * La cola de fotos: qué falta fotografiar, en qué orden, y qué ya se intentó.
 *
 * La cola existía y nunca fue una pantalla. Se calculaba adentro de la auditoría —que responde
 * otra pregunta, *«¿algún color muestra la foto de otro?»*— y salía por un Excel, o por el botón
 * que abre un borrador con todo. Lo que faltaba era el lugar donde se la mira antes de decidir:
 * **qué entra en la próxima sesión**.
 *
 * 🔴 **Arranca por lo que se puede hacer, no por el total.** Medido el 24-ago-2026: de las 441
 * variantes sin foto de Zattia sólo **168** se pueden fotografiar hoy; el resto no cruza con
 * Gestión Nube (95) o no tiene una sola unidad en el depósito (178). En BDI, 75 de 173. Una
 * pantalla encabezada por el total manda a buscar cosas que no están, y el que vuelve con las
 * manos vacías deja de creerle a la lista. Lo trabado se cuenta aparte, con **la acción** de cada
 * motivo al lado — que es lo único que lo destraba.
 *
 * 🔑 **La marca que ninguna otra pantalla tiene: «ya salió y volvió sin foto».** Mirando la
 * tienda, una variante que salió tres veces se ve igual que una que nunca salió. Sin esto, el
 * mismo producto entra a sesión tras sesión y nadie se entera de que viene fallando.
 *
 * ⚠️ **La cola no es una lista de tareas y no hay que tildarla**: sale del estado de la tienda, así
 * que lo que no se fotografió vuelve solo a la lista mañana. Lo único que se le agrega es memoria.
 *
 * La regla vive en `lib/tncat/cola.ts`; acá sólo el estado de la pantalla.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesionFotos } from '@/components/sesionfotos/useSesionFotos'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { auditVariantes } from '@/lib/tncat/cliente'
import { ponerPuenteFotos } from '@/lib/sesionfotos/puente'
import {
  armarCola,
  ESTADO_COLA_ACCION,
  ESTADO_COLA_LABEL,
  filtrarCola,
  ordenarCola,
  resumenCola,
  unidadesEsperando,
  type FiltroCola,
  type OrdenCola,
} from '@/lib/tncat/cola'
import type { ProductoFchk } from '@/lib/tncat/tipos'
import type { Linea } from '@/lib/lineas'
import {
  Badge,
  BuscarInput,
  Button,
  Card,
  Chips,
  color,
  EmptyState,
  FilterBar,
  font,
  KpiCard,
  Notice,
  SelectorLinea,
  space,
  TableWrap,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useConfirmar,
  useFiltroUrl,
} from '@/components/ui'

/** Cuántos renglones se dibujan. Son cientos: más abajo la pantalla deja de ser una lista. */
const MAX = 150

export function ColaCard() {
  const { linea, setLinea, lineas } = useDatosMonitor({ porLinea: true })
  // key: la línea remonta el contenido, así el catálogo y los filtros no se arrastran de una a otra
  // (son dos tiendas distintas, y una selección de Zattia no significa nada en Stunned).
  return (
    <>
      <SelectorLinea linea={linea} lineas={lineas} onChange={setLinea} />
      <Contenido key={linea} linea={linea} />
    </>
  )
}

function Contenido({ linea }: { linea: Linea }) {
  const router = useRouter()
  const { confirmar, avisar } = useConfirmar()
  const { datos, estado: estadoEtl, error: errorEtl } = useDatosMonitor({ porLinea: true })
  const sf = useSesionFotos(linea)

  const [tienda, setTienda] = useState<ProductoFchk[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useFiltroUrl<FiltroCola>('f', 'lista')
  const [orden, setOrden] = useFiltroUrl<OrdenCola>('o', 'plata')
  const [busqueda, setBusqueda] = useState('')
  /**
   * El «ahora» contra el que se miden los días de espera. Se sella **una vez al montar** y no se
   * relee en cada render: si no, `armarCola` sería impura y el mismo renglón podría mostrar 108 y
   * 109 días en dos dibujados seguidos. Nadie tiene esta pantalla abierta el tiempo suficiente para
   * que la diferencia importe, y sí importa que el número no se mueva solo.
   */
  const [ahora] = useState(() => Date.now())

  const cargar = useCallback(
    async (refrescar: boolean, sigueVivo: () => boolean) => {
      setCargando(true)
      try {
        const d = await auditVariantes(linea, refrescar)
        if (!sigueVivo()) return
        setTienda(d)
        setError(d.length ? null : 'La tienda contestó, pero sin ningún producto.')
      } catch (e) {
        if (!sigueVivo()) return
        setTienda([])
        setError('No se pudo traer el catálogo de TiendaNube: ' + (e instanceof Error ? e.message : String(e)))
      } finally {
        if (sigueVivo()) setCargando(false)
      }
    },
    [linea],
  )

  useEffect(() => {
    let vivo = true
    void (async () => {
      await cargar(false, () => vivo)
    })()
    return () => {
      vivo = false
    }
  }, [cargar])

  /**
   * Las huérfanas van al cruce igual que en la auditoría: son variantes con stock cuyo producto
   * todavía no está en `productos` —recién cargado en GN— y son justo las que más chance tienen de
   * no tener foto. Acá sirven además para separar «no cruza» de «su producto no está en GN».
   */
  const filas = useMemo(
    () =>
      datos
        ? armarCola(tienda, datos.allVariantes, datos.allVariantesHuerfanas ?? [], sf.data ?? [], ahora)
        : [],
    [tienda, datos, sf.data, ahora],
  )
  const stockPorVid = useMemo(
    () => new Map((datos?.allVariantes ?? []).map((v) => [String(v.id), (v.local || 0) + (v.deposito || 0)])),
    [datos],
  )
  const resumen = useMemo(() => resumenCola(filas), [filas])
  const listas = useMemo(() => filas.filter((f) => f.estado === 'lista'), [filas])
  const unidades = useMemo(() => unidadesEsperando(listas, stockPorVid), [listas, stockPorVid])

  const visibles = useMemo(() => ordenarCola(filtrarCola(filas, filtro, busqueda), orden), [filas, filtro, busqueda, orden])
  const visiblesListas = useMemo(() => visibles.filter((f) => f.estado === 'lista'), [visibles])

  /**
   * De la cola al borrador, con lo que está a la vista.
   *
   * 🔑 Manda **exactamente los renglones visibles y listos**, no los productos enteros: la cola sabe
   * que al negro le falta la foto y al blanco no, y mandar el producto obligaría a volver a
   * destildar a mano lo que esta pantalla ya decidió. Los `vids` salen del renglón, que es el mismo
   * conjunto que devuelve `cruzarParaSesion` — hay un test que lo fija.
   */
  const pedirSesion = async () => {
    if (!visiblesListas.length) {
      await avisar({
        titulo: 'No hay nada para pedir',
        mensaje: 'Ninguno de los renglones a la vista se puede llevar a una sesión. Probá con el filtro «Todo».',
      })
      return
    }
    const pids = [...new Set(visiblesListas.map((f) => f.pid).filter((p): p is string => !!p))]
    const vids = [...new Set(visiblesListas.flatMap((f) => f.vids))]
    const trabadas = resumen.trabados.reduce((n, t) => n + t.n, 0)
    const ok = await confirmar({
      titulo: 'Pedir una sesión de fotos',
      mensaje:
        `Se abre un borrador con ${pids.length} ${pids.length === 1 ? 'producto' : 'productos'} y ` +
        `${vids.length} ${vids.length === 1 ? 'variante tildada' : 'variantes tildadas'}.` +
        (trabadas ? `\n\nQuedan afuera ${trabadas} que hoy no se pueden fotografiar (ver el filtro «Trabadas»).` : ''),
      ok: 'Abrir el borrador',
    })
    if (!ok) return
    // 🔑 La puerta la sabe la pantalla: esta lista es, por definición, lo que está a la venta sin la
    // foto de su color. Por eso no se pregunta el motivo. Ver `lib/solicitudes/disparador.ts`.
    ponerPuenteFotos({ pids, vids, disparador: 'faltante' })
    router.push('/sesion-fotos')
  }

  /**
   * 🔴 Los tres insumos fallan por separado y **un error no se puede quedar diciendo «cargando»**.
   * Caminarla lo destapó: con el catálogo caído la pantalla decía «Leyendo la tienda y el
   * catálogo…» para siempre, que es la frase que promete que en un rato va a haber algo. Cada
   * fuente dice su nombre y su motivo, y el cartel de espera nombra **lo que falta**, no las tres.
   */
  if (error) return <Notice tone="danger">{error}</Notice>
  if (estadoEtl === 'error')
    return (
      <Notice tone="danger">
        No se pudo leer el catálogo de Gestión Nube{errorEtl ? `: ${errorEtl}` : '.'} Sin él no se puede saber
        cuántas unidades esperan una foto ni cuáles se pueden pedir, así que la cola no se dibuja a medias.
      </Notice>
    )
  if (sf.error && !sf.data)
    return <Notice tone="danger">No se pudo leer el historial de sesiones: {sf.error}</Notice>
  if (cargando || !datos || !sf.data) {
    const falta = [cargando && 'la tienda', !datos && 'el catálogo', !sf.data && 'las sesiones anteriores'].filter(Boolean)
    return <div style={{ padding: 16, color: color.mut2 }}>Leyendo {falta.join(' · ')}…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: space[3] }}>
        <KpiCard
          label="Se pueden fotografiar hoy"
          value={resumen.lista.toLocaleString('es-AR')}
          sub={`${unidades.toLocaleString('es-AR')} ${unidades === 1 ? 'unidad esperando' : 'unidades esperando'}`}
          tone={resumen.lista ? 'success' : 'neutral'}
          info={
            <>
              Variantes con color, <b>sin foto propia</b>, que cruzan por código con Gestión Nube y tienen al menos
              una unidad. Son las únicas que una sesión puede sacar hoy. Las unidades no se cuentan dos veces cuando
              dos variantes de la tienda llevan a la misma de Gestión Nube.
            </>
          }
        />
        <KpiCard
          label="La que espera hace más"
          value={resumen.masVieja == null ? '—' : `${resumen.masVieja.toLocaleString('es-AR')} d`}
          sub={resumen.masVieja == null ? 'ninguna trae fecha' : 'desde que se cargó el color'}
          tone={resumen.masVieja != null && resumen.masVieja > 180 ? 'warning' : 'neutral'}
          info={
            <>
              Desde el alta de <b>la variante</b> en Tienda Nube, no la del producto: el grueso de la cola son colores
              que le faltan a productos que ya tienen fotos. Se mide sólo sobre lo que se puede fotografiar — un
              &laquo;hace 300 días&raquo; de algo que no está en el depósito no es un pendiente.
            </>
          }
        />
        <KpiCard
          label="Ya salieron y siguen sin foto"
          value={resumen.reincidentes.toLocaleString('es-AR')}
          sub={resumen.reincidentes ? 'volvieron de una sesión sin la foto' : 'ninguna volvió sin su foto'}
          tone={resumen.reincidentes ? 'warning' : 'neutral'}
          info={
            <>
              Lo único que no se puede saber mirando la tienda: una variante que salió tres veces se ve igual que una
              que nunca salió. El motivo lo contesta el <b>&laquo;¿qué se fotografió?&raquo;</b> al cerrar la sesión;
              hasta que alguien lo conteste, acá dice sólo cuántas veces salió.
            </>
          }
        />
      </div>

      {resumen.trabados.length > 0 && (
        <Card>
          <div style={{ fontSize: font.base, fontWeight: 700, marginBottom: space[2] }}>
            Lo que hoy no se puede fotografiar
            <InfoPopover titulo="Por qué está trabado">
              Cada motivo es una acción distinta y de alguien distinto. Mostrarlos juntos con la cola haría que la
              lista prometa mercadería que no está.
            </InfoPopover>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
            {resumen.trabados.map((t) => (
              <div key={t.estado} style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap', fontSize: font.sm }}>
                <b style={{ minWidth: 34, textAlign: 'right' }}>{t.n.toLocaleString('es-AR')}</b>
                <span style={{ color: color.mut }}>{ESTADO_COLA_LABEL[t.estado]}</span>
                <Badge tone="neutral">{ESTADO_COLA_ACCION[t.estado]}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <FilterBar>
          <Chips<FiltroCola>
            value={filtro}
            onChange={setFiltro}
            opciones={[
              { key: 'lista', label: 'Se pueden fotografiar', n: resumen.lista },
              { key: 'reincidentes', label: 'Ya salieron', n: resumen.reincidentes, title: 'Salieron a una sesión y siguen sin foto' },
              { key: 'trabadas', label: 'Trabadas', n: filas.length - resumen.lista },
              { key: 'todo', label: 'Todo', n: filas.length },
            ]}
          />
          <Chips<OrdenCola>
            value={orden}
            onChange={setOrden}
            opciones={[
              { key: 'plata', label: 'Más unidades paradas' },
              { key: 'espera', label: 'Más tiempo esperando' },
            ]}
          />
          <BuscarInput value={busqueda} onChange={setBusqueda} placeholder="Buscar producto, color o SKU…" />
        </FilterBar>

        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', margin: `${space[3]}px 0` }}>
          <Button onClick={pedirSesion} disabled={!visiblesListas.length}>
            Pedir una sesión con {visiblesListas.length === 1 ? 'esta' : `estas ${visiblesListas.length}`}
          </Button>
          <Button variant="ghost" onClick={() => void cargar(true, () => true)}>
            Volver a leer la tienda
          </Button>
          <span style={{ fontSize: font.sm, color: color.mut2 }}>
            {visibles.length.toLocaleString('es-AR')} de {filas.length.toLocaleString('es-AR')}
            {visibles.length > MAX ? ` · se muestran las primeras ${MAX}` : ''}
          </span>
        </div>

        {!filas.length ? (
          <EmptyState
            title="No falta ninguna foto"
            hint="Todos los colores de la tienda tienen su foto propia. Es el estado en el que la cola debería estar."
          />
        ) : !visibles.length ? (
          <EmptyState title="Nada con ese filtro" hint="Probá con «Todo» o borrá la búsqueda." />
        ) : (
          <TableWrap>
            <THead>
              <Tr>
                <Th>Producto</Th>
                <Th>Color</Th>
                <Th align="right">Unidades</Th>
                <Th align="right">Espera</Th>
                <Th>Ya salió</Th>
                <Th>Estado</Th>
              </Tr>
            </THead>
            <TBody>
              {visibles.slice(0, MAX).map((f) => (
                <Tr key={`${f.tnId}:${f.tnVid ?? f.color}`}>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{f.producto}</div>
                    <div style={{ fontSize: font.xs, color: color.mut2 }}>
                      {f.sku || f.barcode || 'sin código'}
                      {!f.publicado && ' · despublicado en la tienda'}
                    </div>
                  </Td>
                  <Td>
                    {f.color}
                    {f.valores.length > 1 && <span style={{ color: color.mut2, fontSize: font.xs }}> · {f.valores.join(' / ')}</span>}
                  </Td>
                  <Td align="right">{f.estado === 'lista' ? f.unidades.toLocaleString('es-AR') : '—'}</Td>
                  {/* ⛔ Sin fecha se dice, no se pone 0: un cero acá afirmaría «lo cargaron hoy». */}
                  <Td align="right">{f.dias == null ? <span style={{ color: color.mut2 }}>sin fecha</span> : `${f.dias.toLocaleString('es-AR')} d`}</Td>
                  <Td>
                    {f.salidas === 0 ? (
                      <span style={{ color: color.mut2 }}>nunca</span>
                    ) : (
                      <>
                        <Badge tone="warning">{f.salidas === 1 ? '1 vez' : `${f.salidas} veces`}</Badge>
                        <div style={{ fontSize: font.xs, color: color.mut2 }}>
                          {/* Tres respuestas, no dos: contestaron que no (con motivo) · contestaron
                              que sí y sigue sin foto en TN · nadie contestó. Ver `fotografiado.ts`. */}
                          {f.ultimoIntento == null
                            ? `${f.ultimaSalida ?? 'sin fecha'} · nadie contestó`
                            : f.ultimoIntento.ok
                              ? `${f.ultimaSalida ?? 'sin fecha'} · dijeron que sí, pero la tienda sigue sin la foto`
                              : `${f.ultimaSalida ?? 'sin fecha'} · ${f.ultimoIntento.motivo || 'no se pudo'}`}
                        </div>
                      </>
                    )}
                  </Td>
                  <Td>
                    {f.estado === 'lista' ? (
                      <Badge tone="success">se puede</Badge>
                    ) : (
                      <span title={ESTADO_COLA_ACCION[f.estado]} style={{ fontSize: font.xs, color: color.mut }}>
                        {ESTADO_COLA_LABEL[f.estado]}
                      </span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
