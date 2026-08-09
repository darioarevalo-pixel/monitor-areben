'use client'

/**
 * Automatizaciones — las seis reglas que miran la foto diaria y proponen.
 *
 * # Lo que esta pantalla tiene que dejar claro, y por qué está armada así
 *
 * 1. **Ninguna regla ejecuta.** Se dice arriba de todo y una sola vez. Es la diferencia entre esto
 *    y lo que vende cualquier herramienta de automatización de Meta, y si no está escrito, alguien
 *    va a suponer lo contrario y no va a prender nada.
 * 2. 🎯 **El umbral no se define: se calibra.** Cada regla que pide un número trae el dial con el
 *    calibrador al lado, que dice cuántas veces habría saltado en 90 días y sobre cuántas cosas
 *    distintas. Preguntar «¿cuál es tu ROAS objetivo?» en abstracto no lo contesta nadie; mostrar
 *    «con 2,5 habría gritado 43 veces» se contesta solo.
 * 3. **Una regla apagada dice POR QUÉ.** Hay dos motivos distintos y se ven distinto: le falta un
 *    umbral (lo arregla una persona) o le falta historial (lo arregla el cron, solo). Un cartel
 *    genérico dejaría a alguien buscando un campo que no existe.
 */

import { useCallback, useMemo, useState } from 'react'
import { useMeta } from '@/components/meta-ads/ContextoMeta'
import { useReglas } from '@/components/meta-ads/reglas/useReglas'
import { calibrarRegla, guardarRegla, guardarUmbrales } from '@/lib/meta-ads/cliente'
import { decimal, entero, plata, roas as roasTxt } from '@/lib/meta-ads/formato'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import type {
  Calibracion, ClavePreset, ClaveUmbral, ContextoLinea, DefPreset, DefUmbral, Regla, RespuestaReglas,
} from '@/lib/meta-ads/reglas'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import {
  Button, Card, EmptyState, Input, Notice, SectionCard, StatusPill, color, font, radius, space, weight,
  useToast,
} from '@/components/ui'

export function Automatizaciones() {
  const { linea, visibles } = useMeta()
  const r = useReglas()

  if (r.estado.fase === 'cargando') return <Card style={{ color: color.mut2 }}>Leyendo las automatizaciones…</Card>
  if (r.estado.fase === 'error') {
    return <Notice tone="danger">No se pudieron leer las automatizaciones: {r.estado.motivo}</Notice>
  }
  const d = r.estado.data

  // El selector de arriba puede decir «Todas»; acá hace falta UNA marca, porque el ROAS objetivo de
  // BDI no es el de Stunned y una regla cross-marca no tendría contra qué compararse.
  const lineas: LineaPauta[] = linea === 'todas' ? visibles : [linea]
  if (!lineas.length) {
    return <EmptyState title="No hay ninguna marca que puedas ver" hint="Es un tema de permisos, no de Meta." dashed />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Notice tone="brand">
        <b>Ninguna de estas reglas toca la pauta.</b> Corren solas una vez por día, leen la foto
        diaria —no le preguntan nada a Meta— y dejan lo que encuentran en el Panel, en «Qué hay que
        decidir». Escribir en Meta sigue siendo apretar un botón.
      </Notice>

      {lineas.map((l) => (
        <BloqueLinea key={l} linea={l} d={d} recargar={r.recargar} />
      ))}
    </div>
  )
}

function BloqueLinea({ linea, d, recargar }: { linea: LineaPauta; d: RespuestaReglas; recargar: () => void }) {
  const ctx = d.contexto[linea]
  const puede = d.puedeEditar.includes(linea)
  const porPreset = useMemo(
    () => new Map(d.reglas.filter((x) => x.linea === linea).map((x) => [x.preset, x])),
    [d.reglas, linea],
  )

  return (
    <SectionCard
      title={ETIQUETA_LINEA[linea]}
      subtitle={
        ctx && ctx.dias
          ? `Medido sobre ${ctx.dias} días con gasto · ${plata(ctx.gastoTotal)} · ROAS ${roasTxt(ctx.roasMedio)} · CPA ${ctx.cpaMedio ? plata(ctx.cpaMedio) : 'sin compras'}`
          : 'Todavía no hay días con gasto en la foto diaria de esta marca.'
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {d.presets.map((p) => (
          <FilaPreset
            key={p.clave}
            preset={p}
            linea={linea}
            regla={porPreset.get(p.clave) ?? null}
            umbralLinea={d.umbrales[linea] || {}}
            definicion={d.definicionUmbrales}
            ctx={ctx}
            puede={puede}
            dias={d.dias}
            recargar={recargar}
          />
        ))}
      </div>
    </SectionCard>
  )
}

function FilaPreset({ preset, linea, regla, umbralLinea, definicion, ctx, puede, dias, recargar }: {
  preset: DefPreset & { clave: ClavePreset }
  linea: LineaPauta
  regla: Regla | null
  umbralLinea: Partial<Record<ClaveUmbral, number | null>>
  definicion: Record<ClaveUmbral, DefUmbral>
  ctx: ContextoLinea | undefined
  puede: boolean
  dias: number
  recargar: () => void
}) {
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Los umbrales que esta regla necesita y que NO se deducen: los que hay que elegir mirando.
  const aElegir = preset.requiere.filter((u) => !definicion[u].derivable)

  const activa = !!regla?.activa

  const alternar = useCallback(async () => {
    if (!puede) return
    setGuardando(true)
    const r = await guardarRegla({
      preset: preset.clave,
      linea,
      parametros: regla?.parametros ?? {},
      activa: !activa,
    })
    setGuardando(false)
    if (!r.ok) { toast.error(r.motivo); return }
    toast.ok(!activa ? `«${preset.rotulo}» prendida` : `«${preset.rotulo}» apagada`)
    recargar()
  }, [puede, preset, linea, regla, activa, toast, recargar])

  return (
    <div style={{ border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[3] }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: '1 1 340px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], flexWrap: 'wrap' }}>
            <span style={{ fontSize: font.base, fontWeight: weight.semibold }}>{preset.rotulo}</span>
            {activa
              ? <StatusPill tone="success" label="Prendida" />
              : <StatusPill tone="neutral" label="Apagada" />}
            {aElegir.length === 0
              ? <StatusPill tone="brand" label="No pide configurar nada" />
              : null}
          </div>
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[1], lineHeight: 1.45 }}>
            {preset.resumen}
          </div>
          {regla?.detalle && (
            <div style={{ fontSize: font.sm, color: color.mut2, marginTop: space[1] }}>
              Última corrida: {regla.detalle}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <Button variant="ghost" size="sm" onClick={() => setAbierto((v) => !v)}>
            {abierto ? 'Cerrar' : aElegir.length ? 'Calibrar' : 'Ver detalle'}
          </Button>
          <Button
            variant={activa ? 'outline' : 'solid'}
            size="sm"
            disabled={!puede || guardando}
            onClick={() => void alternar()}
            title={puede ? undefined : 'Hace falta el permiso meta-ads.pautar en esta marca'}
          >
            {activa ? 'Apagar' : 'Prender'}
          </Button>
        </div>
      </div>

      {abierto && (
        <Detalle
          preset={preset}
          linea={linea}
          regla={regla}
          umbralLinea={umbralLinea}
          definicion={definicion}
          aElegir={aElegir}
          ctx={ctx}
          puede={puede}
          dias={dias}
          recargar={recargar}
        />
      )}
    </div>
  )
}

/**
 * 🎯 El calibrador.
 *
 * Se dispara a pedido con un botón y no en cada tecla: cada corrida son 90 evaluaciones sobre
 * decenas de miles de filas del lado del servidor, y un `onChange` que la lance por letra tipeada
 * pondría a la pantalla a pelear consigo misma.
 */
function Detalle({ preset, linea, regla, umbralLinea, definicion, aElegir, ctx, puede, dias, recargar }: {
  preset: DefPreset & { clave: ClavePreset }
  linea: LineaPauta
  regla: Regla | null
  umbralLinea: Partial<Record<ClaveUmbral, number | null>>
  definicion: Record<ClaveUmbral, DefUmbral>
  aElegir: ClaveUmbral[]
  ctx: ContextoLinea | undefined
  puede: boolean
  dias: number
  recargar: () => void
}) {
  const toast = useToast()
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const u of aElegir) {
      const x = regla?.parametros?.[u] ?? umbralLinea[u]
      v[u] = x === null || x === undefined ? '' : String(x)
    }
    return v
  })
  const [cal, setCal] = useState<Calibracion | null>(null)
  const [corriendo, setCorriendo] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const parametros = useMemo(() => {
    const p: Partial<Record<ClaveUmbral, number>> = {}
    for (const [k, v] of Object.entries(valores)) {
      const n = Number(v)
      if (v !== '' && Number.isFinite(n)) p[k as ClaveUmbral] = n
    }
    return p
  }, [valores])

  const correr = useCallback(async () => {
    setCorriendo(true)
    const r = await calibrarRegla({ preset: preset.clave, linea, parametros })
    setCorriendo(false)
    if (!r.ok) { toast.error(r.motivo); return }
    setCal(r.dato)
  }, [preset, linea, parametros, toast])

  const guardar = useCallback(async () => {
    setGuardando(true)
    // Los umbrales se guardan a nivel LÍNEA y no como parámetros de esta regla: el ROAS objetivo de
    // una marca es uno solo, y ponerlo en tres reglas por separado sería tres lugares donde
    // corregirlo cuando cambie.
    const r = await guardarUmbrales(linea, { ...umbralLinea, ...parametros } as Partial<Record<ClaveUmbral, number>>)
    setGuardando(false)
    if (!r.ok) { toast.error(r.motivo); return }
    toast.ok(`Umbrales de ${ETIQUETA_LINEA[linea]} guardados`)
    recargar()
  }, [linea, umbralLinea, parametros, toast, recargar])

  return (
    <div style={{ marginTop: space[3], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
      <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.5, marginBottom: space[3] }}>
        {preset.porQue}
      </div>

      {aElegir.length === 0 ? (
        <Notice tone="success">
          Esta regla no necesita que definas ningún número: lo que mira es un hecho.
          {preset.requiere.length > 0 && (
            <div style={{ fontSize: font.sm, marginTop: space[1] }}>
              El piso que usa se <b>deduce</b> de tu propia pauta
              {ctx?.cpaMedio ? ` (el CPA medido de ${ETIQUETA_LINEA[linea]} es ${plata(ctx.cpaMedio)})` : ''}.
            </div>
          )}
        </Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {aElegir.map((u) => (
            <Dial
              key={u}
              clave={u}
              def={definicion[u]}
              valor={valores[u] ?? ''}
              setValor={(v) => setValores((s) => ({ ...s, [u]: v }))}
              ctx={ctx}
              puede={puede}
            />
          ))}

          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" disabled={corriendo} onClick={() => void correr()}>
              {corriendo ? 'Mirando los últimos 90 días…' : `¿Cuántas veces habría saltado en ${dias} días?`}
            </Button>
            <Button variant="solid" size="sm" disabled={!puede || guardando} onClick={() => void guardar()}>
              {guardando ? 'Guardando…' : 'Guardar estos umbrales'}
            </Button>
          </div>

          {cal && <Resultado cal={cal} dias={dias} />}
        </div>
      )}
    </div>
  )
}

/** Un umbral, con el número medido al lado para que no se elija a ciegas. */
function Dial({ clave, def, valor, setValor, ctx, puede }: {
  clave: ClaveUmbral
  def: DefUmbral
  valor: string
  setValor: (v: string) => void
  ctx: ContextoLinea | undefined
  puede: boolean
}) {
  // La referencia medida de cada umbral. No es una sugerencia que se aplique sola: es el número
  // contra el que tiene sentido elegir. Ver `contextoUmbrales`.
  const referencia = clave === 'roas_objetivo' && ctx
    ? `Venís sacando ${roasTxt(ctx.roasMedio)} en promedio`
    : clave === 'cpa_maximo' && ctx?.cpaMedio
      ? `Hoy te cuesta ${plata(ctx.cpaMedio)}`
      : clave === 'frecuencia_maxima' && ctx
        ? `Tu peor día llegó a ${decimal(ctx.frecuenciaPico)}`
        : null

  return (
    <div>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.sm, fontWeight: weight.semibold, minWidth: 190 }}>{def.rotulo}</span>
        <Input
          type="number"
          value={valor}
          disabled={!puede}
          onChange={(e) => setValor(e.target.value)}
          placeholder="sin definir"
          style={{ width: 130 }}
        />
        {referencia && <span style={{ fontSize: font.sm, color: color.brandSolid }}>{referencia}</span>}
      </div>
      <div style={{ fontSize: font.sm, color: color.mut2, marginTop: space[1], lineHeight: 1.45 }}>{def.ayuda}</div>
    </div>
  )
}

/**
 * Lo que contesta el calibrador. **Los dos números van juntos** y no es decoración: 40 saltos sobre
 * 3 objetos es una regla repetitiva, 40 sobre 40 es una regla que encontró algo. Uno solo se lee mal.
 */
function Resultado({ cal, dias }: { cal: Calibracion; dias: number }) {
  if (!cal.ok) return null
  if (cal.apagada) {
    return (
      <Notice tone={cal.sinHistorial ? 'brand' : 'warning'}>
        {cal.detalle}
        {cal.sinHistorial && (
          <div style={{ fontSize: font.sm, marginTop: space[1] }}>
            No hay nada que hacer: se destraba sola a medida que el cron vaya sacando fotos.
          </div>
        )}
      </Notice>
    )
  }

  const tono = cal.total === 0 ? 'neutral' : cal.total > dias ? 'warning' : 'success'
  const lectura = cal.total === 0
    ? 'Con estos números no habría saltado nunca. Puede ser que el umbral esté demasiado flojo.'
    : cal.total > dias
      ? 'Es más de un renglón por día: probablemente sea ruido. Una regla que grita todos los días se deja de mirar.'
      : 'Parece un ritmo razonable de cosas para mirar.'

  return (
    <Card>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[2] }}>
        <StatusPill tone={tono} label={`${entero(cal.total)} salto${cal.total === 1 ? '' : 's'}`} />
        <span style={{ fontSize: font.sm, color: color.mut }}>
          sobre <b>{cal.objetos}</b> {cal.objetos === 1 ? 'cosa distinta' : 'cosas distintas'}, en {dias} días
        </span>
      </div>
      <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.45, marginBottom: space[2] }}>{lectura}</div>
      {cal.ejemplos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
          {cal.ejemplos.slice(0, 5).map((e) => (
            <div key={e.objeto_id} style={{ fontSize: font.sm }}>
              <span style={{ fontWeight: weight.semibold }}>{e.objeto_nombre || e.objeto_id}</span>
              <span style={{ color: color.mut2 }}> · {e.veces}×</span>
              <div style={{ color: color.mut, lineHeight: 1.4 }}>{e.motivo}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
