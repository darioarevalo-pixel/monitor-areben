'use client'

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin as esAdminDe, puedeSub } from '@/lib/permisos'
import { credencialConPrompt } from '@/lib/sesion'
import { imgAThumbYSubir } from '@/lib/imagenes'
import { MODELOS_AUTOCOMPLETE } from '@/lib/ingresos/modelos'
import {
  agregarBloque,
  agregarDiseno,
  agregarGaleria,
  agregarIngreso,
  agregarModelo,
  bloqueIgualar,
  bloqueU,
  cargarBase,
  celdaGet,
  driveId,
  esVideoUrl,
  estadoDe,
  ESTADOS,
  filaIgualar,
  mesDe,
  nuevoBloque,
  nuevoIngreso,
  ordenarPorFecha,
  quitarBloque,
  quitarDiseno,
  quitarGaleria,
  quitarIngreso,
  quitarModelo,
  resumen,
  setBloqueNombre,
  setCampo,
  setCelda,
  setDisenoImg,
  setDisenoNombre,
  setModelo,
  totalDiseno,
  totalModelo,
  totalU,
  ytId,
} from '@/lib/ingresos/core'
import type { Bloque, GalleryItem, Ingreso, VistaIngresos } from '@/lib/ingresos/tipos'
import { nuevoId, useIngresos } from './useIngresos'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { Card, color as paleta, useConfirmar } from '@/components/ui'

const VISTA_KEY = 'monitor_ing_vista'

/**
 * Reduce la foto, la sube a Blob y persiste la URL (o el base64 si el Blob falla).
 * A diferencia de Fundas NO usa preview: acá `guardar` persiste en el KV COMPARTIDO,
 * así que meter el base64 aunque sea de paso lo mandaría al KV. Se persiste una sola
 * vez, con la URL corta ya resuelta.
 */
function subirFotoIngreso(file: File | null | undefined, persistir: (url: string) => void, max: number) {
  imgAThumbYSubir(file, { onUrl: persistir, onFallback: persistir }, 'ingresos', max)
}

/** Credencial para los guardados admin. A nivel módulo: es estable entre renders. */
const obtenerCred = () => credencialConPrompt('del Monitor')

type Media = { tipo: 'img' | 'video'; url: string; nombre?: string }

/** La mutación pura que persiste el hook. En `null` cuando la persona solo puede mirar. */
type Guardar = (mutar: (l: Ingreso[]) => Ingreso[]) => void

export function Ingresos() {
  const { marca, perfil } = useSesion()
  /**
   * Dos niveles de escritura, no uno.
   *
   * Hasta acá la sección era admin duro y hardcodeado en el hook, así que "cargar el nombre
   * comercial de un diseño" —una anotación— pedía el mismo poder que borrar una importación
   * entera. Por eso el pedido del equipo era "incorporar la posibilidad de cargar los nombres":
   * el campo existía desde siempre, lo que no existía era alguien no-admin que pudiera escribirlo.
   *
   * `nombre` NO abre la vista Editar: escribe el nombre ahí mismo, en el Lector. Así el permiso
   * chico no es "el Editar con todo deshabilitado" —que hay que acordarse de deshabilitar campo
   * por campo, y el día que se agregue uno nuevo queda abierto— sino una superficie que solo
   * tiene ese input.
   */
  const admin = esAdminDe(perfil)
  const puedeTodo = admin || puedeSub(perfil, marca, 'ingresos', 'editar')
  const puedeNombre = puedeTodo || puedeSub(perfil, marca, 'ingresos', 'nombre')
  const st = useIngresos(marca, puedeNombre, obtenerCred)
  const { data, guardar } = st

  const [vista, setVistaState] = useState<VistaIngresos>('lector')
  const [media, setMedia] = useState<Media | null>(null)
  const [pasteTarget, setPasteTarget] = useState<{ gid: string; bid: string; did: string } | null>(null)

  // Vista inicial de localStorage (en effect, no en render: evita el mismatch de SSR).
  // En un IIFE async para no llamar setState síncrono en el body del effect (regla del CI).
  useEffect(() => {
    ;(async () => {
      let v: string | null = null
      try {
        v = localStorage.getItem(VISTA_KEY)
      } catch {}
      const val = (['lector', 'resumen', 'editar'] as const).includes(v as VistaIngresos) ? (v as VistaIngresos) : 'lector'
      setVistaState(val === 'editar' && !puedeTodo ? 'lector' : val)
    })()
  }, [puedeTodo])

  const setVista = (v: VistaIngresos) => {
    if (v === 'editar' && !puedeTodo) return
    setVistaState(v)
    try {
      localStorage.setItem(VISTA_KEY, v)
    } catch {}
  }
  const vistaEfectiva: VistaIngresos = vista === 'editar' && !puedeTodo ? 'lector' : vista

  // Pegar imagen (Ctrl/Cmd+V) en la celda de diseño seleccionada. Port de ingPaste.
  useEffect(() => {
    if (vistaEfectiva !== 'editar' || !pasteTarget || !puedeTodo) return
    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData
      if (!dt) return
      let file: File | null = null
      for (const it of dt.items || []) {
        if (it.kind === 'file') {
          const f = it.getAsFile()
          if (f && /^image\//.test(f.type)) {
            file = f
            break
          }
        }
      }
      if (!file && dt.files) for (const f of dt.files) if (/^image\//.test(f.type)) { file = f; break }
      if (file) {
        e.preventDefault()
        const { gid, bid, did } = pasteTarget
        subirFotoIngreso(file, (url) => guardar((l) => setDisenoImg(l, gid, bid, did, url)), 480)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [vistaEfectiva, pasteTarget, puedeTodo, guardar])

  const agregarIng = () => puedeTodo && guardar((l) => agregarIngreso(l, nuevoIngreso(nuevoId)))

  if (!data) {
    return (
      <Card>
        <Header estado={st.estadoGuardado} admin={puedeTodo} vistaEditar={false} onRefrescar={st.recargar} onAgregar={agregarIng} />
        <div style={{ fontSize: 13, color: st.error ? paleta.danger : paleta.mut2, marginTop: 12 }}>
          {st.error ? `No se pudieron leer los ingresos: ${st.error}` : 'Cargando ingresos…'}
        </div>
      </Card>
    )
  }

  const ordenados = ordenarPorFecha(data)
  const res = resumen(data)

  // Agrupar por mes de llegada (encabezados), respetando el orden.
  const grupos: { mes: string; items: Ingreso[] }[] = []
  ordenados.forEach((g) => {
    const mes = mesDe(g)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.mes === mes) ultimo.items.push(g)
    else grupos.push({ mes, items: [g] })
  })

  return (
    <Card>
      <Header
        estado={st.estadoGuardado}
        admin={puedeTodo}
        vistaEditar={vistaEfectiva === 'editar'}
        onRefrescar={st.recargar}
        onAgregar={agregarIng}
      />

      {(data.length > 0 || puedeTodo) && (
        <div style={{ margin: '12px 0 0' }}>
          <VistaSel vista={vistaEfectiva} admin={puedeTodo} onVista={setVista} />
        </div>
      )}

      <div style={{ fontSize: 13, color: paleta.ink2, margin: '12px 0' }}>
        {data.length
          ? <>📦 <b>{res.enCamino}</b> en camino · <b>{res.unidades.toLocaleString('es-AR')}</b> unidades</>
          : 'Todavía no cargaste ingresos. Tocá "+ Agregar ingreso" para empezar. 📦'}
      </div>

      {/* La bajada del nombre comercial. Va acá, siempre visible y no adentro del ⓘ, porque las
          siete columnas de la última importación están vacías: nadie sabía para qué era el campo.
          Quien puede escribirlo necesita saber qué está proponiendo; quien no, entender qué lee. */}
      {data.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: paleta.mut, margin: '0 0 12px' }}>
          <span>
            El <b>nombre comercial</b> es el que va a tener el producto cuando se cargue en Gestión Nube.
            {puedeNombre ? ' Escribirlo acá es proponerlo.' : ''}
          </span>
          <InfoPopover titulo="El nombre comercial">
            Es el nombre con el que el producto va a existir: el que se carga en Gestión Nube y el que
            después ve el cliente en la tienda.
            <br />
            <br />
            Mientras el producto <b>todavía no existe en Gestión Nube</b>, lo que se escribe acá es una{' '}
            <b>propuesta</b>. Sirve para que quien lo dé de alta cuando llegue la mercadería no tenga que
            inventarlo ni salir a buscarlo en un chat.
            <br />
            <br />
            Cuando el producto <b>ya existe en Gestión Nube</b>, manda el nombre de allá. Cambiarlo en esta
            pantalla <b>no</b> lo cambia en Gestión Nube ni en la tienda.
          </InfoPopover>
        </div>
      )}

      <div>
        {grupos.map((grp, i) => (
          <div key={i}>
            <div style={{ fontSize: 12, fontWeight: 700, color: paleta.mut2, letterSpacing: 0, margin: '14px 0 6px' }}>
              🗓️ {grp.mes}
            </div>
            {grp.items.map((g) =>
              vistaEfectiva === 'editar' ? (
                <IngresoEditar key={g.id} g={g} guardar={guardar} onMedia={setMedia} pasteTarget={pasteTarget} onPasteSel={setPasteTarget} />
              ) : vistaEfectiva === 'resumen' ? (
                <IngresoResumen key={g.id} g={g} onMedia={setMedia} />
              ) : (
                <IngresoLector key={g.id} g={g} onMedia={setMedia} guardar={puedeNombre ? guardar : null} />
              ),
            )}
          </div>
        ))}
      </div>

      <datalist id="ing-modelos">
        {MODELOS_AUTOCOMPLETE.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {media && <MediaModal media={media} onClose={() => setMedia(null)} />}
    </Card>
  )
}

// ── Encabezado ────────────────────────────────────────────────────────────────
function Header({
  estado,
  admin,
  vistaEditar,
  onRefrescar,
  onAgregar,
}: {
  estado: '' | 'guardando' | 'ok' | 'error'
  admin: boolean
  vistaEditar: boolean
  onRefrescar: () => void
  onAgregar: () => void
}) {
  const txt = estado === 'guardando' ? 'Guardando…' : estado === 'ok' ? '✓ Guardado (lo ven todos)' : estado === 'error' ? 'Error al guardar.' : ''
  const color = estado === 'ok' ? paleta.success : estado === 'error' ? paleta.danger : paleta.mut
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color }}>{txt}</span>
        <button onClick={onRefrescar} title="Actualizar" style={{ background: '#fff', border: `1px solid ${paleta.line2}`, borderRadius: 6, padding: '5px 9px', cursor: 'pointer' }}>
          🔄
        </button>
        {admin && vistaEditar && (
          <button onClick={onAgregar} style={{ background: paleta.brandSolid, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 11px', cursor: 'pointer', fontWeight: 600 }}>
            + Agregar ingreso
          </button>
        )}
      </div>
    </div>
  )
}

function VistaSel({ vista, admin, onVista }: { vista: VistaIngresos; admin: boolean; onVista: (v: VistaIngresos) => void }) {
  const btn = (k: VistaIngresos, lbl: string) => {
    const on = vista === k
    return (
      <button
        onClick={() => onVista(k)}
        style={{
          border: `1px solid ${on ? paleta.brandSolid : paleta.line2}`,
          background: on ? paleta.brandSolid : '#fff',
          color: on ? '#fff' : paleta.ink2,
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {lbl}
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {btn('lector', '👁 Lector')}
      {btn('resumen', '📋 Resumen')}
      {admin && btn('editar', '✏️ Editar')}
    </div>
  )
}

// ── Galería (fotos subidas + links de video) ────────────────────────────────────
function thumbBg(it: GalleryItem): React.CSSProperties {
  if (it.tipo === 'video') {
    const yt = ytId(it.url)
    return yt
      ? { backgroundImage: `url('https://img.youtube.com/vi/${yt}/mqdefault.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: paleta.ink }
  }
  return {}
}

function Galeria({ g, editable, guardar, onMedia }: { g: Ingreso; editable: boolean; guardar: (m: (l: Ingreso[]) => Ingreso[]) => void; onMedia: (m: Media) => void }) {
  const { pedirTexto } = useConfirmar()
  const items = g.gallery || []
  if (!items.length && !editable) return null

  const onFotos = (files: FileList | null) => {
    const fs = Array.from(files || [])
    fs.forEach((f) =>
      subirFotoIngreso(f, (url) => guardar((l) => agregarGaleria(l, g.id, { id: nuevoId(), tipo: 'img', url, nombre: f.name || '' })), 520),
    )
  }
  const onLink = async () => {
    const url = (await pedirTexto('Pegá el link de la foto o video (YouTube, Google Drive, etc.)', '', { titulo: 'Agregar por link', ok: 'Siguiente' }))?.trim()
    if (!url) return
    const nombre = (await pedirTexto('Nombre o descripción (opcional)', '', { titulo: 'Agregar por link', ok: 'Agregar' }))?.trim() || ''
    guardar((l) => agregarGaleria(l, g.id, { id: nuevoId(), tipo: esVideoUrl(url) ? 'video' : 'img', url, nombre }))
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, color: paleta.mut2, letterSpacing: 0, marginBottom: 6 }}>📸 Galería del pedido</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {items.map((it) => (
          <div key={it.id} style={{ position: 'relative' }}>
            <div onClick={() => onMedia({ tipo: it.tipo, url: it.url, nombre: it.nombre })} style={{ cursor: 'pointer' }} title="Ver">
              {it.tipo === 'video' ? (
                <div style={{ width: 84, height: 84, borderRadius: 8, ...thumbBg(it), display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${paleta.line}` }}>
                  <span style={{ fontSize: 26, color: '#fff', textShadow: '0 1px 5px rgba(0,0,0,.7)' }}>▶</span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt={it.nombre} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: `1px solid ${paleta.line}` }} />
              )}
            </div>
            {it.nombre ? (
              <div style={{ fontSize: 10, color: paleta.mut, textAlign: 'center', maxWidth: 84, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nombre}</div>
            ) : null}
            {editable && (
              <button
                onClick={() => guardar((l) => quitarGaleria(l, g.id, it.id))}
                title="Quitar"
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.25)', cursor: 'pointer', fontSize: 12, color: paleta.danger, lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {editable && (
          <>
            <label style={{ width: 84, height: 84, border: `1px dashed ${paleta.mut2}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: paleta.mut2, fontSize: 11, textAlign: 'center', background: paleta.bg }}>
              + foto
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { onFotos(e.target.files); e.currentTarget.value = '' }} />
            </label>
            <button onClick={onLink} style={{ width: 84, height: 84, border: `1px dashed ${paleta.mut2}`, borderRadius: 8, cursor: 'pointer', color: paleta.mut2, fontSize: 11, background: paleta.bg, lineHeight: 1.3 }}>
              + link
              <br />
              (video)
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Bloque editable (grilla) ────────────────────────────────────────────────────
function celdaKeyNav(e: React.KeyboardEvent<HTMLInputElement>) {
  const el = e.currentTarget
  if (e.key === 'Tab') {
    const all = Array.from(document.querySelectorAll<HTMLInputElement>('.ing-celda'))
    const i = all.indexOf(el)
    if (i < 0) return
    const next = all[i + (e.shiftKey ? -1 : 1)]
    if (next) {
      e.preventDefault()
      next.focus()
      next.select?.()
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const col = Array.from(document.querySelectorAll<HTMLInputElement>(`.ing-celda[data-b="${el.dataset.b}"][data-d="${el.dataset.d}"]`))
    const i = col.indexOf(el)
    if (i < 0) return
    const next = col[i + (e.shiftKey ? -1 : 1)]
    if (next) {
      next.focus()
      next.select?.()
    }
  }
}

function BloqueEditar({
  g,
  b,
  guardar,
  onPasteSel,
  pasteTarget,
}: {
  g: Ingreso
  b: Bloque
  guardar: (m: (l: Ingreso[]) => Ingreso[]) => void
  onPasteSel: (t: { gid: string; bid: string; did: string }) => void
  pasteTarget: { gid: string; bid: string; did: string } | null
}) {
  const { avisar, confirmar, pedirTexto } = useConfirmar()
  const disenos = b.disenos || []
  const modelos = b.modelos || []
  const grand = bloqueU(b)

  const onImg = (did: string, files: FileList | null) => {
    const f = files?.[0]
    if (f) subirFotoIngreso(f, (url) => guardar((l) => setDisenoImg(l, g.id, b.id, did, url)), 480)
  }
  const onDrop = (e: React.DragEvent, did: string) => {
    e.preventDefault()
    const f = Array.from(e.dataTransfer?.files || []).find((x) => /^image\//.test(x.type))
    if (f) subirFotoIngreso(f, (url) => guardar((l) => setDisenoImg(l, g.id, b.id, did, url)), 480)
  }
  const igualarFila = async (mid: string) => {
    const next = filaIgualar([g], g.id, b.id, mid) // opera sobre este ingreso; si null, no había cantidad
    if (!next) {
      await avisar('Cargá una cantidad en algún diseño de esa fila y después tocá ⎘ para copiarla al resto.')
      return
    }
    guardar((l) => filaIgualar(l, g.id, b.id, mid) ?? l)
  }
  const igualarBloque = async () => {
    if (!modelos.length || !disenos.length) {
      await avisar('Agregá modelos y diseños primero.')
      return
    }
    const raw = await pedirTexto('Misma cantidad para TODO el bloque: todos los modelos y todos los diseños.', '', {
      titulo: 'Igualar el bloque',
      ok: 'Aplicar a todo',
      placeholder: 'ej. 12',
    })
    if (raw === null) return
    const n = Math.max(0, parseInt(raw) || 0)
    guardar((l) => bloqueIgualar(l, g.id, b.id, n))
  }

  return (
    <div style={{ border: `1px solid ${paleta.line}`, borderRadius: 10, padding: '8px 10px', marginTop: 10, background: paleta.bg }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: paleta.mut2, letterSpacing: 0 }}>Bloque</span>
        <input
          value={b.nombre}
          onChange={(e) => guardar((l) => setBloqueNombre(l, g.id, b.id, e.target.value))}
          placeholder="Nombre del bloque (ej. IMD, Formas…)"
          style={{ flex: 1, minWidth: 150, fontSize: 13, fontWeight: 600, border: 'none', borderBottom: `1px solid ${paleta.line}`, padding: '3px 0' }}
        />
        <span style={{ fontSize: 12, color: paleta.ink2 }}>Subtotal: <b>{grand.toLocaleString('es-AR')}</b> u.</span>
        <button onClick={() => void (async () => { if (await confirmar({ titulo: 'Quitar el bloque', tono: 'danger', ok: 'Quitar', mensaje: 'Se borra el bloque con todas sus cantidades e imágenes.' })) guardar((l) => quitarBloque(l, g.id, b.id)) })()} title="Quitar bloque" style={{ border: `1px solid ${paleta.line}`, background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '3px 7px' }}>
          🗑 bloque
        </button>
      </div>

      {!modelos.length && !disenos.length ? (
        <div style={{ fontSize: 12, color: paleta.mut2, margin: '8px 0' }}>Agregá modelos (filas) y diseños (columnas). 👇</div>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 6 }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: paleta.bg, zIndex: 2, textAlign: 'left', fontSize: 11, color: paleta.mut2, padding: 4, verticalAlign: 'bottom' }}>Modelo \ Diseño</th>
                {disenos.map((d) => {
                  const sel = pasteTarget?.gid === g.id && pasteTarget?.bid === b.id && pasteTarget?.did === d.id
                  return (
                    <th key={d.id} style={{ padding: '6px 4px', minWidth: 96, verticalAlign: 'bottom' }}>
                      <div
                        onClick={() => onPasteSel({ gid: g.id, bid: b.id, did: d.id })}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => onDrop(e, d.id)}
                        tabIndex={0}
                        title="Tocá el recuadro y pegá con Ctrl/Cmd+V, arrastrá una imagen, o usá subir"
                        style={{ cursor: 'pointer', outline: sel ? `2px solid ${paleta.brandSolid}` : 'none', borderRadius: 8 }}
                      >
                        {d.img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.img} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: `1px solid ${paleta.line}`, display: 'block', margin: '0 auto 4px', pointerEvents: 'none' }} />
                        ) : (
                          <div style={{ width: 64, height: 64, borderRadius: 8, border: `1px dashed ${paleta.mut2}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: paleta.mut2, fontSize: 9, textAlign: 'center', margin: '0 auto 4px', background: paleta.bg, lineHeight: 1.2, pointerEvents: 'none' }}>
                            📷<span>pegá o<br />subí</span>
                          </div>
                        )}
                      </div>
                      <input
                        value={d.nombre}
                        onChange={(e) => guardar((l) => setDisenoNombre(l, g.id, b.id, d.id, e.target.value))}
                        placeholder="Diseño"
                        style={{ width: 88, fontSize: 12, fontWeight: 600, textAlign: 'center', border: 'none', borderBottom: `1px solid ${paleta.bg2}`, padding: 2 }}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 2 }}>
                        <label style={{ cursor: 'pointer', color: paleta.brandSolid, fontSize: 10 }} title="Subir desde archivo">
                          📷 subir
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { onImg(d.id, e.target.files); e.currentTarget.value = '' }} />
                        </label>
                        <button onClick={() => void (async () => { if (await confirmar({ titulo: 'Quitar el diseño', tono: 'danger', ok: 'Quitar', mensaje: 'Se borra la columna y las cantidades cargadas en ella.' })) guardar((l) => quitarDiseno(l, g.id, b.id, d.id)) })()} title="Quitar diseño" style={{ border: 'none', background: 'none', color: paleta.mut2, cursor: 'pointer', fontSize: 11 }}>
                          ✕
                        </button>
                      </div>
                    </th>
                  )
                })}
                <th style={{ fontSize: 11, color: paleta.mut2, padding: 4, verticalAlign: 'bottom' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {modelos.map((m) => {
                const rowTot = totalModelo(b, m.id)
                return (
                  <tr key={m.id}>
                    <th style={{ textAlign: 'left', padding: '2px 4px', position: 'sticky', left: 0, background: paleta.bg, zIndex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <input
                          list="ing-modelos"
                          value={m.model}
                          onChange={(e) => guardar((l) => setModelo(l, g.id, b.id, m.id, e.target.value))}
                          placeholder="Modelo"
                          style={{ width: 128, fontSize: 13, border: `1px solid ${paleta.line}`, borderRadius: 6, padding: '4px 6px' }}
                        />
                        <button onClick={() => igualarFila(m.id)} title="Copiar la 1ª cantidad cargada a todos los diseños de esta fila" style={{ border: 'none', background: 'none', color: paleta.mut2, cursor: 'pointer', fontSize: 13 }}>
                          ⎘
                        </button>
                        <button onClick={() => void (async () => { if (await confirmar({ titulo: 'Quitar el modelo', tono: 'danger', ok: 'Quitar', mensaje: 'Se borra la fila y las cantidades cargadas en ella.' })) guardar((l) => quitarModelo(l, g.id, b.id, m.id)) })()} title="Quitar modelo" style={{ border: 'none', background: 'none', color: paleta.mut2, cursor: 'pointer', fontSize: 15 }}>
                          ×
                        </button>
                      </div>
                    </th>
                    {disenos.map((d) => (
                      <td key={d.id} style={{ padding: 2, textAlign: 'center' }}>
                        <input
                          type="number"
                          min={0}
                          defaultValue={celdaGet(b, m.id, d.id) || ''}
                          className="ing-celda"
                          data-b={b.id}
                          data-m={m.id}
                          data-d={d.id}
                          onKeyDown={celdaKeyNav}
                          onChange={(e) => guardar((l) => setCelda(l, g.id, b.id, m.id, d.id, e.target.value))}
                          style={{ width: 64, textAlign: 'center', border: `1px solid ${paleta.line}`, borderRadius: 6, padding: 4, fontSize: 13 }}
                        />
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: paleta.ink2, padding: '2px 8px', background: paleta.bg }}>{rowTot ? rowTot.toLocaleString('es-AR') : '—'}</td>
                  </tr>
                )
              })}
              <tr>
                <th style={{ textAlign: 'right', fontSize: 12, color: paleta.mut, padding: '5px 8px 5px 4px', position: 'sticky', left: 0, background: paleta.bg, zIndex: 1 }}>Total</th>
                {disenos.map((d) => {
                  const t = totalDiseno(b, d.id)
                  return (
                    <td key={d.id} style={{ textAlign: 'center', fontWeight: 600, fontSize: 12, color: paleta.mut, padding: '5px 2px', background: paleta.bg }}>{t ? t.toLocaleString('es-AR') : '—'}</td>
                  )
                })}
                <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, color: paleta.ink, padding: '5px 8px', background: paleta.bg2 }}>{grand ? grand.toLocaleString('es-AR') : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <button onClick={() => guardar((l) => agregarModelo(l, g.id, b.id, nuevoId()))} style={linkBtn}>+ Agregar modelo</button>
        <button onClick={() => guardar((l) => agregarDiseno(l, g.id, b.id, nuevoId()))} style={linkBtn}>+ Agregar diseño</button>
        <button onClick={() => guardar((l) => cargarBase(l, g.id, b.id, nuevoId))} title="Trae los modelos base que falten (iPhone 13 → 17 Pro Max)" style={{ ...linkBtn, color: paleta.mut }}>↺ Cargar modelos base</button>
        <button onClick={igualarBloque} title="Misma cantidad en todo este bloque" style={{ ...linkBtn, color: paleta.mut }}>= Misma cantidad (bloque)</button>
      </div>
    </div>
  )
}

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: paleta.brandSolid, cursor: 'pointer', fontSize: 12, padding: 0 }

// ── Bloque de solo lectura (salvo el nombre comercial) ──────────────────────────
/**
 * `guardar` llega en `null` para quien solo mira. Cuando llega una función, el único campo que
 * se vuelve editable es el nombre comercial del diseño: es la superficie del permiso
 * `ingresos.nombre`, y por eso es un componente de lectura con UN input y no el editor con todo
 * lo demás deshabilitado — así el día que el editor sume un campo, este permiso no lo hereda.
 */
function BloqueLector({ b, g, onMedia, guardar }: { b: Bloque; g: Ingreso; onMedia: (m: Media) => void; guardar: Guardar | null }) {
  const disenos = b.disenos || []
  const modelos = b.modelos || []
  const grand = bloqueU(b)
  return (
    <div style={{ border: `1px solid ${paleta.line}`, borderRadius: 10, padding: '8px 10px', marginTop: 10, background: paleta.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: paleta.ink2 }}>{b.nombre || 'Bloque'}</div>
        <span style={{ fontSize: 12, color: paleta.ink2 }}>Subtotal: <b>{grand.toLocaleString('es-AR')}</b> u.</span>
      </div>
      {(modelos.length || disenos.length) && (
        <div style={{ overflowX: 'auto', marginTop: 6 }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: paleta.bg, textAlign: 'left', fontSize: 11, color: paleta.mut2, padding: 4, verticalAlign: 'bottom' }}>Modelo \ Diseño</th>
                {disenos.map((d) => (
                  <th key={d.id} style={{ padding: '6px 6px', minWidth: 128, verticalAlign: 'bottom', fontWeight: 600, fontSize: 12, color: paleta.ink2 }}>
                    {d.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.img} onClick={() => onMedia({ tipo: 'img', url: d.img, nombre: d.nombre })} title="Ampliar" alt={d.nombre} style={{ width: 120, height: 68, objectFit: 'contain', background: paleta.bg, borderRadius: 10, border: `1px solid ${paleta.line}`, display: 'block', margin: '0 auto 5px', cursor: 'zoom-in' }} />
                    ) : (
                      <div style={{ width: 120, height: 68, borderRadius: 10, border: `1px dashed ${paleta.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: paleta.mut2, margin: '0 auto 5px', background: paleta.bg }}>—</div>
                    )}
                    {guardar ? (
                      <input
                        value={d.nombre}
                        onChange={(e) => guardar((l) => setDisenoNombre(l, g.id, b.id, d.id, e.target.value))}
                        placeholder="Nombre comercial"
                        title="El nombre con el que se va a cargar el producto en Gestión Nube"
                        style={{ width: 120, fontSize: 12, fontWeight: 600, textAlign: 'center', border: `1px solid ${paleta.line2}`, borderRadius: 6, padding: '3px 4px', background: '#fff', color: paleta.ink2 }}
                      />
                    ) : (
                      d.nombre || '—'
                    )}
                  </th>
                ))}
                <th style={{ fontSize: 11, color: paleta.mut2, padding: 4, verticalAlign: 'bottom' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {modelos.map((m) => {
                const rowTot = totalModelo(b, m.id)
                return (
                  <tr key={m.id}>
                    <th style={{ textAlign: 'left', fontSize: 13, fontWeight: 600, padding: '3px 8px 3px 4px', borderTop: `1px solid ${paleta.bg2}`, position: 'sticky', left: 0, background: paleta.bg }}>{m.model || '—'}</th>
                    {disenos.map((d) => {
                      const v = celdaGet(b, m.id, d.id)
                      return (
                        <td key={d.id} style={{ textAlign: 'center', fontSize: 13, padding: '3px 6px', borderTop: `1px solid ${paleta.bg2}` }}>{v ? v.toLocaleString('es-AR') : '·'}</td>
                      )
                    })}
                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, padding: '3px 8px', borderTop: `1px solid ${paleta.bg2}`, background: paleta.bg }}>{rowTot ? rowTot.toLocaleString('es-AR') : '—'}</td>
                  </tr>
                )
              })}
              <tr>
                <th style={{ textAlign: 'right', fontSize: 12, color: paleta.mut, padding: '5px 8px', position: 'sticky', left: 0, background: paleta.bg }}>Total</th>
                {disenos.map((d) => {
                  const t = totalDiseno(b, d.id)
                  return (
                    <td key={d.id} style={{ textAlign: 'center', fontWeight: 600, fontSize: 12, color: paleta.mut, padding: '4px 6px', background: paleta.bg }}>{t ? t.toLocaleString('es-AR') : '—'}</td>
                  )
                })}
                <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, color: paleta.ink, padding: '5px 8px', background: paleta.bg2 }}>{grand ? grand.toLocaleString('es-AR') : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Bloque resumen (solo diseño + cantidad total, ordenado por cantidad) ────────
function BloqueResumen({ b, onMedia }: { b: Bloque; onMedia: (m: Media) => void }) {
  const conTot = (b.disenos || []).map((d) => ({ d, t: totalDiseno(b, d.id) })).sort((a, c) => c.t - a.t)
  return (
    <div style={{ border: `1px solid ${paleta.line}`, borderRadius: 10, padding: '10px 12px', marginTop: 10, background: paleta.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: paleta.ink2 }}>{b.nombre || 'Bloque'}</div>
        <span style={{ fontSize: 12, color: paleta.ink2 }}>Total bloque: <b>{bloqueU(b).toLocaleString('es-AR')}</b> u.</span>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {conTot.length ? (
          conTot.map(({ d, t }) => (
            <div key={d.id} style={{ width: 200, textAlign: 'center' }}>
              {d.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.img} onClick={() => onMedia({ tipo: 'img', url: d.img, nombre: d.nombre })} title="Ampliar" alt={d.nombre} style={{ width: 200, height: 112, objectFit: 'contain', background: paleta.bg, borderRadius: 12, border: `1px solid ${paleta.line}`, display: 'block', cursor: 'zoom-in' }} />
              ) : (
                <div style={{ width: 200, height: 112, borderRadius: 12, border: `1px dashed ${paleta.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: paleta.mut2, fontSize: 11, background: paleta.bg }}>sin foto</div>
              )}
              <div style={{ fontSize: 12, fontWeight: 600, color: paleta.ink2, marginTop: 5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nombre || '—'}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: paleta.ink }}>
                {t.toLocaleString('es-AR')} <span style={{ fontSize: 11, fontWeight: 500, color: paleta.mut2 }}>u.</span>
              </div>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: paleta.mut2 }}>Sin diseños.</div>
        )}
      </div>
    </div>
  )
}

// ── Tarjetas de importación ─────────────────────────────────────────────────────
function EstadoBadge({ g }: { g: Ingreso }) {
  const e = estadoDe(g.estado)
  return <span style={{ fontSize: 12, color: e.color, background: e.bg, border: `1px solid ${e.color}`, borderRadius: 7, padding: '3px 9px', fontWeight: 600 }}>{e.lbl}</span>
}
function metaDe(g: Ingreso): string {
  return [g.proveedor && 'Proveedor: ' + g.proveedor, g.fecha && 'Llega: ' + g.fecha].filter(Boolean).join('  ·  ')
}

function IngresoEditar({
  g,
  guardar,
  onMedia,
  pasteTarget,
  onPasteSel,
}: {
  g: Ingreso
  guardar: (m: (l: Ingreso[]) => Ingreso[]) => void
  onMedia: (m: Media) => void
  pasteTarget: { gid: string; bid: string; did: string } | null
  onPasteSel: (t: { gid: string; bid: string; did: string }) => void
}) {
  const { confirmar, pedirTexto } = useConfirmar()
  const e = estadoDe(g.estado)
  const bloques = g.bloques || []
  const addBloque = async () => {
    const nombre = await pedirTexto('Nombre del bloque', '', { titulo: 'Nuevo bloque', ok: 'Siguiente', placeholder: 'ej. IMD, Formas, Silicona…' })
    if (nombre === null) return
    const cuantos = await pedirTexto('¿Cuántos diseños tiene este bloque?', '10', { titulo: 'Nuevo bloque', ok: 'Crear bloque' })
    if (cuantos === null) return
    let n = parseInt(cuantos, 10)
    if (!Number.isFinite(n) || n < 0) n = 0
    if (n > 60) n = 60
    guardar((l) => agregarBloque(l, g.id, nuevoBloque(nuevoId, nombre.trim(), n)))
  }
  return (
    <div style={{ border: `1px solid ${paleta.line}`, borderLeft: `4px solid ${e.color}`, borderRadius: 10, padding: '10px 12px', marginBottom: 9, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={g.desc} onChange={(ev) => guardar((l) => setCampo(l, g.id, 'desc', ev.target.value))} placeholder="Descripción (ej. Pedido fundas China #1)" style={{ flex: 2, minWidth: 200, fontSize: 14, fontWeight: 600, border: 'none', borderBottom: `1px solid ${paleta.bg2}`, padding: '4px 0' }} />
        <select value={g.estado} onChange={(ev) => guardar((l) => setCampo(l, g.id, 'estado', ev.target.value))} style={{ fontSize: 12, padding: '6px 8px', border: `1px solid ${e.color}`, color: e.color, borderRadius: 7, background: e.bg, fontWeight: 600, cursor: 'pointer' }}>
          {ESTADOS.map((s) => (
            <option key={s.k} value={s.k}>{s.lbl}</option>
          ))}
        </select>
        <button onClick={() => void (async () => { if (await confirmar({ titulo: 'Eliminar el ingreso', tono: 'danger', ok: 'Eliminar', mensaje: `Se borra "${g.desc || 'este ingreso'}" con todos sus bloques, cantidades e imágenes.` })) guardar((l) => quitarIngreso(l, g.id)) })()} title="Eliminar ingreso" style={{ padding: '5px 9px', border: `1px solid ${paleta.line}`, background: '#fff', borderRadius: 6, cursor: 'pointer' }}>
          🗑
        </button>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 9 }}>
        <label style={{ fontSize: 11, color: paleta.mut2 }}>
          Proveedor
          <br />
          <input value={g.proveedor} onChange={(ev) => guardar((l) => setCampo(l, g.id, 'proveedor', ev.target.value))} style={{ padding: '5px 7px', border: `1px solid ${paleta.line2}`, borderRadius: 6, width: 160 }} />
        </label>
        <label style={{ fontSize: 11, color: paleta.mut2 }}>
          Llegada estimada
          <br />
          <input type="date" value={g.fecha || ''} onChange={(ev) => guardar((l) => setCampo(l, g.id, 'fecha', ev.target.value))} style={{ padding: '5px 7px', border: `1px solid ${paleta.line2}`, borderRadius: 6 }} />
        </label>
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: paleta.mut2, letterSpacing: 0, marginBottom: 4 }}>Bloques (por material) · modelos × diseños</div>
        {bloques.length ? null : <div style={{ fontSize: 12, color: paleta.mut2, margin: '8px 0' }}>Esta importación todavía no tiene bloques. Agregá uno (ej. IMD, Formas…). 👇</div>}
        {bloques.map((b) => (
          <BloqueEditar key={b.id} g={g} b={b} guardar={guardar} onPasteSel={onPasteSel} pasteTarget={pasteTarget} />
        ))}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={addBloque} style={{ background: paleta.brandBg, border: `1px solid ${paleta.brandBorder}`, color: paleta.brand, cursor: 'pointer', fontSize: 12, padding: '5px 10px', borderRadius: 7 }}>+ Agregar bloque</button>
          <span style={{ fontSize: 13, color: paleta.ink, marginLeft: 'auto' }}>Total importación: <b>{totalU(g).toLocaleString('es-AR')}</b> u.</span>
        </div>
      </div>
      <Galeria g={g} editable guardar={guardar} onMedia={onMedia} />
      <input value={g.nota} onChange={(ev) => guardar((l) => setCampo(l, g.id, 'nota', ev.target.value))} placeholder="Nota general del pedido…" style={{ width: '100%', marginTop: 10, fontSize: 12, border: `1px solid ${paleta.line}`, borderRadius: 6, padding: '6px 8px', boxSizing: 'border-box' }} />
    </div>
  )
}

function IngresoLector({ g, onMedia, guardar }: { g: Ingreso; onMedia: (m: Media) => void; guardar: Guardar | null }) {
  const e = estadoDe(g.estado)
  const meta = metaDe(g)
  const bloques = g.bloques || []
  const noop = () => {}
  return (
    <div style={{ border: `1px solid ${paleta.line}`, borderLeft: `4px solid ${e.color}`, borderRadius: 10, padding: '10px 12px', marginBottom: 9, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{g.desc || '(sin descripción)'}</div>
        <EstadoBadge g={g} />
      </div>
      {meta ? <div style={{ fontSize: 12, color: paleta.mut, marginTop: 5 }}>{meta}</div> : null}
      {bloques.map((b) => (
        <BloqueLector key={b.id} b={b} g={g} onMedia={onMedia} guardar={guardar} />
      ))}
      {bloques.length > 1 ? <div style={{ textAlign: 'right', fontSize: 13, color: paleta.ink, marginTop: 8 }}>Total importación: <b>{totalU(g).toLocaleString('es-AR')}</b> u.</div> : null}
      <Galeria g={g} editable={false} guardar={noop} onMedia={onMedia} />
      {g.nota ? <div style={{ fontSize: 12, color: paleta.ink2, marginTop: 6 }}>📝 {g.nota}</div> : null}
    </div>
  )
}

function IngresoResumen({ g, onMedia }: { g: Ingreso; onMedia: (m: Media) => void }) {
  const e = estadoDe(g.estado)
  const meta = metaDe(g)
  return (
    <div style={{ border: `1px solid ${paleta.line}`, borderLeft: `4px solid ${e.color}`, borderRadius: 10, padding: '10px 12px', marginBottom: 9, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{g.desc || '(sin descripción)'}</div>
        <EstadoBadge g={g} />
      </div>
      {meta ? <div style={{ fontSize: 12, color: paleta.mut, marginTop: 5 }}>{meta}</div> : null}
      {(g.bloques || []).map((b) => (
        <BloqueResumen key={b.id} b={b} onMedia={onMedia} />
      ))}
      <div style={{ textAlign: 'right', fontSize: 13, color: paleta.ink, marginTop: 8 }}>Total importación: <b>{totalU(g).toLocaleString('es-AR')}</b> u.</div>
    </div>
  )
}

// ── Modal de medios (foto o video) ──────────────────────────────────────────────
function MediaModal({ media, onClose }: { media: Media; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const stop = (e: React.MouseEvent) => e.stopPropagation()
  let inner: React.ReactNode
  if (media.tipo === 'video') {
    const yt = ytId(media.url)
    const dr = driveId(media.url)
    if (yt) {
      inner = <iframe width="100%" height="480" src={`https://www.youtube.com/embed/${yt}`} allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowFullScreen style={{ borderRadius: 10, display: 'block', border: 'none' }} />
    } else if (dr) {
      inner = <iframe width="100%" height="480" src={`https://drive.google.com/file/d/${dr}/preview`} allow="autoplay" allowFullScreen style={{ borderRadius: 10, display: 'block', border: 'none' }} />
    } else if (/\.mp4(\?|$)/i.test(media.url)) {
      inner = <video src={media.url} controls autoPlay onClick={stop} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 10, display: 'block', margin: 'auto' }} />
    } else {
      // Sin preview embebible: abrir en pestaña nueva y cerrar.
      if (typeof window !== 'undefined') window.open(media.url, '_blank')
      onClose()
      return null
    }
  } else {
    // eslint-disable-next-line @next/next/no-img-element
    inner = <img src={media.url} alt={media.nombre || ''} onClick={stop} style={{ maxWidth: '100%', maxHeight: '86vh', borderRadius: 10, display: 'block', margin: 'auto' }} />
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 28 }}>
      <div style={{ maxWidth: 1000, width: '100%', position: 'relative', textAlign: 'center' }}>
        <button onClick={onClose} title="Cerrar" style={{ position: 'absolute', top: -16, right: -16, width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 18, boxShadow: '0 2px 10px rgba(0,0,0,.4)', zIndex: 1 }}>
          ×
        </button>
        {inner}
        {media.nombre ? <div style={{ color: '#fff', marginTop: 10, fontSize: 14 }}>{media.nombre}</div> : null}
      </div>
    </div>
  )
}
