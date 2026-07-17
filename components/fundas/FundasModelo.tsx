'use client'

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from './useDatosMonitor'
import { RankingCard } from './RankingCard'
import { DemandaCard } from './DemandaCard'
import { SimulacionCard, type EditorSim } from './SimulacionCard'
import { PedidosCard } from './PedidosCard'
import { ConfirmModal, PromptModal } from './Modales'
import { computeFrom, varActivo } from '@/lib/fundas/simulacion'
import { guardarEstado, guardarPedidos, leerEstado, leerPedidos } from '@/lib/fundas/persistencia'
import type { SimBloque } from '@/lib/fundas/tipos'

const EDITOR_VACIO: EditorSim = { total: '100', rows: [], vars: [], varOn: false, img: null, editando: null }

const nuevoId = () => 'p' + Date.now() + Math.round(Math.random() * 1000)
const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const scrollSim = () => document.getElementById('fm-sim-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

/**
 * "Fundas por modelo" (key `fundas-modelo`, solo BDI) en Next.
 *
 * El shell es dueño del editor de simulación y de los pedidos guardados, y los
 * persiste en localStorage **namespaceado en sombra** (`monitor_sim_next_bdi`)
 * para no pisar los pedidos reales del equipo mientras se prueba. El flip adopta
 * las claves reales (Paso 5). Ranking y Demanda alimentan el editor por los dos
 * puentes ("Importar a simulación" / "Usar los elegidos").
 */
export function FundasModelo() {
  const { marca } = useSesion()
  const { datos, estado, error } = useDatosMonitor()
  const sombra = true // Paso 3: siempre en sombra

  const [editor, setEditor] = useState<EditorSim>(EDITOR_VACIO)
  const [pedidos, setPedidos] = useState<SimBloque[]>([])
  const [hidratado, setHidratado] = useState(false)
  const [avisoCuota, setAvisoCuota] = useState(false)
  const [confirmState, setConfirmState] = useState<{ msg: string; onSi: () => void } | null>(null)
  const [promptState, setPromptState] = useState<{ msg: string; val: string; onOk: (v: string) => void } | null>(null)

  // Cargar de localStorage al montar. En un effect (no en useState) para no leer
  // localStorage en el SSR y evitar el mismatch de hidratación; el setState va en
  // un callback async, como useCRM, así no dispara cascada. Antes de hidratar NO
  // se guarda: pisaría los pedidos reales del equipo.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const e = leerEstado(marca, sombra)
      if (!vivo) return
      if (e) setEditor(e)
      setPedidos(leerPedidos(marca, sombra))
      setHidratado(true)
    })()
    return () => { vivo = false }
  }, [marca, sombra])

  useEffect(() => {
    if (!hidratado) return
    // Escribir en localStorage ES el efecto (sincronizar con un sistema externo).
    // El aviso de cuota se difiere para no hacer setState sincrónico en el effect.
    if (!guardarEstado(marca, sombra, editor)) Promise.resolve().then(() => setAvisoCuota(true))
  }, [editor, hidratado, marca, sombra])

  useEffect(() => {
    if (!hidratado) return
    if (!guardarPedidos(marca, sombra, pedidos)) Promise.resolve().then(() => setAvisoCuota(true))
  }, [pedidos, hidratado, marca, sombra])

  const pedirConfirm = (msg: string, onSi: () => void) => setConfirmState({ msg, onSi })
  const pedirPrompt = (msg: string, val: string, onOk: (v: string) => void) => setPromptState({ msg, val, onOk })

  const snapshot = (nombre: string): SimBloque => ({
    id: nuevoId(),
    nombre: nombre || '',
    total: parseFloat(editor.total) || 0,
    rows: clonar(editor.rows),
    vars: clonar(editor.vars),
    varOn: editor.varOn,
    img: editor.img || null,
  })

  // ── Acciones de pedidos ──
  const guardarPedido = () => {
    const computed = computeFrom(parseFloat(editor.total) || 0, editor.rows, editor.vars, varActivo(editor.vars, editor.varOn))
    if (!computed.length) { alert('Cargá al menos un modelo antes de guardar el pedido.'); return }
    if (editor.editando) {
      const idx = pedidos.findIndex((b) => b.id === editor.editando)
      if (idx >= 0) {
        const snap = snapshot(pedidos[idx].nombre)
        snap.id = pedidos[idx].id
        setPedidos((ps) => ps.map((b, j) => (j === idx ? snap : b)))
        return
      }
    }
    pedirPrompt('Nombre del pedido (ej: Funda IMD):', 'Pedido ' + (pedidos.length + 1), (nombre) => {
      const n = nombre.trim()
      if (n === '') return
      const snap = snapshot(n)
      setPedidos((ps) => [...ps, snap])
      setEditor((e) => ({ ...e, editando: snap.id }))
    })
  }

  const nuevoPedido = () => setEditor(() => ({ ...EDITOR_VACIO }))

  const vaciarSim = () => {
    if (editor.rows.length === 0 && editor.vars.length === 0) return
    pedirConfirm('¿Vaciar la simulación? Se borran todos los modelos y variantes cargados.', () =>
      setEditor((e) => ({ ...e, rows: [], vars: [], varOn: false, img: null })),
    )
  }

  const editarBloque = (id: string) => {
    const b = pedidos.find((x) => x.id === id)
    if (!b) return
    setEditor({ total: String(b.total), rows: clonar(b.rows || []), vars: clonar(b.vars || []), varOn: !!b.varOn, img: b.img || null, editando: id })
    scrollSim()
  }

  const duplicarBloque = (id: string) => {
    const idx = pedidos.findIndex((x) => x.id === id)
    if (idx < 0) return
    const copia = clonar(pedidos[idx])
    copia.id = nuevoId()
    copia.nombre = (pedidos[idx].nombre || 'Pedido') + ' (copia)'
    setPedidos((ps) => { const n = [...ps]; n.splice(idx + 1, 0, copia); return n })
  }

  const eliminarBloque = (id: string) => {
    const b = pedidos.find((x) => x.id === id)
    if (!b) return
    pedirConfirm(`¿Eliminar el pedido "${b.nombre || 'sin nombre'}"?`, () => {
      setPedidos((ps) => ps.filter((x) => x.id !== id))
      setEditor((e) => (e.editando === id ? { ...e, editando: null } : e))
    })
  }

  const nombreBloque = (id: string, val: string) => setPedidos((ps) => ps.map((b) => (b.id === id ? { ...b, nombre: val } : b)))

  // ── Puentes desde ranking / demanda ──
  const aplicarRows = (rows: { model: string; pct: number }[], mensaje: string) => {
    const aplicar = () => { setEditor((e) => ({ ...e, rows })); scrollSim() }
    if (editor.rows.length > 0) pedirConfirm(mensaje, aplicar)
    else aplicar()
  }
  const importarRanking = (filas: { model: string; pct: number }[]) => {
    if (!filas.length) return
    aplicarRows(
      filas.map((f) => ({ model: f.model, pct: f.pct })),
      'Ya tenés una simulación armada.\n\n¿Reiniciarla con el ranking actual? Se pierden los modelos y porcentajes cargados.\n\n(Las variantes que definiste se mantienen.)',
    )
  }
  const usarDemanda = (rows: { model: string; pct: number }[]) => {
    if (!rows.length) { alert('Elegí al menos un modelo (con la tilde) para llevar a la simulación.'); return }
    aplicarRows(rows, 'Esto reemplaza los modelos y porcentajes de la simulación actual con los elegidos.\n\n¿Seguir?')
  }

  return (
    <div className="section visible">
      {avisoCuota && (
        <div className="card" style={{ color: '#B45309', background: '#FFFBEB', borderColor: '#FCD34D' }}>
          El navegador llegó al límite de almacenamiento: el último cambio de la simulación no se guardó. Vaciá pedidos ya decididos o sacá fotos pesadas para liberar espacio.
        </div>
      )}

      {estado === 'error' ? (
        <div className="card" style={{ color: '#DC2626' }}>No se pudieron cargar los datos del monitor{error ? `: ${error}` : '.'}</div>
      ) : !datos ? (
        <div className="card" style={{ color: '#9CA3AF' }}>Cargando datos…</div>
      ) : (
        <>
          <RankingCard datos={datos} onImportar={importarRanking} />
          <DemandaCard datos={datos} onUsar={usarDemanda} />
        </>
      )}

      <SimulacionCard editor={editor} setEditor={setEditor} onGuardar={guardarPedido} onNuevo={nuevoPedido} onVaciar={vaciarSim} />
      <PedidosCard pedidos={pedidos} editando={editor.editando} onEditar={editarBloque} onDuplicar={duplicarBloque} onEliminar={eliminarBloque} onNombre={nombreBloque} />

      {confirmState && (
        <ConfirmModal
          mensaje={confirmState.msg}
          onSi={() => { confirmState.onSi(); setConfirmState(null) }}
          onNo={() => setConfirmState(null)}
        />
      )}
      {promptState && (
        <PromptModal
          mensaje={promptState.msg}
          valorInicial={promptState.val}
          onOk={(v) => { promptState.onOk(v); setPromptState(null) }}
          onCancel={() => setPromptState(null)}
        />
      )}
    </div>
  )
}
