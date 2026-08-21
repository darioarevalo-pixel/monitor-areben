'use client'

/**
 * Los números del módulo, por marca.
 *
 * **Por qué existe esta pantalla.** La tabla `canje_config` y su acción de guardado están desde la
 * Fase 1, y hasta ahora no las llamaba nadie: cada uno de estos valores se cambiaba entrando a la
 * base a mano. Eso convirtió en "pedido de desarrollo" cosas que son decisiones del sector —con qué
 * palabra se cuentan las unidades, cada cuánto se le puede volver a escribir a alguien— y dejó al
 * cupón de Tienda Nube sin ningún lugar donde vivir.
 *
 * **No es por usuario ni global: es por marca.** BDI habla de fundas y Zattia de prendas, y cada
 * una tiene su cupón. La marca es la que está elegida arriba, en la solapa de la sección.
 *
 * ⚠️ El gate real es `esAdministracion()` en `api/_canjes.js`. Acá se esconde el formulario para no
 * ofrecer algo que el servidor va a rechazar, pero eso es cortesía, no seguridad.
 */

import { useState } from 'react'
import {
  Button, Field, Input, Notice, SectionCard, color, font, space, weight, useToast,
} from '@/components/ui'
import { guardarConfig } from '@/lib/canjes/cliente'
import { STORE_LABEL, type CanjeConfig, type CanjeStore } from '@/lib/canjes/tipos'

/** El valor de un número que puede estar vacío. `null` no es `0` y la diferencia importa. */
const aTexto = (v: number | null | undefined) => (v == null ? '' : String(v))
const aNumero = (v: string) => (v.trim() === '' ? null : Number(v))

export function Ajustes({
  store, config, puedeEditar, onGuardado,
}: {
  store: CanjeStore
  config: CanjeConfig | null
  /** Espejo de `esAdministracion()` del handler. Sin esto, el formulario se muestra en lectura. */
  puedeEditar: boolean
  onGuardado: () => void
}) {
  const toast = useToast()
  const [guardando, setGuardando] = useState(false)

  // ⚠️ El formulario se inicializa UNA vez y se remonta con `key` desde la sección cuando llega
  // otra config (la carga es asincrónica y la marca se cambia arriba). Sincronizarlo con un
  // `useEffect` + setState es lo que el lint prohíbe, y con razón: acá además pisaría lo que se
  // estaba tipeando si la sección se recargara sola.
  const [cupon, setCupon] = useState(config?.cupon_codigo ?? '')
  const [emailPedido, setEmailPedido] = useState(config?.email_pedido ?? '')
  const [unidad, setUnidad] = useState(config?.unidad_default ?? '')
  const [drive, setDrive] = useState(config?.drive_url ?? '')
  const [umbral, setUmbral] = useState(aTexto(config?.umbral_aprobacion_alta))
  const [cadencia, setCadencia] = useState(aTexto(config?.cadencia_dias_default))
  const [plazo, setPlazo] = useState(aTexto(config?.plazo_entregable_dias_default))
  const [factor, setFactor] = useState(aTexto(config?.factor_costo_estimado))
  const [topeEvidencias, setTopeEvidencias] = useState(aTexto(config?.tope_evidencias_por_canje))
  const [incompletos, setIncompletos] = useState(aTexto(config?.cierres_incompletos_no_repetir))
  const [bloquear, setBloquear] = useState(config?.bloquear_por_vencidos === true)

  async function guardar() {
    setGuardando(true)
    try {
      await guardarConfig(store, {
        cupon_codigo: cupon.trim() || null,
        email_pedido: emailPedido.trim().toLowerCase() || null,
        unidad_default: unidad.trim() || null,
        drive_url: drive.trim() || null,
        umbral_aprobacion_alta: aNumero(umbral),
        cadencia_dias_default: aNumero(cadencia) ?? 90,
        plazo_entregable_dias_default: aNumero(plazo) ?? 10,
        factor_costo_estimado: aNumero(factor) ?? 0.4,
        tope_evidencias_por_canje: aNumero(topeEvidencias) ?? 30,
        cierres_incompletos_no_repetir: aNumero(incompletos) ?? 2,
        bloquear_por_vencidos: bloquear,
      })
      toast.ok('Guardado.')
      onGuardado()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  const off = !puedeEditar || guardando

  return (
    <>
      {!puedeEditar && (
        <div style={{ marginBottom: space[4] }}>
          <Notice tone="neutral">
            Esto lo cambia Administración. Podés mirar cómo está configurado, pero no guardarlo.
          </Notice>
        </div>
      )}

      <SectionCard
        title={`La orden de ${STORE_LABEL[store]} en Tienda Nube`}
        subtitle="Los dos datos que son siempre los mismos al tipear la orden de un canje."
      >
        {/* ⚠️ El monitor NO puede crear cupones en Tienda Nube: no hay credenciales de la tienda en
            este repo. El cupón se crea una vez a mano en el admin y acá sólo se guarda el código
            para no ir a buscarlo en cada canje. */}
        <Field
          label="Código del cupón"
          hint="Se crea a mano en Tienda Nube. Uno solo por marca, para todos los canjes."
          width={280}
        >
          <Input value={cupon} onChange={(e) => setCupon(e.target.value)} disabled={off} placeholder="Sin cargar" />
        </Field>
        <div style={{ color: color.mut, fontSize: font.sm, marginTop: space[2] }}>
          Aparece con su botón de copiar en la ficha de cada canje, al lado de los datos para tipear
          la orden. Se guarda en el canje el día que se registra la compra, para que dentro de un año
          se pueda entender una orden vieja aunque el código haya cambiado.
        </div>

        {/* El mail de la marca, no el de ella. La orden es un trámite interno; el mail de la
            creadora es una herramienta de contacto que vive en el padrón y no tiene por qué entrar
            a la tienda —ni que TN le mande los avisos de una compra que ella no hizo. */}
        <div style={{ marginTop: space[5] }}>
          <Field
            label="Mail para la orden"
            hint="El de la marca. NO se usa el de la creadora."
            width={280}
          >
            <Input
              type="email"
              value={emailPedido}
              onChange={(e) => setEmailPedido(e.target.value)}
              disabled={off}
              placeholder="Sin cargar"
            />
          </Field>
          <div style={{ color: color.mut, fontSize: font.sm, marginTop: space[2] }}>
            Todas las órdenes de canje de la marca quedan bajo este mismo cliente en Tienda Nube, y
            la tienda no le manda nada a ella. El mail de la creadora queda igual en su ficha del
            padrón: es con lo que se la vuelve a contactar más adelante.
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Cómo se habla" subtitle="Las palabras que la marca usa todos los días.">
        <Field
          label="Con qué se cuentan las unidades"
          hint="BDI cuenta fundas; Zattia, prendas. Sin esto dice “productos”."
          width={280}
        >
          <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} disabled={off} placeholder="productos" />
        </Field>
      </SectionCard>

      <SectionCard title="Los plazos" subtitle="Los valores por defecto: cada canje puede tener el suyo.">
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Cadencia" hint="Días entre dos canjes con la misma persona" width={180}>
            <Input type="number" value={cadencia} onChange={(e) => setCadencia(e.target.value)} disabled={off} />
          </Field>
          <Field label="Plazo de cada entregable" hint="Días desde que le llega el pedido" width={180}>
            <Input type="number" value={plazo} onChange={(e) => setPlazo(e.target.value)} disabled={off} />
          </Field>
          <Field label="Tope de evidencias" hint="Por canje" width={150}>
            <Input type="number" value={topeEvidencias} onChange={(e) => setTopeEvidencias(e.target.value)} disabled={off} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Las firmas y la plata" subtitle="Quién tiene que aprobar y con qué números se estima.">
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          {/* `null` no es 0: vacío significa que TODO va a la firma alta, que es el default seguro
              con el que arrancó el módulo. Por eso el hint lo dice en vez de poner un 0. */}
          <Field
            label="Umbral de la firma alta"
            hint="Vacío = todo va a la firma alta"
            width={220}
          >
            <Input type="number" value={umbral} onChange={(e) => setUmbral(e.target.value)} disabled={off} placeholder="Todo" />
          </Field>
          <Field
            label="Factor de costo estimado"
            hint="Ratio costo/PVP para estimar antes de cargar los productos"
            width={220}
          >
            <Input type="number" step="0.05" value={factor} onChange={(e) => setFactor(e.target.value)} disabled={off} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="El cumplimiento" subtitle="Qué hace el sistema con quien no cumple lo que prometió.">
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Cierres incompletos para “no repetir”" hint="Se sale solo si después cumple" width={260}>
            <Input type="number" value={incompletos} onChange={(e) => setIncompletos(e.target.value)} disabled={off} />
          </Field>
        </div>
        <label style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', marginTop: space[3] }}>
          <input
            type="checkbox"
            checked={bloquear}
            onChange={(e) => setBloquear(e.target.checked)}
            disabled={off}
            style={{ marginTop: 3 }}
          />
          <span>
            <span style={{ fontWeight: weight.medium }}>Frenar canjes nuevos con quien tiene entregables vencidos</span>
            {/* ⚠️ Arranca apagado a propósito. El riesgo del módulo no es técnico: si el cumplimiento
                no se carga, TODO EL MUNDO figura como incumplidor y el sistema empieza a frenar
                gente que sí cumplió. */}
            <span style={{ display: 'block', color: color.mut, fontSize: font.sm }}>
              Prendelo recién cuando la carga de evidencias se haya sostenido un mes. Si nadie carga
              lo que se publicó, todo el mundo figura como incumplidor y se traba gente que cumplió.
            </span>
          </span>
        </label>
      </SectionCard>

      <SectionCard title="Dónde se archiva el contenido" subtitle="Una sola carpeta por marca. El sistema no la organiza.">
        <Field label="Carpeta de Drive" hint="Es el archivo final, no por donde entra: ella sube desde su link" width={420}>
          <Input value={drive} onChange={(e) => setDrive(e.target.value)} disabled={off} placeholder="https://drive.google.com/…" />
        </Field>
      </SectionCard>

      {puedeEditar && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="solid" tone="brand" onClick={() => void guardar()} loading={guardando}>
            Guardar los ajustes de {STORE_LABEL[store]}
          </Button>
        </div>
      )}
    </>
  )
}
