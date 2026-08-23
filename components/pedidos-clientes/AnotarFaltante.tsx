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
 */

import { useState } from 'react'
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

function Formulario({ marca, textoInicial = '', onCerrar, onAnotado }: Props) {
  const toast = useToast()
  const [texto, setTexto] = useState(textoInicial)
  const [tipo, setTipo] = useState<TipoFaltante>('no_trabajamos')
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
      })
      setRecien((l) => [t, ...l])
      setTexto('')
      setCliente('')
      setNota('')
      onAnotado?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anotar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto titulo="Anotar un faltante" onCerrar={onCerrar} cerrarConFondo={false}>
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
            {guardando ? 'Anotando…' : 'Anotar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
