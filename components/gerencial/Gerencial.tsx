'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { aprobarConsumo, rechazarConsumo } from '@/lib/gerencial/acciones'
import { DIAS_SNOOZE, idsSilenciados, reactivar, silenciar } from '@/lib/gerencial/snooze'
import { useGerencial } from './useGerencial'
import {
  ETIQUETA_AREA,
  ETIQUETA_SEVERIDAD,
  SEVERIDADES,
  type Accion,
  type Accionable,
  type Area,
  type ConsumoPendiente,
  type Severidad,
} from '@/lib/gerencial/tipos'
import type { Marca } from '@/lib/nav.datos'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Badge, Button, Card, EmptyState, Esqueleto, MarcaChip, Notice, color, font, space, useConfirmar, useToast } from '@/components/ui'

/**
 * Panel Gerencial (key `gerencial`): la vista de decisiones. Toma los accionables que
 * arman los detectores (multimarca + Ads global) y los muestra ordenados por severidad,
 * con la recomendación y acciones: link a la sección, silenciar (baja el ruido), y —en la
 * tarjeta de aprobaciones— aprobar/rechazar consumos in-place.
 */

const COLOR_SEVERIDAD: Record<Severidad, { fondo: string; texto: string; punto: string }> = {
  critico: { fondo: 'var(--mo-danger-bg)', texto: 'var(--mo-danger-ink)', punto: 'var(--mo-danger)' },
  atencion: { fondo: 'var(--mo-warning-bg)', texto: 'var(--mo-warning-ink)', punto: 'var(--mo-warning-solid)' },
  oportunidad: { fondo: 'var(--mo-success-bg)', texto: 'var(--mo-success-ink)', punto: 'var(--mo-success)' },
}

const AREAS: Area[] = ['comercial', 'ads', 'stock', 'operativo', 'importaciones']

const hoyISO = () => new Date().toISOString().slice(0, 10)

export function Gerencial() {
  const { accionables, cargando, errores, recargar } = useGerencial()
  const [fSev, setFSev] = useState<Severidad | 'todas'>('todas')
  const [fArea, setFArea] = useState<Area | 'todas'>('todas')
  const [mostrarSil, setMostrarSil] = useState(false)
  // Un contador para re-leer los silenciados de localStorage tras silenciar/reactivar.
  const [snoozeNonce, setSnoozeNonce] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- snoozeNonce fuerza re-leer localStorage
  const silenciados = useMemo(() => idsSilenciados(), [snoozeNonce])

  const onSilenciar = (id: string) => {
    silenciar(id)
    setSnoozeNonce((n) => n + 1)
  }
  const onReactivar = (id: string) => {
    reactivar(id)
    setSnoozeNonce((n) => n + 1)
  }

  const activos = accionables.filter((a) => !silenciados.has(a.id))
  const visibles = useMemo(() => {
    const base = mostrarSil ? accionables.filter((a) => silenciados.has(a.id)) : activos
    return base.filter(
      (a) => (fSev === 'todas' || a.severidad === fSev) && (fArea === 'todas' || a.area === fArea),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accionables, silenciados, mostrarSil, fSev, fArea])

  const conteoSev = (s: Severidad) => activos.filter((a) => a.severidad === s).length
  const areasPresentes = AREAS.filter((ar) => activos.some((a) => a.area === ar))
  const nSilenciados = accionables.length - activos.length
  const filtrando = fSev !== 'todas' || fArea !== 'todas'

  return (
    <>
      <HeaderAcciones>
        <InfoPopover titulo="Panel Gerencial">
          Reúne, de todas tus marcas, lo que requiere una decisión: capital parado, precios fuera de
          objetivo, stock a depurar, Ads con mal retorno, pendientes operativos e importaciones. Podés
          silenciar lo que no aplica y aprobar consumos internos desde acá.
        </InfoPopover>
        {nSilenciados > 0 && (
          <Button variant="ghost" onClick={() => setMostrarSil((v) => !v)}>
            {mostrarSil ? '← Volver' : ` ${nSilenciados} silenciado${nSilenciados === 1 ? '' : 's'}`}
          </Button>
        )}
        <Button variant="outline" onClick={recargar}>Actualizar</Button>
      </HeaderAcciones>

      {/* Las pills de severidad y los chips de área son FILTROS: van juntos en una barra,
          no sueltos sobre el lienzo. Antes flotaban sin contenedor y la pantalla se veía
          sin forma. */}
      <Card padding={4} style={{ marginBottom: space[4] }}>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          {SEVERIDADES.map((s) => (
            <PillSeveridad
              key={s}
              sev={s}
              n={conteoSev(s)}
              activo={fSev === s}
              onClick={() => setFSev(fSev === s ? 'todas' : s)}
            />
          ))}
        </div>
        {areasPresentes.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: space[3], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
            <Chip label="Todas las áreas" activo={fArea === 'todas'} onClick={() => setFArea('todas')} />
            {areasPresentes.map((ar) => (
              <Chip
                key={ar}
                label={ETIQUETA_AREA[ar]}
                activo={fArea === ar}
                onClick={() => setFArea(fArea === ar ? 'todas' : ar)}
              />
            ))}
          </div>
        )}
      </Card>

      {errores.length > 0 && (
        <Notice tone="warning" icon="⚠" style={{ marginBottom: space[4] }}>
          Algunos datos no cargaron ({errores.join(' · ')}). El panel muestra el resto.
        </Notice>
      )}

      {cargando && accionables.length === 0 ? (
        <Esqueleto forma="tabla" filas={5} />
      ) : visibles.length === 0 ? (
        <EmptyState
          icon="✅"
          title={
            mostrarSil
              ? 'No hay accionables silenciados con estos filtros'
              : filtrando
                ? 'No hay accionables con estos filtros'
                : 'No hay accionables pendientes'
          }
          hint={!mostrarSil && !filtrando ? 'Todo en orden.' : undefined}
          dashed
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {cargando && (
            <div style={{ fontSize: font.sm, color: color.mut2, padding: '0 2px' }}>Actualizando…</div>
          )}
          {visibles.map((a) => (
            <CardAccionable
              key={a.id}
              a={a}
              silenciado={mostrarSil}
              onSilenciar={() => onSilenciar(a.id)}
              onReactivar={() => onReactivar(a.id)}
              onCambio={recargar}
            />
          ))}
        </div>
      )}
    </>
  )
}

function CardAccionable({
  a,
  silenciado,
  onSilenciar,
  onReactivar,
  onCambio,
}: {
  a: Accionable
  silenciado: boolean
  onSilenciar: () => void
  onReactivar: () => void
  onCambio: () => void
}) {
  const c = COLOR_SEVERIDAD[a.severidad]
  return (
    <Card padding={5} style={{ borderLeft: `4px solid ${c.punto}`, background: c.fondo }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <MarcaChip marca={a.marca} />
        <span style={{ fontSize: 11, fontWeight: 700, color: c.texto, letterSpacing: 0 }}>
          {ETIQUETA_SEVERIDAD[a.severidad]}
        </span>
        <Badge tone="neutral" subtle>
          {ETIQUETA_AREA[a.area]}
        </Badge>
      </div>
      <div style={{ fontWeight: 700, fontSize: font.lg, color: color.ink }}>{a.titulo}</div>
      <div style={{ fontSize: font.base, color: color.ink2, marginTop: 3 }}>{a.detalle}</div>
      <div style={{ fontSize: font.base, color: color.ink, marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span aria-hidden>💡</span>
        <span>
          <b>Qué hacer:</b> {a.recomendacion}
        </span>
      </div>

      {a.consumos && a.consumos.length > 0 && <Aprobaciones consumos={a.consumos} onCambio={onCambio} />}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {a.acciones.map((ac, i) => (
          <BotonAccion key={i} marca={a.marca} accion={ac} />
        ))}
        {silenciado ? (
          <Button size="sm" variant="outline" onClick={onReactivar} style={{ marginLeft: 'auto' }}>Reactivar</Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onSilenciar} title={`Ocultar por ${DIAS_SNOOZE} días`} style={{ marginLeft: 'auto' }}>Silenciar</Button>
        )}
      </div>
    </Card>
  )
}

/** Lista expandible de consumos internos pendientes, con aprobar/rechazar in-place. */
function Aprobaciones({ consumos, onCambio }: { consumos: ConsumoPendiente[]; onCambio: () => void }) {
  const { pedirTexto } = useConfirmar()
  const toast = useToast()
  const { perfil, marca: marcaActiva, setMarca } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const [procesando, setProcesando] = useState<string | null>(null)

  // El permiso se evalúa por la marca del consumo (todos comparten marca en esta tarjeta).
  const marcaCard = consumos[0]?.marca
  const puede = !!marcaCard && (esAdmin(perfil) || puedeSub(perfil, marcaCard, 'solicitudes-internas', 'aprobar'))
  const usuario = perfil?.name || ''

  const correr = async (c: ConsumoPendiente, accion: 'aprobar' | 'rechazar') => {
    if (!puede || procesando) return
    // El KV es por marca: si la activa no coincide, alinearla antes de escribir.
    if (marcaActiva !== c.marca) setMarca(c.marca)
    let motivo = ''
    if (accion === 'rechazar') {
      const m = await pedirTexto('Motivo del rechazo (opcional)', '', { titulo: 'Rechazar', ok: 'Rechazar' })
      if (m === null) return // cancelar no rechaza
      motivo = m.trim()
    }
    setProcesando(c.id)
    const r =
      accion === 'aprobar'
        ? await aprobarConsumo(c.marca, c.id, usuario, hoyISO())
        : await rechazarConsumo(c.marca, c.id, motivo, usuario, hoyISO())
    setProcesando(null)
    if (!r.ok) {
      toast.error('No se pudo guardar: ' + r.motivo)
      return
    }
    onCambio()
  }

  if (!puede) return null

  return (
    <div style={{ marginTop: 10 }}>
      <Button size="sm" variant="outline" onClick={() => setAbierto((v) => !v)}>
        {abierto ? '▾ Ocultar' : `▸ Revisar ${consumos.length} para aprobar acá`}
      </Button>
      {abierto && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {consumos.map((c) => (
            <Card
              key={c.id}
              padding={3}
              style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}
            >
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: font.base, fontWeight: 600, color: color.ink }}>{c.texto}</div>
                <div style={{ fontSize: font.sm, color: color.mut }}>{c.sub}</div>
              </div>
              <Button size="sm" variant="solid" tone="success" loading={procesando === c.id} onClick={() => void correr(c, 'aprobar')}>
                Aprobar
              </Button>
              <Button size="sm" variant="outline" tone="danger" disabled={procesando === c.id} onClick={() => void correr(c, 'rechazar')}>
                Rechazar
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function BotonAccion({ marca, accion }: { marca: Marca; accion: Accion }) {
  const router = useRouter()
  const { marca: marcaActiva, setMarca } = useSesion()
  const ir = () => {
    if (marcaActiva !== marca) setMarca(marca)
    router.push(`/${accion.seccion}`)
  }
  return (
    <Button size="sm" variant="solid" tone="brand" onClick={ir}>{accion.label} →</Button>
  )
}

function PillSeveridad({ sev, n, activo, onClick }: { sev: Severidad; n: number; activo: boolean; onClick: () => void }) {
  const c = COLOR_SEVERIDAD[sev]
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        border: `1px solid ${activo ? c.punto : color.line}`,
        background: activo ? c.fondo : color.surface,
        borderRadius: 9,
        padding: '6px 11px',
        cursor: 'pointer',
        fontSize: font.base,
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.punto, display: 'inline-block' }} />
      <span style={{ fontWeight: 700, color: color.ink }}>{n}</span>
      <span style={{ color: color.mut }}>{ETIQUETA_SEVERIDAD[sev]}</span>
    </button>
  )
}

function Chip({ label, activo, onClick }: { label: string; activo: boolean; onClick: () => void }) {
  return (
    <button type="button" className="mo-chip" aria-pressed={activo} onClick={onClick}>
      {label}
    </button>
  )
}
