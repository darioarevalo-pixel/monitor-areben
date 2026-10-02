'use client'

/**
 * Pagos recibidos (key `pagos-recibidos`, área Local).
 *
 * La pantalla queda abierta todo el día en la compu del local. La empleada entrega la compra
 * cuando el pago aparece acá, ⛔ por lo que muestra el teléfono de la clienta (la app falsa).
 *
 * 🔴 **La pantalla tiene que avisar cuando deja de estar al día.** Una lista vieja que parece
 * nueva es peor que no tener lista: la empleada vería «no entró» de un pago que sí entró, o al
 * revés. Por eso, si pasa `VIEJA_MS` sin una lectura buena, la lista se tapa con un aviso rojo.
 *
 * El sonido es un extra: ⛔ ningún aviso depende de él. El pago nuevo además queda resaltado.
 * Los navegadores no dejan sonar nada hasta que la persona toca la página: por eso el botón.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  Badge,
  Button,
  EmptyState,
  Input,
  KpiCard,
  Notice,
  SectionCard,
  TableWrap,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  color,
  font,
  formatMoney,
  radius,
  space,
  weight,
} from '@/components/ui'
import { CuentaDeCobro } from './CuentaDeCobro'
import { leerPagos, TEXTO_ORIGEN, type Pago, type Respuesta } from '@/lib/pagos-recibidos/cliente'

/** Cada cuánto se le pregunta a Mercado Pago. */
const CADA_MS = 15_000
/** Sin una lectura buena en este tiempo, la lista deja de ser confiable (4 lecturas perdidas). */
const VIEJA_MS = 60_000
/** Cuánto queda resaltado un pago recién llegado. */
const NUEVO_MS = 3 * 60_000

const hora = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(iso),
  )

function hace(iso: string, ahora: number): string {
  const s = Math.max(0, Math.round((ahora - Date.parse(iso)) / 1000))
  if (s < 60) return 'hace menos de un minuto'
  const m = Math.round(s / 60)
  if (m < 60) return m === 1 ? 'hace 1 minuto' : `hace ${m} minutos`
  return `a las ${hora(iso)}`
}

/** Dos tonos cortos, generados en el momento: no hay archivo de sonido que cargar. */
function sonar(ctx: AudioContext) {
  const t = ctx.currentTime
  for (const [i, f] of [880, 1320].entries()) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = f
    g.gain.setValueAtTime(0.0001, t + i * 0.18)
    g.gain.exponentialRampToValueAtTime(0.3, t + i * 0.18 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16)
    o.connect(g).connect(ctx.destination)
    o.start(t + i * 0.18)
    o.stop(t + i * 0.18 + 0.17)
  }
}

export function PagosRecibidos() {
  const { marca } = useSesion()
  const [dia, setDia] = useState<string | null>(null) // null = hoy
  // La lectura viaja PEGADA a la marca y el día que la pidieron (molde de `useCobranzas`): al
  // cambiar de marca o de día, la vieja se descarta sola y ⛔ se muestra bajo el título nuevo.
  const clave = `${marca}|${dia ?? 'hoy'}`
  const [lectura, setLectura] = useState<{ clave: string; r: Respuesta; ok: number } | null>(null)
  const [fallo, setFallo] = useState<{ clave: string; msg: string } | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const [nuevos, setNuevos] = useState<Map<string, number>>(new Map())
  const [sonido, setSonido] = useState(false)
  // Sube al cambiar de cuenta: relee en el momento, sin esperar los 15 s.
  const [tick, setTick] = useState(0)
  const audio = useRef<AudioContext | null>(null)
  const vistos = useRef<{ clave: string; ids: Set<string> } | null>(null)

  const leer = useCallback(
    async (vivo: () => boolean) => {
      try {
        const res = await leerPagos(marca, dia ?? undefined)
        if (!vivo()) return
        setLectura({ clave, r: res, ok: Date.now() })
        setFallo(null)
        const ids = (res.pagos || []).map((p) => p.id)
        // La primera lectura de cada marca/día sólo siembra: lo que ya estaba al abrir no es «nuevo».
        if (!vistos.current || vistos.current.clave !== clave) {
          vistos.current = { clave, ids: new Set(ids) }
          return
        }
        const ya = vistos.current.ids
        const llegaron = ids.filter((id) => !ya.has(id))
        if (!llegaron.length) return
        llegaron.forEach((id) => ya.add(id))
        const t = Date.now()
        setNuevos((m) => {
          const n = new Map(m)
          llegaron.forEach((id) => n.set(id, t))
          return n
        })
        if (audio.current) sonar(audio.current)
      } catch (e) {
        if (vivo()) setFallo({ clave, msg: e instanceof Error ? e.message : 'No se pudieron leer los pagos.' })
      }
    },
    [marca, dia, clave],
  )

  useEffect(() => {
    let vivo = true
    void (async () => {
      await leer(() => vivo)
    })()
    // Sólo se repite si se mira HOY: un día pasado no cambia.
    const id = dia == null ? setInterval(() => void leer(() => vivo), CADA_MS) : null
    return () => {
      vivo = false
      if (id) clearInterval(id)
    }
  }, [leer, dia, tick])

  const r = lectura && lectura.clave === clave ? lectura.r : null
  const ultimoOk = lectura && lectura.clave === clave ? lectura.ok : null
  const error = fallo && fallo.clave === clave ? fallo.msg : null

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 5_000)
    return () => clearInterval(id)
  }, [])

  function activarSonido() {
    if (!audio.current) audio.current = new AudioContext()
    void audio.current.resume()
    sonar(audio.current)
    setSonido(true)
  }

  const esHoy = dia == null
  const vieja = esHoy && r != null && (ultimoOk == null || ahora - ultimoOk > VIEJA_MS)
  const pagos = r?.pagos || []
  const esNuevo = (p: Pago) => {
    const t = nuevos.get(p.id)
    return t != null && ahora - t < NUEVO_MS
  }
  const [ultimo, ...resto] = pagos

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard
        title="Pagos recibidos"
        subtitle={
          esHoy
            ? 'Lo que entró hoy a la cuenta de Mercado Pago del local. Se actualiza solo.'
            : `Lo que entró el ${dia!.split('-').reverse().join('/')}.`
        }
        actions={
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
            {r?.admin && (
              <>
                <Input
                  type="date"
                  value={dia ?? r.hoy}
                  max={r.hoy}
                  onChange={(e) => setDia(!e.target.value || e.target.value === r.hoy ? null : e.target.value)}
                  style={{ width: 150 }}
                />
                {!esHoy && (
                  <Button size="sm" variant="outline" onClick={() => setDia(null)}>
                    Ver hoy
                  </Button>
                )}
              </>
            )}
            {esHoy &&
              (sonido ? (
                <Badge tone="success">Sonido activado</Badge>
              ) : (
                <Button size="sm" onClick={activarSonido}>
                  Activar sonido
                </Button>
              ))}
          </div>
        }
      />

      {vieja && (
        <Notice tone="danger">
          <strong>Esta lista no se está actualizando</strong>
          {ultimoOk ? ` desde las ${hora(new Date(ultimoOk).toISOString())}` : ''}. Mientras siga este cartel, no la uses para
          confirmar un pago. Revisá que la compu tenga internet{error ? ` (${error})` : ''}.
        </Notice>
      )}
      {!r && error && <Notice tone="danger">{error}</Notice>}

      {r?.admin && <CuentaDeCobro marca={marca} cuentas={r.cuentas || []} onCambio={() => setTick((n) => n + 1)} />}

      {r?.admin && r.conectada && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: space[3] }}>
          <KpiCard label={esHoy ? 'Total de hoy' : 'Total del día'} value={formatMoney(r.total ?? 0)} sub={`${r.cantidad ?? 0} pagos`} />
          {(r.devueltos?.length ?? 0) > 0 && (
            <KpiCard
              label="Devueltos"
              tone="warning"
              value={formatMoney(r.devueltos!.reduce((s, p) => s + p.monto, 0))}
              sub={`${r.devueltos!.length} — no están en el total`}
            />
          )}
        </div>
      )}

      {!r ? (
        !error && <EmptyState title="Buscando los pagos en Mercado Pago…" />
      ) : !r.conectada ? (
        <EmptyState
          title={
            r.admin
              ? 'Cargá la cuenta de Mercado Pago del local para empezar.'
              : 'Todavía no está cargada la cuenta de Mercado Pago del local. Avisale a Darío o a Bruno.'
          }
          dashed
        />
      ) : pagos.length === 0 ? (
        <EmptyState title={esHoy ? 'Todavía no entró ningún pago hoy.' : 'Ese día no entró ningún pago.'} dashed />
      ) : (
        <div style={{ opacity: vieja ? 0.35 : 1, display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {esHoy && (
            <div
              style={{
                border: `2px solid ${esNuevo(ultimo) ? color.success : color.line}`,
                background: esNuevo(ultimo) ? color.successBg : color.surface,
                borderRadius: radius.xl,
                padding: space[5],
              }}
            >
              <div style={{ fontSize: font.sm, color: color.mut, fontWeight: weight.semibold }}>
                {esNuevo(ultimo) ? 'Acaba de entrar' : 'Último pago'}
              </div>
              <div style={{ fontSize: 40, fontWeight: weight.heavy, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(ultimo.monto)}
              </div>
              <div style={{ fontSize: font.lg, color: color.ink2 }}>
                {hace(ultimo.cuando, ahora)} · {TEXTO_ORIGEN[ultimo.origen]} · {hora(ultimo.cuando)}
              </div>
            </div>
          )}
          <TableWrap>
            <THead>
              <Tr>
                <Th>Hora</Th>
                <Th align="right">Monto</Th>
                <Th>De dónde</Th>
                <Th>N.º de operación</Th>
              </Tr>
            </THead>
            <TBody>
              {(esHoy ? resto : pagos).map((p) => (
                <Tr key={p.id} style={esNuevo(p) ? { background: color.successBg } : undefined}>
                  <Td mono>{hora(p.cuando)}</Td>
                  <Td align="right" mono strong>
                    {formatMoney(p.monto)}
                  </Td>
                  <Td>{TEXTO_ORIGEN[p.origen]}</Td>
                  <Td mono>{p.id}</Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>
        </div>
      )}

      {esHoy && r?.conectada && ultimoOk && !vieja && (
        <div style={{ fontSize: font.sm, color: color.mut }}>Actualizado a las {hora(new Date(ultimoOk).toISOString())}.</div>
      )}
    </div>
  )
}
