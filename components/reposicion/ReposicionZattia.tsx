'use client'

/**
 * Reposición **según ventas** de Zattia y de BDI (BDI desde el 12-oct-2026: las dos listas las arma
 * Karen, desde la compu del local). Dos listas, una por persona en Zattia:
 *
 * - **Llevar al local** — la arma Lorena en el depósito (hoja A4).
 * - **Devolver al depósito** — la arma Camila en el local y la lleva en el carro (rollo de 80 mm).
 *
 * Arriba, el selector **Zattia / Stunned**: cada línea tiene sus propias condiciones (`ventas` y
 * `ventasStunned` en la config) y sus propios papeles, porque Stunned tiene su sector en el depósito.
 *
 * El cálculo vive en `lib/reposicion/porVentas.ts` (reglas y porqué, ahí). En BDI no hay selector de
 * línea, ni «para exhibir», ni etiquetas: son de la ropa.
 * **Armar con el lector** (12-oct-2026): Lorena escanea en la compu contra la lista y el Monitor hace
 * la transferencia depósito → local en Gestión Nube (`ArmadoLector.tsx`, `api/_repo-armado.js`).
 * Devolución (12-oct-2026): Camila escanea en la compu del local y el Monitor transfiere local →
 * depósito, en varias tandas del carro con «Transferir y continuar».
 * Desde el 15-oct-2026 la devolución es una SOLICITUD (`SolicitudDevolucion.tsx`): Darío o Bruno
 * eligen qué vuelve, por prioridad y sin tope diario, y la envían al local.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useTnPromo } from '@/components/productos/useTnImages'
import { useRecargarDatos } from '@/components/productos/BotonRecargar'
import { puedeEliminarTn } from '@/components/caducados/eliminarTn'
import { HeaderAcciones } from '@/components/layout/acciones'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { dispararSyncStock } from '@/lib/sync-gn'
import { indexarTn, matchTn } from '@/lib/tn'
import { construirInv } from '@/lib/reposicion/inventario'
import { aplicarCats } from '@/lib/reposicion/core'
import { CAMPO_LINEA, cfgVentas, decidirTodo, hoyAR, listaLlevar, type CfgVentas, type FilaVentas, type LineaZ, type MarcaModo, type Modo } from '@/lib/reposicion/porVentas'
import { esStunned, ETIQUETA_LINEA } from '@/lib/lineas'
import { apagarProductos, prenderProductos } from '@/lib/reposicion/sinReponer'
import { reposicionPDFFilas } from '@/lib/reposicion/pdf'
import type { Producto } from '@/lib/etl/tipos'
import { useReposicion } from './useReposicion'
import { ultimaSincronizacion } from '@/lib/reposicion/cliente'
import { useEtiquetasCampania } from '@/components/etiquetas/useEtiquetasCampania'
import { ArmadoLector } from './ArmadoLector'
import { OpcionesBdi } from './OpcionesBdi'
import { HistorialArmados } from './HistorialArmados'
import { SolicitudDevolucion, type DatoTn } from './SolicitudDevolucion'
import { abrirArmado, articuloDe, cambiarCantidadesArmado, codigoArmado, leerArmadoHoy, pedidoDesde, resolverArmado, resumenArmado, talle, trabado, type Armado, type LineaPedido, type Sentido } from '@/lib/reposicion/armado'
import { cambiarCantidades, transferidoDe } from '@/lib/reposicion/armado.core.js'
import { transfiereEnErp } from '@/lib/erp/transferencia-doc.core.js'
import { Badge, Button, EmptyState, Esqueleto, Modal, Notice, Select, SelectorLinea, Tabs, TBody, THead, TableWrap, Td, Th, Tr, color, font, space, useConfirmar, useToast } from '@/components/ui'

type Pestana = 'llevar' | 'devolver' | 'historial'

export function ReposicionZattia({ allProductos }: { allProductos: Producto[] }) {
  const { marca, perfil } = useSesion()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const rep = useReposicion(marca)
  const { cfg } = rep
  const { recargar, cargando: recargando } = useRecargarDatos()
  // La misma regla que Caducados: marcar modos lo pueden Darío y Bruno.
  const puedeMarcar = puedeEliminarTn(perfil)

  const bdi = marca === 'bdi'
  const [linea, setLinea] = useState<LineaZ>(bdi ? 'bdi' : 'zattia')
  const art = articuloDe(linea)
  const [opcionesOpen, setOpcionesOpen] = useState(false)
  // Las categorías salen de la Tienda Nube DE LA LÍNEA: Stunned tiene la suya (`docs/lineas.md`).
  const tnIdx = useTnPromo(linea)
  const prodById = useMemo(() => Object.fromEntries(allProductos.map((p) => [String(p.id), p])) as Record<string, Producto>, [allProductos])
  const hoy = hoyAR()
  const cv = cfgVentas(cfg, linea)
  const vv = rep.vvPorDias[cv.ventanaDias]
  // Sólo las variantes de la línea elegida: la única marca de Stunned es el prefijo del SKU.
  const inv = useMemo(
    () =>
      aplicarCats(construirInv(rep.rawInv, prodById, tnIdx ?? indexarTn([]), rep.s7, vv ?? {}), cfg.catsOff).filter(
        (it) => esStunned(it.sku) === (linea === 'stunned'),
      ),
    [rep.rawInv, prodById, tnIdx, rep.s7, vv, cfg.catsOff, linea],
  )
  const filas = useMemo(() => decidirTodo(inv, cfg, hoy, linea), [inv, cfg, hoy, linea])
  // La Propuesta de devolución muestra el alta en Tienda Nube y si tiene precio promocional (Darío,
  // 19-oct-2026). Se cruza con el producto de GN (su SKU y nombre), como las categorías.
  const tnDe = useCallback(
    (g: { pid: string; name: string; sku?: string }): DatoTn | null => {
      if (!tnIdx) return null
      const p = prodById[g.pid]
      const tn = matchTn({ sku: p?.sku ?? g.sku ?? null, name: p?.name ?? g.name }, tnIdx)
      if (!tn) return null
      const promo = !!tn.promo_price && tn.promo_price > 0 && (!tn.price || tn.promo_price < tn.price)
      return { alta: tn.created_at ?? null, promo }
    },
    [tnIdx, prodById],
  )
  const llevar = useMemo(() => listaLlevar(filas), [filas])
  const exhibidos = useMemo(() => filas.filter((f) => f.d.modo.modo === 'exhibido'), [filas])

  const [tab, setTab] = useState<Pestana>('llevar')
  const [manual, setManual] = useState<Record<string, number>>({})
  const [configOpen, setConfigOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncLabel, setSyncLabel] = useState('')

  const [armados, setArmados] = useState<Record<Sentido, Armado | null>>({ llevar: null, devolver: null })
  // 🔑 Con un armado empezado, las cantidades son las del ARMADO (Darío, 17-oct-2026): lo cambiado en
  // una compu quedaba sólo en esa pantalla y en otra, con el mismo usuario, no aparecía.
  const enCurso = armados.llevar?.estado === 'en_curso' ? armados.llevar : null
  const cantArmado = useMemo(() => (enCurso ? Object.fromEntries(enCurso.pedido.map((l) => [l.vid, l.cant])) : null), [enCurso])
  const cantLlevar = (f: FilaVentas) => (cantArmado ? (cantArmado[f.it.vid] ?? 0) : (manual[f.it.vid] ?? f.d.llevar))
  const totalLlevar = llevar.reduce((s, f) => s + cantLlevar(f), 0)
  const paraExhibir = llevar.filter((f) => f.d.exhibir && cantLlevar(f) > 0).length
  const conAlarma = llevar.filter((f) => f.d.soloAlarma).reduce((s, f) => s + cantLlevar(f), 0)

  // Desde cuándo se espera un «Actualizar stock» que tardó más de lo normal (`null` = no se espera).
  const [esperandoSync, setEsperandoSync] = useState<number | null>(null)
  useEffect(() => {
    if (esperandoSync == null) return
    const desde = rep.lastUpdate?.getTime() ?? 0
    const t = setInterval(() => {
      void (async () => {
        const s = await ultimaSincronizacion(marca)
        if (s && s.getTime() > desde) {
          setEsperandoSync(null)
          await Promise.all([rep.traer({ forzar: true }), recargar()])
          toast.ok('Stock actualizado')
        } else if (Date.now() - esperandoSync > 10 * 60_000) {
          setEsperandoSync(null)
          toast.aviso('Gestión Nube no terminó de actualizar el stock. Probá «Actualizar stock» de nuevo en unos minutos.')
        }
      })()
    }, 30_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esperandoSync, marca])

  const onActualizar = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      // Ver el porqué de mirar el `done` en `Reposicion.tsx` (el 4-sep el local bajó con stock de ayer).
      const done = await dispararSyncStock(marca, setSyncLabel)
      setSyncLabel('↻ Recargando…')
      await Promise.all([rep.traer({ forzar: true }), recargar()])
      setManual({})
      if (done) toast.ok('Stock actualizado')
      else {
        // 🔑 Sin «tocá Recargar» (Darío, 12-oct-2026: Recargar quedó sólo para él y Bruno): la
        // pantalla mira sola cada 30 s hasta que Gestión Nube termina.
        toast.aviso('Gestión Nube está tardando. La pantalla se actualiza sola cuando termine.')
        setEsperandoSync(Date.now())
      }
    } catch (e) {
      toast.error('No se pudo actualizar: ' + (e as Error).message)
    } finally {
      setSyncing(false)
      setSyncLabel('')
    }
  }

  // ── El armado con el lector: Reposición (Lorena) y Devolución (Camila) ───────────────────────
  const [armando, setArmando] = useState<Sentido | null>(null)
  const [abriendo, setAbriendo] = useState(false)
  const traerArmados = async (l: LineaZ = linea) => {
    const [a, b] = await Promise.all([leerArmadoHoy(l, 'llevar').catch(() => null), leerArmadoHoy(l, 'devolver').catch(() => null)])
    setArmados({ llevar: a, devolver: b })
  }
  useEffect(() => {
    void (async () => {
      await traerArmados(linea)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linea])
  const abierto = (s: Sentido) => (armados[s]?.estado === 'en_curso' ? armados[s] : null)

  // ── Cambiar cantidades con el armado empezado: se guardan en el armado (Darío, 17-oct-2026) ──
  const cambiosCant = useRef<Record<string, LineaPedido>>({})
  const timerCant = useRef<ReturnType<typeof setTimeout> | null>(null)
  const subirCantidades = async (id: string) => {
    const cambios = Object.values(cambiosCant.current)
    cambiosCant.current = {}
    if (!cambios.length) return
    try {
      const d = await cambiarCantidadesArmado(linea, id, cambios)
      setArmados((x) => ({ ...x, llevar: d.armado }))
      if (Object.keys(d.topes || {}).length) toast.aviso('No se puede pedir menos de lo que ya se escaneó.')
    } catch (e) {
      toast.error('No se pudo guardar la cantidad: ' + (e as Error).message)
      await traerArmados()
    }
  }
  const editarLlevar = (f: FilaVentas, v: string) => {
    if (!enCurso) {
      setManual((m) => {
        const n = { ...m }
        if (v === '') delete n[f.it.vid]
        else n[f.it.vid] = Math.max(0, Math.min(f.it.deposito, parseInt(v, 10) || 0))
        return n
      })
      return
    }
    // Vacío = 0 mientras se escribe (si no, borrar para corregir no dejaba): el guardado espera 0,8 s.
    const cant = Math.max(0, Math.min(f.it.deposito, parseInt(v, 10) || 0))
    const [base] = pedidoDesde([f], () => 1, true)
    const cambio = { ...base, cant }
    // Se ve al instante; el servidor confirma (y no deja bajar de lo ya escaneado).
    const { pedido } = cambiarCantidades(enCurso.pedido, [cambio], enCurso.escaneos, transferidoDe(enCurso.transfer))
    setArmados((x) => ({ ...x, llevar: x.llevar ? { ...x.llevar, pedido } : x.llevar }))
    cambiosCant.current[cambio.vid] = cambio
    if (timerCant.current) clearTimeout(timerCant.current)
    const id = enCurso.id
    timerCant.current = setTimeout(() => void subirCantidades(id), 800)
  }
  // Con un armado empezado y la lista a la vista, se vuelve a mirar cada 20 s: lo cambiado en otra
  // compu aparece solo (salvo mientras hay un cambio propio sin guardar).
  const idEnCurso = enCurso?.id
  useEffect(() => {
    if (!idEnCurso || armando) return
    const r = setInterval(() => {
      if (Object.keys(cambiosCant.current).length) return
      void leerArmadoHoy(linea, 'llevar')
        .then((a) => {
          if (Object.keys(cambiosCant.current).length) return
          setArmados((x) => ({ ...x, llevar: a }))
        })
        .catch(() => {})
    }, 20_000)
    return () => clearInterval(r)
  }, [idEnCurso, armando, linea])
  // Mientras uno está «transfiriendo», se vuelve a mirar cada 30 s: o termina, o a los 90 s queda
  // TRABADO y aparecen los botones para resolverlo (revisión del 12-oct-2026).
  const hayTransfiriendo = armados.llevar?.estado === 'transfiriendo' || armados.devolver?.estado === 'transfiriendo'
  useEffect(() => {
    if (!hayTransfiriendo) return
    const t = setInterval(() => void traerArmados(), 30_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayTransfiriendo, linea])
  // 🔴 Recién transferido (cualquiera de los dos), las listas siguen iguales hasta que se actualiza el
  // stock: armarlas de nuevo pediría dos veces lo mismo. Hasta que el stock sea posterior, no se arma.
  const transferidoDespues = (a: Armado | null) => a?.estado === 'transferido' && !!a.cerrado_en && (!rep.lastUpdate || rep.lastUpdate.getTime() < new Date(a.cerrado_en).getTime())
  const esperandoStock = transferidoDespues(armados.llevar) || transferidoDespues(armados.devolver)

  const onArmar = async (sentido: Sentido) => {
    if (abierto(sentido)) return setArmando(sentido)
    // La devolución se arma sólo desde una solicitud enviada (ya está abierta): acá no se inicia.
    if (sentido === 'devolver') return
    const pedido = pedidoDesde(llevar, cantLlevar, true)
    if (!pedido.length) return toast.aviso(`No hay ${art.plural} para reponer.`)
    // Una lista armada con stock viejo pide lo que ya se movió ayer.
    if (edadMin != null && edadMin >= 360) {
      const ok = await confirmar({
        titulo: 'Stock desactualizado (' + antiguedad + ')',
        tono: 'warning',
        ok: 'Iniciar igual',
        mensaje: 'Conviene actualizar el stock antes de iniciar el armado.',
      })
      if (!ok) return
    }
    setAbriendo(true)
    try {
      const d = await abrirArmado(linea, sentido, pedido)
      setArmados((x) => ({ ...x, [sentido]: d.armado }))
      // Lo cambiado a mano ya quedó en el armado: desde acá manda el armado.
      setManual({})
      // El que ya había puede estar sin confirmar en GN: ése no se abre, se resuelve con el cartel.
      if (d.yaHabia && d.armado.estado !== 'en_curso') return toast.aviso('Hay una transferencia sin confirmar: verificala antes de iniciar otro armado.')
      if (d.yaHabia) toast.aviso('Ya había un armado en curso: se continúa ese.')
      setArmando(sentido)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAbriendo(false)
    }
  }

  const onResolver = async (a: Armado, hecha: boolean) => {
    // 🔴 «No está» habilita a transferir de nuevo: si en realidad estaba, las prendas viajan dos veces. En el ERP ⛔ hay riesgo:
    // el reintento retoma el mismo documento.
    if (!hecha && !transfiereEnErp(a.linea)) {
      const ok = await confirmar({
        titulo: '¿Seguro que no está en Gestión Nube?',
        tono: 'danger',
        ok: 'No está: transferir de nuevo',
        mensaje: `Buscá en Gestión Nube una transferencia con «#${codigoArmado(a.id)}» en la descripción. Si figura y la volvés a hacer, las ${art.plural} se transfieren dos veces.`,
      })
      if (!ok) return
    }
    try {
      await resolverArmado(a.linea, a.id, hecha)
      await traerArmados()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** El botón del armado de cada pestaña: Iniciar / Continuar (o nada si quedó sin confirmar). */
  const botonArmado = (sentido: Sentido, hayLista: boolean) =>
    armados[sentido]?.estado === 'revisar' || armados[sentido]?.estado === 'transfiriendo' ? null : (
      <Button
        variant="solid"
        tone="brand"
        onClick={() => void onArmar(sentido)}
        loading={abriendo}
        disabled={!abierto(sentido) && (!hayLista || esperandoStock)}
        title={esperandoStock && !abierto(sentido) ? 'Actualizá el stock: la lista todavía no descuenta lo transferido' : undefined}
      >
        {abierto(sentido) && Object.keys(abierto(sentido)!.escaneos || {}).length ? 'Continuar armado' : 'Iniciar armado'}
      </Button>
    )

  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const edadMin = rep.lastUpdate ? Math.max(0, Math.round((ahora - rep.lastUpdate.getTime()) / 60000)) : null
  const antiguedad = edadMin == null ? '' : edadMin < 60 ? `hace ${edadMin} min` : edadMin < 1440 ? `hace ${Math.floor(edadMin / 60)} h` : `hace ${Math.floor(edadMin / 1440)} d`

  const onImprimirLlevar = async () => {
    const ok = await reposicionPDFFilas(
      // El papel de Lorena lleva sólo lo que tiene que hacer: producto, talle y cuánto (Darío,
      // 11-oct). Ni stock ni ventas — eso lo ven el dueño y el socio en pantalla—, y tampoco «para
      // exhibir»: ese aviso lo da el Monitor al escanear (parte 3).
      llevar.map((f) => ({ ubic: f.it.ubic, name: f.it.name, size: f.it.size, mover: cantLlevar(f) })),
      linea,
      rep.lastUpdate,
    )
    if (!ok) toast.aviso(`No hay ${art.plural} para llevar: están todas en 0.`)
  }

  if (rep.cargando && !rep.rawInv.length) return <Esqueleto forma="tabla" filas={8} />
  if (rep.error)
    return (
      <Notice tone="danger" icon="⚠">
        No pude cargar la reposición: {rep.error}{' '}
        <Button size="sm" variant="outline" tone="danger" onClick={() => void rep.traer({ forzar: true })}>
          Reintentar
        </Button>
      </Notice>
    )

  const enArmado = armando ? abierto(armando) : null
  if (enArmado)
    return (
      <ArmadoLector
        armado={enArmado}
        inv={inv}
        allProductos={allProductos}
        campaniaEtiqueta={cfg.campaniaEtiqueta ?? null}
        onSalir={() => {
          setArmando(null)
          void traerArmados()
        }}
        onTerminado={(transferido) => {
          setArmando(null)
          void traerArmados()
          // La transferencia ya está en GN; el espejo se pone al día solo con esto.
          if (transferido) void onActualizar()
        }}
      />
    )

  return (
    <>
      <HeaderAcciones>
        {bdi ? (
          <InfoPopover titulo="Reposición">
            <b>Stock ideal</b>: {cv.minimoBajo} por variante; {cv.minimoModelo} en los modelos que venden {cv.umbralModelo} o más fundas por semana, si el diseño
            vendió {cv.ventaDisenoMin} o más en {cv.ventanaDias} días; {cv.minimo} si
            el diseño vende {cv.umbralSemana} o más por semana. Lo que vende mucho suma reserva para {cv.coberturaDias} días.
            <br />
            <br />
            <b>Reposición</b>: lo que falta para llegar al stock ideal. Siempre quedan {cv.reservaDeposito} en el depósito para la venta online. Los vidrios, mínimo {cv.minimoTemplado}; los que
            venden {cv.umbralCaja} o más por semana van por caja de {cv.cajaTemplado}, cuando en el local quedan {cv.diasPedidoTemplado} días de venta o menos.
            Los accesorios que venden {cv.umbralAccesorio} o más por semana tienen en el local lo que se vende en {cv.diasAccesorio} días.
            <br />
            <b>Devolución</b>: una solicitud que eligen Darío o Bruno entre lo que supera el stock ideal; primero lo que no se vende.
            <br />
            <br />
            Ventas del local: últimos {cv.ventanaDias} días y última semana.
          </InfoPopover>
        ) : (
          <InfoPopover titulo="Reposición">
            <b>Stock ideal</b>: {cv.minimoBajo} por variante (1 exhibida + reserva); {cv.minimo} si vende {cv.umbralSemana} o más por semana. Lo que vende mucho
            suma reserva para {cv.coberturaDias} días.
            <br />
            <br />
            <b>Reposición</b>: lo que falta para llegar al stock ideal. Si el local está en 0, la primera va <b>para exhibir</b> (alarma y etiquetas).
            <br />
            <b>Devolución</b>: una solicitud que eligen Darío o Bruno entre lo que supera el stock ideal; primero lo que no se vende.
            <br />
            <br />
            Ventas del local y de Tienda Nube: últimos {cv.ventanaDias} días y última semana.
          </InfoPopover>
        )}
        {/* Configurar y Recargar, sólo Darío y Bruno (Darío, 12-oct-2026): para quien arma, una
            pantalla más simple. Recargar no hace falta: la espera de «Actualizar stock» se resuelve sola. */}
        {puedeMarcar && (
          <Button variant="ghost" onClick={() => setConfigOpen(true)}>
            Configurar
          </Button>
        )}
        {puedeMarcar && (
          <Button variant="ghost" onClick={() => void Promise.all([rep.traer({ forzar: true }), recargar()])} loading={recargando} title="Vuelve a leer los datos ya sincronizados, sin ir a Gestión Nube">
            Recargar
          </Button>
        )}
        <Button variant="outline" onClick={() => void onActualizar()} loading={syncing || esperandoSync != null} title="Carga el stock de Gestión Nube (unos 2 minutos)">
          {syncing ? syncLabel || 'Actualizando…' : esperandoSync != null ? 'Esperando a Gestión Nube…' : 'Actualizar stock'}
        </Button>
      </HeaderAcciones>

      {!bdi && (
        <SelectorLinea
          linea={linea}
          lineas={['zattia', 'stunned']}
          onChange={(l) => {
            setLinea(l as LineaZ)
            setManual({})
          }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', margin: `${space[3]}px 0` }}>
        <Tabs
          value={tab}
          onChange={(k) => setTab(k as Pestana)}
          items={[
            { key: 'llevar', label: 'Reposición', badge: totalLlevar || undefined },
            // ⏸️ BDI: la devolución queda EN PAUSA (Darío, 12-oct-2026: «pendiente de analizar»). El
            // cálculo está hecho (100 por día); se vuelve a mostrar sacando esta condición.
            ...(bdi ? [] : [{ key: 'devolver', label: 'Devolución', badge: (abierto('devolver') ? resumenArmado(abierto('devolver')!.pedido, {}).pedidas : 0) || undefined }]),
            { key: 'historial', label: 'Historial' },
          ]}
        />
        <span style={{ marginLeft: 'auto', fontSize: font.sm, color: edadMin != null && edadMin >= 360 ? color.warningInk : color.mut2 }}>
          {rep.lastUpdate
            ? `Stock ${antiguedad} · ${rep.lastUpdate.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
            : 'Stock sin fecha de actualización'}
        </span>
      </div>

      {tab === 'historial' ? (
        <HistorialArmados linea={linea} />
      ) : tab === 'llevar' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
            <span style={{ fontSize: font.md, color: color.ink2 }}>
              <b>{totalLlevar}</b> {art.plural} · {llevar.length} variantes
            </span>
            {paraExhibir > 0 && (
              <span title="La primera va con alarma, etiqueta de precio y etiqueta de formas de pago">
                <Badge tone="warning">{paraExhibir} para exhibir</Badge>
              </span>
            )}
            {conAlarma > 0 && (
              <span title="Todas con alarma, ninguna con etiqueta de precio">
                <Badge tone="brand">{conAlarma} con alarma, sin precio</Badge>
              </span>
            )}
            {!enCurso && Object.keys(manual).length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setManual({})}>
                ↺ Restablecer cantidades
              </Button>
            )}
            <Button variant="outline" style={{ marginLeft: 'auto' }} onClick={() => void onImprimirLlevar()} disabled={!llevar.length}>
              Imprimir A4
            </Button>
            {botonArmado('llevar', llevar.length > 0)}
          </div>
          <EstadoArmado armado={armados.llevar} onResolver={(a, h) => void onResolver(a, h)} />
          {!llevar.length ? (
            <EmptyState icon="🎉" title={`No hay ${art.plural} para reponer`} hint="El local tiene su stock ideal, o lo que falta no está en el depósito." dashed />
          ) : (
            <TablaVentas
              filas={llevar}
              cantidad={cantLlevar}
              titulo="Reponer"
              editar={editarLlevar}
            />
          )}
        </>
      ) : (
        <>
          {/* Recién enviada (sin nada escaneado) ya la muestra la solicitud: el cartel de «en curso» sobra. */}
          <EstadoArmado armado={armados.devolver?.estado === 'en_curso' && !Object.keys(armados.devolver.escaneos || {}).length ? null : armados.devolver} onResolver={(a, h) => void onResolver(a, h)} />
          <SolicitudDevolucion
            linea={linea}
            rotulo={ETIQUETA_LINEA[linea]}
            filas={filas}
            vv={vv}
            tnDe={tnDe}
            armado={armados.devolver}
            stockViejo={transferidoDespues(armados.devolver)}
            puedeAprobar={puedeMarcar}
            bolsaProd={cv.bolsaProd}
            guardarBolsaProd={(v) => rep.guardarCfg({ ...cfg, [CAMPO_LINEA[linea]]: { ...cv, bolsaProd: v } })}
            apagar={(pids) => rep.guardarCfg(apagarProductos(cfg, pids))}
            prender={(pids) => rep.guardarCfg(prenderProductos(cfg, pids))}
            boton={botonArmado('devolver', true)}
            onEnviada={() => void traerArmados()}
          />
        </>
      )}

      {tab !== 'historial' && exhibidos.length > 0 && (
        <p style={{ marginTop: space[4], fontSize: font.sm, color: color.mut }}>
          Todo exhibido, fuera de las listas: {new Set(exhibidos.map((f) => f.it.pid)).size} productos · {[...new Set(exhibidos.map((f) => f.d.modo.motivo))].join(' · ')}
        </p>
      )}

      <ConfigZattia
        abierto={configOpen}
        onClose={() => setConfigOpen(false)}
        titulo={`Configurar reposición de ${ETIQUETA_LINEA[linea]}`}
        filas={filas}
        cfgVentas={cv}
        puede={puedeMarcar}
        shareStatus={rep.shareStatus}
        guardar={(v) => rep.guardarCfg({ ...cfg, [CAMPO_LINEA[linea]]: v })}
        campaniaEtiqueta={cfg.campaniaEtiqueta ?? null}
        guardarCampania={(id) => rep.guardarCfg({ ...cfg, campaniaEtiqueta: id })}
        bdi={bdi}
        apagados={cfg.apagados.map(String)}
        prender={(pid) => rep.guardarCfg(prenderProductos(cfg, [pid]))}
        onOpciones={() => {
          setConfigOpen(false)
          setOpcionesOpen(true)
        }}
      />
      {/* BDI: los productos que no se reponen y las categorías a ignorar al agrupar (las lee Conteo)
          salen de la ventana de antes; los mínimos y los topes ya no se aplican. */}
      {bdi && (
        <OpcionesBdi
          abierto={opcionesOpen}
          inv={inv}
          cfg={cfg}
          puede={puedeMarcar}
          shareStatus={rep.shareStatus}
          guardarCfg={rep.guardarCfg}
          onClose={() => setOpcionesOpen(false)}
        />
      )}
    </>
  )
}

/**
 * UNA tabla para toda la lista, con el producto como separador (Darío, 12-oct: «muy repetitivo»:
 * antes era una tabla por producto con los encabezados repetidos). La cantidad es editable sólo en
 * «Reponer».
 */
function TablaVentas({ filas, cantidad, titulo, editar }: { filas: FilaVentas[]; cantidad: (f: FilaVentas) => number; titulo: string; editar?: (f: FilaVentas, v: string) => void }) {
  const grupos = useMemo(() => {
    const g: { pid: string; name: string; filas: FilaVentas[] }[] = []
    for (const f of filas) {
      const ult = g[g.length - 1]
      if (ult && ult.pid === f.it.pid) ult.filas.push(f)
      else g.push({ pid: f.it.pid, name: f.it.name, filas: [f] })
    }
    return g
  }, [filas])
  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Variante</Th>
          <Th width={150}>SKU</Th>
          <Th align="center" width={70}>Local</Th>
          <Th align="center" width={80}>Depósito</Th>
          <Th align="center" width={90}>Venta semanal</Th>
          <Th align="center" width={80}>Stock ideal</Th>
          <Th align="center" width={84}>{titulo}</Th>
          <Th>Motivo</Th>
        </Tr>
      </THead>
      <TBody>
        {grupos.map((g, i) => (
          // Por SKU, un mismo producto puede quedar en dos grupos separados: la clave lleva la posición.
          <Fragment key={`${g.pid}-${i}`}>
            <Tr>
              <Td colSpan={8} style={{ background: color.bg2, paddingTop: space[2], paddingBottom: space[2] }}>
                <b style={{ color: color.ink }}>{g.name}</b>
                <span style={{ color: color.mut2, fontSize: font.sm }}> · {g.filas[0].it.cat}</span>
                {g.filas[0].d.nuevo && (
                  <span style={{ marginLeft: 6 }}>
                    <Badge tone="brand">nuevo</Badge>
                  </span>
                )}
              </Td>
            </Tr>
            {g.filas.map((f) => {
              const n = cantidad(f)
              return (
                <Tr key={f.it.vid}>
                  <Td wrap>
                    {talle(f.it.size) || 'Única'}
                    {f.d.exhibir && titulo === 'Reponer' && (
                      <span title="Local en 0: la primera va con alarma, etiqueta de precio y etiqueta de formas de pago" style={{ marginLeft: 6 }}>
                        <Badge tone="warning">para exhibir</Badge>
                      </span>
                    )}
                    {f.d.soloAlarma && titulo === 'Reponer' && (
                      <span title="Todas con alarma, ninguna con etiqueta de precio" style={{ marginLeft: 6 }}>
                        <Badge tone="brand">con alarma, sin precio</Badge>
                      </span>
                    )}
                  </Td>
                  <Td style={{ fontSize: font.sm, color: color.mut }}>{f.it.sku || '—'}</Td>
                  <Td align="center" style={{ color: f.it.local <= 1 ? color.danger : color.ink2, fontWeight: 600 }}>{f.it.local}</Td>
                  <Td align="center">{f.it.deposito}</Td>
                  <Td align="center" style={{ color: f.d.vendidas ? color.success : color.mut2, fontWeight: 600 }}>{f.d.porSemana.toLocaleString('es-AR')}</Td>
                  <Td align="center" style={{ color: color.mut2 }}>{f.d.objetivo ?? '—'}</Td>
                  <Td align="center" tall>
                    {editar ? (
                      <input
                        className="mo-input mo-input--num"
                        type="number"
                        min={0}
                        max={f.it.deposito}
                        inputMode="numeric"
                        value={n}
                        onChange={(e) => editar(f, e.target.value)}
                        aria-label={`Prendas a reponer de ${f.it.name} ${f.it.size}`}
                        style={{ width: 64, textAlign: 'center', padding: '0 6px', fontWeight: 700 }}
                      />
                    ) : (
                      <b>{n}</b>
                    )}
                  </Td>
                  <Td wrap style={{ fontSize: font.sm, color: color.mut }}>{f.d.porque}</Td>
                </Tr>
              )
            })}
          </Fragment>
        ))}
      </TBody>
    </TableWrap>
  )
}

const MODOS: { v: Modo; label: string }[] = [
  { v: 'ventas', label: 'Según ventas' },
  { v: 'exhibido', label: 'Todo exhibido' },
  { v: 'fija', label: 'Cantidad fija' },
]

/** Parámetros y marcas (por categoría y por producto). Editan sólo Darío y Bruno; el resto lo ve. */
function ConfigZattia({ abierto, onClose, titulo, filas, cfgVentas: cv, puede, shareStatus, guardar, campaniaEtiqueta, guardarCampania, bdi, onOpciones, apagados, prender }: {
  abierto: boolean
  onClose: () => void
  titulo: string
  filas: FilaVentas[]
  cfgVentas: CfgVentas
  puede: boolean
  shareStatus: { txt: string; color: string }
  guardar: (v: CfgVentas) => void
  campaniaEtiqueta: string | null
  guardarCampania: (id: string | null) => void
  bdi: boolean
  onOpciones: () => void
  /** Productos apagados de la reposición (se apagan al confirmar una devolución). */
  apagados: string[]
  prender: (pid: string) => void
}) {
  const [buscar, setBuscar] = useState('')
  const [buscarSp, setBuscarSp] = useState('')
  // Las campañas vivas, las mismas que lista Etiquetas → Precio de campaña. Sólo con la ventana abierta.
  const { campanias } = useEtiquetasCampania('zattia', '', abierto)
  const productos = useMemo(() => {
    const m = new Map<string, string>()
    filas.forEach((f) => m.set(f.it.pid, f.it.name))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [filas])
  const encontrarSp = (q: string) => (q.trim().length >= 2 ? productos.filter(([pid, n]) => !cv.sinPrecio[pid] && n.toLowerCase().includes(q.trim().toLowerCase())) : [])
  const encontradosSp = encontrarSp(buscarSp)
  const setSinPrecio = (pids: string[], v: { hasta?: string } | null) => {
    const next = { ...cv.sinPrecio }
    pids.forEach((pid) => (v ? (next[pid] = v) : delete next[pid]))
    guardar({ ...cv, sinPrecio: next })
  }
  const encontrados = buscar.trim().length >= 2 ? productos.filter(([, n]) => n.toLowerCase().includes(buscar.toLowerCase())).slice(0, 20) : []

  const setParam = (k: keyof Pick<CfgVentas, 'minimo' | 'minimoBajo' | 'umbralSemana' | 'coberturaDias' | 'ventanaDias' | 'loteMin' | 'topeDevolucion' | 'diasNuevo' | 'minimoModelo' | 'umbralModelo' | 'ventaDisenoMin' | 'reservaDeposito' | 'cajaTemplado' | 'diasPedidoTemplado' | 'umbralCaja' | 'minimoTemplado' | 'umbralAccesorio' | 'diasAccesorio'>, v: string) => {
    const n = parseInt(v, 10)
    if (!Number.isFinite(n) || n < 0) return
    guardar({ ...cv, [k]: n })
  }
  const setModo = (tipo: 'modosCat' | 'modosProd', clave: string, m: MarcaModo | null) => {
    const next = { ...cv[tipo] }
    if (m) next[clave] = m
    else delete next[clave]
    guardar({ ...cv, [tipo]: next })
  }

  const filaModo = (tipo: 'modosCat' | 'modosProd', clave: string, nombre: string) => {
    const m = cv[tipo][clave]
    return (
      <div key={clave} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, padding: '5px 8px', border: `1px solid ${color.bg2}`, borderRadius: 6, marginBottom: 4 }}>
        <span style={{ flex: '1 1 180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
        <Select
          value={m?.modo ?? 'ventas'}
          disabled={!puede}
          onChange={(e) => {
            const modo = e.target.value as Modo
            setModo(tipo, clave, modo === 'ventas' && tipo === 'modosCat' ? null : { ...(m || {}), modo, n: modo === 'fija' ? m?.n ?? cv.minimo : undefined })
          }}
          style={{ width: 150 }}
          aria-label={`Modo de ${nombre}`}
        >
          {MODOS.map((o) => (
            <option key={o.v} value={o.v}>{o.label}</option>
          ))}
        </Select>
        {m?.modo === 'fija' && (
          <input type="number" min={0} defaultValue={m.n ?? cv.minimo} disabled={!puede} onChange={(e) => setModo(tipo, clave, { ...m, n: Math.max(0, parseInt(e.target.value, 10) || 0) })} aria-label="Cantidad" style={{ width: 56, padding: '3px 6px', border: `1px solid ${color.line2}`, borderRadius: 6, textAlign: 'center' }} />
        )}
        {m && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: color.mut }}>
            hasta
            <input type="date" defaultValue={m.hasta ?? ''} disabled={!puede} onChange={(e) => setModo(tipo, clave, { ...m, hasta: e.target.value || undefined })} style={{ padding: '2px 4px', border: `1px solid ${color.line2}`, borderRadius: 6 }} />
          </label>
        )}
        {m && puede && (
          <Button size="sm" variant="ghost" onClick={() => setModo(tipo, clave, null)}>
            Sacar
          </Button>
        )}
      </div>
    )
  }

  const param = (k: Parameters<typeof setParam>[0], label: string) => (
    <label style={{ fontSize: 12, color: color.ink2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, border: `1px solid ${color.bg2}`, borderRadius: 7, padding: '5px 8px' }}>
      <span>{label}</span>
      <input type="number" min={0} defaultValue={cv[k]} disabled={!puede} onChange={(e) => setParam(k, e.target.value)} style={{ width: 60, padding: '4px 6px', border: `1px solid ${color.line2}`, borderRadius: 6, textAlign: 'center' }} />
    </label>
  )

  return (
    <Modal abierto={abierto} onCerrar={onClose} titulo={titulo} ancho="ancho" pie={<Button variant="solid" tone="brand" onClick={onClose}>Listo</Button>}>
      <div style={{ fontSize: 12, color: color.mut, marginBottom: 10 }}>
        {puede ? 'Los cambios se aplican para todo el equipo.' : 'Solo Darío y Bruno pueden editar.'} <span style={{ color: shareStatus.color }}>{shareStatus.txt}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 8, marginBottom: 14 }}>
        {param('minimoBajo', 'Mínimo, baja venta')}
        {param('minimo', 'Mínimo, con venta')}
        {param('umbralSemana', 'Con venta desde (por semana)')}
        {bdi && param('minimoModelo', 'Mínimo, modelos de venta alta')}
        {bdi && param('umbralModelo', 'Modelo de venta alta desde (fundas por semana)')}
        {bdi && param('ventaDisenoMin', 'Y el diseño vendió al menos (en los días analizados)')}
        {bdi && param('reservaDeposito', 'Reserva en el depósito (venta online)')}
        {bdi && param('minimoTemplado', 'Vidrios: mínimo en el local')}
        {bdi && param('cajaTemplado', 'Vidrios: unidades por caja')}
        {bdi && param('diasPedidoTemplado', 'Vidrios: pedir caja cuando quedan (días de venta)')}
        {bdi && param('umbralCaja', 'Vidrios: por caja desde (por semana)')}
        {bdi && param('umbralAccesorio', 'Accesorios: cubrir días de venta desde (por semana)')}
        {bdi && param('diasAccesorio', 'Accesorios: días de venta en el local')}
        {param('coberturaDias', 'Días de reserva')}
        {param('ventanaDias', 'Días de ventas analizados')}
        {param('loteMin', 'Reposición mínima')}
        {param('diasNuevo', 'Días como producto nuevo')}
      </div>

      {bdi && (
        <div style={{ marginBottom: 14 }}>
          <Button size="sm" variant="outline" onClick={onOpciones}>
            Productos que no se reponen y categorías
          </Button>
        </div>
      )}

      {/* La campaña cuyas prendas «para exhibir» salen con su etiqueta propia (Darío, 12-oct-2026). */}
      {!bdi && (
        <>
      <div style={{ fontSize: 13, fontWeight: 700, margin: '6px 0' }}>Etiqueta de campaña</div>
      <div style={{ fontSize: 11.5, color: color.mut2, marginBottom: 8 }}>
        Las prendas para exhibir que estén en esta campaña salen con su etiqueta, con el precio de la campaña. El resto, con precio y formas de pago.
      </div>
      <Select
        value={campaniaEtiqueta ?? ''}
        disabled={!puede}
        onChange={(e) => guardarCampania(e.target.value || null)}
        aria-label="Campaña con etiqueta propia"
        style={{ marginBottom: 14, maxWidth: 360 }}
      >
        <option value="">Ninguna</option>
        {campaniaEtiqueta && !campanias.some((c) => c.id === campaniaEtiqueta) && <option value={campaniaEtiqueta}>Campaña terminada</option>}
        {campanias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </Select>
        </>
      )}

      {/* «Por categoría» se sacó el 11-oct-2026 (Darío): nada la usaba —las excepciones van por
          producto— y las categorías de Tienda Nube mezclan «BEST SELLERS» y «(sin categoría)». El
          cálculo todavía la entiende (`modosCat`), por si vuelve. */}
      <div style={{ fontSize: 13, fontWeight: 700, margin: '6px 0' }}>Excepciones por producto</div>
      {!bdi && <div style={{ fontSize: 11.5, color: color.mut2, marginBottom: 8 }}>OUTLET y ACCESORIO ya van como «Todo exhibido».</div>}
      {Object.keys(cv.modosProd).map((pid) => filaModo('modosProd', pid, productos.find(([p]) => p === pid)?.[1] ?? `Producto ${pid}`))}
      {puede && (
        <>
          <input className="mo-input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar producto…" style={{ margin: '6px 0' }} />
          {encontrados
            .filter(([pid]) => !cv.modosProd[pid])
            .map(([pid, n]) => (
              <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 8px' }}>
                <span style={{ flex: 1 }}>{n}</span>
                <Button size="sm" variant="ghost" onClick={() => { setModo('modosProd', pid, { modo: 'exhibido' }); setBuscar('') }}>
                  Agregar
                </Button>
              </div>
            ))}
        </>
      )}

      {/* Darío, 26-oct-2026: confirmar una devolución apaga el producto de la reposición, definitivo;
          se prende acá, a mano. Es la lista `apagados` de siempre (BDI la edita en OpcionesBdi). */}
      {!bdi && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>Sin reponer</div>
          <div style={{ fontSize: 11.5, color: color.mut2, marginBottom: 8 }}>
            Se apagan al confirmar una devolución y no se piden al depósito hasta que los vuelvas a reponer.
          </div>
          {!apagados.length && <div style={{ fontSize: 12, color: color.mut2, marginBottom: 6 }}>Ninguno.</div>}
          {apagados.map((pid) => (
            <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 8px', border: `1px solid ${color.bg2}`, borderRadius: 6, marginBottom: 4 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{productos.find(([p]) => p === pid)?.[1] ?? `Producto ${pid}`}</span>
              {puede && (
                <Button size="sm" variant="ghost" onClick={() => prender(pid)}>
                  Volver a reponer
                </Button>
              )}
            </div>
          ))}
        </>
      )}

      {/* Sin etiqueta de precio es de la ropa: BDI no lo usa. */}
      {!bdi && (
        <>
      {/* Darío, 12-oct-2026: las bikinis van a una caja «todo a $5.000» → sin etiqueta de precio, y
          como todo está exhibido, cada unidad va con alarma. No cambia cuánto se lleva. */}
      <div style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>Sin etiqueta de precio</div>
      <div style={{ fontSize: 11.5, color: color.mut2, marginBottom: 8 }}>Al escanear, cada unidad se marca «con alarma, sin etiqueta de precio».</div>
      {Object.keys(cv.sinPrecio).length > 1 && puede && (
        <div style={{ marginBottom: 6 }}>
          <Button size="sm" variant="ghost" onClick={() => setSinPrecio(Object.keys(cv.sinPrecio), null)}>
            Sacar todos ({Object.keys(cv.sinPrecio).length})
          </Button>
        </div>
      )}
      {Object.entries(cv.sinPrecio).map(([pid, m]) => {
        const nombre = productos.find(([p]) => p === pid)?.[1] ?? `Producto ${pid}`
        return (
          <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, padding: '5px 8px', border: `1px solid ${color.bg2}`, borderRadius: 6, marginBottom: 4 }}>
            <span style={{ flex: '1 1 180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: color.mut }}>
              hasta
              <input type="date" defaultValue={m.hasta ?? ''} disabled={!puede} onChange={(e) => setSinPrecio([pid], { hasta: e.target.value || undefined })} style={{ padding: '2px 4px', border: `1px solid ${color.line2}`, borderRadius: 6 }} />
            </label>
            {puede && (
              <Button size="sm" variant="ghost" onClick={() => setSinPrecio([pid], null)}>
                Sacar
              </Button>
            )}
          </div>
        )
      })}
      {puede && (
        <>
          <input className="mo-input" value={buscarSp} onChange={(e) => setBuscarSp(e.target.value)} placeholder="Buscar producto…" style={{ margin: '6px 0' }} />
          {encontradosSp.length > 1 && (
            <div style={{ padding: '3px 8px' }}>
              <Button size="sm" variant="solid" tone="brand" onClick={() => { setSinPrecio(encontradosSp.map(([pid]) => pid), {}); setBuscarSp('') }}>
                Agregar los {encontradosSp.length}
              </Button>
            </div>
          )}
          {encontradosSp.slice(0, 40).map(([pid, n]) => (
            <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 8px' }}>
              <span style={{ flex: 1 }}>{n}</span>
              <Button size="sm" variant="ghost" onClick={() => { setSinPrecio([pid], {}); setBuscarSp('') }}>
                Agregar
              </Button>
            </div>
          ))}
        </>
      )}
        </>
      )}
    </Modal>
  )
}

const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '')

/** Cómo quedó el armado de hoy: en curso, transferido, o sin confirmar en Gestión Nube. */
function EstadoArmado({ armado, onResolver }: { armado: Armado | null; onResolver: (a: Armado, hecha: boolean) => void }) {
  if (!armado) return null
  const r = resumenArmado(armado.pedido, armado.escaneos || {})
  const quien = armado.persona ? ` · ${armado.persona}` : ''
  const art = articuloDe(armado.linea)
  const devolucion = armado.sentido === 'devolver'
  const ya = armado.transfer?.unidades ?? 0
  const enErp = transfiereEnErp(armado.linea)
  const box = { marginBottom: space[3] }
  if (armado.estado === 'en_curso')
    return (
      <div style={box}>
        <Notice tone="brand" icon="📦">
          Armado en curso{quien} · {r.escaneadas} de {r.pedidas} {art.plural} escaneadas{ya > 0 ? ` · ${ya} ya transferidas` : ''}
        </Notice>
      </div>
    )
  if (armado.estado === 'transferido')
    return (
      <div style={box}>
        <Notice tone="success" icon="✓">
          {devolucion ? 'Devolución transferida' : 'Reposición transferida'} a las {hhmm(armado.cerrado_en)}{quien} · {ya || r.escaneadas} {art.plural}
          {armado.transfer?.transfer_id ? ` · Transferencia ${(armado.transfer.tandas?.length ?? 0) > 1 ? armado.transfer.tandas!.map((t) => t.transfer_id).join(', ') : armado.transfer.transfer_id}` : ''}
          {/* La línea en el ERP ⛔ tiene número de GN: el suyo es el del documento (T-n de ERP › Stock › Transferencias). */}
          {!armado.transfer?.transfer_id && armado.transfer?.erp ? ` · Transferencia ${armado.transfer.tandas?.map((t) => t.erp).filter(Boolean).map((n) => `T-${n}`).join(', ') || `T-${armado.transfer.erp}`}` : ''}. Actualizá el stock para ver la lista nueva.
        </Notice>
      </div>
    )
  if (armado.estado === 'transfiriendo' && !trabado(armado))
    return (
      <div style={box}>
        <Notice tone="brand" icon="⏳">
          Transfiriendo {enErp ? 'en el ERP' : 'en Gestión Nube'}{quien}…
        </Notice>
      </div>
    )
  // 🔑 Línea con la transferencia en el ERP: ⛔ hay nada que buscar en GN. Transferir de nuevo retoma el MISMO documento.
  if (enErp && (armado.estado === 'revisar' || armado.estado === 'transfiriendo'))
    return (
      <div style={box}>
        <Notice tone="danger" icon="⚠">
          <div><b>Transferencia sin confirmar{quien}.</b> Se puede transferir de nuevo: el ERP sigue la misma transferencia, no la duplica.</div>
          <div style={{ display: 'flex', gap: space[2], marginTop: space[2], flexWrap: 'wrap' }}>
            <Button size="sm" variant="solid" tone="brand" onClick={() => onResolver(armado, false)}>Transferir de nuevo</Button>
          </div>
        </Notice>
      </div>
    )
  if (armado.estado === 'revisar' || armado.estado === 'transfiriendo') {
    const u = armado.transfer?.unidadesEnCurso
    return (
      <div style={box}>
        <Notice tone="danger" icon="⚠">
          <div>
            <b>Transferencia sin confirmar{quien}.</b> Puede haberse hecho: no la hagas a mano. Buscá en Gestión Nube una transferencia{' '}
            {devolucion ? 'del local al depósito' : 'del depósito al local'} de las {hhmm(armado.actualizado_en)}
            {u ? ` de ${u} ${u === 1 ? art.singular : art.plural}` : ''} con <b>#{codigoArmado(armado.id)}</b> en la descripción.
          </div>
          {armado.transfer?.descripcion && <div style={{ fontSize: font.sm, marginTop: space[1], opacity: 0.85 }}>Descripción: «{armado.transfer.descripcion}»</div>}
          <div style={{ display: 'flex', gap: space[2], marginTop: space[2], flexWrap: 'wrap' }}>
            <Button size="sm" variant="solid" tone="brand" onClick={() => onResolver(armado, true)}>
              Sí, está en Gestión Nube
            </Button>
            <Button size="sm" variant="outline" onClick={() => onResolver(armado, false)}>
              No está: transferir de nuevo
            </Button>
          </div>
        </Notice>
      </div>
    )
  }
  return null
}
