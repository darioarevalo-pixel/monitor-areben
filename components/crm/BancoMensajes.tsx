'use client'

import { useCallback, useEffect, useState } from 'react'
import { guardarBanco, leerBanco } from '@/lib/kv/cliente'
import {
  Button,
  CopyButton,
  Modal,
  Notice,
  color,
  font,
  space,
  useConfirmar,
  useToast,
} from '@/components/ui'
import {
  HUECOS,
  agregarGrupo,
  agregarMensaje,
  borrarGrupo,
  borrarMensaje,
  editarMensaje,
  moverGrupo,
  moverMensaje,
  normalizarBanco,
  renombrarGrupo,
  totalMensajes,
  type Banco,
} from '@/lib/crm/mensajes'

/**
 * "Mensajes para WhatsApp" — la ventana donde se escriben los textos que se mandan.
 *
 * **Por qué una ventana con botón y no una pestaña.** Los mensajes se retocan cada tanto, no
 * todos los días; una pestaña fija arriba de la sección ocupa lugar para siempre a cambio de
 * algo que se abre una vez por semana. Mismo criterio que la Guía de trabajo.
 *
 * **Los grupos los arma el que vende.** El banco venía con 8 grupos de fábrica (dormido /
 * objeciones / canal) que no son la división de nadie en particular — por eso acá se pueden
 * crear, renombrar, mover y borrar. Un banco que sólo deja tocar los textos adentro de cajones
 * ajenos se termina abandonando.
 *
 * 🔴 **Se carga al ABRIR, no con la sección.** La sección ya baja 27.990 ventas; esto es una
 * consulta más al KV que la mayoría de los días no se usa.
 *
 * 🔴 **`cargado` manda.** La clave `mensajes:bdi` se reescribe entera en cada guardado y la
 * guarda del servidor deja pasar `[]`: si la lectura falla, no se puede tocar nada. Por eso la
 * ventana muestra el error y no dibuja ningún botón de edición.
 */

const CAJA: React.CSSProperties = {
  border: `1px solid ${color.line2}`,
  borderRadius: 'var(--mo-r-lg)',
  padding: `${space[3]} ${space[4]}`,
}

/** Botón chiquito de ícono, para las flechas y la papelera. */
function Mini({
  children,
  title,
  onClick,
  peligro,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  peligro?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        border: `1px solid ${color.line2}`,
        background: color.bg,
        color: peligro ? color.danger : color.mut,
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: font.sm,
        lineHeight: 1,
        padding: '5px 7px',
      }}
    >
      {children}
    </button>
  )
}

export function BancoMensajes({ onCerrar }: { onCerrar: () => void }) {
  const toast = useToast()
  const { confirmar } = useConfirmar()

  const [banco, setBanco] = useState<Banco>([])
  const [cargado, setCargado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Qué se está editando: un mensaje ({gi, mi}), el nombre de un grupo o el grupo nuevo.
  const [editando, setEditando] = useState<{ gi: number; mi: number } | null>(null)
  const [borrador, setBorrador] = useState('')
  const [renombrando, setRenombrando] = useState<number | null>(null)
  const [grupoNuevo, setGrupoNuevo] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await leerBanco('bdi')
      if (!vivo) return
      if (r.ok) {
        setBanco(normalizarBanco(r.dato))
        setCargado(true)
      } else {
        setError(r.motivo)
      }
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [])

  /**
   * Aplica una transformación y la persiste. Optimista, como el resto del CRM: la pantalla
   * cambia primero y el error, si aparece, se avisa por toast.
   */
  const aplicar = useCallback(
    async (fn: (b: Banco) => Banco) => {
      const nuevo = fn(banco)
      if (nuevo === banco) return
      setBanco(nuevo)
      setGuardando(true)
      const r = await guardarBanco({ store: 'bdi', banco: nuevo, cargado })
      setGuardando(false)
      if (!r.ok) toast.error('No se pudo guardar: ' + r.motivo)
    },
    [banco, cargado, toast],
  )

  const abrirEdicion = (gi: number, mi: number) => {
    setEditando({ gi, mi })
    setBorrador(banco[gi].mensajes[mi])
  }

  /**
   * Un mensaje nuevo se edita con `mi = -1` y **nace recién al guardarlo**. La otra forma —
   * agregarlo vacío y después editarlo — deja una caja en blanco cada vez que alguien abre el
   * editor y se arrepiente.
   */
  const confirmarEdicion = async () => {
    if (!editando) return
    const { gi, mi } = editando
    setEditando(null)
    await aplicar((b) => (mi < 0 ? agregarMensaje(b, gi, borrador) : editarMensaje(b, gi, mi, borrador)))
  }

  const pedirBorrarMensaje = async (gi: number, mi: number) => {
    const ok = await confirmar({ titulo: 'Eliminar el mensaje', mensaje: '¿Lo saco de la lista? No se puede deshacer.' })
    if (ok) await aplicar((b) => borrarMensaje(b, gi, mi))
  }

  const pedirBorrarGrupo = async (gi: number) => {
    const g = banco[gi]
    const ok = await confirmar({
      titulo: `Eliminar "${g.grupo}"`,
      mensaje:
        g.mensajes.length > 0
          ? `Se elimina el grupo con sus ${g.mensajes.length} mensajes. No se puede deshacer.`
          : 'Se elimina el grupo. No se puede deshacer.',
    })
    if (ok) await aplicar((b) => borrarGrupo(b, gi))
  }

  const total = totalMensajes(banco)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Mensajes para WhatsApp"
      ancho="ancho"
      cerrarConFondo={false}
      pie={
        <>
          <span style={{ marginRight: 'auto', fontSize: font.sm, color: color.mut }}>
            {guardando ? 'Guardando…' : cargado ? `${total} mensajes en ${banco.length} grupos · se guarda solo` : ''}
          </span>
          <Button onClick={onCerrar}>Cerrar</Button>
        </>
      }
    >
      {cargando && <div style={{ padding: space[4], color: color.mut2 }}>Cargando…</div>}

      {!cargando && error && (
        <Notice tone="danger" icon="⚠">
          No se pudo leer la lista de mensajes, así que no se puede editar nada: guardar ahora la
          dejaría vacía. Cerrá y volvé a abrir en un rato. ({error})
        </Notice>
      )}

      {!cargando && cargado && (
        <>
          <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.7, marginBottom: space[3] }}>
            Son los mensajes que aparecen en el panel del costado de WhatsApp. Los grupos y los
            textos los armás vos: agregá, cambiá y borrá lo que quieras.
          </div>

          <div style={{ ...CAJA, background: color.bg2, marginBottom: space[4] }}>
            <div style={{ fontSize: font.sm, fontWeight: 700, color: color.mut, marginBottom: space[2] }}>
              Los huecos
            </div>
            <div style={{ display: 'grid', gap: 4, fontSize: font.sm, color: color.ink2 }}>
              {HUECOS.map((h) => (
                <div key={h.hueco}>
                  <code style={{ background: color.bg, border: `1px solid ${color.line2}`, padding: '1px 6px', borderRadius: 4 }}>
                    {h.hueco}
                  </code>{' '}
                  — {h.que}
                  {h.automatico && <b style={{ color: color.brand }}> (lo pone solo)</b>}
                </div>
              ))}
            </div>
          </div>

          {banco.length === 0 && (
            <div style={{ ...CAJA, textAlign: 'center', color: color.mut, fontSize: font.base }}>
              Todavía no hay ningún grupo. Creá el primero acá abajo.
            </div>
          )}

          <div style={{ display: 'grid', gap: space[4] }}>
            {banco.map((g, gi) => (
              <div key={`${gi}-${g.grupo}`} style={CAJA}>
                {/* Cabecera del grupo */}
                <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
                  {renombrando === gi ? (
                    <>
                      <input
                        className="mo-input"
                        autoFocus
                        value={borrador}
                        onChange={(e) => setBorrador(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setRenombrando(null)
                            aplicar((b) => renombrarGrupo(b, gi, borrador))
                          }
                          if (e.key === 'Escape') setRenombrando(null)
                        }}
                        style={{ flex: 1, minWidth: 200 }}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          setRenombrando(null)
                          aplicar((b) => renombrarGrupo(b, gi, borrador))
                        }}
                      >
                        Guardar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRenombrando(null)}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, flex: 1 }}>{g.grupo}</span>
                      <span style={{ fontSize: font.sm, color: color.mut2 }}>{g.mensajes.length}</span>
                      <Mini title="Renombrar el grupo" onClick={() => { setRenombrando(gi); setBorrador(g.grupo) }}>
                        ✏️
                      </Mini>
                      <Mini title="Subir el grupo" onClick={() => aplicar((b) => moverGrupo(b, gi, -1))}>↑</Mini>
                      <Mini title="Bajar el grupo" onClick={() => aplicar((b) => moverGrupo(b, gi, 1))}>↓</Mini>
                      <Mini title="Eliminar el grupo" peligro onClick={() => pedirBorrarGrupo(gi)}>🗑️</Mini>
                    </>
                  )}
                </div>

                {/* Mensajes */}
                <div style={{ display: 'grid', gap: space[2], marginTop: space[3] }}>
                  {g.mensajes.map((m, mi) =>
                    editando && editando.gi === gi && editando.mi === mi ? (
                      <div key={mi} style={{ background: color.bg2, border: `1px solid ${color.line2}`, borderRadius: 8, padding: space[2] }}>
                        <textarea
                          className="mo-input"
                          autoFocus
                          rows={3}
                          value={borrador}
                          onChange={(e) => setBorrador(e.target.value)}
                          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
                        />
                        <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end', marginTop: space[2] }}>
                          <Button size="sm" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                          <Button size="sm" onClick={confirmarEdicion}>Guardar</Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={mi}
                        style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', background: color.bg2, border: `1px solid ${color.line2}`, borderRadius: 8, padding: `${space[2]} ${space[3]}` }}
                      >
                        <div style={{ flex: 1, fontSize: font.base, color: color.ink2, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{m}</div>
                        <CopyButton getText={() => m} label="Copiar" copiedLabel="Copiado" />
                        <Mini title="Editar el mensaje" onClick={() => abrirEdicion(gi, mi)}>✏️</Mini>
                        <Mini title="Subir el mensaje" onClick={() => aplicar((b) => moverMensaje(b, gi, mi, -1))}>↑</Mini>
                        <Mini title="Bajar el mensaje" onClick={() => aplicar((b) => moverMensaje(b, gi, mi, 1))}>↓</Mini>
                        <Mini title="Eliminar el mensaje" peligro onClick={() => pedirBorrarMensaje(gi, mi)}>🗑️</Mini>
                      </div>
                    ),
                  )}

                  {editando && editando.gi === gi && editando.mi < 0 && (
                    <div style={{ background: color.bg2, border: `1px solid ${color.line2}`, borderRadius: 8, padding: space[2] }}>
                      <textarea
                        className="mo-input"
                        autoFocus
                        rows={3}
                        placeholder="Escribí el mensaje. Podés usar [Nombre]."
                        value={borrador}
                        onChange={(e) => setBorrador(e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
                      />
                      <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end', marginTop: space[2] }}>
                        <Button size="sm" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                        <Button size="sm" disabled={!borrador.trim()} onClick={confirmarEdicion}>Guardar</Button>
                      </div>
                    </div>
                  )}

                  <div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditando({ gi, mi: -1 })
                        setBorrador('')
                      }}
                    >
                      + Agregar mensaje
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Grupo nuevo */}
          <div style={{ ...CAJA, marginTop: space[4], display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="mo-input"
              placeholder="Nombre del grupo nuevo (ej. Postventa)"
              value={grupoNuevo}
              onChange={(e) => setGrupoNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && grupoNuevo.trim()) {
                  aplicar((b) => agregarGrupo(b, grupoNuevo))
                  setGrupoNuevo('')
                }
              }}
              style={{ flex: 1, minWidth: 220 }}
            />
            <Button
              disabled={!grupoNuevo.trim()}
              onClick={() => {
                aplicar((b) => agregarGrupo(b, grupoNuevo))
                setGrupoNuevo('')
              }}
            >
              Agregar grupo
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
