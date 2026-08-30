'use client'

/**
 * **Un plan, paso por paso, con lo que pasó en cada uno.**
 *
 * # Qué tiene que contestar esta pantalla, y por qué no alcanza una barra de progreso
 *
 * «7 de 9» no sirve cuando algo salió mal, que es cuando se mira. Las preguntas reales son *¿qué
 * quedó hecho?*, *¿qué se creó y dónde está?* y *¿qué falta?* — y la última se contesta distinto si
 * el paso está esperando a Meta que si lo rechazó.
 *
 * 🔴 **Un paso «dudoso» NO se dibuja como un error.** Es «se cortó la llamada y todavía no aparece»,
 * que la mayoría de las veces termina en la copia adoptada un momento después. Pintarlo en rojo
 * enseñaría a rearmar el plan, que es exactamente lo que hace dos copias.
 *
 * ⚠️ **Cancelar no deshace**, y el cartel lo dice con todas las letras antes de apretar. Meta no
 * tiene transacciones y fingir que sí sería la mentira más cara de esta sección.
 *
 * 🔑 **Un escalón «salteado» no es un paso que falló ni uno que se perdió**: es el guardarraíl
 * diciendo que hoy no corresponde subir, con el motivo escrito. Se dibuja con su renglón y su texto
 * completo —no plegado— porque **ese texto ES el valor de la pieza**: una escalada que frena y no
 * cuenta por qué es indistinguible de una que no corrió.
 */

import { useState } from 'react'
import { atascadoDesde, avisosDe, diasDesde, type EstadoPaso, type PasoPlan, type Plan } from '@/lib/meta-ads/planes'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import { Button, Card, Notice, StatusPill, color, font, radius, space, weight } from '@/components/ui'

/** Cómo se lee cada estado de paso. El tono es la mitad del mensaje. */
const PINTA: Record<EstadoPaso, { label: string; tone: 'success' | 'warning' | 'danger' | 'brand' | 'neutral' }> = {
  pendiente: { label: 'Pendiente', tone: 'neutral' },
  'en-curso': { label: 'Enviado', tone: 'brand' },
  hecho: { label: 'Hecho', tone: 'success' },
  // Ámbar y no rojo: ver el comentario de arriba.
  dudoso: { label: 'Esperando a Meta', tone: 'warning' },
  fallado: { label: 'Falló', tone: 'danger' },
  // Ni rojo ni verde: un escalón salteado es una decisión, no un fallo ni un éxito. Ver la cabecera.
  salteado: { label: 'No se dio', tone: 'warning' },
}

const PINTA_PLAN: Record<Plan['estado'], { label: string; tone: 'success' | 'warning' | 'danger' | 'brand' | 'neutral' }> = {
  pendiente: { label: 'Sin empezar', tone: 'neutral' },
  'en-curso': { label: 'En curso', tone: 'brand' },
  hecho: { label: 'Terminado', tone: 'success' },
  atascado: { label: 'Atascado', tone: 'danger' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
}

/** Cuándo vuelve a tocarse, escrito como se lee. `null` si no está esperando. */
function esperaDe(plan: Plan): string | null {
  if (!plan.proximoEn) return null
  const t = Date.parse(plan.proximoEn)
  if (!Number.isFinite(t) || t <= Date.now()) return null
  return new Date(t).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * **Hace cuánto que está así**, en castellano. `null` si no se puede saber o es de hoy.
 *
 * 🔴 Existe porque un plan atascado no tenía edad en ninguna parte, y uno del 8-ago se leía igual
 * que uno de esta mañana: los dos decían «Atascado» y nada más. Un aviso sin edad se mira una vez.
 *
 * ⚠️ Es una función de módulo y ⛔ no se llama en el cuerpo del componente con `Date.now()` adentro:
 * `react-hooks/purity` lo prohíbe, igual que en `esperaDe()`. Lo que se prueba es la cuenta, que vive
 * en el núcleo con `ahora` como parámetro (`atascadoDesde` + `diasDesde`).
 */
function edadDe(plan: Plan): string | null {
  if (plan.estado !== 'atascado') return null
  const d = diasDesde(atascadoDesde(plan), Date.now())
  if (d == null || d < 1) return null
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}

export function ProgresoPlan({ plan, avanzando, motivo, onSeguir, onReintentar, onCancelar }: {
  plan: Plan
  avanzando: boolean
  motivo: string | null
  onSeguir: () => void
  /** Manda de nuevo el paso que falló. Sólo se dibuja si ese paso lo permite. */
  onReintentar: (orden: number) => void
  onCancelar: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  const hechos = plan.pasos.filter((p) => p.estado === 'hecho' || p.estado === 'salteado').length
  const terminado = plan.estado === 'hecho' || plan.estado === 'cancelado'
  const pinta = PINTA_PLAN[plan.estado]
  // 🔴 En un plan atascado, «Seguir» no hace nada: el motor no repite un paso fallado por su cuenta
  // —si lo hiciera, un rechazo permanente sería un bucle—. Un botón que no hace nada se lee como que
  // la sección está rota, así que ahí el botón es OTRO y dice qué paso va a mandar de nuevo.
  const trabado = plan.pasos.find((p) => p.estado === 'fallado') || null
  const avisos = avisosDe(plan)
  const atascado = plan.estado === 'atascado'
  // 🔴 Mientras espera, «Seguir» no se dibuja: el servidor lo rechaza igual, y un botón que contesta
  // «todavía no» es peor que no tenerlo. Lo que va en su lugar es CUÁNDO vuelve.
  const espera = esperaDe(plan)
  const edad = edadDe(plan)

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], flexWrap: 'wrap' }}>
            <StatusPill tone={pinta.tone} label={pinta.label} />
            <span style={{ fontSize: font.base, fontWeight: weight.semibold }}>{titulo(plan)}</span>
            {plan.simulacro && <StatusPill tone="neutral" label="Simulacro" />}
          </div>
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[1] }}>
            {ETIQUETA_LINEA[plan.linea] || plan.linea} · {hechos} de {plan.pasos.length} pasos · lo armó {plan.quien}
            {/* 🔴 La edad va al lado del pill y ⛔ no adentro del cartel de abajo: es lo primero que
                cambia qué hacer con un plan frenado, y el cartel se lee después del título. */}
            {edad && <> · frenado <b style={{ color: color.dangerInk }}>{edad}</b></>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: space[2] }}>
          {!terminado && atascado && trabado?.puedeReintentar && (
            <Button size="sm" variant="solid" tone="brand" onClick={() => onReintentar(trabado.orden)} disabled={avanzando}>
              {avanzando ? 'Enviando de nuevo…' : `Reintentar el paso ${trabado.orden}`}
            </Button>
          )}
          {!terminado && !atascado && !espera && (
            <Button size="sm" variant="solid" tone="brand" onClick={onSeguir} disabled={avanzando}>
              {avanzando ? 'Avanzando…' : hechos ? 'Seguir' : 'Empezar'}
            </Button>
          )}
          {!terminado && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(true)} disabled={avanzando}>
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* 🔑 La marca, visible y copiable: es con lo que se busca en Ads Manager todo lo que este plan
          creó. Esconderla dejaría al que tiene que ir a mirar sin con qué buscar. */}
      <div style={{ fontSize: font.sm, color: color.mut2 }}>
        Todo lo que crea este plan lleva <code style={{ fontWeight: weight.semibold }}>{plan.marcador}</code> en el
        nombre. Buscá eso en Ads Manager para verlo junto.
      </div>

      {/* 🔑 Lo que la receta corrigió, ANTES de «Empezar». El conjunto no se fotocopia: se vuelve a
          armar, y Meta ya no acepta todo lo que aceptaba cuando el original nació. Que la copia
          salga distinta del original en algún campo no es un detalle de implementación — sobre todo
          cuando el campo es el presupuesto. */}
      {avisos.length > 0 && (
        <Notice tone="warning">
          <div style={{ fontWeight: weight.semibold }}>
            La copia no sale idéntica: hubo que corregir {avisos.length === 1 ? 'una cosa' : `${avisos.length} cosas`} para que Meta la acepte.
          </div>
          <ul style={{ fontSize: font.sm, margin: `${space[1]} 0 0`, paddingLeft: space[4], lineHeight: 1.45 }}>
            {avisos.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </Notice>
      )}

      {confirmando && (
        <Notice tone="warning">
          <div style={{ fontWeight: weight.semibold }}>Cancelar no deshace lo que ya se hizo.</div>
          <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.45 }}>
            {hechos > 0
              ? `Ya corrieron ${hechos} paso(s): lo que se creó sigue en Meta, pausado, y lo que se movió de presupuesto sigue movido. Cancelar sólo deja de avanzar.`
              : 'Todavía no se tocó nada en Meta, así que cancelar no deja nada a medias.'}
          </div>
          <div style={{ display: 'flex', gap: space[2], marginTop: space[2] }}>
            <Button size="sm" variant="solid" tone="danger" onClick={() => { setConfirmando(false); onCancelar() }}>
              Sí, dejar de avanzar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>Volver</Button>
          </div>
        </Notice>
      )}

      {atascado && plan.detalle && (
        <Notice tone="danger">
          {plan.detalle}
          {trabado?.puedeReintentar && (
            <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.45 }}>
              Meta contestó que no <b>antes de crear nada</b>, así que no quedó nada a medias. Arreglá
              eso en Ads Manager y mandá el paso de nuevo: <b>lo que ya salió no se rehace</b>.
            </div>
          )}
          {/* 🔴 Los dos motivos por los que no se puede reintentar dicen COSAS OPUESTAS, y por eso
              son dos carteles y no uno. Con un paso retirado ⛔ no hay nada que mirar en Ads
              Manager —Meta rechazó antes de crear nada— y ⛔ no hay nada que arreglar afuera: el
              pedido que este plan guarda es el de un camino que el motor ya no usa, así que
              mandarlo de nuevo manda exactamente lo mismo. Lo que corresponde es armarlo de nuevo. */}
          {trabado?.retirado && (
            <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.45 }}>
              Este plan quedó de una versión anterior del motor: <b>volver a mandarlo manda el mismo
              pedido que falló</b>. Lo que Meta pedía ya se corrige solo — armá el plan de nuevo y
              cancelá éste.
            </div>
          )}
          {trabado && !trabado.puedeReintentar && !trabado.retirado && (
            <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.45 }}>
              Este no se puede volver a mandar desde acá: hay que mirar en Ads Manager cómo quedó
              antes de tocar nada.
            </div>
          )}
        </Notice>
      )}
      {/* 🔑 Que la escalada siga sola es información, no un detalle: si la pantalla no lo dijera,
          alguien apretaría Seguir todos los días creyendo que sin él no pasa nada. */}
      {!terminado && espera && (
        <Notice tone="brand">
          <div style={{ fontWeight: weight.semibold }}>El próximo escalón es el {espera}.</div>
          <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.45 }}>
            Se da solo: no hace falta volver a entrar. Antes de subir, el motor relee el presupuesto en
            Meta y mira cómo viniste esos días — si no corresponde, el escalón no se da y acá vas a
            leer por qué.
          </div>
        </Notice>
      )}
      {!atascado && motivo && <Notice tone="brand">{motivo}</Notice>}

      <ol style={{ display: 'flex', flexDirection: 'column', gap: space[1], margin: 0, padding: 0, listStyle: 'none' }}>
        {plan.pasos.map((p) => <Paso key={p.orden} paso={p} />)}
      </ol>
    </Card>
  )
}

function Paso({ paso }: { paso: PasoPlan }) {
  const pinta = PINTA[paso.estado] || PINTA.pendiente
  return (
    <li
      style={{
        display: 'flex', gap: space[2], alignItems: 'flex-start',
        border: `1px solid ${color.line}`, borderRadius: radius.md, padding: space[2],
      }}
    >
      <span style={{ fontSize: font.sm, color: color.mut2, minWidth: 20, textAlign: 'right' }}>{paso.orden}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.sm, fontWeight: weight.medium }}>{paso.rotulo}</span>
          <StatusPill tone={pinta.tone} label={pinta.label} />
          {paso.intentos > 1 && (
            <span style={{ fontSize: font.xs, color: color.mut2 }}>{paso.intentos} intentos</span>
          )}
        </div>
        {paso.detalle && (
          <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[1], lineHeight: 1.4 }}>{paso.detalle}</div>
        )}
      </div>
    </li>
  )
}

/** Qué dice el plan que hace, en castellano y sin jerga de la API. */
function titulo(plan: Plan): string {
  const e = plan.entrada as Record<string, unknown>
  if (plan.tipo === 'duplicar') {
    const copias = Number(e.copias) || 1
    const que = e.nivel === 'campania' ? 'la campaña' : 'el conjunto'
    const nombre = String(e.nombreOriginal || '')
    return `Duplicar ${que}${copias > 1 ? ` ${copias} veces` : ''}${nombre ? ` «${nombre}»` : ''}`
  }
  if (plan.tipo === 'crear') {
    // El nombre de la campaña nueva Y el de la referencia: sin el segundo, un plan atascado no dice
    // de dónde salió la segmentación, que es lo primero que hay que ir a mirar.
    const ref = String(e.referenciaNombre || '')
    return `Crear la campaña «${String(e.nombre || '')}»${ref ? ` a partir de «${ref}»` : ''}`
  }
  if (plan.tipo === 'mover-plata') {
    return `Mover presupuesto de «${String(e.deNombre || '')}» a «${String(e.aNombre || '')}»`
  }
  if (plan.tipo === 'escalar') {
    const n = plan.pasos.length
    const horas = Number(e.horas) || 24
    const cada = horas === 24 ? 'por día' : `cada ${horas} h`
    return `Escalar «${String(e.nombre || '')}»: ${n} ${n === 1 ? 'escalón' : 'escalones'}, uno ${cada}`
  }
  return plan.tipo
}
