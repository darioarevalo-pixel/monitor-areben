'use client'

/**
 * **Duplicar y ajustar.**
 *
 * # Por qué es un modal y ya no un cartel de sí/no
 *
 * Porque duplicar sin ajustar deja una copia idéntica con un nombre automático, y lo que hace falta
 * de verdad —sacar otra igual pero con otro nombre y otra plata— obligaba a duplicar, buscar la
 * copia en la tabla, renombrarla y recién ahí tocarle el presupuesto. Los tres campos juntos son la
 * operación completa; vacíos, se comporta exactamente como el cartel viejo.
 *
 * # Lo que el modal tiene que averiguar antes de poder ofrecer el presupuesto
 *
 * 🔑 **Toda la pauta es ABO: la plata vive en el conjunto, no en la campaña.** Así que el
 * presupuesto de la copia de una campaña no se le escribe a la campaña —ahí no hay nada que tocar—
 * sino a su conjunto. Por eso, al abrirse sobre una campaña sin presupuesto propio, el modal va a
 * mirar cuántos conjuntos tiene: con uno solo ofrece el campo y dice a cuál se lo va a poner; con
 * varios no lo ofrece y explica que la copia sale con los mismos montos. Ofrecer un campo que
 * después se aplica a "alguno" de los conjuntos sería peor que no ofrecerlo.
 *
 * # La segunda salida: armar un PLAN (tanda 3)
 *
 * Cuando el aviso de arriba dice que Meta va a rechazar la copia —por el tope de 3 avisos o por el
 * campo de «mejoras estándar»— el camino de una sola llamada no tiene arreglo: los dos rechazos
 * salen de que `POST /copies` copia el creativo entero y no lo controlamos.
 *
 * 🔑 **El plan los esquiva a los dos con la misma decisión**: copia *shallow* (sin avisos, que es un
 * POST chico que Meta no rechaza) y después crea cada aviso reusando el `creative_id` del original,
 * que nunca arrastra el campo obsoleto. Por eso el botón grande pasa a ser «Armar un plan» cuando la
 * copia está condenada: «Duplicar igual» sobre un cartel rojo es invitar a gastar una escritura de
 * cupo para recibir el mismo no. Queda igual, en chico, porque el diagnóstico puede fallar.
 */

import { useEffect, useState } from 'react'
import { cancelarPlan, crearPlan, reintentarPaso, traerConjuntos, traerMejoras } from '@/lib/meta-ads/cliente'
import { aCrudo, aMonto, LARGO_NOMBRE, nuevoIdem, TOPE_ADS_SINCRONO, type NivelAccion } from '@/lib/meta-ads/acciones'
import { nuevoIdemPlan, type Plan } from '@/lib/meta-ads/planes'
import { ProgresoPlan } from '@/components/meta-ads/planes/ProgresoPlan'
import { avanzarHasta } from '@/components/meta-ads/planes/usePlanes'
import { dondeVaElPresupuesto, segunLosConjuntos, type Presupuestable } from '@/lib/meta-ads/copia'
import { money } from '@/lib/meta-ads/formato'
import { bloqueoDeLaCopia, copiaCondenada, type BloqueoCopia } from '@/lib/meta-ads/mejoras'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import {
  Button, ConfirmDetalle, Field, Input, Modal, Notice, NumberField, color, font, space,
} from '@/components/ui'
import { ROTULO_NIVEL, type AjustesCopia, type ObjetoMeta } from '@/components/meta-ads/acciones/tipos'

/**
 * **Lo que Meta va a contestar, dicho antes de apretar.**
 *
 * Los dos motivos por los que una copia se rechaza se ven igual desde afuera —«no se pudo
 * duplicar»— y ninguno se arregla reintentando:
 *
 *  1. **El tope de la vía síncrona**: más de `TOPE_ADS_SINCRONO` avisos y el servidor lo rechaza sin
 *     tocar Meta. Va primero porque es el que corta primero.
 *  2. **El campo de «mejoras estándar»**, que Meta deprecó. Un solo aviso alcanza para tumbar la
 *     copia entera, y no lo controla el monitor: `POST /copies` no manda el creativo, lo copia Meta.
 *
 * 🔑 **Cuando NO hay bloqueo también se dice.** Un cartel que sólo aparece con malas noticias deja a
 * la persona sin saber si el silencio es «está todo bien» o «no se miró» — y acá hay un tercer estado
 * real («Meta no devolvió los creativos») que es justo el que no se puede confundir con los otros dos.
 */
function AvisoBloqueo({ b, nivel }: { b: BloqueoCopia; nivel: NivelAccion }) {
  const rotulo = ROTULO_NIVEL[nivel]
  const Rotulo = rotulo.charAt(0).toUpperCase() + rotulo.slice(1)

  if (b.fase === 'mirando') {
    return <div style={{ fontSize: font.sm, color: color.mut2 }}>Mirando si Meta va a aceptar la copia…</div>
  }
  if (b.fase === 'sin-datos') {
    return <div style={{ fontSize: font.sm, color: color.mut }}>{b.motivo} Se puede intentar igual.</div>
  }

  if (b.pasaElTope) {
    return (
      <Notice tone="danger">
        {Rotulo} tiene <b>{b.avisos} avisos</b> y Meta copia hasta {TOPE_ADS_SINCRONO} de una vez:
        el pedido se rechaza sin tocar nada. Para esto hay que duplicarlo desde Ads Manager.
        {b.obsoletos > 0 && ' (Y además hay avisos con el campo de mejoras estándar, que también lo frena.)'}
      </Notice>
    )
  }

  if (b.obsoletos > 0) {
    return (
      <Notice tone="danger">
        <b>{b.obsoletos === b.avisos ? `Sus ${b.avisos === 1 ? 'único aviso lleva' : `${b.avisos} avisos llevan`}` : `${b.obsoletos} de sus ${b.avisos} avisos llevan`} el campo de «mejoras estándar» que Meta dejó de aceptar</b>, así que
        va a rechazar la copia. No lo controla el monitor: la copia la arma Meta con el creativo del
        original. Se arregla rearmando esos avisos en Ads Manager, eligiendo las funciones una por una.
        {b.nombres.length > 0 && (
          <div style={{ marginTop: space[1], fontSize: font.sm }}>
            {b.nombres.join(' · ')}{b.obsoletos > b.nombres.length && ` y ${b.obsoletos - b.nombres.length} más`}
          </div>
        )}
      </Notice>
    )
  }

  if (b.avisos === 0) {
    return (
      <div style={{ fontSize: font.sm, color: color.mut }}>
        No tiene avisos, así que la copia no crea ninguno: Meta la va a aceptar.
      </div>
    )
  }

  return (
    <div style={{ fontSize: font.sm, color: color.mut }}>
      {b.avisos === 1 ? 'Su único aviso no lleva' : `Sus ${b.avisos} avisos no llevan`} el campo que
      Meta deprecó{b.sinSpec > 0 ? ` (de ${b.sinSpec} no se pudo confirmar)` : ''}, así que la copia
      debería salir.
    </div>
  )
}

export function ModalDuplicar({ o, diarioCrudo, sinPresupuesto, onCerrar, onDuplicar, trabajando }: {
  o: ObjetoMeta
  /** El diario propio del objeto que se duplica, crudo. 0 si no tiene. */
  diarioCrudo: number
  /** El presupuesto no vive en este objeto: CBO en la campaña padre, o presupuesto total. */
  sinPresupuesto: boolean
  onCerrar: () => void
  onDuplicar: (aj: AjustesCopia) => void
  trabajando: boolean
}) {
  const [nombre, setNombre] = useState('')
  // 🔑 El monto arranca **derivado** del presupuesto de hoy y sólo pasa a ser estado propio cuando
  // alguien lo toca. Copiarlo con un efecto (`if (fase==='listo') setMonto(base)`) es el patrón que
  // ya mordió dos veces en esta pantalla: un efecto que corrige el estado después de renderizar deja
  // un cuadro intermedio con el valor viejo, y encima pisaría lo tipeado si la lectura contesta
  // tarde. `tocado` es lo que distingue «todavía no lo tocó» de «lo borró a propósito».
  const [monto, setMonto] = useState<number | ''>('')
  const [tocado, setTocado] = useState(false)
  // Los tres `idem` nacen con el modal, no con el clic: dos clics rápidos serían dos copias.
  const [idems] = useState(() => ({ duplicar: nuevoIdem(), nombre: nuevoIdem(), presupuesto: nuevoIdem() }))
  const [presu, setPresu] = useState<Presupuestable>(() => dondeVaElPresupuesto(o.nivel, diarioCrudo, sinPresupuesto))
  // El plan, cuando se elige esa salida. Nace con el modal abierto y se sigue desde acá: mandar a
  // buscarlo al Panel después de armarlo perdería a la persona justo en el medio de la operación.
  const [plan, setPlan] = useState<Plan | null>(null)
  const [enPlan, setEnPlan] = useState(false)
  const [motivoPlan, setMotivoPlan] = useState<string | null>(null)
  // Su propio `idem`, nacido con el modal igual que los otros tres: de él se deriva el marcador con
  // el que la sonda encuentra lo que el plan cree, así que dos clics tienen que dar el mismo.
  const [idemPlan] = useState(() => nuevoIdemPlan())
  // Sin la campaña no se puede preguntar, y decirlo es mejor que dibujar un cartel vacío para siempre.
  const [bloqueo, setBloqueo] = useState<BloqueoCopia>(() => (
    o.campania ? { fase: 'mirando' } : { fase: 'sin-datos', motivo: 'No se pudo mirar si los creativos se pueden copiar.' }
  ))

  /**
   * ¿Meta va a aceptar esta copia? Una lectura, al abrir el modal.
   *
   * 🔑 **Acá y no al desplegar la fila.** Es el único momento en que la respuesta cambia una decisión;
   * pedirlo al desplegar sería un viaje a Meta por cada campaña que alguien mire de paso. Y no toca
   * nada: si falla, duplicar sigue habilitado y el modal dice que no se pudo averiguar.
   */
  useEffect(() => {
    const camp = o.campania
    if (!camp) return
    let vivo = true
    traerMejoras(camp).then((r) => {
      if (vivo) setBloqueo(bloqueoDeLaCopia(o.nivel, o.id, r))
    })
    return () => { vivo = false }
  }, [o.campania, o.nivel, o.id])

  // Los conjuntos de la campaña, sólo cuando hace falta decidir dónde iría el presupuesto. Es una
  // lectura y no toca nada; `vivo` corta la carrera de cerrar el modal antes de que conteste.
  useEffect(() => {
    if (presu.fase !== 'mirando') return
    let vivo = true
    traerConjuntos(o.id).then((r) => {
      if (!vivo) return
      setPresu(segunLosConjuntos(r))
    })
    return () => { vivo = false }
    // Corre una sola vez por modal: `presu` cambia de fase justo por este efecto, y volver a
    // dispararlo con ella en las dependencias sería un pedido por cada respuesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id])

  const limpio = nombre.trim()
  const nombreLargo = limpio.length > LARGO_NOMBRE
  const igualAlOriginal = !!limpio && limpio === o.nombre.trim()
  const base = presu.fase === 'listo' ? aMonto(presu.baseCruda, o.moneda) : 0
  // Lo que ve el campo: el presupuesto de hoy mientras nadie lo toque, lo tipeado en cuanto lo hagan.
  const campo: number | '' = tocado ? monto : presu.fase === 'listo' ? Math.round(base) : ''
  const nuevoMonto = typeof campo === 'number' ? campo : 0
  const montoInvalido = presu.fase === 'listo' && (typeof campo !== 'number' || campo <= 0)
  const cambiaPlata = presu.fase === 'listo' && !montoInvalido && aCrudo(nuevoMonto, o.moneda) !== presu.baseCruda
  const ajusta = (!!limpio && !nombreLargo) || cambiaPlata
  const delta = nuevoMonto - base
  const condenada = copiaCondenada(bloqueo)

  /**
   * Arma el plan. ⚠️ **No escribe en Meta**: deja los pasos guardados para poder leerlos antes de
   * ejecutarlos, que es la mitad del valor de tener un plan. Lo que escribe es «Empezar».
   */
  const armarPlan = async () => {
    setEnPlan(true)
    setMotivoPlan(null)
    const r = await crearPlan({
      tipo: 'duplicar',
      idem: idemPlan,
      nivel: o.nivel,
      objetoId: o.id,
      copias: 1,
      nombre: limpio || null,
      presupuestoCrudo: cambiaPlata ? aCrudo(nuevoMonto, o.moneda) : null,
    })
    setEnPlan(false)
    if (!r.ok) { setMotivoPlan(r.motivo); return }
    setPlan(r.dato.plan)
  }

  // Con el plan armado, el modal deja de ser un formulario y pasa a ser el progreso: mandar a
  // buscarlo al Panel perdería a la persona justo en el medio de la operación.
  if (plan) {
    return (
      <Modal
        abierto
        onCerrar={onCerrar}
        cerrarConFondo={false}
        titulo={`Plan · ${ROTULO_NIVEL[o.nivel]}`}
        pie={<Button variant="ghost" onClick={onCerrar}>Cerrar</Button>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.5 }}>
            La copia se arma en pasos chicos: primero el objeto vacío y después un aviso por vez,
            reusando el creativo del original. <b>Se puede cerrar esto</b>: el plan queda en el Panel y
            el avance se retoma desde donde quedó.
          </div>
          <ProgresoPlan
            plan={plan}
            avanzando={enPlan}
            motivo={motivoPlan}
            onSeguir={() => {
              setEnPlan(true)
              setMotivoPlan(null)
              void avanzarHasta(plan.id, setPlan).then((m) => { setMotivoPlan(m); setEnPlan(false) })
            }}
            onReintentar={(orden) => {
              setEnPlan(true)
              setMotivoPlan(null)
              void reintentarPaso(plan.id, orden).then((r) => {
                if (!r.ok) { setMotivoPlan(r.motivo); setEnPlan(false); return }
                setPlan(r.dato.plan)
                // Reintentar y avanzar son un solo gesto: el que arregló afuera lo que Meta pedía
                // quiere que siga, no destrabar el paso y tener que apretar otra vez.
                return avanzarHasta(plan.id, setPlan).then((m) => { setMotivoPlan(m); setEnPlan(false) })
              })
            }}
            onCancelar={() => {
              void cancelarPlan(plan.id).then((r) => { if (r.ok) setPlan(r.dato.plan) })
            }}
          />
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={`Duplicar · ${ROTULO_NIVEL[o.nivel]}`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={trabajando || enPlan}>Cancelar</Button>
          {/* 🔑 **El plan es el botón grande SIEMPRE, no sólo cuando la copia está condenada.**
              Medido el 9-ago-2026 con `validate_only` sobre los 43 conjuntos activos de la cuenta:
              `POST /copies` pasa 4 de 16 y la receta, 20 de 20 de la pauta real. El camino viejo
              queda en chico porque todavía no tiene una semana de uso, no porque sea mejor. */}
          <Button
            variant="solid"
            tone="brand"
            disabled={trabajando || enPlan || nombreLargo || montoInvalido || presu.fase === 'mirando'}
            onClick={() => void armarPlan()}
          >
            {enPlan ? 'Armando el plan…' : 'Armar un plan'}
          </Button>
          <Button
            variant="ghost"
            tone="brand"
            disabled={trabajando || enPlan || nombreLargo || montoInvalido || presu.fase === 'mirando'}
            onClick={() => onDuplicar({
              nombre: limpio || null,
              // Sólo se manda si de verdad cambia: mandar el mismo número sería una escritura más en
              // Meta —y una fila más de auditoría— para dejar todo igual.
              diarioCrudo: cambiaPlata ? aCrudo(nuevoMonto, o.moneda) : null,
              destino: presu.fase === 'listo' ? presu.destino : 'copia',
              idemDuplicar: idems.duplicar,
              idemNombre: idems.nombre,
              idemPresupuesto: idems.presupuesto,
            })}
          >
            {trabajando ? 'Creando la copia en Meta…'
              // El botón dice lo que va a pasar. Con el cartel rojo arriba, «Duplicar» a secas
              // invitaría a apretar como si nada; «igual» es la palabra que reconoce el aviso.
              : condenada ? 'Duplicar igual'
                : ajusta ? 'Duplicar y ajustar' : 'Duplicar'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.5 }}>
          Se crea una copia con sus conjuntos y avisos. <b>Nace pausada</b> y con la marca del
          original, así que no gasta hasta que alguien la prenda.
        </div>

        <AvisoBloqueo b={bloqueo} nivel={o.nivel} />

        <Notice tone="brand">
          <b>El plan es el camino recomendado.</b> En vez de pedirle a Meta la fotocopia, lee cómo
          está armado el {ROTULO_NIVEL[o.nivel]}, le corrige lo que Meta ya no acepta y lo crea desde
          cero, con un aviso por paso reusando el creativo del original. Así ni el tope de{' '}
          {TOPE_ADS_SINCRONO} avisos ni el campo de «mejoras estándar» lo frenan, si se corta a la
          mitad se retoma donde quedó, y <b>antes de escribir nada le pregunta a Meta si lo va a
          aceptar</b>.
          {condenada && <> Acá además hace falta: la copia directa ya está condenada.</>}
        </Notice>
        <Notice tone="warning">
          <b>La fotocopia de Meta casi nunca sale.</b> Sobre los conjuntos activos de la cuenta,
          medido el 9-ago: <b>pasa 4 de cada 16</b>. Los conjuntos se armaron con reglas viejas y Meta
          revalida la copia con las de hoy — los que ya están al aire siguen andando porque a ésos no
          los vuelve a examinar.
        </Notice>
        {motivoPlan && <Notice tone="danger">No se pudo armar el plan: {motivoPlan}</Notice>}

        <Notice tone="warning">
          La copia <b>arranca en aprendizaje desde cero</b>: Meta no le hereda nada de lo aprendido a
          la original. Si lo que querés es más entrega de algo que ya funciona, sale más barato
          subirle el presupuesto a esta que duplicarla.
        </Notice>

        <div>
          <ConfirmDetalle label={ROTULO_NIVEL[o.nivel]} valor={o.nombre} />
          {o.cuenta && <ConfirmDetalle label="Cuenta" valor={o.cuenta} />}
          {o.linea && <ConfirmDetalle label="Marca" valor={ETIQUETA_LINEA[o.linea]} />}
        </div>

        <Field
          label="Nombre de la copia"
          // ⚠️ El ejemplo tiene que ser IGUAL al que genera `sufijoDeCopia()` (`api/_meta-acciones.js`),
          // que rellena el día y el mes a mano porque `es-AR` ignora el `2-digit` en esa combinación:
          // es lo que alguien va a tipear en el buscador de Ads Manager si hay que ir a encontrarla.
          hint="Dejalo vacío y queda el del original con la fecha y la hora («— copia 08/08 17:03»)."
        >
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={`${o.nombre} — copia …`}
            invalid={nombreLargo}
            maxLength={LARGO_NOMBRE + 1}
            style={{ width: '100%' }}
          />
        </Field>
        {nombreLargo && <Notice tone="warning">El nombre no puede pasar de {LARGO_NOMBRE} caracteres.</Notice>}
        {/* 🔴 Ya hay dos campañas llamadas igual en cuentas distintas —una apagada con $436.937
            encima y otra que corre— y desempatarlas cuesta cada vez que alguien las mira. Dejar
            hacerlo, sí; hacerlo sin que se vea, no. */}
        {igualAlOriginal && (
          <Notice tone="warning">
            Le estás poniendo el <b>mismo nombre que el original</b>. Van a quedar dos con el mismo
            nombre y la única forma de distinguirlas después va a ser por el id.
          </Notice>
        )}

        {presu.fase === 'mirando' && (
          <div style={{ fontSize: font.sm, color: color.mut2 }}>Mirando dónde va el presupuesto…</div>
        )}

        {presu.fase === 'no-aplica' && (
          <div style={{ fontSize: font.sm, color: color.mut }}>{presu.motivo}</div>
        )}

        {presu.fase === 'listo' && (
          <>
            <Field label="Presupuesto diario de la copia" hint={presu.donde}>
              <NumberField
                value={campo}
                onChange={(v) => { setTocado(true); setMonto(v) }}
                min={0}
                step={100}
                prefix="$"
                width={160}
                invalid={montoInvalido}
              />
            </Field>
            <div>
              <ConfirmDetalle label="El original tiene" valor={money(base, o.moneda)} />
              <ConfirmDetalle label="La copia va a quedar en" valor={montoInvalido ? '—' : money(nuevoMonto, o.moneda)} />
              {!montoInvalido && delta !== 0 && (
                <ConfirmDetalle
                  label="Diferencia"
                  valor={
                    <span style={{ color: delta > 0 ? color.warningInk : color.mut }}>
                      {delta > 0 ? '+' : '−'}{money(Math.abs(delta), o.moneda)} por día
                      {base > 0 && ` (${delta > 0 ? '+' : '−'}${Math.round(Math.abs(delta / base) * 100)}%)`}
                    </span>
                  }
                />
              )}
            </div>
          </>
        )}

        <div style={{ fontSize: font.xs, color: color.mut }}>
          Esto no se deshace desde el monitor: para sacar la copia hay que eliminarla en Ads Manager.
        </div>
      </div>
    </Modal>
  )
}
