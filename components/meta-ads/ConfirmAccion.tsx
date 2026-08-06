'use client'

/**
 * El cartel de confirmación de todo lo que ESCRIBE en Meta, y la plomería que lo acompaña.
 *
 * # Por qué hay un solo archivo para esto
 *
 * Las cuatro tandas de "accionar sobre la pauta" —pausar, escalar, duplicar, crear— comparten
 * exactamente la misma coreografía: confirmar con el detalle a la vista, mandar, esperar, contar
 * cómo salió y recargar. Escribirla en cada botón sería garantizar que el tercero se olvide del
 * `idem` (y duplique una campaña dos veces) o del recargar (y muestre el valor viejo como si nada
 * hubiera pasado).
 *
 * # Las tres cosas que el cartel tiene que decir sí o sí
 *
 *  1. **Sobre qué objeto.** Con las tres marcas en una sola cuenta publicitaria, "¿pausar esto?" no
 *     es una pregunta: hay que decir qué campaña y de qué marca.
 *  2. **De cuánto a cuánto.** El renglón «Presupuesto diario: $12.000 → $18.000» es el que hace que
 *     un cero de más se vea antes de apretar, no después.
 *  3. **Qué botón hace qué.** El botón dice la acción ("Poner $18.000 por día"), no "Confirmar".
 *
 * # El `idem` se genera al APRETAR, no al mandar
 *
 * Si se generara al mandar, un doble clic haría dos claves distintas y dos escrituras — que es
 * justo lo que evita. Generado al apretar, el segundo pedido choca contra el índice único de
 * `meta_ads_accion` y devuelve el resultado del primero sin llamar a Meta. En pausar eso es
 * cosmético; en la Tanda 2 es lo único que evita duplicar una campaña dos veces.
 */

import { useCallback, useState } from 'react'
import { accionarMeta } from '@/lib/meta-ads/cliente'
import { aCrudo, aMonto, nuevoIdem, type ClaveAccion, type NivelAccion } from '@/lib/meta-ads/acciones'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import {
  Button, ConfirmDetalle, Field, Modal, NumberField, Notice, color, font, space, useConfirmar, useToast,
} from '@/components/ui'

/** El objeto sobre el que se acciona, con lo que hace falta para poder contarlo en el cartel. */
export type ObjetoMeta = {
  nivel: NivelAccion
  id: string
  nombre: string
  /** La línea de la campaña de la que cuelga. `null` = todavía no tiene marca (el 409 del servidor). */
  linea: LineaPauta | null
  /** Moneda de la cuenta: define la unidad menor con la que Meta maneja los montos. */
  moneda: string
}

const ROTULO_NIVEL: Record<NivelAccion, string> = { campania: 'la campaña', conjunto: 'el conjunto', aviso: 'el aviso' }

/** Los montos se muestran redondeados: el centavo de un presupuesto diario no le importa a nadie. */
const money = (v: number, moneda: string) => {
  const cur = /^[A-Z]{3}$/.test(moneda) ? moneda : 'ARS'
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)
  } catch {
    return `${cur} ${new Intl.NumberFormat('es-AR').format(Math.round(v))}`
  }
}

/**
 * La plomería compartida: confirmar → mandar → contar → recargar.
 *
 * `enCurso` es el id del objeto que se está tocando. Va por objeto y no como un booleano global
 * porque en una tabla de doce campañas un spinner en todas las filas no dice nada.
 *
 * `recargar` no es opcional a propósito. Meta contesta el valor releído, pero la pantalla también
 * tiene los subtotales por etapa, el diagnóstico y el reparto por marca calculados sobre el censo:
 * parchear una fila a mano dejaría todo lo demás mintiendo.
 */
export function useAccionMeta(recargar: () => void) {
  const { confirmar } = useConfirmar()
  const toast = useToast()
  const [enCurso, setEnCurso] = useState<string | null>(null)

  const mandar = useCallback(async (
    o: ObjetoMeta,
    accion: ClaveAccion,
    campos: Record<string, string | number>,
    idem: string,
    exito: string,
  ) => {
    setEnCurso(o.id)
    const r = await accionarMeta({ accion, nivel: o.nivel, objetoId: o.id, campos, idem })
    setEnCurso(null)
    if (r.ok) {
      // «Se registró» no es un detalle burocrático: cuando el log falla y Meta ya aplicó, la plata
      // se movió igual y quien lo hizo tiene que saber que no quedó escrito quién fue.
      if (r.dato.sinRegistro) toast.aviso(`${exito} ⚠️ No se pudo dejar registro de quién lo hizo.`)
      else toast.ok(exito)
      recargar()
      return true
    }
    // El 409 de «esta campaña no tiene marca» no es un error de la persona ni algo que se arregle
    // reintentando: se arregla asignándola, ahí nomás, en la columna Marca de esta misma tabla.
    if (r.sinLinea) toast.error('Esta campaña todavía no tiene marca. Asignala en la columna «Marca» de esta tabla y volvé.')
    else toast.error(r.motivo)
    return false
  }, [recargar, toast])

  /**
   * Pausar o reactivar. Es reversible y su peor caso es perder un día de entrega, así que el cartel
   * es corto — pero existe: apagar una campaña que está entregando se hace con un clic y se nota
   * recién al día siguiente.
   */
  const cambiarEstado = useCallback(async (o: ObjetoMeta, estadoActual: string | null) => {
    const idem = nuevoIdem()
    const activo = estadoActual === 'ACTIVE'
    const nuevo: 'ACTIVE' | 'PAUSED' = activo ? 'PAUSED' : 'ACTIVE'
    const ok = await confirmar({
      titulo: activo ? `¿Pausar ${ROTULO_NIVEL[o.nivel]}?` : `¿Reactivar ${ROTULO_NIVEL[o.nivel]}?`,
      tono: activo ? 'warning' : 'brand',
      ok: activo ? 'Pausar' : 'Reactivar',
      mensaje: (
        <div>
          <div style={{ marginBottom: space[2] }}>
            {activo
              ? 'Deja de mostrarse y de gastar en el acto, hasta que alguien la vuelva a activar.'
              : 'Vuelve a mostrarse y a consumir presupuesto en el acto.'}
          </div>
          <ConfirmDetalle label={ROTULO_NIVEL[o.nivel]} valor={o.nombre} />
          {o.linea && <ConfirmDetalle label="Marca" valor={ETIQUETA_LINEA[o.linea]} />}
          <ConfirmDetalle label="Estado" valor={`${activo ? 'Activa' : 'Pausada'} → ${activo ? 'Pausada' : 'Activa'}`} />
        </div>
      ),
    })
    if (!ok) return false
    return mandar(o, 'estado', { status: nuevo }, idem, activo ? 'Pausada.' : 'Reactivada.')
  }, [confirmar, mandar])

  return { enCurso, mandar, cambiarEstado }
}

/**
 * Lo que una fila necesita para poder dibujar sus botones: qué puede esta persona **en esa línea**,
 * qué se está escribiendo ahora mismo, y a quién avisarle cuando se aprieta.
 *
 * `puede` recibe la línea y no un booleano ya resuelto porque las tres marcas se pautean desde la
 * misma cuenta: en una misma tabla puede haber una campaña de BDI que esta persona acciona y una de
 * Zattia que no. Un permiso resuelto una vez por pantalla sería el bug que este archivo evita.
 */
export type Acciones = {
  puede: (accion: ClaveAccion, linea: LineaPauta | null) => boolean
  /** El id del objeto que se está escribiendo, o `null`. Por objeto: en una tabla de doce filas, un
   *  spinner en todas no dice nada. */
  enCurso: string | null
  onEstado: (o: ObjetoMeta, estadoActual: string | null) => void
  onPresupuesto: (o: ObjetoMeta, diarioCrudo: number) => void
}

/**
 * Los botones de una fila. Los usan la tabla de campañas y la de conjuntos, con las mismas reglas.
 *
 * Qué se dibuja y qué no:
 *  - **Reactivar** aparece en lo que está pausado; **Pausar**, en lo que está entregando.
 *  - **Presupuesto** sólo donde hay un diario propio que tocar. Si el presupuesto está a nivel
 *    campaña (CBO) o es un total (lifetime), no se dibuja: sería un botón que Meta rechaza.
 *  - `inerte` es el caso de las publicaciones de Instagram promocionadas: figuran ACTIVE para
 *    siempre y no entregan nada hace meses. Son cientos, y llenarlas de botones taparía las cinco
 *    campañas que se llevan la plata. Se dice por qué en el `title` en vez de esconderlo.
 */
export function BotonesAccion({ objeto, estado, diarioCrudo, sinPresupuesto, inerte, acciones }: {
  objeto: ObjetoMeta
  estado: string | null
  diarioCrudo: number
  /** El presupuesto no vive en este objeto (CBO en la campaña, o presupuesto total). */
  sinPresupuesto?: boolean
  /** Por qué este objeto no ofrece acciones aunque figure activo. */
  inerte?: string | null
  acciones: Acciones
}) {
  const activo = estado === 'ACTIVE'
  const puedeEstado = acciones.puede('estado', objeto.linea)
  const puedePresupuesto = acciones.puede('presupuesto', objeto.linea)
  const trabajando = acciones.enCurso === objeto.id

  if (!puedeEstado && !puedePresupuesto) return <span style={{ color: color.mut2 }}>—</span>
  if (activo && inerte) return <span style={{ color: color.mut2 }} title={inerte}>—</span>

  return (
    <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
      {puedeEstado && (
        <Button
          size="sm"
          variant="ghost"
          disabled={trabajando}
          onClick={() => acciones.onEstado(objeto, estado)}
        >
          {trabajando ? '…' : activo ? 'Pausar' : 'Reactivar'}
        </Button>
      )}
      {puedePresupuesto && !sinPresupuesto && diarioCrudo > 0 && (
        <Button
          size="sm"
          variant="ghost"
          disabled={trabajando}
          onClick={() => acciones.onPresupuesto(objeto, diarioCrudo)}
        >
          Presupuesto
        </Button>
      )}
    </div>
  )
}

/**
 * Cambiar el presupuesto diario.
 *
 * # Por qué esto es un modal propio y no un `confirmar()` más
 *
 * Porque hay un número que tipear, y partirlo en dos pasos —primero pedir el monto, después
 * confirmarlo— sería preguntar dos veces lo mismo. **Este modal ES la confirmación**: muestra el
 * valor de hoy, el nuevo y la diferencia en vivo, y su botón dice cuánto va a quedar. Un cero de
 * más se ve mientras se tipea, que es cuando sirve verlo.
 *
 * 🔑 Meta maneja los montos en la **unidad menor de la moneda** (en ARS, `1800000` es $18.000). La
 * conversión pasa por `aCrudo`/`aMonto` y por ningún otro lado: un `×100` de más es la diferencia
 * entre subir el diario y multiplicarlo por cien, y Meta acepta los dos sin chistar.
 */
export function ModalPresupuesto({ o, diarioCrudo, onCerrar, onGuardar, guardando }: {
  o: ObjetoMeta
  diarioCrudo: number
  onCerrar: () => void
  onGuardar: (nuevoCrudo: number, idem: string) => void
  guardando: boolean
}) {
  const actual = aMonto(diarioCrudo, o.moneda)
  const [monto, setMonto] = useState<number | ''>(Math.round(actual))
  // El `idem` nace con el modal, no con el clic en Guardar: si naciera con el clic, dos clics
  // rápidos serían dos claves y dos escrituras.
  const [idem] = useState(nuevoIdem)

  const nuevo = typeof monto === 'number' ? monto : 0
  const delta = nuevo - actual
  const invalido = typeof monto !== 'number' || monto <= 0
  const sinCambio = !invalido && aCrudo(nuevo, o.moneda) === diarioCrudo

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={`Presupuesto diario · ${ROTULO_NIVEL[o.nivel]}`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button
            variant="solid"
            tone={delta > 0 ? 'warning' : 'brand'}
            disabled={invalido || sinCambio || guardando}
            onClick={() => onGuardar(aCrudo(nuevo, o.moneda), idem)}
          >
            {guardando ? 'Escribiendo en Meta…' : `Poner ${money(nuevo, o.moneda)} por día`}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.5 }}>
          <b>{o.nombre}</b>
          {o.linea && <div style={{ fontSize: font.sm, color: color.mut }}>{ETIQUETA_LINEA[o.linea]}</div>}
        </div>

        {/* El caso CBO —el presupuesto vive en la campaña y el del conjunto no se toca— no llega
            hasta acá: el botón no se dibuja (`BotonesAccion`, `sinPresupuesto`) y, si alguien lo
            fuerza igual, lo corta el 409 del servidor. Este modal sólo se abre donde hay un diario
            propio que cambiar. */}
        <Field label="Presupuesto diario" hint="Lo que Meta puede gastar por día. Cambia la entrega en el acto.">
          <NumberField value={monto} onChange={setMonto} min={0} step={100} prefix="$" width={160} invalid={invalido} />
        </Field>

        <div>
          <ConfirmDetalle label="Hoy" valor={money(actual, o.moneda)} />
          <ConfirmDetalle label="Va a quedar" valor={invalido ? '—' : money(nuevo, o.moneda)} />
          {!invalido && delta !== 0 && (
            <ConfirmDetalle
              label="Diferencia"
              valor={
                <span style={{ color: delta > 0 ? color.warningInk : color.mut }}>
                  {delta > 0 ? '+' : '−'}{money(Math.abs(delta), o.moneda)} por día
                  {actual > 0 && ` (${delta > 0 ? '+' : '−'}${Math.round(Math.abs(delta / actual) * 100)}%)`}
                </span>
              }
            />
          )}
        </div>

        {/* Lo que no es obvio y cambia la decisión: un salto grande de presupuesto reabre la fase de
            aprendizaje y los primeros días rinden peor. No se bloquea —los topes de variación
            quedaron descartados a propósito—, se dice. */}
        {!invalido && actual > 0 && Math.abs(delta / actual) >= 0.25 && (
          <Notice tone="warning">
            Es un salto de más del 25%. Meta vuelve a poner {ROTULO_NIVEL[o.nivel]} en fase de
            aprendizaje y los primeros días suelen rendir peor. No lo impide nadie, pero conviene
            saberlo antes.
          </Notice>
        )}
      </div>
    </Modal>
  )
}
