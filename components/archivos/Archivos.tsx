'use client'

/**
 * **Archivos** — qué hay guardado en el Blob, cuánto pesa y qué se puede eliminar.
 *
 * # Por qué existe
 *
 * El 7-sep-2026 el store llegó al giga del plan Hobby y **frenó toda subida del monitor**: el link
 * de las creadoras, las fotos de un reclamo, los diseños, las piezas de Meta. El cartel que veía la
 * persona hablaba del archivo («no se pudo subir»), así que nadie podía saber que el problema era el
 * lugar. Y para mirar qué había adentro hubo que entrar al dashboard de Vercel — con una cuenta que
 * no es la nuestra y un token que ⛔ ni siquiera se puede copiar.
 *
 * Lo que se recuperó ese día fueron **532 MB de contenido de canjes que nadie había archivado en
 * Drive**. Nada de eso se veía desde el monitor.
 *
 * # Las tres cosas que esta pantalla contesta, en este orden
 *
 * | | |
 * | --- | --- |
 * | ¿Cuánto lugar queda? | la barra de arriba, contra el giga del plan |
 * | ¿Quién lo ocupa? | una fila por carpeta, la más pesada primero |
 * | ¿Qué puedo eliminar? | **cuánto pesa lo que está sin dueño**, que es lo único accionable |
 *
 * # 🔴 Lo que esta pantalla NO hace, y es la mitad del diseño
 *
 * ⛔ **No llama huérfano a lo que no pudo verificar.** Un archivo sale «sin dueño» sólo si el
 * servidor cruzó su carpeta y no lo nombra nadie. Si la consulta falló —o si la fuente vive en otro
 * lado, como la galería de Ingresos, que guarda sus URLs en el KV de bdi-catalogo— la carpeta se
 * muestra **sin verificar** y no se ofrece eliminar nada de ahí. La regla vive en
 * `lib/blob/inventario.core.js` y la corre también el servidor antes de eliminar: un botón
 * equivocado acá ⛔ no alcanza para perder un archivo.
 *
 * ⛔ **No elimina lo recién subido.** Los bytes llegan al Blob antes que su fila —así sube la
 * creadora— así que lo que tiene menos de {@link GRACIA_HORAS} horas se muestra aparte, como
 * «recién subido», aunque todavía no lo nombre nadie.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HeaderAcciones } from '@/components/layout/acciones'
import { eliminarHuerfanos, leerInventario, type Inventario } from '@/lib/blob/cliente'
import {
  agrupar, GRACIA_HORAS, sePuedeEliminarEnLote, totalDe,
  type ArchivoConEstado, type CarpetaInventario, type EstadoArchivo,
} from '@/lib/blob/inventario'
import {
  Badge, Button, EmptyState, Esqueleto, Notice, Plegable, SectionCard,
  space, useConfirmar, useToast,
} from '@/components/ui'

/**
 * El techo del plan. Es el número contra el que se mide la barra, y por eso está acá y no en un
 * texto suelto: el día que el store se mude a un plan pago, esta constante es lo que cambia.
 *
 * ⚠️ Es el del plan Hobby de la cuenta donde vive el proyecto, ⛔ no un límite nuestro.
 */
const TOPE_PLAN_BYTES = 1024 * 1024 * 1024

/** Desde acá el cartel deja de ser informativo y avisa. Antes de que frene, no después. */
const AVISO_DESDE = 0.7

const ROTULO: Record<EstadoArchivo, { texto: string; tone: 'neutral' | 'warning' | 'danger' | 'success' }> = {
  usado: { texto: 'En uso', tone: 'success' },
  reciente: { texto: 'Recién subido', tone: 'neutral' },
  'sin-dueno': { texto: 'Sin dueño', tone: 'warning' },
  'no-verificable': { texto: 'No se pudo verificar', tone: 'neutral' },
  // Meta ya tiene su copia adentro del aviso: lo de acá es el original que subimos, y sobra.
  'copia-en-meta': { texto: 'Ya está en Meta', tone: 'warning' },
}

/** MB con un decimal — el store se mide en megas, y en bytes no se lee. */
function pesar(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 ** 3)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function Archivos() {
  const toast = useToast()
  const { confirmar } = useConfirmar()

  const [inv, setInv] = useState<Inventario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [limpiando, setLimpiando] = useState<string | null>(null)

  const recargar = useCallback(() => leerInventario()
    .then((d) => { setInv(d); setError(null) })
    .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo leer los archivos.'))
    .finally(() => setCargando(false)), [])

  useEffect(() => { void recargar() }, [recargar])

  // El servidor ya decidió el estado de cada archivo; acá sólo se agrupa para mirarlo. Se le pasa
  // el mismo contexto vacío a propósito: `estado` viene de allá y ⛔ no se recalcula con datos de
  // menos, que es como una pantalla termina diciendo algo distinto que el servidor.
  const carpetas = useMemo<CarpetaInventario[]>(() => {
    if (!inv) return []
    const usadas = new Map<string, string>()
    const enMeta = new Map<string, string>()
    for (const a of inv.archivos) {
      if (a.estado === 'usado') usadas.set(a.pathname, 'sí')
      if (a.estado === 'copia-en-meta') enMeta.set(a.pathname, 'sí')
    }
    return agrupar(inv.archivos, { usadas, enMeta, sinVerificar: inv.sinVerificar })
  }, [inv])

  const total = useMemo(() => totalDe(inv?.archivos || []), [inv])
  const usado = total.bytes / TOPE_PLAN_BYTES

  async function limpiar(g: CarpetaInventario) {
    const urls = g.archivos.filter((a) => sePuedeEliminarEnLote(a.estado)).map((a) => a.url)
    if (!urls.length) return
    const ok = await confirmar({
      titulo: `¿Eliminar ${urls.length} ${urls.length === 1 ? 'archivo' : 'archivos'} de ${g.label}?`,
      // 🔑 El diálogo NOMBRA lo que va a dejar de existir y cuánto pesa: es la última pantalla antes
      // de algo sin vuelta atrás, y «¿Estás seguro?» no dice qué se pierde.
      mensaje: `Son ${pesar(g.bytesEliminables)} que hoy no usa ninguna pantalla. Se eliminan del Blob y no se pueden recuperar.`,
      ok: `Eliminar ${urls.length}`,
      tono: 'danger',
    })
    if (!ok) return
    setLimpiando(g.carpeta)
    try {
      const r = await eliminarHuerfanos(urls)
      const salteados = r.salteados ? ` · ${r.salteados} quedaron: el servidor los encontró en uso` : ''
      toast.ok(`Se eliminaron ${r.eliminados} archivos (${pesar(r.bytes)})${salteados}`)
      await recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
    } finally {
      setLimpiando(null)
    }
  }

  if (cargando) return <Esqueleto />

  return (
    <>
      <HeaderAcciones>
        <Button variant="ghost" size="sm" onClick={() => void recargar()}>Actualizar</Button>
      </HeaderAcciones>

      {error && <Notice tone="danger">{error}</Notice>}

      <SectionCard
        title="Cuánto lugar hay"
        subtitle="Todo lo que el monitor guarda arriba: las fotos y videos de las creadoras, la galería de las importaciones, las piezas de Meta, los diseños y las fotos de los reclamos."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2] }}>
            <b style={{ fontSize: 24 }}>{pesar(total.bytes)}</b>
            <span style={{ opacity: 0.7 }}>de {pesar(TOPE_PLAN_BYTES)} · {total.archivos} archivos</span>
          </div>
          <div style={{ height: 10, background: 'var(--fondo-2, #eee)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, usado * 100).toFixed(1)}%`,
              height: '100%',
              background: usado >= AVISO_DESDE ? 'var(--peligro, #c0392b)' : 'var(--acento, #4f46e5)',
            }}
            />
          </div>
          {usado >= AVISO_DESDE && (
            <Notice tone="warning">
              <b>Queda poco lugar.</b> Cuando se llena, <b>ninguna</b> subida del monitor funciona —ni el
              link de las creadoras, ni las fotos de un reclamo, ni las piezas de Meta— y el cartel que ve
              la persona habla del archivo, no del espacio.
            </Notice>
          )}
          {inv?.truncado && (
            <Notice tone="warning">
              El store tiene más archivos de los que se trajeron: lo de abajo es una parte, no el total.
            </Notice>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Quién ocupa el lugar"
        subtitle={`Lo más pesado primero. «Sin dueño» es lo que hoy no usa ninguna pantalla y «Ya está en Meta» son las piezas que Meta se quedó adentro del aviso: las dos se pueden eliminar. Lo subido en las últimas ${GRACIA_HORAS} horas nunca se ofrece, porque puede ser algo que se está subiendo en este momento.`}
      >
        {!carpetas.length ? (
          <EmptyState dashed title="No hay nada guardado" hint="El store está vacío." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
            {carpetas.map((g) => (
              <Carpeta
                key={g.carpeta}
                grupo={g}
                limpiando={limpiando === g.carpeta}
                onLimpiar={() => void limpiar(g)}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </>
  )
}

function Carpeta({ grupo, limpiando, onLimpiar }: {
  grupo: CarpetaInventario
  limpiando: boolean
  onLimpiar: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div style={{ border: '1px solid var(--borde, #e5e5e5)', borderRadius: 10, padding: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <b>{grupo.label}</b>
        <span style={{ opacity: 0.7 }}>{pesar(grupo.bytes)} · {grupo.archivos.length} archivos</span>
        {grupo.quien && <span style={{ opacity: 0.6, fontSize: 13 }}>— {grupo.quien}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: space[2], alignItems: 'center' }}>
          {grupo.eliminables > 0 && (
            <Button variant="solid" tone="danger" size="sm" onClick={onLimpiar} loading={limpiando}>
              Eliminar lo que no usa nadie ({pesar(grupo.bytesEliminables)})
            </Button>
          )}
        </span>
      </div>

      {grupo.sinVerificar && (
        <div style={{ marginTop: space[2] }}>
          <Notice tone="warning">
            <b>No se pudo verificar quién usa esta carpeta</b>, así que acá no se ofrece eliminar nada.
            La galería de Ingresos guarda sus archivos en otro lado (el KV), y si esa lectura falla no
            hay forma de saber cuáles siguen en uso.
          </Notice>
        </div>
      )}

      <Plegable
        abierto={abierto}
        onToggle={() => setAbierto((v) => !v)}
        titulo={`Ver los ${grupo.archivos.length} archivos`}
        ayuda="Uno por uno, el más pesado arriba, con quién lo usa."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {grupo.archivos.map((a) => <Fila key={a.pathname} archivo={a} />)}
        </div>
      </Plegable>
    </div>
  )
}

function Fila({ archivo }: { archivo: ArchivoConEstado }) {
  const r = ROTULO[archivo.estado]
  return (
    <div style={{ display: 'flex', gap: space[2], alignItems: 'center', fontSize: 13 }}>
      <a href={archivo.url} target="_blank" rel="noreferrer" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {archivo.pathname}
      </a>
      <span style={{ opacity: 0.7, minWidth: 70, textAlign: 'right' }}>{pesar(archivo.size)}</span>
      <Badge tone={r.tone}>{r.texto}</Badge>
    </div>
  )
}
