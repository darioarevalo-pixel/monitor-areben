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
 */

import { useEffect, useState } from 'react'
import { traerConjuntos, traerMejoras } from '@/lib/meta-ads/cliente'
import { aCrudo, aMonto, LARGO_NOMBRE, nuevoIdem, TOPE_ADS_SINCRONO, type NivelAccion } from '@/lib/meta-ads/acciones'
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

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={`Duplicar · ${ROTULO_NIVEL[o.nivel]}`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={trabajando}>Cancelar</Button>
          <Button
            variant="solid"
            tone="brand"
            disabled={trabajando || nombreLargo || montoInvalido || presu.fase === 'mirando'}
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
              : copiaCondenada(bloqueo) ? 'Duplicar igual'
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
          Esto no se deshace desde el monitor: para sacar la copia hay que borrarla en Ads Manager.
        </div>
      </div>
    </Modal>
  )
}
