'use client'

/**
 * Cargar varias personas al padrón de una sola vez.
 *
 * **Por qué existe.** El alta de a una cuesta un renglón y por eso el padrón se llena; pero una
 * campaña arranca con veinte creadoras juntas, y veinte modales seguidos es exactamente el momento
 * en que alguien decide seguir anotando en la planilla.
 *
 * **Por qué una grilla y no un Excel** (Bruno, 5-ago-2026): los datos no vienen de ninguna planilla,
 * se tipean mirando Instagram. Subir un archivo agregaría un paso —armarlo— antes del que importa.
 * Igual se puede pegar: un pegado con renglones cae repartido en filas, así que copiar tres @ de un
 * WhatsApp tampoco obliga a tipearlos.
 *
 * ⚠️ **Lo que se ve mientras se tipea es una previsión, no un resultado.** Ver
 * `lib/canjes/alta-masiva.ts`: la pantalla del final se dibuja desde lo que contestó el servidor,
 * fila por fila.
 */

import { useMemo, useState } from 'react'
import {
  Badge, Button, Input, Modal, Notice, StatusPill, TableWrap, THead, TBody, Tr, Th, Td, useToast,
  color, font, space, weight, type Tone,
} from '@/components/ui'
import { crearPersonasLote, type ResultadoAlta } from '@/lib/canjes/cliente'
import {
  FILA_VACIA, TOPE_ALTA_LOTE, filasAEnviar, filasDePegado, previsualizarAlta, resumenAlta,
  type EstadoFila, type FilaAlta,
} from '@/lib/canjes/alta-masiva'
import { instagramParaMostrar } from '@/lib/canjes/instagram'
import { nombrePersona, type CanjePersona, type CanjeStore } from '@/lib/canjes/tipos'

const FILAS_INICIALES = 5

const ESTADO_FILA: Record<Exclude<EstadoFila, 'ok' | 'vacia'>, { tone: Tone; label: string }> = {
  'ya-esta': { tone: 'neutral', label: 'Ya está' },
  repetida: { tone: 'warning', label: 'Repetida' },
  invalida: { tone: 'danger', label: 'Sin @' },
}

const ESTADO_RESULTADO: Record<ResultadoAlta['estado'], { tone: Tone; label: string }> = {
  creada: { tone: 'success', label: 'Agregada' },
  existia: { tone: 'neutral', label: 'Ya estaba' },
  repetida: { tone: 'warning', label: 'Repetida' },
  invalida: { tone: 'danger', label: 'Sin @' },
  error: { tone: 'danger', label: 'No entró' },
}

export function AltaMasiva({
  abierto, store, personas, onCerrar, onListo,
}: {
  abierto: boolean
  store: CanjeStore
  /** El padrón que ya está en memoria: con él se sabe quién ya está sin ir al servidor. */
  personas: CanjePersona[]
  onCerrar: () => void
  /** Se cargaron: la lista se vuelve a pedir. */
  onListo: () => Promise<void>
}) {
  const toast = useToast()
  const [filas, setFilas] = useState<FilaAlta[]>(() => Array.from({ length: FILAS_INICIALES }, () => ({ ...FILA_VACIA })))
  const [guardando, setGuardando] = useState(false)
  /** El resultado del servidor. `null` mientras se está tipeando. */
  const [resultados, setResultados] = useState<ResultadoAlta[] | null>(null)

  const padron = useMemo(
    () => personas.map((p) => ({ id: p.id, instagram: p.instagram, nombre: nombrePersona(p) })),
    [personas],
  )

  const previas = useMemo(() => previsualizarAlta(filas, padron), [filas, padron])
  const resumen = useMemo(() => resumenAlta(previas), [previas])

  const cambiar = (i: number, campo: keyof FilaAlta, v: string) =>
    setFilas((p) => p.map((f, j) => (j === i ? { ...f, [campo]: v } : f)))

  /**
   * Pegar reparte. Con un solo renglón se deja que el navegador pegue normal —es lo que espera quien
   * copió un @ suelto—; con varios se llena la grilla desde esta fila para abajo.
   */
  const pegar = (i: number, texto: string) => {
    const nuevas = filasDePegado(texto)
    if (nuevas.length < 2) return false
    setFilas((p) => {
      const copia = [...p]
      nuevas.forEach((f, k) => { copia[i + k] = f })
      return copia
    })
    return true
  }

  const cerrar = () => {
    setFilas(Array.from({ length: FILAS_INICIALES }, () => ({ ...FILA_VACIA })))
    setResultados(null)
    onCerrar()
  }

  async function guardar() {
    const aEnviar = filasAEnviar(previas)
    if (!aEnviar.length) return
    setGuardando(true)
    try {
      const r = await crearPersonasLote(store, aEnviar)
      // El resumen se muestra ANTES de recargar: `recargar()` vuelve a bajar el módulo entero y el
      // spinner se comería justo lo único que dice cuáles entraron.
      setResultados(r.resultados)
      await onListo()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  // ── El resultado, tal como lo contestó el servidor ────────────────────────────
  if (resultados) {
    const cuenta = (e: ResultadoAlta['estado']) => resultados.filter((r) => r.estado === e).length
    const creadas = cuenta('creada')
    return (
      <Modal
        abierto={abierto}
        onCerrar={cerrar}
        titulo="Cómo salió"
        ancho="ancho"
        pie={<Button variant="solid" tone="brand" onClick={cerrar}>Listo</Button>}
      >
        <Notice tone={creadas ? 'success' : 'warning'}>
          {creadas === 1 ? 'Se agregó 1 persona al padrón.' : `Se agregaron ${creadas} personas al padrón.`}
          {cuenta('existia') > 0 && ` ${cuenta('existia')} ya estaban.`}
          {cuenta('error') > 0 && ` ${cuenta('error')} no entraron.`}
        </Notice>
        <div style={{ marginTop: space[3] }}>
          <TableWrap>
            <THead>
              <Tr><Th>Instagram</Th><Th>Cómo salió</Th></Tr>
            </THead>
            <TBody>
              {resultados.map((r, i) => (
                <Tr key={`${r.instagram}-${i}`}>
                  <Td mono>{instagramParaMostrar(r.instagram, r.instagram_raw) || '—'}</Td>
                  <Td>
                    <span style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
                      <StatusPill tone={ESTADO_RESULTADO[r.estado].tone} label={ESTADO_RESULTADO[r.estado].label} />
                      {r.nombre && r.estado === 'existia' && (
                        <span style={{ color: color.mut, fontSize: font.sm }}>{r.nombre}</span>
                      )}
                      {r.error && <span style={{ color: color.danger, fontSize: font.sm }}>{r.error}</span>}
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>
        </div>
      </Modal>
    )
  }

  // ── La grilla ─────────────────────────────────────────────────────────────────
  return (
    <Modal
      abierto={abierto}
      onCerrar={cerrar}
      titulo="Cargar varias personas"
      ancho="ancho"
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button
            variant="solid"
            tone="brand"
            loading={guardando}
            disabled={!resumen.nuevas || resumen.sobran > 0}
            onClick={() => void guardar()}
          >
            {resumen.nuevas === 1 ? 'Agregar 1' : `Agregar ${Math.min(resumen.nuevas, TOPE_ALTA_LOTE)}`}
          </Button>
        </>
      }
    >
      <div style={{ color: color.mut, fontSize: font.sm, marginBottom: space[3] }}>
        Lo único que hace falta es el <strong style={{ fontWeight: weight.medium }}>@</strong>; el resto
        se completa después desde la ficha. Se puede pegar una lista entera en la primera casilla.
      </div>

      <TableWrap>
        <THead>
          <Tr>
            <Th width={36} />
            <Th>Instagram</Th>
            <Th>Nombre</Th>
            <Th>Teléfono</Th>
            <Th>Ciudad</Th>
            <Th width={130} />
          </Tr>
        </THead>
        <TBody>
          {previas.map((p, i) => (
            <Tr key={i}>
              <Td mono>{p.n}</Td>
              <Td>
                <Input
                  value={p.fila.instagram}
                  placeholder="@lucia.mkp"
                  autoFocus={i === 0}
                  onChange={(e) => cambiar(i, 'instagram', e.target.value)}
                  onPaste={(e) => {
                    if (pegar(i, e.clipboardData.getData('text'))) e.preventDefault()
                  }}
                />
              </Td>
              <Td><Input value={p.fila.nombre} onChange={(e) => cambiar(i, 'nombre', e.target.value)} /></Td>
              <Td><Input value={p.fila.telefono} onChange={(e) => cambiar(i, 'telefono', e.target.value)} /></Td>
              <Td><Input value={p.fila.ciudad} onChange={(e) => cambiar(i, 'ciudad', e.target.value)} /></Td>
              <Td>
                {/* Lo que va a pasar con esta fila, mientras se tipea. Una fila vacía no dice nada:
                    no es un error, es una fila que todavía no se llenó. */}
                {p.estado === 'ok' ? (
                  <span style={{ color: color.mut2, fontSize: font.sm }}>@{p.instagram}</span>
                ) : p.estado === 'vacia' ? null : (
                  <span style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge tone={ESTADO_FILA[p.estado].tone} subtle>{ESTADO_FILA[p.estado].label}</Badge>
                    {p.yaEs && <span style={{ color: color.mut2, fontSize: font.sm }}>{p.yaEs.nombre}</span>}
                  </span>
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </TableWrap>

      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', marginTop: space[3] }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFilas((p) => [...p, ...Array.from({ length: FILAS_INICIALES }, () => ({ ...FILA_VACIA }))])}
        >
          Sumar {FILAS_INICIALES} filas
        </Button>
        <span style={{ color: color.mut, fontSize: font.sm }}>
          {[
            resumen.nuevas === 1 ? '1 nueva' : `${resumen.nuevas} nuevas`,
            resumen.yaEstan ? `${resumen.yaEstan} ya ${resumen.yaEstan === 1 ? 'está' : 'están'}` : '',
            resumen.repetidas ? `${resumen.repetidas} ${resumen.repetidas === 1 ? 'repetida' : 'repetidas'}` : '',
            resumen.invalidas ? `${resumen.invalidas} sin @ válido` : '',
          ].filter(Boolean).join(' · ')}
        </span>
      </div>

      {resumen.sobran > 0 && (
        <div style={{ marginTop: space[3] }}>
          <Notice tone="warning">
            El máximo por tanda son {TOPE_ALTA_LOTE} y hay {resumen.nuevas}. Sacá {resumen.sobran} y
            cargalas en una segunda tanda.
          </Notice>
        </div>
      )}
    </Modal>
  )
}
