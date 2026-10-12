'use client'

/**
 * El armado de «Llevar al local» con el lector (tanda 1 del escaneo, Darío 12-oct-2026).
 *
 * Lorena escanea en la COMPU del depósito cada prenda que junta. La pantalla la cuenta CONTRA la
 * lista congelada al empezar, la dice en voz alta y, al terminar, el Monitor hace la transferencia
 * depósito → local en Gestión Nube **sólo con lo escaneado** (`api/_repo-armado.js`).
 *
 * 🔑 Lo que no se adivina (mismas lecciones que Conteo, `docs/secciones/conteo.md`):
 * - **Lo que no va, frena la pantalla** (cartel rojo a pantalla completa): una prenda que sobra o que
 *   no está en la lista no puede quedar en la pila por no haber oído el pitido.
 * - El cartel rojo ⛔ no es el `Modal` del kit: el Enter del lector lo cerraba solo. Lo que se escanea
 *   con el cartel abierto no se cuenta, y el cartel lo dice.
 * - Lo escaneado vive en el aparato (localStorage) y se sube a la base cada pocos segundos: si se
 *   cierra la pestaña o se corta internet, no se pierde.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  cancelarArmado,
  destino,
  transferidoDe,
  ErrorArmado,
  frase,
  guardarArmado,
  leerCodigo,
  motivoRechazo,
  resumenArmado,
  talle,
  transferirArmado,
  type Armado,
  type Lectura,
  type LineaPedido,
  type MotivoFaltante,
  type Rechazado,
} from '@/lib/reposicion/armado'
import { avisar, prepararSonido } from '@/lib/sonido'
import type { RepoItem } from '@/lib/reposicion/tipos'
import { Badge, Button, Modal, Notice, TBody, THead, TableWrap, Td, Th, Tr, color, font, space, useConfirmar, useToast } from '@/components/ui'

type Guardado = 'ok' | 'guardando' | 'error'
type Cartel = { titulo: string; texto: string }

const claveLocal = (id: string) => `monitor_repo_armado_${id}`

function leerLocal(id: string): { escaneos: Record<string, number>; faltantes: Record<string, MotivoFaltante> } | null {
  try {
    const raw = localStorage.getItem(claveLocal(id))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function ArmadoLector({ armado, inv, onSalir, onTerminado }: {
  armado: Armado
  /** Todo el inventario de la línea: para nombrar una prenda que no está en la lista. */
  inv: RepoItem[]
  /** Volver a la lista sin cerrar el armado (sigue abierto). */
  onSalir: () => void
  /** Se transfirió o se descartó: la pantalla de arriba vuelve a leer el armado y el stock. */
  onTerminado: (transferido: boolean) => void
}) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const pedido = armado.pedido
  const inicial = useMemo(() => leerLocal(armado.id), [armado.id])
  const [escaneos, setEscaneos] = useState<Record<string, number>>(() => inicial?.escaneos ?? armado.escaneos ?? {})
  const [faltantes, setFaltantes] = useState<Record<string, MotivoFaltante>>(() => inicial?.faltantes ?? armado.faltantes ?? {})
  const [guardado, setGuardado] = useState<Guardado>('ok')
  // La última que SUMÓ: un cartel rojo no la borra, así se sigue viendo dónde iba.
  const [ultima, setUltima] = useState<Extract<Lectura, { tipo: 'suma' }> | null>(null)
  const [cartel, setCartel] = useState<Cartel | null>(null)
  const [extra, setExtra] = useState(0)
  const [escuchando, setEscuchando] = useState(false)
  // «cerrar» = Finalizar; «seguir» = Transferir y continuar (la limpieza grande, en tandas del carro).
  const [terminar, setTerminar] = useState<false | 'cerrar' | 'seguir'>(false)
  // Lo ya transferido en tandas anteriores: no se puede restar ni se vuelve a mandar.
  const [transferido, setTransferido] = useState<Record<string, number>>(() => transferidoDe(armado.transfer))
  const devolucion = armado.sentido === 'devolver'
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Guardar: en el aparato al instante, en la base cada 1,5 s ──────────────────────────────
  const pendiente = useRef(false)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  const estadoRef = useRef({ escaneos, faltantes })
  useEffect(() => {
    estadoRef.current = { escaneos, faltantes }
  }, [escaneos, faltantes])

  const subir = useCallback(async () => {
    if (!pendiente.current) return
    pendiente.current = false
    setGuardado('guardando')
    try {
      await guardarArmado(armado.id, estadoRef.current.escaneos, estadoRef.current.faltantes)
      setGuardado(pendiente.current ? 'guardando' : 'ok')
    } catch {
      pendiente.current = true
      setGuardado('error')
    }
  }, [armado.id])

  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) {
      primera.current = false
      return
    }
    try {
      localStorage.setItem(claveLocal(armado.id), JSON.stringify({ escaneos, faltantes }))
    } catch {
      /* sin almacenamiento: queda la base */
    }
    pendiente.current = true
    setGuardado('guardando')
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => void subir(), 1500)
  }, [escaneos, faltantes, armado.id, subir])
  // Al salir de la pantalla, lo que quedó sin subir se sube.
  useEffect(() => () => void subir(), [subir])
  // Si falló, reintenta solo cada 10 s.
  useEffect(() => {
    if (guardado !== 'error') return
    const r = setInterval(() => void subir(), 10_000)
    return () => clearInterval(r)
  }, [guardado, subir])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ── El lector ─────────────────────────────────────────────────────────────────────────────
  const onCodigo = (codigo: string) => {
    if (!codigo.trim()) return
    prepararSonido()
    if (cartel) {
      // Con el cartel abierto no se cuenta nada: es la prenda que hay que separar, más ésta.
      setExtra((n) => n + 1)
      avisar('no')
      return
    }
    const l = leerCodigo(pedido, escaneos, codigo, inv)
    if (l.tipo === 'suma') {
      setUltima(l)
      setEscaneos((e) => ({ ...e, [l.linea.vid]: l.n }))
      // Si estaba anotada como «no estaba», apareció: se saca la marca.
      if (faltantes[l.linea.vid]) setFaltantes(({ [l.linea.vid]: _, ...resto }) => resto)
      avisar(l.exhibir ? 'mira' : l.faltan > 0 ? 'ok' : 'suma', frase(l))
      return
    }
    setExtra(0)
    if (l.tipo === 'sobra') {
      setCartel({ titulo: 'Prenda excedente', texto: `${l.linea.name}${talle(l.linea.size) ? ` ${talle(l.linea.size)}` : ''}: ya están las ${l.linea.cant}.` })
      avisar('no', 'Excedente')
    } else if (l.tipo === 'no-pedida') {
      setCartel({ titulo: 'Prenda no solicitada', texto: `${l.nombre} no está en la ${devolucion ? 'devolución' : 'reposición'} de hoy.` })
      avisar('no', 'No solicitada')
    } else {
      setCartel({ titulo: 'Código desconocido', texto: `«${codigo.trim()}» no corresponde a ninguna prenda.` })
      avisar('no', 'Código desconocido')
    }
  }

  const sacarUna = (l: LineaPedido) => setEscaneos((e) => {
    const n = Math.max(transferido[l.vid] || 0, (e[l.vid] || 0) - 1)
    const { [l.vid]: _, ...resto } = e
    return n > 0 ? { ...resto, [l.vid]: n } : resto
  })

  const r = resumenArmado(pedido, escaneos)
  const abiertas = pedido.filter((l) => (escaneos[l.vid] || 0) < l.cant)
  const completas = pedido.filter((l) => (escaneos[l.vid] || 0) >= l.cant)
  const yaTransferidas = Object.values(transferido).reduce((x, n) => x + n, 0)
  const porTransferir = r.escaneadas - yaTransferidas

  const onDescartar = async () => {
    const ok = await confirmar({
      titulo: '¿Descartar este armado?',
      tono: 'danger',
      ok: 'Descartar armado',
      mensaje: 'Se pierde lo escaneado y no se transfiere nada.',
    })
    if (!ok) return
    try {
      await cancelarArmado(armado.id)
      try {
        localStorage.removeItem(claveLocal(armado.id))
      } catch {
        /* nada */
      }
      onTerminado(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
        <Button variant="ghost" onClick={onSalir}>
          ← Volver
        </Button>
        <span style={{ fontSize: font.lg, color: color.ink }}>
          <b>{r.escaneadas}</b> / {r.pedidas} prendas
        </span>
        {yaTransferidas > 0 && <span style={{ fontSize: font.sm, color: color.mut }}>{yaTransferidas} ya transferidas</span>}
        <span style={{ marginLeft: 'auto', fontSize: font.sm, color: guardado === 'error' ? color.danger : color.mut2 }}>
          {guardado === 'ok' ? '✓ Guardado' : guardado === 'guardando' ? 'Guardando…' : 'Sin conexión: guardado en esta compu'}
        </span>
        {devolucion && (
          <Button variant="outline" onClick={() => setTerminar('seguir')} disabled={porTransferir <= 0} title="Transfiere lo escaneado hasta ahora y la lista sigue abierta">
            Transferir y continuar
          </Button>
        )}
        <Button variant="solid" tone="brand" onClick={() => setTerminar('cerrar')} disabled={r.escaneadas === 0 && !Object.keys(faltantes).length}>
          Finalizar
        </Button>
      </div>

      {devolucion && (
        <div style={{ marginBottom: space[3] }}>
          <Notice tone="warning" icon="⚠">
            <b>Retirar solo de la reserva, nunca la exhibida.</b>
          </Notice>
        </div>
      )}

      <div style={{ height: 8, background: color.bg2, borderRadius: 4, overflow: 'hidden', marginBottom: space[3] }}>
        <div style={{ width: `${r.pedidas ? Math.round((r.escaneadas / r.pedidas) * 100) : 0}%`, height: '100%', background: 'var(--mo-brand-solid)' }} />
      </div>

      <input
        ref={inputRef}
        className="mo-input"
        type="text"
        // Un campo de texto suelto con foco lo toman por usuario/contraseña los gestores de claves
        // (Darío, 12-oct-2026: «me abre un espacio para rellenar una contraseña»). `name` propio y
        // las marcas de cada gestor para que lo ignoren.
        name="codigo-prenda"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore=""
        data-lpignore="true"
        data-bwignore="true"
        data-form-type="other"
        placeholder="Escanear prenda…"
        aria-label="Código de barras a escanear"
        onFocus={() => setEscuchando(true)}
        onBlur={() => setEscuchando(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const v = e.currentTarget.value
            e.currentTarget.value = ''
            onCodigo(v)
          }
        }}
        style={{ height: 52, fontSize: 18, borderWidth: 3, borderColor: escuchando ? color.successBorder : color.line }}
      />
      {!escuchando && !cartel && !terminar && (
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          style={{ display: 'block', width: '100%', height: 'auto', marginTop: space[2], padding: space[2], border: `1px dashed ${color.warningInk}`, borderRadius: 8, background: 'transparent', color: color.warningInk, fontSize: font.md, cursor: 'pointer' }}
        >
          Lector inactivo: hacé clic acá para seguir.
        </button>
      )}

      <UltimaLectura l={ultima} />

      {abiertas.length > 0 && (
        <>
          <h3 style={{ fontSize: font.md, margin: `${space[4]}px 0 ${space[2]}px`, color: color.ink }}>Pendientes ({abiertas.length})</h3>
          <TablaRenglones lineas={abiertas} escaneos={escaneos} faltantes={faltantes} transferido={transferido} onSacar={sacarUna} />
        </>
      )}
      {completas.length > 0 && (
        <>
          <h3 style={{ fontSize: font.md, margin: `${space[4]}px 0 ${space[2]}px`, color: color.success }}>Completas ({completas.length})</h3>
          <TablaRenglones lineas={completas} escaneos={escaneos} faltantes={faltantes} transferido={transferido} onSacar={sacarUna} />
        </>
      )}

      {/* Con tandas ya transferidas no se puede descartar: esas prendas ya cambiaron de depósito. */}
      {yaTransferidas === 0 && (
        <div style={{ marginTop: space[5], display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="ghost" tone="danger" onClick={() => void onDescartar()}>
            Descartar armado
          </Button>
        </div>
      )}

      {cartel && (
        <CartelFreno
          cartel={cartel}
          extra={extra}
          onSeguir={() => {
            setCartel(null)
            setExtra(0)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
        />
      )}

      <Terminar
        key={terminar || 'cerrado'}
        abierto={!!terminar}
        seguir={terminar === 'seguir'}
        transferido={transferido}
        armado={armado}
        escaneos={escaneos}
        faltantes={faltantes}
        setEscaneos={setEscaneos}
        setFaltantes={setFaltantes}
        onCerrar={() => {
          setTerminar(false)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        onTanda={(t) => {
          setTransferido(transferidoDe(t))
          setTerminar(false)
          toast.ok(`${t.tandas?.at(-1)?.unidades ?? ''} prendas transferidas al ${destino(armado.sentido)}${t.transfer_id ? ` · Transferencia ${t.transfer_id}` : ''}`)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        onTransferido={() => {
          try {
            localStorage.removeItem(claveLocal(armado.id))
          } catch {
            /* nada */
          }
          onTerminado(true)
        }}
      />
    </div>
  )
}

function UltimaLectura({ l }: { l: Extract<Lectura, { tipo: 'suma' }> | null }) {
  if (!l)
    return (
      <div style={{ marginTop: space[3], padding: space[4], border: `1px solid ${color.line}`, borderRadius: 'var(--mo-r-xl)', textAlign: 'center', color: color.mut, fontSize: font.md }}>
        Escaneá la primera prenda.
      </div>
    )
  const ok = l.faltan === 0
  return (
    <div
      role="status"
      style={{
        marginTop: space[3],
        padding: space[4],
        borderRadius: 'var(--mo-r-xl)',
        textAlign: 'center',
        border: `2px solid ${l.exhibir ? color.warningInk : ok ? color.successBorder : color.line}`,
        background: l.exhibir ? 'var(--mo-warning-bg, #FEF3C7)' : 'transparent',
      }}
    >
      {l.exhibir && <div style={{ fontSize: font.lg, fontWeight: 800, color: color.warningInk, marginBottom: space[2] }}>Para exhibir: alarma y etiquetas</div>}
      <div style={{ fontSize: 22, fontWeight: 700, color: color.ink }}>
        {l.linea.name} {talle(l.linea.size) && <span style={{ fontWeight: 400 }}>· {talle(l.linea.size)}</span>}
      </div>
      <div style={{ fontSize: font.lg, marginTop: space[1], color: ok ? color.success : color.ink2 }}>
        {ok ? `✓ Completa (${l.linea.cant})` : `${l.n} / ${l.linea.cant}`}
      </div>
    </div>
  )
}

function TablaRenglones({ lineas, escaneos, faltantes, transferido, onSacar }: { lineas: LineaPedido[]; escaneos: Record<string, number>; faltantes: Record<string, MotivoFaltante>; transferido: Record<string, number>; onSacar: (l: LineaPedido) => void }) {
  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th width={130}>SKU</Th>
          <Th>Producto</Th>
          <Th width={110}>Variante</Th>
          <Th align="center" width={80}>Pedido</Th>
          <Th align="center" width={90}>Escaneado</Th>
          <Th width={60} />
        </Tr>
      </THead>
      <TBody>
        {lineas.map((l) => {
          const n = escaneos[l.vid] || 0
          return (
            <Tr key={l.vid}>
              <Td style={{ fontSize: font.sm, color: color.mut }}>{l.sku || '—'}</Td>
              <Td wrap>
                {l.name}
                {l.exhibir && (
                  <span style={{ marginLeft: 6 }}>
                    <Badge tone="warning">para exhibir</Badge>
                  </span>
                )}
                {faltantes[l.vid] === 'no-estaba' && (
                  <span style={{ marginLeft: 6 }}>
                    <Badge tone="danger">no encontrada</Badge>
                  </span>
                )}
              </Td>
              <Td>{talle(l.size) || '—'}</Td>
              <Td align="center">{l.cant}</Td>
              <Td align="center" style={{ fontWeight: 700, color: n >= l.cant ? color.success : n > 0 ? color.ink : color.mut2 }}>
                {n}
              </Td>
              <Td align="right">
                {n > (transferido[l.vid] || 0) && (
                  <Button size="sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => onSacar(l)} title="Restar una (escaneo por error)" aria-label={`Restar una de «${l.name}»`}>
                    −1
                  </Button>
                )}
              </Td>
            </Tr>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

function CartelFreno({ cartel, extra, onSeguir }: { cartel: Cartel; extra: number; onSeguir: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-label={cartel.titulo}
      onMouseDown={(e) => e.preventDefault()}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: color.danger, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4] }}
    >
      <div style={{ maxWidth: 600, textAlign: 'center' }}>
        <div style={{ fontSize: 56, lineHeight: 1 }}>✋</div>
        <div style={{ fontSize: 32, fontWeight: 800, marginTop: space[3] }}>{cartel.titulo}</div>
        <div style={{ fontSize: font.lg, marginTop: space[3] }}>{cartel.texto}</div>
        <div style={{ fontSize: font.lg, marginTop: space[3], fontWeight: 600 }}>Dejala en el estante.</div>
        {extra > 0 && (
          <div style={{ fontSize: font.md, marginTop: space[3], padding: space[3], background: 'rgba(0,0,0,.2)', borderRadius: 'var(--mo-r-xl)' }}>
            {extra === 1 ? '1 lectura' : `${extra} lecturas`} con este aviso abierto: no {extra === 1 ? 'se contó' : 'se contaron'}. Volvé a escanear.
          </div>
        )}
        <div style={{ marginTop: space[5] }}>
          <Button variant="solid" tone="neutral" size="lg" onMouseDown={(e) => e.preventDefault()} onClick={onSeguir}>
            Continuar
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Cerrar: por cada renglón incompleto se pregunta «¿no estaba, o lo dejás para después?», y recién
 * con todo contestado se transfiere. Si GN rechaza renglones (no movió nada), se muestran y se
 * pueden sacar para transferir el resto.
 */
function Terminar({ abierto, seguir, transferido, armado, escaneos, faltantes, setEscaneos, setFaltantes, onCerrar, onTanda, onTransferido }: {
  abierto: boolean
  /** «Transferir y continuar»: no pregunta por lo que falta y el armado sigue abierto. */
  seguir: boolean
  transferido: Record<string, number>
  armado: Armado
  escaneos: Record<string, number>
  faltantes: Record<string, MotivoFaltante>
  setEscaneos: React.Dispatch<React.SetStateAction<Record<string, number>>>
  setFaltantes: React.Dispatch<React.SetStateAction<Record<string, MotivoFaltante>>>
  onCerrar: () => void
  onTanda: (t: NonNullable<Armado['transfer']>) => void
  onTransferido: () => void
}) {
  const lugar = destino(armado.sentido)
  const [enviando, setEnviando] = useState(false)
  const [rechazados, setRechazados] = useState<Rechazado[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ transfer_id?: string | number | null; unidades?: number } | null>(null)
  const incompletas = seguir ? [] : armado.pedido.filter((l) => (escaneos[l.vid] || 0) < l.cant)
  const sinContestar = incompletas.filter((l) => !faltantes[l.vid])
  const r = resumenArmado(armado.pedido, escaneos)
  const porTransferir = r.escaneadas - Object.values(transferido).reduce((x, n) => x + n, 0)
  const porVid = useMemo(() => Object.fromEntries(armado.pedido.map((l) => [l.vid, l])), [armado.pedido])

  const transferir = async (esc = escaneos, fal = faltantes) => {
    setEnviando(true)
    setError(null)
    setRechazados([])
    try {
      const d = await transferirArmado(armado.id, esc, fal, seguir)
      if (seguir) onTanda(d.transfer)
      else setHecho(d.transfer)
    } catch (e) {
      if (e instanceof ErrorArmado && e.status === 422 && Array.isArray(e.datos.rechazados)) setRechazados(e.datos.rechazados as Rechazado[])
      setError((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  const sacarRechazadas = () => {
    const esc = { ...escaneos }
    const fal = { ...faltantes }
    for (const x of rechazados) {
      delete esc[x.vid]
      fal[x.vid] = 'rechazada'
    }
    setEscaneos(esc)
    setFaltantes(fal)
    void transferir(esc, fal)
  }

  if (hecho)
    return (
      <Modal abierto={abierto} onCerrar={onTransferido} titulo="Transferencia realizada" cerrarConFondo={false} pie={<Button variant="solid" tone="brand" onClick={onTransferido}>Volver</Button>}>
        <p style={{ fontSize: font.md, margin: 0 }}>
          {hecho.unidades ?? r.escaneadas} {(hecho.unidades ?? r.escaneadas) === 1 ? 'prenda transferida' : 'prendas transferidas'} al {lugar}
          {hecho.transfer_id ? ` · Transferencia ${hecho.transfer_id}` : ''}.
        </p>
      </Modal>
    )

  return (
    <Modal
      abierto={abierto}
      onCerrar={enviando ? () => {} : onCerrar}
      titulo={seguir ? 'Transferir y continuar' : 'Finalizar armado'}
      ancho="ancho"
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={enviando}>
            Volver al escaneo
          </Button>
          {rechazados.length > 0 ? (
            <Button variant="solid" tone="brand" onClick={sacarRechazadas} loading={enviando}>
              Excluirlas y transferir
            </Button>
          ) : (
            <Button variant="solid" tone="brand" onClick={() => void transferir()} loading={enviando} disabled={sinContestar.length > 0 || (porTransferir <= 0 && (seguir || r.escaneadas === 0))}>
              {porTransferir > 0 ? `Transferir ${porTransferir} ${porTransferir === 1 ? 'prenda' : 'prendas'}` : 'Cerrar armado'}
            </Button>
          )}
        </>
      }
    >
      <p style={{ fontSize: font.md, marginTop: 0 }}>
        {seguir ? (
          <>
            Se transfieren al {lugar} las <b>{porTransferir}</b> escaneadas desde la última transferencia. La lista sigue abierta.
          </>
        ) : (
          <>
            <b>{r.escaneadas}</b> / {r.pedidas} prendas escaneadas. Se transfieren al {lugar} solo las escaneadas
            {r.escaneadas > porTransferir ? ` (${r.escaneadas - porTransferir} ya transferidas)` : ''}.
          </>
        )}
      </p>

      {incompletas.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', margin: `${space[3]}px 0` }}>
            <span style={{ fontSize: font.md, fontWeight: 600, flex: '1 1 200px' }}>Sin escanear</span>
            {incompletas.length > 1 && (
              <>
                <span style={{ fontSize: font.sm, color: color.mut }}>Todas:</span>
                <Button size="sm" variant="ghost" onClick={() => setFaltantes((f) => ({ ...f, ...Object.fromEntries(incompletas.map((l) => [l.vid, 'no-estaba' as const])) }))}>
                  No encontradas
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFaltantes((f) => ({ ...f, ...Object.fromEntries(incompletas.map((l) => [l.vid, 'despues' as const])) }))}>
                  Pendientes
                </Button>
              </>
            )}
          </div>
          {incompletas.map((l) => {
            const n = escaneos[l.vid] || 0
            const m = faltantes[l.vid]
            const elegir = (v: MotivoFaltante) => setFaltantes((f) => ({ ...f, [l.vid]: v }))
            return (
              <div key={l.vid} style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', padding: `${space[2]}px 0`, borderBottom: `1px solid ${color.bg2}` }}>
                <span style={{ flex: '1 1 240px', fontSize: font.md }}>
                  {l.name} {talle(l.size) && <span style={{ color: color.mut }}>· {talle(l.size)}</span>}
                  <span style={{ color: color.danger, marginLeft: 8 }}>{l.cant - n}</span>
                </span>
                <Button size="sm" variant={m === 'no-estaba' ? 'solid' : 'outline'} tone={m === 'no-estaba' ? 'danger' : 'neutral'} onClick={() => elegir('no-estaba')}>
                  No encontrada
                </Button>
                <Button size="sm" variant={m === 'despues' ? 'solid' : 'outline'} tone={m === 'despues' ? 'brand' : 'neutral'} onClick={() => elegir('despues')}>
                  Pendiente
                </Button>
              </div>
            )
          })}
          {sinContestar.length > 0 && (
            <p style={{ fontSize: font.sm, color: color.mut, marginTop: space[2] }}>Indicá qué pasó con {sinContestar.length === 1 ? 'la que queda' : `las ${sinContestar.length} que quedan`}.</p>
          )}
        </>
      )}

      {error && (
        <div style={{ marginTop: space[3] }}>
          <Notice tone="danger" icon="⚠">
            {error}
            {rechazados.length > 0 && (
              <ul style={{ margin: `${space[2]}px 0 0`, paddingLeft: 18 }}>
                {rechazados.map((x) => (
                  <li key={x.vid}>
                    <b>
                      {porVid[x.vid]?.name ?? x.vid} {talle(porVid[x.vid]?.size || '')}
                    </b>
                    : {motivoRechazo(x.reason)}
                  </li>
                ))}
              </ul>
            )}
            {rechazados.length > 0 && <div style={{ marginTop: space[2] }}>Separalas: hay una diferencia de stock.</div>}
          </Notice>
        </div>
      )}
    </Modal>
  )
}
