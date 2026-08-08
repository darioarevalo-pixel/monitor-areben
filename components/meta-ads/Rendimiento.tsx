'use client'

/**
 * Rendimiento — los números de una cuenta publicitaria: totales, embudo transaccional, quién, dónde,
 * evolución diaria, anuncios por campaña y placements.
 *
 * Era el `Resumen` que vivía adentro de `MetaAds.tsx` junto con el router de la sección. Sale a
 * archivo propio en la tanda 2; los formateadores que tenía duplicados se fueron a
 * `lib/meta-ads/formato.ts`.
 *
 * ⚠️ **Es la única pantalla de Meta que NO usa `useCampanias`**, y no es un olvido: pide el detalle
 * de una cuenta (`?account=`), que es otra consulta y otra granularidad. El censo reparte campaña
 * por campaña entre las marcas; esto son los totales de la cuenta, marcas mezcladas incluidas.
 */

import { useEffect, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSesion } from '@/components/SesionProvider'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { useMeta } from '@/components/meta-ads/ContextoMeta'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { pausarAnuncio, traerDetalleCuenta, traerDiagnostico, traerOverview } from '@/lib/meta-ads/cliente'
import { nuevoIdem } from '@/lib/meta-ads/acciones'
import {
  diaCorto, entero, genero, money, pctCien, plataforma, roas, rotuloEstado, rotuloRanking, type Rotulo,
} from '@/lib/meta-ads/formato'
import { opcionesDe, RANGOS, RANGOS_CORTOS, type RangoUI } from '@/lib/meta-ads/rango'
import type {
  AdRow, Campaña, CuentaDiagnostico, CuentaMetaAds, DemografiaFila, DetalleCuenta, FunnelPaso,
  Metricas, RegionFila, RespuestaDiagnostico, VeredictoEscritura,
} from '@/lib/meta-ads/tipos'
import { Badge, Notice, chartColor, color as paleta, useConfirmar, type Tone } from '@/components/ui'

/** Estado de la mutación pausar/activar, compartido hacia las filas de anuncio. */
type EstadoPausa = { status?: string; pending?: boolean; error?: string }
type CtxPausa = {
  puede: boolean
  ov: Record<string, EstadoPausa>
  onToggle: (adId: string, actual: string | null | undefined) => void
}

type Cargable<T> = { fase: 'cargando' } | { fase: 'error'; motivo: string } | { fase: 'ok'; data: T }

export function Rendimiento() {
  const { perfil, marca } = useSesion()
  const { confirmar } = useConfirmar()
  const puedePausar = puedeSub(perfil, marca, 'meta-ads', 'pausar')
  // El rango y la cuenta salen del eje de la sección (y de la URL), no de un estado local: son lo
  // que hace que un link reproduzca la pantalla exacta.
  const { rango: preset, setRango: setPreset, cuenta: cuentaEje, setCuenta } = useMeta()
  // Estados optimistas de pausa/activación, keyeados por cuenta+rango: al cambiar de
  // vista, `ovMap` vuelve a {} solo, sin efecto (evita setState-en-effect).
  const [pausaOv, setPausaOv] = useState<{ key: string; map: Record<string, EstadoPausa> }>({ key: '', map: {} })

  const [ov, setOv] = useState<{ preset: RangoUI; r: Cargable<CuentaMetaAds[]> } | null>(null)
  useEffect(() => {
    let vivo = true
    traerOverview(opcionesDe(preset)).then((r) => {
      if (!vivo) return
      setOv({ preset, r: r.ok ? { fase: 'ok', data: r.dato.cuentas } : { fase: 'error', motivo: r.motivo } })
    })
    return () => { vivo = false }
  }, [preset])

  const ovEstado: Cargable<CuentaMetaAds[]> = !ov || ov.preset !== preset ? { fase: 'cargando' } : ov.r
  const cuentas = ovEstado.fase === 'ok' ? ovEstado.data : []
  // El detalle es de UNA cuenta: el endpoint no agrega varias. Con el eje en «Todas» se abre **la
  // que más gastó en el rango**, no la primera que devolvió Meta — así se abría `BDI ACCESORIOS`,
  // que no gastó un peso, habiendo una cuenta con $608.503 (medido en prod el 8-ago-2026). La
  // pantalla vacía por default enseña que la sección no anda.
  //
  // Los chips escriben en el eje —no en un estado local— para que el desplegable de arriba y ellos
  // no puedan decir cosas distintas.
  const conMasGasto = cuentas.reduce<CuentaMetaAds | null>((mejor, c) => ((c.spend ?? 0) > (mejor?.spend ?? -1) ? c : mejor), null)
  const activaId = (cuentaEje !== 'todas' && cuentas.some((c) => c.id === cuentaEje) ? cuentaEje : conMasGasto?.id) ?? null

  const [det, setDet] = useState<{ key: string; r: Cargable<DetalleCuenta> } | null>(null)
  useEffect(() => {
    if (!activaId) return
    let vivo = true
    const key = `${activaId}|${preset}`
    traerDetalleCuenta(activaId, opcionesDe(preset)).then((r) => {
      if (!vivo) return
      setDet({ key, r: r.ok ? { fase: 'ok', data: r.dato } : { fase: 'error', motivo: r.motivo } })
    })
    return () => { vivo = false }
  }, [activaId, preset])

  const detKey = activaId ? `${activaId}|${preset}` : ''
  const detEstado: Cargable<DetalleCuenta> = !activaId || !det || det.key !== detKey ? { fase: 'cargando' } : det.r

  // Override activo solo si corresponde a la vista actual; al cambiar de cuenta/rango queda {}.
  const ovMap = pausaOv.key === detKey ? pausaOv.map : {}

  async function onToggle(adId: string, actual: string | null | undefined) {
    const efectivo = ovMap[adId]?.status ?? actual
    const activo = efectivo === 'ACTIVE'
    const next: 'ACTIVE' | 'PAUSED' = activo ? 'PAUSED' : 'ACTIVE'
    // El `idem` se genera ACÁ, al apretar, no adentro de `pausarAnuncio`: si naciera al mandar, un
    // doble clic serían dos claves distintas y dos escrituras. Ver `acciones/useAccionMeta`.
    const idem = nuevoIdem()
    const ok = await confirmar({
      titulo: activo ? '¿Pausar este anuncio?' : '¿Reactivar este anuncio?',
      tono: activo ? 'warning' : 'brand',
      ok: activo ? 'Pausar' : 'Reactivar',
      mensaje: activo
        ? 'Deja de mostrarse y de gastar en el acto, hasta que alguien lo vuelva a activar.'
        : 'Vuelve a mostrarse y a consumir presupuesto en el acto.',
    })
    if (!ok) return
    const set = (v: EstadoPausa) => setPausaOv((o) => {
      const base = o.key === detKey ? o.map : {}
      return { key: detKey, map: { ...base, [adId]: { ...base[adId], ...v } } }
    })
    set({ pending: true, error: undefined })
    const r = await pausarAnuncio(adId, next, idem)
    set(r.ok ? { status: r.dato.status, pending: false } : { pending: false, error: r.motivo })
  }

  const pausa: CtxPausa = { puede: puedePausar, ov: ovMap, onToggle }
  const zonaActiva = cuentas.find((c) => c.id === activaId)?.zona || ''

  return (
    <div>
      {/* Rango + info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: paleta.ink2, display: 'flex', alignItems: 'center', gap: 6 }}>
          Rango:
          <select value={preset} onChange={(e) => setPreset(e.target.value as RangoUI)} style={{ padding: '6px 10px', border: `1px solid ${paleta.line2}`, borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            {RANGOS.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
          </select>
        </label>
        {/* En rangos cortos la zona horaria de la cuenta ES el dato: "Hoy" lo resuelve Meta allá,
            así que si la cuenta está en otro huso, el corte del día no es el de acá. */}
        {RANGOS_CORTOS.has(preset) && zonaActiva && (
          <span style={{ fontSize: 12, color: paleta.mut2 }} title="El día lo corta Meta en la zona horaria de la cuenta publicitaria, no en la tuya">
            en hora de {zonaActiva}
          </span>
        )}
        <InfoPopover titulo="Sobre estos números">
          <p>De la API de Marketing de Meta (solo lectura). Las <b>ventas</b> y el <b>ROAS</b> usan las compras <i>omni_purchase</i> con ventana de atribución <b>7 días clic / 1 día view</b>.</p>
          <p>Si el píxel/CAPI de Meta no está midiendo compras, ventas y ROAS aparecen en <b>0</b> aunque haya gasto — es un tema de configuración del píxel, no del reporte.</p>
        </InfoPopover>
      </div>

      {/* Selector de cuenta (chips) */}
      {ovEstado.fase === 'error' ? (
        <div className="card" style={{ color: paleta.danger }}>
          No se pudieron traer las cuentas de Meta: {ovEstado.motivo}
          <div style={{ fontSize: 12, color: paleta.mut2, marginTop: 6 }}>Si dice &quot;Meta Ads no configurado&quot;, falta <code>META_ADS_TOKEN</code> en el servidor.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {ovEstado.fase === 'cargando' ? (
            <span style={{ fontSize: 13, color: paleta.mut2 }}>Cargando cuentas…</span>
          ) : (
            cuentas.map((c) => <ChipCuenta key={c.id} c={c} activa={c.id === activaId} onClick={() => setCuenta(c.id)} />)
          )}
        </div>
      )}

      {/* Detalle de la cuenta activa */}
      {activaId && (
        detEstado.fase === 'cargando' ? (
          <div className="card" style={{ color: paleta.mut2 }}>Cargando anuncios, evolución y placements…</div>
        ) : detEstado.fase === 'error' ? (
          <div className="card" style={{ color: paleta.danger }}>No se pudo traer el detalle: {detEstado.motivo}</div>
        ) : (
          // El nombre sale del selector, no del detalle: el overview es el único que
          // conoce el portfolio dueño cuando la cuenta no tiene nombre propio.
          <Detalle d={detEstado.data} pausa={pausa} nombre={cuentas.find((c) => c.id === activaId)?.nombre} />
        )
      )}

      {esAdmin(perfil) && <DiagnosticoToken />}
    </div>
  )
}

/**
 * ¿El token puede escribir en Meta? Solo admin, plegado y a pedido.
 *
 * Existe porque para accionar sobre la pauta hay que abrir **dos candados distintos** —el scope
 * `ads_management` del token y el permiso "Administrar campañas" del system user sobre cada
 * cuenta— y desde afuera fallan igual. Acá se ven separados: se arregla en Meta, se aprieta de
 * nuevo, y el veredicto cambia.
 *
 * 🔑 **El sondeo de escritura NO corre solo.** Es una escritura de verdad (inofensiva: le pone a
 * una campaña el nombre que ya tiene), y algo que escribe en Meta no puede dispararse por el solo
 * hecho de que alguien abrió la pantalla.
 */
function DiagnosticoToken() {
  const [r, setR] = useState<Cargable<RespuestaDiagnostico> | null>(null)
  const [probando, setProbando] = useState(false)

  async function pedir(probar: boolean) {
    setProbando(probar)
    setR({ fase: 'cargando' })
    const d = await traerDiagnostico(probar)
    setR(d.ok ? { fase: 'ok', data: d.dato } : { fase: 'error', motivo: d.motivo })
    setProbando(false)
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: paleta.mut, letterSpacing: 0 }}>Diagnóstico del token de Meta</div>
        <span style={{ fontSize: 11, color: paleta.mut2 }}>solo administradores</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => pedir(false)} style={{ height: 'auto', padding: '6px 12px', fontSize: 12, border: `1px solid ${paleta.line2}`, borderRadius: 8, background: paleta.bg2, cursor: 'pointer' }}>
            Comprobar
          </button>
          {r?.fase === 'ok' && (
            <button
              onClick={() => pedir(true)}
              title="Le pone a una campaña el nombre que ya tiene. No cambia nada, pero es una escritura real."
              style={{ height: 'auto', padding: '6px 12px', fontSize: 12, border: `1px solid ${paleta.line2}`, borderRadius: 8, background: paleta.bg2, cursor: 'pointer' }}
            >
              {probando ? 'Probando…' : 'Probar a escribir'}
            </button>
          )}
        </div>
      </div>

      {r?.fase === 'cargando' && <div style={{ fontSize: 12, color: paleta.mut2, marginTop: 10 }}>Preguntándole a Meta…</div>}
      {r?.fase === 'error' && <div style={{ fontSize: 12, color: paleta.danger, marginTop: 10 }}>{r.motivo}</div>}

      {r?.fase === 'ok' && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Si Meta informó los scopes, la respuesta ya está y no hace falta ni probar a
              escribir: sin `ads_management` el token no escribe, sea cual sea el permiso de las
              cuentas. Se dice arriba de todo para no hacer leer tres filas. */}
          {r.data.scopes !== null && !r.data.scopes.includes('ads_management') && (
            <Notice tone="warning">
              <div style={{ fontSize: 12 }}>
                <b>El token no puede escribir:</b> le falta el scope <code>ads_management</code>. Ninguna acción
                sobre la pauta va a funcionar hasta que se reemplace, incluido el botón de pausar anuncios que ya está
                en el detalle de cada cuenta.
                <div style={{ color: paleta.mut2, marginTop: 4 }}>
                  Se arregla generando un token nuevo en el system user <code>monitor-ads</code> con{' '}
                  <code>ads_read</code> + <code>ads_management</code>, y reemplazando <code>META_ADS_TOKEN</code> en Vercel.
                </div>
              </div>
            </Notice>
          )}
          <div style={{ fontSize: 12, color: paleta.ink2 }}>
            <b>Scopes del token:</b>{' '}
            {r.data.scopes === null
              // Que Meta no conteste `/me/permissions` con un token de system user es normal y NO
              // significa que no tenga scopes. Decir "ninguno" acá mandaría a arreglar lo que anda.
              ? <span style={{ color: paleta.mut2 }}>Meta no los informó{r.data.scopesMotivo ? ` (${r.data.scopesMotivo})` : ''} — con un token de system user es normal; lo que manda es la prueba de abajo.</span>
              : r.data.scopes.join(', ') || <span style={{ color: paleta.mut2 }}>ninguno</span>}
          </div>
          {r.data.cuentas.map((c) => <FilaDiagnostico key={c.id} c={c} />)}
        </div>
      )}
    </div>
  )
}

/** Qué hacer con cada veredicto, en castellano y con el paso siguiente. */
const VEREDICTOS: Record<VeredictoEscritura, { txt: string; tone: Tone; que: string }> = {
  'escribe': { txt: 'Escribe', tone: 'success', que: 'Los dos candados están abiertos: esta cuenta se puede accionar desde el monitor.' },
  'permiso-de-cuenta-ok': { txt: 'Puede administrar', tone: 'warning', que: 'El system user administra la cuenta. Falta probar el scope del token con «Probar a escribir».' },
  'sin-permiso-de-cuenta': { txt: 'Solo lectura', tone: 'danger', que: 'En business.facebook.com, al system user monitor-ads subirle esta cuenta de «Ver rendimiento» a «Administrar campañas».' },
  'tareas-desconocidas': { txt: 'No se sabe', tone: 'warning', que: 'Meta no informó user_tasks para este token, y vacío NO quiere decir que no administre: con system users suele venir así. Lo resuelve la prueba de escritura, una vez que el token tenga ads_management.' },
  'sin-scope': { txt: 'Falta ads_management', tone: 'danger', que: 'El permiso de la cuenta está bien, pero al token le falta el scope. Generar uno nuevo con ads_read + ads_management y reemplazar META_ADS_TOKEN en Vercel.' },
  'token-invalido': { txt: 'Token inválido', tone: 'danger', que: 'El token venció o fue revocado. Generar uno nuevo en el mismo system user.' },
  'rechazo-desconocido': { txt: 'Meta lo rechazó', tone: 'danger', que: 'El código de error de abajo es el que hay que mirar: no es ninguno de los dos casos conocidos.' },
  'no-se-pudo-leer': { txt: 'No se pudo leer', tone: 'danger', que: 'Ni siquiera se pudieron leer los permisos de esta cuenta.' },
}

function FilaDiagnostico({ c }: { c: CuentaDiagnostico }) {
  const v = VEREDICTOS[c.veredicto]
  return (
    <div style={{ border: `1px solid ${paleta.line2}`, borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{c.nombre}</span>
        <Badge tone={v.tone}>{v.txt}</Badge>
        {c.tareas && c.tareas.length > 0 && <span style={{ fontSize: 11, color: paleta.mut2 }}>user_tasks: {c.tareas.join(', ')}</span>}
        {/* El mínimo viene en la unidad menor de la moneda (ARS: 150000 = $1.500). Se muestra ya
            convertido porque es el número con el que se va a validar el presupuesto. */}
        {typeof c.minDiarioCrudo === 'number' && c.minDiarioCrudo > 0 && (
          <span style={{ fontSize: 11, color: paleta.mut2 }}>mínimo diario: {money(c.minDiarioCrudo / 100, c.moneda || '')}</span>
        )}
        {c.minimosMotivo && <span style={{ fontSize: 11, color: paleta.mut2 }} title={c.minimosMotivo}>sin mínimos</span>}
      </div>
      <div style={{ fontSize: 12, color: paleta.ink2, marginTop: 4 }}>{v.que}</div>
      {c.detalle && <div style={{ fontSize: 11, color: paleta.danger, marginTop: 4 }}>{c.detalle}</div>}
      {c.prueba && (
        <div style={{ fontSize: 11, color: paleta.mut2, marginTop: 4 }}>
          {c.prueba.corrida === false
            ? `No se pudo probar: ${c.prueba.motivo}`
            : c.prueba.ok
              ? `Prueba de escritura OK sobre «${c.prueba.campania}» (no se cambió nada).`
              : `Meta rechazó la prueba sobre «${c.prueba.campania}»${c.prueba.codigo ? ` (#${c.prueba.codigo})` : ''}: ${c.prueba.detalle}`}
        </div>
      )}
    </div>
  )
}

function ChipCuenta({ c, activa, onClick }: { c: CuentaMetaAds; activa: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`Cuenta ${c.id}`}
      style={{
        // `height: auto` no es de adorno: la regla legacy `.shell-content button` le fija a
        // TODO botón la altura de un control (una línea), y este tiene dos → el importe se
        // salía de la caja y el borde inferior lo cruzaba como si estuviera tachado.
        height: 'auto',
        border: `1px solid ${activa ? paleta.brandSolid : paleta.line2}`,
        background: activa ? paleta.brandBg : paleta.surface,
        borderRadius: 10,
        padding: '8px 12px',
        cursor: 'pointer',
        textAlign: 'left',
        minWidth: 140,
        lineHeight: 1.35,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: activa ? paleta.brand : paleta.ink2 }}>{c.nombre}</div>
      <div style={{ fontSize: 12, fontWeight: 400, color: paleta.mut }}>{c.error ? 'error' : c.sinDatos ? 'sin gasto en el rango' : money(c.spend, c.moneda)}</div>
    </button>
  )
}

function Detalle({ d, pausa, nombre }: { d: DetalleCuenta; pausa: CtxPausa; nombre?: string }) {
  const moneda = d.cuenta.moneda
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Totales */}
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 10 }}>Totales · {nombre || d.cuenta.nombre}</div>
        <TilesTotales t={d.totales} moneda={moneda} hookRate={d.video?.hookRate} />
      </div>

      {/* Las pautas de venta, aparte */}
      {d.venta && d.venta.campañas > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: paleta.mut, letterSpacing: 0 }}>Solo las pautas de venta</div>
            <InfoPopover titulo="Por qué este ROAS y no el de arriba">
              <p>El ROAS de la cuenta mezcla <b>todas</b> las campañas, incluidas las de tráfico o reconocimiento, que ni
              siquiera están optimizando para que alguien compre. Eso lo hunde sin que signifique nada.</p>
              <p>Acá van solo las campañas cuyo objetivo en Meta es vender, que son las que se juzgan por el retorno.
              A las de tráfico se les mira el <b>costo por visita al perfil</b>, en su propia fila más abajo.</p>
            </InfoPopover>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: 10 }}>
            <Tile label="ROAS de venta" valor={roas(d.venta.roas)} destacado color={paleta.success} />
            <Tile label="Gasto en venta" valor={money(d.venta.spend, moneda)} />
            <Tile label="Ingresos" valor={money(d.venta.revenue, moneda)} />
            <Tile label="Compras" valor={entero(d.venta.purchases)} />
            <Tile label="Campañas" valor={`${d.venta.campañas} de ${d.campañas.length}`} />
          </div>
        </div>
      )}

      {/* Diagnóstico: aparece solo si NINGUNA campaña trajo visitas al perfil. El nombre exacto de
          esa acción no está documentado de forma estable en Meta, así que en vez de adivinar se
          muestra lo que la cuenta sí devolvió — con eso se ajusta el patrón de una. */}
      {d.campañas.length > 0 && !d.campañas.some((c) => (c.totales.perfil || 0) > 0 || (c.totales.seguidores || 0) > 0) && (
        <Notice tone="neutral" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12 }}>
            <b>Meta no devolvió visitas al perfil ni seguidores nuevos</b> en esta cuenta y este rango,
            así que no se puede calcular su costo. Puede ser que no haya habido, o que esas acciones
            se llamen distinto de lo que buscamos.
            <div style={{ color: paleta.mut2, marginTop: 4 }}>
              Acciones que sí trajo:{' '}
              {(d.accionesVistas || []).length ? (d.accionesVistas || []).join(', ') : 'ninguna'}
            </div>
          </div>
        </Notice>
      )}

      {/* Del clic a la compra. Se llamaba "Embudo de compra" y se renombró cuando entró la pestaña
          de etapas: son dos embudos distintos y compartir la palabra los volvía indistinguibles.
          Este mide QUÉ PASA con quien ya hizo clic; aquel, A QUIÉN le habla la pauta. */}
      {d.funnel && d.funnel.some((p) => p.count > 0) && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0 }}>Del clic a la compra</div>
            <InfoPopover titulo="Del clic a la compra">
              <p>
                De cada paso, cuántas personas lo hicieron y cuánto costó cada resultado (gasto ÷ cantidad).
                La barra muestra la caída respecto del primer paso. Sirve para ver <b>dónde se corta</b> el camino a la compra.
              </p>
              <p>
                Mide qué pasa con quien <b>ya hizo clic</b>. A quién le estás hablando lo mirás en el
                <b> Embudo</b>.
              </p>
            </InfoPopover>
          </div>
          <EmbudoClics pasos={d.funnel} moneda={moneda} />
        </div>
      )}

      {/* Quién (edad × género) */}
      {d.demografia && d.demografia.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 10 }}>Quién compra · edad y género</div>
          <TablaDemografia rows={d.demografia} moneda={moneda} />
        </div>
      )}

      {/* Dónde (región) */}
      {d.regiones && d.regiones.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 10 }}>Dónde · por región</div>
          <TablaRegiones rows={d.regiones} moneda={moneda} />
        </div>
      )}

      {/* Evolución diaria */}
      {d.daily.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 10 }}>Evolución diaria</div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d.daily} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColor.grid} />
                <XAxis dataKey="date" tickFormatter={diaCorto} tick={{ fontSize: 11, fill: paleta.mut2 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: paleta.mut2 }} width={48} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: paleta.mut2 }} width={48} />
                <Tooltip
                  labelFormatter={(v) => diaCorto(String(v))}
                  formatter={(val: number, name) => [name === 'Gasto' || name === 'Ingresos' ? money(val, moneda) : entero(val), name]}
                />
                <Bar yAxisId="l" dataKey="spend" name="Gasto" fill={chartColor.brand} radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" dataKey="revenue" name="Ingresos" stroke={chartColor.success} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Anuncios por campaña */}
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 10 }}>Anuncios por campaña</div>
        {d.campañas.length === 0 ? (
          <div style={{ fontSize: 13, color: paleta.mut2 }}>No hay anuncios con gasto en este rango.</div>
        ) : (
          d.campañas.map((c) => <CampañaBloque key={c.id} c={c} moneda={moneda} accountId={d.cuenta.id} pausa={pausa} accionesVistas={d.accionesVistas} />)
        )}
      </div>

      {/* Placements */}
      {d.placements.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 10 }}>Por plataforma y ubicación</div>
          <TablaPlacements rows={d.placements} moneda={moneda} />
        </div>
      )}
    </div>
  )
}

function TilesTotales({ t, moneda, hookRate }: { t: Metricas; moneda: string; hookRate?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: 10 }}>
      <Tile label="Gasto" valor={money(t.spend, moneda)} destacado />
      <Tile label="Compras" valor={entero(t.purchases)} />
      <Tile label="Ingresos" valor={money(t.revenue, moneda)} destacado color={paleta.success} />
      <Tile label="ROAS" valor={roas(t.roas)} destacado color={paleta.success} />
      <Tile label="Impresiones" valor={entero(t.impressions)} />
      <Tile label="Alcance" valor={entero(t.reach)} />
      <Tile label="CTR" valor={pctCien(t.ctr)} />
      <Tile label="CPC" valor={money(t.cpc, moneda)} />
      {hookRate ? <Tile label="Hook (video)" valor={pctCien(hookRate)} /> : null}
    </div>
  )
}

// Cada paso con su cantidad, costo por resultado y una barra proporcional al primer paso.
function EmbudoClics({ pasos, moneda }: { pasos: FunnelPaso[]; moneda: string }) {
  const base = pasos[0]?.count || 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pasos.map((p) => {
        const pctBar = base ? Math.max(2, (p.count / base) * 100) : 0
        return (
          <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 130, fontSize: 13, color: paleta.ink2 }}>{p.label}</div>
            <div style={{ flex: 1, minWidth: 120, background: paleta.bg2, borderRadius: 6, height: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{ width: `${pctBar}%`, background: paleta.brandBorder, height: '100%', borderRadius: 6 }} />
              <span style={{ position: 'absolute', left: 8, top: 0, lineHeight: '22px', fontSize: 12, fontWeight: 600, color: paleta.brand }}>{entero(p.count)}</span>
            </div>
            <div style={{ width: 130, textAlign: 'right', fontSize: 12, color: paleta.mut }}>
              {p.count ? `${money(p.costo, moneda)} c/u` : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TablaDemografia({ rows, moneda }: { rows: DemografiaFila[]; moneda: string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: paleta.mut2, fontSize: 11, letterSpacing: '.03em' }}>
            <Th left>Género</Th><Th left>Edad</Th><Th>Gasto</Th><Th>Compras</Th><Th>Ingresos</Th><Th>ROAS</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${paleta.bg2}` }}>
              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{genero(r.gender)}</td>
              <td style={{ padding: '7px 10px', color: paleta.mut }}>{r.age || '—'}</td>
              <Td>{money(r.spend, moneda)}</Td>
              <Td>{entero(r.purchases)}</Td>
              <Td>{money(r.revenue, moneda)}</Td>
              <Td color={r.spend && r.revenue ? paleta.success : paleta.mut2}>{roas(r.spend ? r.revenue / r.spend : 0)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TablaRegiones({ rows, moneda }: { rows: RegionFila[]; moneda: string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: paleta.mut2, fontSize: 11, letterSpacing: '.03em' }}>
            <Th left>Región</Th><Th>Gasto</Th><Th>Compras</Th><Th>Ingresos</Th><Th>ROAS</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${paleta.bg2}` }}>
              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{r.region}</td>
              <Td>{money(r.spend, moneda)}</Td>
              <Td>{entero(r.purchases)}</Td>
              <Td>{money(r.revenue, moneda)}</Td>
              <Td color={r.spend && r.revenue ? paleta.success : paleta.mut2}>{roas(r.spend ? r.revenue / r.spend : 0)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Tile({ label, valor, destacado, color }: { label: string; valor: string; destacado?: boolean; color?: string }) {
  return (
    <div style={{ background: paleta.bg, border: `1px solid ${paleta.line}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: paleta.mut2, letterSpacing: 0 }}>{label}</div>
      <div style={{ fontSize: destacado ? 19 : 16, fontWeight: 700, color: color ?? paleta.ink, marginTop: 2 }}>{valor}</div>
    </div>
  )
}

function CampañaBloque({ c, moneda, accountId, pausa, accionesVistas }: { c: Campaña; moneda: string; accountId: string; pausa: CtxPausa; accionesVistas?: string[] }) {
  const [abierta, setAbierta] = useState(true)
  return (
    <div style={{ border: `1px solid ${paleta.line}`, borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setAbierta((v) => !v)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 12px', background: paleta.bg, border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: paleta.ink }}>
          <span style={{ color: paleta.mut2, marginRight: 6 }}>{abierta ? '▾' : '▸'}</span>{c.nombre}
          {c.tipo && c.tipo !== 'otro' ? (
            <Badge tone={c.tipo === 'venta' ? 'success' : 'brand'}>{c.tipo === 'venta' ? 'venta' : 'tráfico'}</Badge>
          ) : null}
          <span style={{ color: paleta.mut2, fontWeight: 400 }} title={c.objetivo ? `Objetivo en Meta: ${c.objetivo}` : 'Meta no devolvió el objetivo de esta campaña'}>
            {' '}· {c.ads.length} anuncio{c.ads.length === 1 ? '' : 's'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: paleta.ink2, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span>Gasto <b>{money(c.totales.spend, moneda)}</b></span>
          {/* Las métricas salen del DATO, no de cómo clasifiqué la campaña: si Meta devuelve
              visitas al perfil se muestran, sea cual sea el objetivo, y si hay compras se
              muestra el ROAS. Clasificar mal no puede esconder un número que existe. */}
          {(c.totales.perfil || 0) > 0 && (
            <>
              <span>Visitas al perfil <b>{entero(c.totales.perfil)}</b></span>
              <span style={{ color: paleta.brand }}>Costo por visita <b>{money(c.totales.costoPerfil, moneda)}</b></span>
            </>
          )}
          {(c.totales.seguidores || 0) > 0 && (
            <>
              <span>Seguidores <b>{entero(c.totales.seguidores)}</b></span>
              <span style={{ color: paleta.brand }}>Costo por seguidor <b>{money(c.totales.costoSeguidor, moneda)}</b></span>
            </>
          )}
          {c.tipo === 'trafico' && !(c.totales.perfil || 0) && !(c.totales.seguidores || 0) && (
            <span
              style={{ color: paleta.mut2 }}
              title={`Meta no devolvió visitas al perfil ni seguidores. Las acciones que sí trajo esta cuenta: ${(accionesVistas || []).join(', ') || 'ninguna'}`}
            >
              Sin visitas ni seguidores
            </span>
          )}
          {(c.tipo !== 'trafico' || c.totales.purchases > 0) && (
            <>
              <span>Compras <b>{entero(c.totales.purchases)}</b></span>
              <span style={{ color: paleta.success }}>ROAS <b>{roas(c.totales.roas)}</b></span>
            </>
          )}
        </div>
      </button>
      {abierta && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: paleta.mut2, fontSize: 11, letterSpacing: '.03em' }}>
                <Th left>Anuncio</Th><Th>Gasto</Th><Th>Compras</Th><Th>Ingresos</Th><Th>ROAS</Th><Th>CTR</Th><Th>CPC</Th><Th>Impr.</Th>
              </tr>
            </thead>
            <tbody>
              {c.ads.map((a) => <FilaAd key={a.ad_id} a={a} moneda={moneda} accountId={accountId} pausa={pausa} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Deep-link a Ads Manager con el anuncio ya seleccionado: ahí Bruno pausa/edita con su propio login.
const adsManagerUrl = (accountId: string, adId: string) =>
  `https://www.facebook.com/adsmanager/manage/ads?act=${accountId}&selected_ad_ids=${adId}`

function LinkAccion({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: paleta.brandSolid, textDecoration: 'none', fontWeight: 500 }}>
      {children}
    </a>
  )
}

function FilaAd({ a, moneda, accountId, pausa }: { a: AdRow; moneda: string; accountId: string; pausa: CtxPausa }) {
  const ovAd = pausa.ov[a.ad_id]
  const statusEfectivo = ovAd?.status ?? a.status
  // Un ANUNCIO es masculino: «Pausado», no «Pausada». Lo decide `formato.ts`, que es el mismo lugar
  // desde donde la tabla de campañas pide el femenino.
  const estado = rotuloEstado(statusEfectivo, 'm')
  const activo = statusEfectivo === 'ACTIVE'
  const puedeToggle = pausa.puede && (activo || statusEfectivo === 'PAUSED') // solo si sabemos el estado real
  const rk = a.ranking
  const badges = [
    estado,
    rk ? rotuloRanking(rk.quality) : null,
    rk ? rotuloRanking(rk.conversion) : null,
  ].filter((b): b is Rotulo => b !== null)
  const gestion = adsManagerUrl(accountId, a.ad_id)
  return (
    <tr style={{ borderTop: `1px solid ${paleta.bg2}` }}>
      <td style={{ padding: '7px 10px', maxWidth: 340 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {/* Preview del creativo → abre el aviso publicado (o Ads Manager si no hay permalink). */}
          <a
            href={a.permalink || gestion}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver el aviso"
            style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 8, overflow: 'hidden', border: `1px solid ${paleta.line}`, background: paleta.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {a.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.thumb} alt="" width={46} height={46} style={{ width: 46, height: 46, objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 18 }}>🖼️</span>
            )}
          </a>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, color: paleta.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.ad_name}</div>
            {a.adset_name ? <div style={{ fontSize: 11, color: paleta.mut2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.adset_name}</div> : null}
            {(badges.length > 0 || (a.video && a.video.hookRate > 0)) && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                {badges.map((b, i) => <Badge key={i} tone={b.tone}>{b.txt}</Badge>)}
                {a.video && a.video.hookRate > 0 ? <span style={{ fontSize: 11, color: paleta.mut }}>Hook {pctCien(a.video.hookRate)}</span> : null}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
              {puedeToggle && (
                <button
                  onClick={() => pausa.onToggle(a.ad_id, statusEfectivo)}
                  disabled={ovAd?.pending}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: ovAd?.pending ? paleta.mut2 : activo ? paleta.warningInk : paleta.success,
                    background: ovAd?.pending ? paleta.bg2 : activo ? paleta.warningBg : paleta.successBg,
                    border: `1px solid ${activo ? paleta.warningBorder : paleta.successBorder}`,
                    borderRadius: 6,
                    padding: '2px 9px',
                    cursor: ovAd?.pending ? 'default' : 'pointer',
                  }}
                >
                  {ovAd?.pending ? '…' : activo ? '⏸ Pausar' : '▶ Activar'}
                </button>
              )}
              <LinkAccion href={gestion}>Ads Manager ↗</LinkAccion>
              {a.permalink ? <LinkAccion href={a.permalink}>Ver aviso ↗</LinkAccion> : null}
              {ovAd?.error ? <span style={{ fontSize: 11, color: paleta.danger }}>No se pudo: {ovAd.error}</span> : null}
            </div>
          </div>
        </div>
      </td>
      <Td>{money(a.spend, moneda)}</Td>
      <Td>{entero(a.purchases)}</Td>
      <Td>{money(a.revenue, moneda)}</Td>
      <Td color={a.roas ? paleta.success : paleta.mut2}>{roas(a.roas)}</Td>
      <Td>{pctCien(a.ctr)}</Td>
      <Td>{money(a.cpc, moneda)}</Td>
      <Td>{entero(a.impressions)}</Td>
    </tr>
  )
}

function TablaPlacements({ rows, moneda }: { rows: { platform: string; position: string; spend: number; purchases: number; revenue: number }[]; moneda: string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: paleta.mut2, fontSize: 11, letterSpacing: '.03em' }}>
            <Th left>Plataforma</Th><Th left>Ubicación</Th><Th>Gasto</Th><Th>Compras</Th><Th>Ingresos</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${paleta.bg2}` }}>
              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{plataforma(p.platform)}</td>
              <td style={{ padding: '7px 10px', color: paleta.mut }}>{p.position || '—'}</td>
              <Td>{money(p.spend, moneda)}</Td>
              <Td>{entero(p.purchases)}</Td>
              <Td>{money(p.revenue, moneda)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, left }: { children?: React.ReactNode; left?: boolean }) {
  return <th style={{ padding: '4px 10px', textAlign: left ? 'left' : 'right', fontWeight: 600 }}>{children}</th>
}
function Td({ children, color }: { children?: React.ReactNode; color?: string }) {
  return <td style={{ padding: '7px 10px', textAlign: 'right', color: color ?? paleta.ink2 }}>{children}</td>
}
