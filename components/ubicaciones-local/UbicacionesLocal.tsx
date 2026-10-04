'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, EmptyState, Input, Notice, SectionCard, Tabs, color, font, space, useConfirmar, useToast } from '@/components/ui'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { bajarExhib, type CrudosExhib } from '@/lib/exhib/datos'
import { armarProdMap, construirItems } from '@/lib/exhib/core'
import { haceCuanto } from '@/lib/buzon/core'
import { avisar, prepararSonido } from '@/lib/sonido'
import { DIAS_ESTANTE_VIEJO, cmpSku, indexarLocal, leerCodigo, resolverEnLocal } from '@/lib/ubicaciones-local/core.core.js'
import { eliminarEstante, guardarEstante, leerControles, leerFoto, resolverEnServidor, type Controles, type Foto } from '@/lib/ubicaciones-local/cliente'

/**
 * Ubicaciones depósito (Zattia): en qué estante de atrás del local está guardado cada producto.
 *
 * 🔑 **Escaneo total**: se escanea el estante y después TODAS sus bolsas; guardar REEMPLAZA el
 * estante. Lo que se fue del estante desaparece solo, sin escanear «salidas».
 *
 * 🔑 **Cada bolsa se reconoce en el teléfono**, contra el Local del espejo que baja al abrir (el mismo
 * que usa el Chequeo de exhibición, con las fotos de TN): el pitido tiene que salir al toque, con el
 * lector en una mano y la bolsa en la otra. El servidor vuelve a resolver todo al guardar.
 *
 * 🔴 **Lo escaneado vive en el teléfono hasta que el servidor confirma**: una recarga o un corte de
 * señal a mitad de estante ⛔ pierden nada.
 */

/** Una bolsa leída. `clave: null` = el código ⛔ es ningún producto (queda marcado en la lista). */
type Lectura = { codigo: string; clave: string | null; nombre: string | null; img: string | null; enLocal: number | null; en: number }
type EnCurso = { estante: string | null; lecturas: Lectura[] }

const LS = 'mo-ubicaciones-local:en-curso'
const VACIO: EnCurso = { estante: null, lecturas: [] }
/** El lector puede repetir el Enter solo: la misma lectura dentro de esta ventana ⛔ es otra bolsa. */
const DOBLE_LECTURA_MS = 600

function leerLS(): EnCurso {
  try {
    const d = JSON.parse(localStorage.getItem(LS) || 'null') as Partial<EnCurso> | null
    return d && typeof d === 'object' ? { estante: d.estante || null, lecturas: Array.isArray(d.lecturas) ? d.lecturas : [] } : VACIO
  } catch {
    return VACIO
  }
}
function guardarLS(e: EnCurso) {
  try {
    localStorage.setItem(LS, JSON.stringify(e))
  } catch {
    /* modo privado: sigue en memoria */
  }
}

type Vista = 'escanear' | 'estantes' | 'controles'

export function UbicacionesLocal() {
  const { marca } = useSesion()
  const { datos } = useDatosMonitor()
  const [vista, setVista] = useState<Vista>('escanear')
  const [foto, setFoto] = useState<Foto | null>(null)
  const [crudos, setCrudos] = useState<CrudosExhib>({ inv: [], tnProducts: [] })
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    try {
      setFoto(await leerFoto())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (marca !== 'zattia') return
    void (async () => {
      await recargar()
      try {
        setCrudos(await bajarExhib('zattia'))
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [marca, recargar])

  // El cruce con TN se recalcula cuando llega el ETL (ver `armarProdMap`): sin él, sólo faltan las fotos.
  const indice = useMemo(() => {
    const prodMap = armarProdMap(datos?.allProductos ?? [], crudos.tnProducts)
    return indexarLocal(construirItems(crudos.inv, prodMap, {}))
  }, [datos, crudos])

  if (marca !== 'zattia') return <Notice tone="warning">Las ubicaciones del depósito son sólo del local de Zattia.</Notice>

  const puedeEscanear = !!foto?.puede.escanear
  const items = [
    ...(puedeEscanear ? [{ key: 'escanear', label: 'Escanear' }] : []),
    { key: 'estantes', label: 'Estantes', badge: foto ? foto.estantes.length : undefined },
    { key: 'controles', label: 'Controles' },
  ]
  const actual: Vista = vista === 'escanear' && foto && !puedeEscanear ? 'estantes' : vista

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      {error && <Notice tone="danger">{error}</Notice>}
      <Tabs items={items} value={actual} onChange={(k) => setVista(k as Vista)} />
      {actual === 'escanear' && <Escanear foto={foto} indice={indice} listo={crudos.inv.length > 0} alGuardar={recargar} />}
      {actual === 'estantes' && <Estantes foto={foto} indice={indice} puedeEscanear={puedeEscanear} alCambiar={recargar} />}
      {actual === 'controles' && <VistaControles indice={indice} />}
    </div>
  )
}

type Indice = ReturnType<typeof indexarLocal>

// ───────────────────────── Escanear ─────────────────────────

function Escanear({ foto, indice, listo, alGuardar }: { foto: Foto | null; indice: Indice; listo: boolean; alGuardar: () => Promise<void> }) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [enCurso, setEnCurso] = useState<EnCurso>(VACIO)
  const [guardando, setGuardando] = useState(false)
  // Ref y ⛔ estado: el lector dispara más rápido que el re-render, y la segunda lectura leería la lista vieja.
  const ref = useRef<EnCurso>(VACIO)
  const scanRef = useRef<HTMLInputElement>(null)

  // Adentro de un async porque `localStorage` ⛔ existe en el render del servidor (mismo patrón que `useColaEscaneos`).
  useEffect(() => {
    void (async () => {
      const e = leerLS()
      ref.current = e
      setEnCurso(e)
    })()
  }, [])

  const poner = useCallback((e: EnCurso) => {
    ref.current = e
    setEnCurso(e)
    guardarLS(e)
  }, [])

  const enfocar = () => setTimeout(() => scanRef.current?.focus(), 0)

  /** Guarda el estante en curso. `true` si quedó guardado (o no había nada que guardar). */
  const guardar = useCallback(async (): Promise<boolean> => {
    const e = ref.current
    if (!e.estante) return true
    setGuardando(true)
    try {
      const r = await guardarEstante(e.estante, e.lecturas.map((l) => l.codigo))
      const bolsas = r.productos.reduce((t, p) => t + p.bolsas, 0)
      const extra = r.sinResolver.length ? ` · ${r.sinResolver.length} código${r.sinResolver.length === 1 ? '' : 's'} sin reconocer quedaron afuera` : ''
      toast.ok(`Estante ${e.estante} guardado: ${r.productos.length} productos, ${bolsas} bolsas${extra}.`)
      // Mientras viajaba el pedido pudo entrar otra lectura: se limpia sólo si sigue siendo el mismo estante.
      if (ref.current.estante === e.estante && ref.current.lecturas.length === e.lecturas.length) poner(VACIO)
      void alGuardar()
      return true
    } catch (err) {
      toast.error((err as Error).message)
      avisar('no', 'no se guardó')
      return false
    } finally {
      setGuardando(false)
    }
  }, [toast, poner, alGuardar])

  const marcar = useCallback(
    async (texto: string) => {
      const l = leerCodigo(texto)
      if (l.tipo === 'vacio') return
      const e = ref.current

      if (l.tipo === 'estante') {
        if (e.estante === l.estante) return avisar('ok', l.estante)
        // Escanear otro estante cierra el anterior. 🔴 Si no se pudo guardar, ⛔ se cambia: se perdería.
        if (e.estante && !(await guardar())) return
        poner({ estante: l.estante, lecturas: [] })
        return avisar('ok', `estante ${l.estante}`)
      }

      if (!e.estante) return avisar('mira', 'primero el estante')
      const ahora = Date.now()
      const ultima = e.lecturas.at(-1)
      if (ultima && ultima.codigo === l.codigo && ahora - ultima.en < DOBLE_LECTURA_MS) return

      const p = resolverEnLocal(indice, l)
      const lectura: Lectura = p
        ? { codigo: l.codigo, clave: p.clave, nombre: p.nombre, img: p.img, enLocal: p.enLocal, en: ahora }
        : { codigo: l.codigo, clave: null, nombre: null, img: null, enLocal: null, en: ahora }
      poner({ ...e, lecturas: [...e.lecturas, lectura] })

      if (p) {
        const veces = e.lecturas.filter((x) => x.clave === p.clave).length + 1
        if (p.enLocal <= 0) avisar('ojo', 'sin stock')
        else avisar(veces > 1 ? 'suma' : 'ok', veces > 1 ? String(veces) : undefined)
        return
      }
      // El Local del teléfono ⛔ lo tiene: puede ser un producto que el Local nunca tuvo (⇒ sin stock).
      // Se le pregunta al servidor ANTES de pitar: «no figura» y «sin stock» piden cosas distintas.
      try {
        const s = await resolverEnServidor(l.codigo)
        if (!s) return avisar('no', 'no figura')
        const cur = ref.current
        poner({ ...cur, lecturas: cur.lecturas.map((x) => (x.codigo === l.codigo && x.clave === null ? { ...x, clave: s.clave, nombre: s.nombre, enLocal: s.enLocal } : x)) })
        avisar(s.enLocal > 0 ? 'ok' : 'ojo', s.enLocal > 0 ? undefined : 'sin stock')
      } catch {
        // Sin red: queda marcado y el servidor lo vuelve a intentar al guardar.
        avisar('no', 'no figura')
      }
    },
    [indice, guardar, poner],
  )

  const sacarUna = (codigo: string, clave: string | null) => {
    const e = ref.current
    const i = e.lecturas.map((x) => (clave ? x.clave === clave : x.codigo === codigo)).lastIndexOf(true)
    if (i < 0) return
    poner({ ...e, lecturas: e.lecturas.filter((_, j) => j !== i) })
    enfocar()
  }

  const alGuardarClick = async () => {
    const e = ref.current
    if (!e.estante) return
    if (!e.lecturas.length) {
      const ok = await confirmar({ titulo: `Estante ${e.estante} vacío`, mensaje: 'No escaneaste ninguna bolsa. Si guardás, el estante queda vacío.', ok: 'Guardar vacío', tono: 'warning' })
      if (!ok) return
    }
    await guardar()
    enfocar()
  }

  const descartar = async () => {
    const ok = await confirmar({ titulo: 'Descartar lo escaneado', mensaje: `Se descartan las ${ref.current.lecturas.length} lecturas del estante ${ref.current.estante}. Lo guardado antes no cambia.`, ok: 'Descartar', tono: 'danger' })
    if (ok) poner(VACIO)
    enfocar()
  }

  // La lista agrupada: una fila por producto (con sus bolsas) y una por código ⛔ reconocido.
  const filas = useMemo(() => {
    const m = new Map<string, Lectura & { bolsas: number }>()
    for (const l of enCurso.lecturas) {
      const k = l.clave ?? `?${l.codigo}`
      const prev = m.get(k)
      m.set(k, prev ? { ...prev, bolsas: prev.bolsas + 1 } : { ...l, bolsas: 1 })
    }
    return [...m.values()].sort((a, b) => (a.clave === null ? -1 : b.clave === null ? 1 : cmpSku(a.clave, b.clave)))
  }, [enCurso.lecturas])

  const guardado = foto?.estantes.find((x) => x.estante === enCurso.estante)
  const bolsas = enCurso.lecturas.filter((l) => l.clave).length

  return (
    <SectionCard
      title={enCurso.estante ? `Estante ${enCurso.estante}` : 'Escaneá la etiqueta del estante'}
      subtitle={
        enCurso.estante
          ? `${filas.filter((f) => f.clave).length} productos · ${bolsas} bolsas${guardado ? ` · antes tenía ${guardado.productos.length} productos: al guardar se reemplaza` : ' · estante nuevo'}`
          : 'Después, todas sus bolsas. Escanear otro estante guarda el anterior.'
      }
      actions={
        enCurso.estante ? (
          <div style={{ display: 'flex', gap: space[2] }}>
            <Button variant="ghost" onClick={descartar} disabled={guardando}>Descartar</Button>
            <Button variant="solid" tone="brand" onClick={alGuardarClick} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar estante'}</Button>
          </div>
        ) : null
      }
    >
      {!listo && <Notice tone="neutral">Cargando el stock del Local…</Notice>}
      <input
        ref={scanRef}
        className="mo-input"
        type="text"
        autoFocus
        onFocus={() => prepararSonido()}
        onKeyDown={(ev) => {
          if (ev.key !== 'Enter') return
          ev.preventDefault()
          const t = ev.currentTarget.value
          ev.currentTarget.value = ''
          void marcar(t)
        }}
        placeholder={enCurso.estante ? 'código de la bolsa' : 'EST-A1'}
        aria-label="Código de barras"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        style={{ width: '100%', maxWidth: 360, height: 46, fontSize: 17, textAlign: 'center', borderWidth: 2, borderColor: color.brandSolid, margin: `${space[2]}px 0 ${space[3]}px` }}
      />

      {filas.length > 0 && (
        <div style={{ display: 'grid', gap: space[1] }}>
          {filas.map((f) => (
            <div
              key={f.clave ?? `?${f.codigo}`}
              style={{
                display: 'flex', alignItems: 'center', gap: space[3], padding: space[2], borderRadius: 8,
                border: `1px solid ${f.clave === null ? color.dangerBorder : f.enLocal === 0 ? color.warningBorder : color.line}`,
                background: f.clave === null ? color.dangerBg : f.enLocal === 0 ? color.warningBg : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {f.img ? <img src={f.img} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ width: 40, height: 40 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{f.clave ?? f.codigo}</div>
                <div style={{ fontSize: font.sm, color: color.mut }}>
                  {f.clave === null ? 'No es ningún producto: no se va a guardar' : `${f.nombre ?? ''}${f.enLocal === 0 ? ' · sin stock en el Local' : ''}`}
                </div>
              </div>
              <Badge tone={f.bolsas > 1 ? 'brand' : 'neutral'}>{f.bolsas} {f.bolsas === 1 ? 'bolsa' : 'bolsas'}</Badge>
              <Button variant="ghost" size="sm" onClick={() => sacarUna(f.codigo, f.clave)} aria-label="Sacar una bolsa">−1</Button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ───────────────────────── Estantes ─────────────────────────

function Estantes({ foto, indice, puedeEscanear, alCambiar }: { foto: Foto | null; indice: Indice; puedeEscanear: boolean; alCambiar: () => Promise<void> }) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [q, setQ] = useState('')
  // El «hace cuánto» se fija al abrir la pestaña: ⛔ cambia a mitad de una lectura.
  const [ahora] = useState(() => Date.now())

  if (!foto) return <Notice tone="neutral">Cargando los estantes…</Notice>
  if (!foto.estantes.length) return <EmptyState title="Todavía no hay estantes" hint="Se cargan escaneando la etiqueta de cada estante y todas sus bolsas." />

  const nombreDe = (clave: string, nombre: string | null) => nombre || indice.porClave.get(clave)?.nombre || ''
  const busca = q.trim().toUpperCase()
  // Buscar ⇒ dónde está cada producto que coincide: «RBT-0137 → A1 · A2».
  const donde = new Map<string, { nombre: string; estantes: string[] }>()
  if (busca) {
    for (const e of foto.estantes)
      for (const p of e.productos) {
        const nombre = nombreDe(p.clave, p.nombre)
        if (!p.clave.includes(busca) && !nombre.toUpperCase().includes(busca)) continue
        const d = donde.get(p.clave) || { nombre, estantes: [] }
        d.estantes.push(e.estante)
        donde.set(p.clave, d)
      }
  }

  const eliminar = async (estante: string) => {
    const ok = await confirmar({ titulo: `Eliminar el estante ${estante}`, mensaje: 'Deja de existir con todo lo que tenía cargado, también su historial.', ok: 'Eliminar', tono: 'danger' })
    if (!ok) return
    try {
      await eliminarEstante(estante)
      toast.ok(`Estante ${estante} eliminado.`)
      await alCambiar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por SKU o nombre: RBT-0137, remera…" style={{ maxWidth: 420 }} />
      {busca && (
        <SectionCard title={donde.size ? `Dónde está (${donde.size})` : 'No está en ningún estante'}>
          {[...donde.entries()].sort((a, b) => cmpSku(a[0], b[0])).map(([clave, d]) => (
            <div key={clave} style={{ display: 'flex', gap: space[3], padding: `${space[1]}px 0` }}>
              <b style={{ minWidth: 110 }}>{clave}</b>
              <span style={{ flex: 1, color: color.mut }}>{d.nombre}</span>
              <b>{[...new Set(d.estantes)].sort(cmpSku).join(' · ')}</b>
            </div>
          ))}
        </SectionCard>
      )}
      {foto.estantes.map((e) => {
        const dias = e.escaneadoEn ? (ahora - Date.parse(e.escaneadoEn)) / 86400000 : Infinity
        const bolsas = e.productos.reduce((t, p) => t + p.bolsas, 0)
        return (
          <SectionCard
            key={e.estante}
            title={`Estante ${e.estante}`}
            subtitle={
              <span>
                {e.productos.length} productos · {bolsas} bolsas ·{' '}
                <span style={{ color: dias > DIAS_ESTANTE_VIEJO ? color.warningInk : undefined, fontWeight: dias > DIAS_ESTANTE_VIEJO ? 600 : undefined }}>
                  {e.escaneadoEn ? `escaneado ${haceCuanto(e.escaneadoEn, ahora)}` : 'sin escanear'}
                </span>
                {e.escaneadoPor ? ` por ${e.escaneadoPor}` : ''}
              </span>
            }
            actions={puedeEscanear ? <Button variant="ghost" size="sm" onClick={() => eliminar(e.estante)}>Eliminar</Button> : null}
          >
            {e.productos.length ? (
              e.productos.map((p) => (
                <div key={p.clave} style={{ display: 'flex', gap: space[3], padding: `${space[1]}px 0`, borderBottom: `1px solid ${color.line}` }}>
                  <b style={{ minWidth: 110 }}>{p.clave}</b>
                  <span style={{ flex: 1, color: color.mut }}>{nombreDe(p.clave, p.nombre)}</span>
                  <span>{p.bolsas} {p.bolsas === 1 ? 'bolsa' : 'bolsas'}</span>
                </div>
              ))
            ) : (
              <span style={{ color: color.mut }}>Vacío.</span>
            )}
          </SectionCard>
        )
      })}
    </div>
  )
}

// ───────────────────────── Controles ─────────────────────────

function VistaControles({ indice }: { indice: Indice }) {
  const [c, setC] = useState<Controles | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    leerControles().then(setC).catch((e) => setError((e as Error).message))
  }, [])

  if (error) return <Notice tone="danger">{error}</Notice>
  if (!c) return <Notice tone="neutral">Cargando los controles…</Notice>

  const nombre = (clave: string, n: string | null) => n || indice.porClave.get(clave)?.nombre || ''

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <Notice tone="neutral">Según el stock de anoche del Local: lo que se vendió hoy todavía no cuenta.</Notice>
      <SectionCard title={`Bolsa sin stock (${c.bolsaSinStock.length})`} subtitle="Hay bolsa en un estante, pero el Local tiene 0: la bolsa está vacía o el stock está mal.">
        {c.bolsaSinStock.length ? (
          c.bolsaSinStock.map((x) => (
            <div key={x.clave} style={{ display: 'flex', gap: space[3], padding: `${space[1]}px 0`, borderBottom: `1px solid ${color.line}` }}>
              <b style={{ minWidth: 110 }}>{x.clave}</b>
              <span style={{ flex: 1, color: color.mut }}>{nombre(x.clave, x.nombre)}</span>
              <b>{x.estantes.join(' · ')}</b>
            </div>
          ))
        ) : (
          <span style={{ color: color.mut }}>Ninguna.</span>
        )}
      </SectionCard>
      <SectionCard title={`Stock sin bolsa (${c.stockSinBolsa.length})`} subtitle="Algún color o talle tiene más de 3 en el Local y el producto no está en ningún estante: bolsa perdida o en un lugar sin escanear.">
        {c.stockSinBolsa.length ? (
          c.stockSinBolsa.map((x) => (
            <div key={x.clave} style={{ display: 'flex', gap: space[3], padding: `${space[1]}px 0`, borderBottom: `1px solid ${color.line}` }}>
              <b style={{ minWidth: 110 }}>{x.clave}</b>
              <span style={{ flex: 1, color: color.mut }}>{nombre(x.clave, x.nombre)}</span>
              <span>{x.enLocal} en el Local</span>
            </div>
          ))
        ) : (
          <span style={{ color: color.mut }}>Ninguno.</span>
        )}
      </SectionCard>
    </div>
  )
}
