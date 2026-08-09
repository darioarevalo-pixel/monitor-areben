'use client'

/**
 * **Probar piezas nuevas**: se arrastran los archivos y sale una tanda de conjuntos, uno por pieza.
 *
 * # Por qué un conjunto por pieza
 *
 * Es la única forma de leer cuál pieza anduvo. Meta reparte el presupuesto de un conjunto entre sus
 * avisos según lo que va aprendiendo: dos piezas adentro del mismo conjunto no compiten parejo —una
 * se lleva casi todo a los dos días— y la que quedó sin entrega **no perdió, no jugó**. Con un
 * conjunto cada una, cada pieza tiene su propio presupuesto y el número final se puede comparar.
 *
 * # 🔑 Lo único que se elige es la pieza, y es a propósito
 *
 * El texto, el título, el botón, el destino y la página salen de un **aviso modelo**; la
 * segmentación, la optimización, el cobro y el píxel salen de un **conjunto de referencia**. Los dos
 * de la misma campaña, o sea de algo que Meta ya aceptó y que hoy está entregando. Es la misma
 * decisión que toma `ModalCrear` y por el mismo motivo: el `targeting spec` y la matriz de
 * *objetivo × optimización × cobro* son la fuente número uno de rechazos, y un formulario con esos
 * campos es pedirle a una persona que adivine qué combinaciones son legales.
 *
 * Lo que queda para elegir es lo que se está probando —el archivo— más el nombre y el presupuesto.
 *
 * # Los bytes no pasan por el servidor
 *
 * Ver `useSubirPiezas`: el archivo va del browser al Blob directo y a Meta se le manda la URL, que
 * él se encarga de bajar. Nada de esto toca el tope de 4,5 MB del body de una función.
 *
 * ⚠️ **Armar el plan NO escribe en Meta.** Los pasos que aparecen —con el nombre de cada conjunto y
 * cada aviso que se va a crear— son la vista previa, con la receta ya validada contra Meta. Lo que
 * escribe es «Empezar», y **todo nace pausado**.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMeta } from '@/components/meta-ads/ContextoMeta'
import { useSubirPiezas } from '@/components/meta-ads/piezas/useSubirPiezas'
import { ProgresoPlan } from '@/components/meta-ads/planes/ProgresoPlan'
import { avanzarHasta } from '@/components/meta-ads/planes/usePlanes'
import {
  cancelarPlan, crearPlan, reintentarPaso, traerConjuntos, traerCreativos, traerEtapas,
} from '@/lib/meta-ads/cliente'
import { aCrudo, aMonto, LARGO_NOMBRE } from '@/lib/meta-ads/acciones'
import { nuevoIdemPlan, type Plan } from '@/lib/meta-ads/planes'
import { TOPE_PIEZAS } from '@/lib/meta-ads/pieza'
import type { AvisoCreativo, CampañaEtapa, ConjuntoMeta } from '@/lib/meta-ads/tipos'
import {
  Button, Card, Field, Input, Notice, NumberField, SectionCard, Select, color, font, radius, space,
} from '@/components/ui'

/**
 * El diario que se precarga cuando la referencia optimiza para tráfico.
 *
 * 🔑 **Es un valor de la operación, no un default técnico**: un conjunto de tráfico de esta pauta
 * sale de $1.800 por día. El de venta **no tiene default a propósito** — ese número lo decide una
 * persona cada vez, y precargarlo con cualquier cosa es invitar a que salga con el número de otra
 * campaña sin que nadie lo mire.
 */
const DIARIO_TRAFICO = 1800

/** Los `optimization_goal` que son tráfico. `LINK_CLICKS` está retirado pero sigue en conjuntos vivos. */
const METAS_TRAFICO = new Set(['LINK_CLICKS', 'LANDING_PAGE_VIEWS'])

export function CargarPiezas() {
  const { linea } = useMeta()
  const subida = useSubirPiezas()

  const [campanias, setCampanias] = useState<CampañaEtapa[] | null>(null)
  const [monedas, setMonedas] = useState<Record<string, string>>({})
  const [falloCenso, setFalloCenso] = useState<string | null>(null)
  const [campaniaId, setCampaniaId] = useState('')

  const [conjuntos, setConjuntos] = useState<ConjuntoMeta[] | null>(null)
  const [avisos, setAvisos] = useState<AvisoCreativo[] | null>(null)
  const [referenciaId, setReferenciaId] = useState('')
  const [modeloId, setModeloId] = useState('')

  const [nombre, setNombre] = useState('')
  const [monto, setMonto] = useState<number | ''>('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [enPlan, setEnPlan] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)
  // 🔑 El `idem` nace al MONTAR, no al apretar: si naciera al apretar, un doble clic serían dos
  // claves y dos tandas. Es el mismo con el que la sonda encuentra lo que el plan creó.
  const [idem] = useState(nuevoIdemPlan)

  // El censo, una vez. De acá salen las campañas donde se puede meter la tanda y la moneda de cada
  // cuenta, sin la que el presupuesto no se puede ni mostrar ni escribir.
  useEffect(() => {
    let vivo = true
    void traerEtapas().then((r) => {
      if (!vivo) return
      if (!r.ok) { setFalloCenso(r.motivo); setCampanias([]); return }
      const todas = Object.values(r.dato.lineas || {}).flat().filter(Boolean) as CampañaEtapa[]
      setCampanias(todas)
      setMonedas(Object.fromEntries(r.dato.cuentas.map((c) => [c.id, c.moneda || 'ARS'])))
    })
    return () => { vivo = false }
  }, [])

  // El efecto sólo va a buscar; **olvidar lo elegido antes lo hace el handler**, no acá. Un `setState`
  // sincrónico adentro de un efecto encadena renders, y además dejaría un cuadro intermedio con la
  // referencia vieja y la campaña nueva ya pintadas juntas.
  useEffect(() => {
    if (!campaniaId) return
    let vivo = true
    void traerConjuntos(campaniaId).then((r) => { if (vivo) setConjuntos(r.ok ? r.dato.conjuntos : []) })
    void traerCreativos(campaniaId).then((r) => { if (vivo) setAvisos(r.ok ? r.dato.ads : []) })
    return () => { vivo = false }
  }, [campaniaId])

  /**
   * ⛔ **Cambiar de campaña olvida la referencia, el modelo y el presupuesto.** Dejar una referencia
   * de la campaña anterior es exactamente cómo se arma una tanda en el lugar equivocado sin que
   * nadie lo note — el servidor lo rechazaría por ser de otra cuenta, pero dentro de la misma cuenta
   * no tiene forma de saber que no era eso lo que se quería.
   */
  const elegirCampania = (id: string) => {
    setCampaniaId(id)
    setConjuntos(null); setAvisos(null); setReferenciaId(''); setModeloId(''); setMonto('')
  }

  /**
   * El diario se precarga al ELEGIR la referencia y no en un efecto: recalcularlo en cada render
   * pisaría lo que alguien acaba de tipear.
   */
  const elegirReferencia = (id: string) => {
    setReferenciaId(id)
    const c = conjuntos?.find((x) => x.id === id) || null
    setMonto(c && METAS_TRAFICO.has(String(c.objetivo || '')) ? DIARIO_TRAFICO : '')
  }

  const campania = useMemo(() => campanias?.find((c) => c.id === campaniaId) || null, [campanias, campaniaId])
  const moneda = campania ? monedas[campania.cuentaId] || 'ARS' : 'ARS'
  const referencia = conjuntos?.find((c) => c.id === referenciaId) || null
  const modelo = avisos?.find((a) => a.id === modeloId) || null

  const limpio = nombre.trim()
  const nombreLargo = limpio.length > LARGO_NOMBRE
  const montoInvalido = typeof monto !== 'number' || monto <= 0
  const listo = !!limpio && !nombreLargo && !montoInvalido && !!campaniaId && !!referenciaId
    && !!modeloId && subida.listas.length > 0 && !subida.subiendo && !subida.demasiadas

  const armar = async () => {
    setEnPlan(true)
    setMotivo(null)
    const r = await crearPlan({
      tipo: 'piezas',
      idem,
      campaignId: campaniaId,
      referenciaId,
      modeloId,
      nombre: limpio,
      piezas: subida.listas,
      presupuestoCrudo: typeof monto === 'number' ? aCrudo(monto, moneda) : null,
    })
    setEnPlan(false)
    if (!r.ok) { setMotivo(r.motivo); return }
    setPlan(r.dato.plan)
  }

  if (plan) {
    return (
      <SectionCard title="Plan · piezas nuevas">
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.5 }}>
            Estos son los pasos que se van a mandar, <b>y Meta ya dijo que acepta la configuración</b>.
            Todavía no se escribió nada. <b>Se puede cerrar esto</b>: el plan queda en el Panel y el
            avance se retoma desde donde quedó. Un video puede tardar unos minutos en procesarse —
            mientras tanto el plan dice que está esperando, que <b>no es un error</b>.
          </div>
          <ProgresoPlan
            plan={plan}
            avanzando={enPlan}
            motivo={motivo}
            onSeguir={() => {
              setEnPlan(true); setMotivo(null)
              void avanzarHasta(plan.id, setPlan).then((m) => { setMotivo(m); setEnPlan(false) })
            }}
            onReintentar={(orden) => {
              setEnPlan(true); setMotivo(null)
              void reintentarPaso(plan.id, orden).then((r) => {
                if (!r.ok) { setMotivo(r.motivo); setEnPlan(false); return }
                setPlan(r.dato.plan)
                return avanzarHasta(plan.id, setPlan).then((m) => { setMotivo(m); setEnPlan(false) })
              })
            }}
            onCancelar={() => { void cancelarPlan(plan.id).then((r) => { if (r.ok) setPlan(r.dato.plan) }) }}
          />
          <div>
            <Button variant="ghost" onClick={() => { setPlan(null); subida.limpiar(); setNombre('') }}>
              Cargar otra tanda
            </Button>
          </div>
        </div>
      </SectionCard>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="Probar piezas nuevas">
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.5 }}>
            Cada archivo sale como <b>un conjunto propio con un aviso adentro</b>, con la segmentación
            de un conjunto que ya elegís y el texto de un aviso que ya está al aire.{' '}
            <b>Todo nace pausado</b>: no gasta hasta que alguien lo prenda, de a uno.
          </div>

          <Notice tone="brand">
            <b>Un conjunto por pieza, y no todas adentro de uno.</b> Meta reparte el presupuesto de un
            conjunto entre sus avisos: dos piezas juntas no compiten parejo, una se lleva casi todo a
            los dos días y la otra no perdió — no jugó. Separadas, cada una tiene su plata y el número
            del final se puede comparar. La contra es que <b>{TOPE_PIEZAS} piezas son {TOPE_PIEZAS}{' '}
            presupuestos diarios</b> el día que las prendas.
          </Notice>

          {falloCenso && <Notice tone="danger">No se pudieron leer las campañas: {falloCenso}</Notice>}

          <Field label="¿En qué campaña van los conjuntos nuevos?">
            <Select value={campaniaId} onChange={(e) => elegirCampania(e.target.value)}>
              <option value="">{campanias ? 'Elegí una campaña…' : 'Cargando…'}</option>
              {(campanias || []).map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </Select>
          </Field>

          {campaniaId && (
            <>
              <Field label="La segmentación sale de este conjunto">
                <Select value={referenciaId} onChange={(e) => elegirReferencia(e.target.value)}>
                  <option value="">{conjuntos ? 'Elegí un conjunto…' : 'Cargando…'}</option>
                  {(conjuntos || []).map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </Select>
              </Field>
              {conjuntos?.length === 0 && (
                <Notice tone="warning">Esa campaña no tiene conjuntos legibles: elegí otra.</Notice>
              )}

              <Field label="El texto sale de este aviso">
                <Select value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
                  <option value="">{avisos ? 'Elegí un aviso…' : 'Cargando…'}</option>
                  {(avisos || []).map((a) => (
                    <option key={a.id} value={a.id}>{a.nombre}</option>
                  ))}
                </Select>
              </Field>
              {modelo && <VistaDelCopy modelo={modelo} />}
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Los archivos">
        <ZonaDeArchivos subida={subida} />
      </SectionCard>

      <SectionCard title="El nombre y la plata">
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <Field label="Cómo se va a llamar la tanda">
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="PIEZAS AGOSTO"
            />
          </Field>
          <div style={{ fontSize: font.sm, color: color.mut }}>
            Cada conjunto se va a llamar <b>«{limpio || 'PIEZAS AGOSTO'} · nombre del archivo»</b>,
            que es lo que después distingue una pieza de otra en Ads Manager.
          </div>
          {nombreLargo && <Notice tone="danger">El nombre no puede pasar de {LARGO_NOMBRE} caracteres.</Notice>}

          <Field label="Presupuesto diario de CADA conjunto">
            <NumberField value={monto} onChange={setMonto} min={0} />
          </Field>
          {referencia && METAS_TRAFICO.has(String(referencia.objetivo || '')) && (
            <div style={{ fontSize: font.sm, color: color.mut }}>
              La referencia optimiza para tráfico, así que va precargado en {DIARIO_TRAFICO}.
            </div>
          )}
          {referencia && !METAS_TRAFICO.has(String(referencia.objetivo || '')) && (
            <Notice tone="warning">
              La referencia optimiza para <b>venta</b>, y ese número no se precarga: lo decidís vos
              cada vez. Con {subida.listas.length || 'N'} piezas, es{' '}
              <b>{typeof monto === 'number' && monto > 0
                ? `${(monto * Math.max(subida.listas.length, 1)).toLocaleString('es-AR')} por día`
                : 'ese número × la cantidad de piezas'}</b> cuando las prendas todas.
            </Notice>
          )}
          {montoInvalido && <Notice tone="warning">Poné un presupuesto diario mayor que cero.</Notice>}

          {referencia && referencia.diarioCrudo > 0 && (
            <div style={{ fontSize: font.sm, color: color.mut }}>
              El conjunto de referencia hoy gasta {aMonto(referencia.diarioCrudo, moneda).toLocaleString('es-AR')} por día.
            </div>
          )}

          {motivo && <Notice tone="danger">No se pudo armar el plan: {motivo}</Notice>}

          <div>
            <Button variant="solid" tone="brand" disabled={!listo || enPlan} onClick={() => void armar()}>
              {enPlan ? 'Preguntándole a Meta…' : 'Armar el plan'}
            </Button>
          </div>
          {linea === 'todas' && (
            <div style={{ fontSize: font.sm, color: color.mut }}>
              La marca de la tanda sale de la campaña elegida, no del selector de arriba.
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}

/** Lo que se hereda del aviso modelo, a la vista antes de armar nada. */
function VistaDelCopy({ modelo }: { modelo: AvisoCreativo }) {
  return (
    <Card>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start' }}>
        {modelo.imagen && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={modelo.imagen}
            alt=""
            style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: radius.sm, flex: '0 0 auto' }}
          />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], minWidth: 0 }}>
          <div style={{ fontSize: font.sm, color: color.mut }}>Se hereda de este aviso:</div>
          {modelo.titulo && <div style={{ fontWeight: 600 }}>{modelo.titulo}</div>}
          {modelo.texto && <div style={{ fontSize: font.sm, color: color.ink2 }}>{modelo.texto}</div>}
          <div style={{ fontSize: font.sm, color: color.mut }}>
            {modelo.cta ? <>Botón: <b>{modelo.cta}</b>. </> : 'Sin botón propio. '}
            {modelo.destino ? <>Va a <span style={{ wordBreak: 'break-all' }}>{modelo.destino}</span></> : 'Sin destino legible.'}
          </div>
        </div>
      </div>
    </Card>
  )
}

/** Elegir y soltar archivos, con el estado de cada subida a la vista. */
function ZonaDeArchivos({ subida }: { subida: ReturnType<typeof useSubirPiezas> }) {
  const [encima, setEncima] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <label
        onDragOver={(e) => { e.preventDefault(); setEncima(true) }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault()
          setEncima(false)
          if (e.dataTransfer.files?.length) subida.agregar(e.dataTransfer.files)
        }}
        style={{
          display: 'block', padding: space[5], textAlign: 'center', cursor: 'pointer',
          border: `2px dashed ${encima ? color.brand : color.line}`,
          borderRadius: radius.md,
          background: encima ? color.brandBg : color.bg,
        }}
      >
        <input
          type="file"
          multiple
          accept="video/*,image/*"
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.length) subida.agregar(e.target.files); e.target.value = '' }}
        />
        <div style={{ fontWeight: 600 }}>Arrastrá los videos y las fotos acá</div>
        <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[1] }}>
          o hacé clic para elegirlos. Hasta {TOPE_PIEZAS} por tanda.
        </div>
      </label>

      {subida.demasiadas && (
        <Notice tone="danger">
          Son más de {TOPE_PIEZAS} piezas. Sacá algunas: cada una es un conjunto con su presupuesto.
        </Notice>
      )}

      {subida.piezas.map((p) => (
        <div
          key={p.key}
          style={{
            display: 'flex', alignItems: 'center', gap: space[2], justifyContent: 'space-between',
            padding: space[2], border: `1px solid ${color.line}`, borderRadius: radius.sm,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</div>
            <div style={{ fontSize: font.sm, color: p.estado === 'fallada' ? color.danger : color.mut }}>
              {p.estado === 'esperando' && 'En la cola…'}
              {p.estado === 'subiendo' && 'Subiendo…'}
              {p.estado === 'lista' && `Lista · ${p.clase === 'video' ? 'video' : 'imagen'} · ${(p.tamanio / 1048576).toFixed(1)} MB`}
              {p.estado === 'fallada' && p.motivo}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => subida.sacar(p.key)}>Sacar</Button>
        </div>
      ))}
    </div>
  )
}
