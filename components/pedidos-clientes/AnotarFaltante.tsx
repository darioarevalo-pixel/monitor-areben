'use client'

/**
 * El alta de un faltante. **Un solo componente, dos pantallas**: la sección `pedidos-clientes` y
 * —la que importa— «Atención al cliente», que es la que está abierta mientras se atiende.
 *
 * 🔴 **Por qué vive acá y no adentro de cada pantalla.** Una lista nueva no existe hasta que entra
 * donde se toma el trabajo: si anotar un faltante obligara a salir de Atención, buscar la sección y
 * volver, no se anota nunca y la sección queda vacía para siempre — con la trampa de que una
 * sección vacía se lee como "no piden nada". Y si el formulario se copiara en las dos pantallas,
 * el día que se agregue un campo una de las dos lo pierde y sus filas entran incompletas sin que
 * falle nada.
 *
 * # Las tres decisiones de fricción, que son la diferencia entre que se use o no
 *
 * 1. **Enter guarda.** El camino corto es escribir y apretar Enter, nada más: el tipo y el canal
 *    tienen default y se corrigen sólo cuando hace falta.
 * 2. **No se cierra al guardar.** Se limpia el campo y se queda abierto, porque lo normal es
 *    anotar dos o tres seguidos, y porque quien anota necesita VER que quedó — un modal que se
 *    cierra deja la duda de si guardó, y a la duda le sigue anotarlo de nuevo (y contarlo dos veces).
 * 3. **El tipo y el canal se recuerdan entre altas.** Quien está repasando el stock del sábado
 *    anota cinco `sin_stock` seguidos y elige una sola vez.
 * 4. **Elegir el artículo es OPCIONAL y está plegado.** Lo que no trabajamos no existe en ningún
 *    catálogo nuestro —no hay nada que elegir, y ése es el caso más común— así que el buscador no
 *    puede estar delante del camino corto. Se abre solo cuando ya se sabe cuál es el artículo:
 *    cuando se entra desde una fila de producto de Atención.
 *
 * # Por qué el artículo se ELIGE y no se escribe (24-ago-2026, pedido de Bruno)
 *
 * 🔑 «Si no lo tenemos está perfecto; ahora si está sin stock, estaría bueno seleccionar el
 * artículo». Las dos mitades de «faltante» no se anotan igual: lo que se ACABÓ ya existe —tiene
 * ficha, variante y SKU en Gestión Nube—, y escribirlo a mano tira las tres cosas y le deja al que
 * compra un texto que tiene que volver a buscar. Además el buscador muestra **el stock de hoy**, que
 * es lo único que puede desmentir en el momento un «no hay» que en realidad está en el depósito.
 */

import { useState } from 'react'
import { BuscarArticuloGN, type ArticuloGN } from '@/components/ui/BuscarArticuloGN'
import {
  Badge,
  Button,
  Chips,
  Field,
  Input,
  MarcaChip,
  Modal,
  Notice,
  color,
  font,
  space,
  useToast,
} from '@/components/ui'
import { guardarPedido } from '@/lib/pedidos-clientes/cliente'
import { CANALES, ETIQUETA_CANAL, ETIQUETA_TIPO, TIPOS, claveDeTexto } from '@/lib/pedidos-clientes/core'
import type { Marca } from '@/lib/nav.datos'
import type { CanalPedido, TipoFaltante } from '@/lib/pedidos-clientes/tipos'

type Props = {
  marca: Marca | null
  abierto: boolean
  /** Lo que la persona ya escribió en otra parte — el buscador de Atención que no encontró nada. */
  textoInicial?: string
  /**
   * Con esto el alta abre con el buscador de artículo **abierto y sembrado** con este texto, y el
   * tipo en `sin_stock`. Lo manda la fila de un producto encontrado en Atención: ahí ya se sabe
   * cuál es el artículo y lo único que falta es la variante.
   */
  articuloInicial?: string
  onCerrar: () => void
  onAnotado?: () => void
}

/**
 * 🔑 **Cerrado no se monta, y por eso `textoInicial` puede entrar como valor inicial de `useState`.**
 * La versión obvia —un `useEffect` que copia la prop al estado cuando se abre— la rechaza el lint
 * del repo (`react-hooks/set-state-in-effect`), y con razón: encadena renders y, sobre todo, deja
 * el campo con la búsqueda ANTERIOR durante un frame. Partirlo en dos componentes hace que abrirlo
 * de nuevo con otra búsqueda sea un montaje nuevo, sin ningún estado viejo que limpiar. Es el mismo
 * criterio que `useProductosTienda`, que lleva la marca adentro del estado en vez de limpiarlo.
 */
export function AnotarFaltante(props: Props) {
  if (!props.abierto) return null
  return <Formulario {...props} />
}

function Formulario({ marca, textoInicial = '', articuloInicial, onCerrar, onAnotado }: Props) {
  const toast = useToast()
  const [texto, setTexto] = useState(textoInicial)
  const [tipo, setTipo] = useState<TipoFaltante>(articuloInicial ? 'sin_stock' : 'no_trabajamos')
  /** El artículo de Gestión Nube, cuando se eligió. `null` es el caso normal de lo que no trabajamos. */
  const [articulo, setArticulo] = useState<ArticuloGN | null>(null)
  /**
   * Con qué texto arranca el buscador de artículo, y `null` cuando está plegado.
   *
   * 🔴 **La semilla se congela al abrir y no es `texto` en vivo.** Sembrarlo con lo que se está
   * tipeando haría que el buscador salga a Gestión Nube en cada tecla: `inicial` es una dependencia
   * del efecto que dispara la búsqueda.
   */
  const [semillaArticulo, setSemillaArticulo] = useState<string | null>(articuloInicial ?? null)
  const [canal, setCanal] = useState<CanalPedido>('local')
  const [cliente, setCliente] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  /** Lo anotado en esta pasada. Es el acuse de recibo: sin esto no se ve que quedó guardado. */
  const [recien, setRecien] = useState<string[]>([])

  async function anotar() {
    const t = texto.trim()
    if (!t) return toast.error('Escribí qué te pidieron.')
    // El mismo chequeo que hace el servidor, acá para no gastar un viaje: un texto de puro ruido se
    // guardaría bien y no entraría en ningún grupo del ranking.
    if (!claveDeTexto(t)) return toast.error('Escribí el producto: así como está no se puede agrupar con nada.')
    if (!marca) return toast.error('Elegí una marca en el encabezado.')
    setGuardando(true)
    try {
      await guardarPedido({
        store: marca,
        texto: t,
        tipo,
        canal,
        cliente: cliente.trim() || null,
        nota: nota.trim() || null,
        // Los tres viajan juntos: sin `producto_id`, el servidor tira el sku y la variante — un sku
        // suelto no tiene con qué agrupar y una variante sola no dice de qué producto es.
        producto_id: articulo ? articulo.product_id : null,
        sku: articulo?.sku || null,
        variante: articulo?.size_name || null,
      })
      setRecien((l) => [t, ...l])
      setTexto('')
      setCliente('')
      setNota('')
      // El artículo NO se recuerda entre altas, al revés que el tipo y el canal: el siguiente
      // faltante es otro producto, y un artículo pegado del anterior se guarda sin que nadie lo
      // mire — y a diferencia del canal, un artículo equivocado manda a reponer lo que no falta.
      setArticulo(null)
      setSemillaArticulo(null)
      onAnotado?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anotar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto titulo="Agregar un faltante" onCerrar={onCerrar} cerrarConFondo={false}>
      <div style={{ display: 'grid', gap: space[4] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.sm, color: color.mut }}>
          Marca: <MarcaChip marca={marca || 'bdi'} /> — sale del encabezado.
        </div>

        <Field label="Qué te pidieron" hint="Como lo dijo el cliente. Enter lo anota.">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !guardando) {
                e.preventDefault()
                void anotar()
              }
            }}
            placeholder="funda iphone 15 transparente"
            autoFocus
          />
        </Field>

        {/* 🔴 **El artículo va DESPUÉS del texto y plegado.** Lo que no trabajamos —el caso más
            común— no está en ningún catálogo nuestro: un buscador delante del campo obligaría a
            todos a pasar por una búsqueda que para la mitad no puede dar nada. Se abre solo cuando
            se entra desde una fila de producto de Atención, que es cuando ya se sabe cuál es. */}
        {/* ⛔ Este bloque NO va adentro de un `Field`: el `Field` del kit es un `<label>`, y un
            `<button>` adentro de un label lo activa también el clic en el rótulo —y el buscador
            trae una lista de botones—. Se dibuja el mismo rótulo a mano. */}
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: font.xs, color: color.mut, fontWeight: 500 }}>¿Cuál artículo es?</span>
          {articulo ? (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: space[3], padding: '8px 10px',
                border: `1px solid ${color.line}`, borderRadius: 10, background: color.bg2,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: font.sm, fontWeight: 600, color: color.ink }}>
                  {articulo.product_name || '—'}
                  {articulo.size_name ? <span style={{ color: color.mut }}> · {articulo.size_name}</span> : null}
                </div>
                {/* El stock de hoy va a la vista a propósito: es lo único que puede desmentir en el
                    momento un «no hay» que en realidad está en el depósito. */}
                <div style={{ fontSize: font.xs, color: color.mut2, display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace' }}>{articulo.sku || 's/sku'}</span>
                  <span>stock hoy {articulo.available_quantity ?? 0}</span>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setArticulo(null)}>
                Sacar
              </Button>
            </div>
          ) : !marca ? (
            <div style={{ fontSize: font.xs, color: color.mut2 }}>
              Elegí una marca en el encabezado para poder buscar el artículo.
            </div>
          ) : semillaArticulo !== null ? (
            <div style={{ display: 'grid', gap: space[2] }}>
              <BuscarArticuloGN
                marca={marca}
                mostrarCosto={false}
                inicial={semillaArticulo}
                placeholder="Buscá el artículo por nombre, SKU o código de barras…"
                onSelect={(a) => {
                  setArticulo(a)
                  // El texto pasa a ser el nombre del catálogo: es lo que la lista muestra como
                  // etiqueta del grupo, y escrito a mano cada uno lo nombra distinto.
                  if (a.product_name) setTexto(a.product_name)
                  // El tipo lo sigue mandando la persona; esto es sólo el default que casi siempre
                  // corresponde. Elegir el artículo con «no lo trabajamos» es un caso real: el
                  // producto sí, ese talle nunca.
                  setTipo('sin_stock')
                  setSemillaArticulo(null)
                }}
              />
              <Button size="sm" variant="ghost" onClick={() => setSemillaArticulo(null)}>
                Dejarlo sin artículo
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="soft" iconLeft="🔎" onClick={() => setSemillaArticulo(texto)}>
              Elegir el artículo del catálogo
            </Button>
          )}
          <span style={{ fontSize: font.xs, color: color.mut2 }}>
            Para lo que sí vendemos y se acabó. Quedan el SKU y el talle, que es con lo que se repone.
          </span>
        </div>

        {/* 🔑 Las dos cosas que la palabra «faltante» quiere decir, separadas acá y no después: son
            dos decisiones distintas (comprar variedad / reponer) y nadie va a volver a clasificar
            cien filas más tarde. */}
        <Field label="¿Por qué no lo teníamos?">
          <Chips
            value={tipo}
            onChange={(v) => setTipo(v as TipoFaltante)}
            opciones={TIPOS.map((t: string) => ({
              key: t as TipoFaltante,
              label: ETIQUETA_TIPO[t as TipoFaltante],
              title: t === 'no_trabajamos' ? 'No lo vendemos: es variedad para comprar.' : 'Lo vendemos y se acabó: es reposición.',
            }))}
          />
        </Field>

        <Field label="¿Por dónde lo pidió?">
          <Chips
            value={canal}
            onChange={(v) => setCanal(v as CanalPedido)}
            opciones={CANALES.map((c: string) => ({ key: c as CanalPedido, label: ETIQUETA_CANAL[c as CanalPedido] }))}
          />
        </Field>

        <Field label="Quién lo pidió" hint="Opcional. Sirve para avisarle cuando llegue.">
          <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ana / +54911…" />
        </Field>

        <Field label="Nota" hint="Opcional: talle, color, marca, lo que sea que se pidió puntual.">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="talle 2, negro" />
        </Field>

        {recien.length > 0 && (
          <Notice tone="success">
            <div style={{ marginBottom: space[2] }}>
              {recien.length === 1 ? 'Anotado:' : `Anotados ${recien.length}:`}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2] }}>
              {recien.map((t, i) => (
                <Badge key={`${t}-${i}`}>{t}</Badge>
              ))}
            </div>
          </Notice>
        )}

        <div style={{ display: 'flex', gap: space[3], justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCerrar}>
            {recien.length ? 'Listo' : 'Cancelar'}
          </Button>
          <Button variant="solid" tone="brand" disabled={guardando} onClick={() => void anotar()}>
            {guardando ? 'Agregando…' : 'Agregar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
