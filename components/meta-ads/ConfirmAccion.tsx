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

import { useCallback, useEffect, useState } from 'react'
import { accionarMeta, reconciliarCopia, traerConjuntos, traerMejoras } from '@/lib/meta-ads/cliente'
import { aCrudo, aMonto, LARGO_NOMBRE, nuevoIdem, TOPE_ADS_SINCRONO, type ClaveAccion, type NivelAccion } from '@/lib/meta-ads/acciones'
import { dondeVaElPresupuesto, segunLosConjuntos, type Presupuestable } from '@/lib/meta-ads/copia'
import { bloqueoDeLaCopia, copiaCondenada, type BloqueoCopia } from '@/lib/meta-ads/mejoras'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import {
  Button, ConfirmDetalle, Field, Input, Modal, NumberField, Notice, color, font, space, useConfirmar, useToast,
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
  /**
   * De qué cuenta publicitaria es. Sólo para MOSTRARLO en el cartel, y sólo cuando hace falta.
   *
   * 🔴 Hay campañas con el MISMO nombre en cuentas distintas —«STUNNED - Tráfico a Perfil» existe dos
   * veces y no son la misma: una está apagada con $436.937 encima y la otra es la que corre—. La
   * tabla ya las desempata, pero el cartel es la última pantalla antes de escribir, y ahí decía sólo
   * el nombre: quien lo abriera desde la fila equivocada no tenía cómo darse cuenta.
   */
  cuenta?: string
  /**
   * La campaña de la que cuelga (para una campaña, ella misma).
   *
   * La necesita el modal de duplicar: lo que dice si Meta va a aceptar la copia se pregunta **por
   * campaña** (`?recurso=mejoras`), porque así lo contesta Graph, y desde la fila de un conjunto el
   * id de su campaña no se puede deducir.
   */
  campania?: string
}

const ROTULO_NIVEL: Record<NivelAccion, string> = { campania: 'la campaña', conjunto: 'el conjunto', aviso: 'el aviso' }

/**
 * Lo que se decide en el modal de duplicar y se ejecuta después de que la copia existe.
 *
 * Los tres `idem` nacen **al abrir el modal**, no al apretar: si nacieran al apretar, un doble clic
 * serían dos claves y dos copias. Son tres y no uno porque son tres escrituras distintas, cada una
 * con su propia fila de auditoría y su propio candado.
 */
export type AjustesCopia = {
  /** El nombre para la copia, o `null` para dejarle el automático (original + « — copia dd/mm hh:mm»). */
  nombre: string | null
  /** El diario nuevo, en la unidad MENOR de la moneda, o `null` para dejar el del original. */
  diarioCrudo: number | null
  /**
   * Dónde va ese presupuesto. `copia` es la copia misma (un conjunto duplicado, o una campaña con
   * presupuesto propio); `conjunto-unico` es el único conjunto de una campaña copiada — que sólo se
   * puede resolver DESPUÉS de crearla, porque los ids son nuevos.
   */
  destino: 'copia' | 'conjunto-unico'
  idemDuplicar: string
  idemNombre: string
  idemPresupuesto: string
}

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

  /**
   * La escritura pelada: manda y devuelve lo que contestó el servidor. **No avisa ni recarga.**
   *
   * Existe aparte de `mandar` por «duplicar y ajustar», que son hasta tres escrituras seguidas: con
   * `mandar` cada paso dispararía su propio toast y su propio recargar —y recargar el censo cuesta
   * ~20 s—, así que la copia terminaría de ajustarse tres releídas después, con tres carteles
   * contando pedazos de una sola operación. La cadena avisa una vez, al final, y recarga una vez.
   */
  const enviar = useCallback(
    (o: ObjetoMeta, accion: ClaveAccion, campos: Record<string, string | number>, idem: string) =>
      accionarMeta({ accion, nivel: o.nivel, objetoId: o.id, campos, idem }),
    [],
  )

  const mandar = useCallback(async (
    o: ObjetoMeta,
    accion: ClaveAccion,
    campos: Record<string, string | number>,
    idem: string,
    exito: string,
  ) => {
    setEnCurso(o.id)
    const r = await enviar(o, accion, campos, idem)
    setEnCurso(null)
    if (r.ok) {
      // ⚠️ Duplicar NO pasa por acá: va por `duplicarYAjustar`, que es el único que sabe contar una
      // operación de hasta tres escrituras. Poner el aviso de la copia también acá dejaría dos
      // lugares narrando lo mismo, y uno de los dos siempre queda desactualizado.
      if (r.dato.sinRegistro) {
        // «Se registró» no es un detalle burocrático: cuando el log falla y Meta ya aplicó, la plata
        // se movió igual y quien lo hizo tiene que saber que no quedó escrito quién fue.
        toast.aviso(`${exito} ⚠️ No se pudo dejar registro de quién lo hizo.`)
      } else {
        toast.ok(exito)
      }
      recargar()
      return true
    }
    // El 409 de «esta campaña no tiene marca» no es un error de la persona ni algo que se arregle
    // reintentando: se arregla asignándola, ahí nomás, en la columna Marca de esta misma tabla.
    if (r.sinLinea) toast.error('Esta campaña todavía no tiene marca. Asignala en la columna «Marca» de esta tabla y volvé.')
    else toast.error(r.motivo)
    return false
  }, [enviar, recargar, toast])

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
          {o.cuenta && <ConfirmDetalle label="Cuenta" valor={o.cuenta} />}
          {o.linea && <ConfirmDetalle label="Marca" valor={ETIQUETA_LINEA[o.linea]} />}
          <ConfirmDetalle label="Estado" valor={`${activo ? 'Activa' : 'Pausada'} → ${activo ? 'Pausada' : 'Activa'}`} />
        </div>
      ),
    })
    if (!ok) return false
    return mandar(o, 'estado', { status: nuevo }, idem, activo ? 'Pausada.' : 'Reactivada.')
  }, [confirmar, mandar])

  /**
   * **Duplicar y ajustar**: hasta tres escrituras encadenadas —copiar, renombrar la copia, ponerle
   * el presupuesto— con un solo aviso al final y una sola recarga.
   *
   * # Por qué son tres acciones y no una con campos
   *
   * Duplicar **no acepta campos**, y eso no es una limitación que haya que sortear: es lo que hace
   * imposible pedir la copia activa con un payload armado a mano (`ACCIONES.duplicar.campos` está
   * vacía y un test lo amarra). Abrirle campos para poder mandarle el nombre volvería a poner esa
   * puerta. Encadenando, cada paso entra por la acción que ya existía, con su propia whitelist, su
   * propio `idem` y su propia fila de auditoría.
   *
   * # Qué pasa si un paso falla
   *
   * La copia **ya está creada y pausada**, así que nada se rompe y nada gasta: se cuenta qué quedó
   * hecho y qué no, con el motivo. Lo que NO se hace es reintentar solo —duplicar no es
   * reintentable— ni dar por bueno lo que no se pudo confirmar.
   */
  const duplicarYAjustar = useCallback(async (o: ObjetoMeta, aj: AjustesCopia) => {
    setEnCurso(o.id)
    try {
      const dup = await enviar(o, 'duplicar', {}, aj.idemDuplicar)

      /**
       * 🔑 **El corte por tiempo NO es un final.** Duplicar algo con avisos tarda más que los 8 s del
       * `fetch` (medido el 8-ago-2026), o sea que este camino es el normal y no el raro: la copia se
       * creó y del lado de acá se cortó. Reintentar haría dos copias; lo que se hace es **ir a
       * buscarla por el sufijo** —una lectura— y, si está, seguir con el nombre y el presupuesto como
       * si nada hubiera pasado. Si todavía no aparece, se dice eso, que no es «no se creó».
       */
      let copia = dup.ok ? dup.dato.copia : undefined
      if (!dup.ok && dup.puedeExistir) {
        const rec = await reconciliarCopia(aj.idemDuplicar)
        if (rec.ok && rec.encontrada) copia = rec.copia
        else {
          // No se la encontró (o no se pudo mirar): la única respuesta honesta es «no sabemos», con
          // el nombre para buscarla. Decir «no se creó» sería invitar a apretar de nuevo.
          const donde = dup.sufijo ? ` Buscá «${dup.sufijo}» en Ads Manager antes de volver a intentarlo.` : ''
          toast.aviso(`${rec.ok ? rec.motivo : `No se pudo confirmar si la copia se creó (${rec.motivo}).`}${donde}`)
          return false
        }
      }

      if (!dup.ok && !copia) {
        if (dup.sinLinea) toast.error('Esta campaña todavía no tiene marca. Asignala en la columna «Marca» de esta tabla y volvé.')
        else toast.error(dup.motivo)
        return false
      }

      if (!copia || !copia.id) {
        // Es lo que contesta un `idem` repetido: el servidor devuelve lo guardado del primer intento
        // y ahí no viene el objeto nuevo. La copia existe; encadenarle ajustes a ciegas sería
        // escribir sobre un id que no tenemos.
        toast.aviso('Esa copia ya se había hecho. Buscala en la tabla y ajustala desde su fila.')
        return true
      }

      const copiaObj: ObjetoMeta = { ...o, id: copia.id, nombre: copia.nombre }
      const logros: string[] = []
      const pendientes: string[] = []
      let nombreFinal = copia.nombre

      if (aj.nombre) {
        const r = await enviar(copiaObj, 'nombre', { name: aj.nombre }, aj.idemNombre)
        if (r.ok) nombreFinal = r.dato.objetoNombre || aj.nombre
        else pendientes.push(`No se le pudo poner el nombre (${r.motivo}), así que quedó con el automático.`)
      }

      if (aj.diarioCrudo) {
        // 🔑 El presupuesto de la copia de una campaña **no va en la campaña**: toda la pauta es ABO
        // y la plata vive en el conjunto. Cuál es el conjunto de la copia sólo se sabe preguntándolo
        // DESPUÉS de crearla, y se verifica que sea uno solo en vez de asumir que copió lo mismo.
        const destino = aj.destino === 'conjunto-unico' ? await conjuntoUnicoDe(copiaObj) : { ok: true as const, objeto: copiaObj }
        if (!destino.ok) {
          pendientes.push(destino.motivo)
        } else {
          const r = await enviar(destino.objeto, 'presupuesto', { daily_budget: aj.diarioCrudo }, aj.idemPresupuesto)
          if (r.ok) logros.push(`con ${money(aMonto(aj.diarioCrudo, o.moneda), o.moneda)} por día`)
          else pendientes.push(`No se le pudo poner el presupuesto (${r.motivo}), así que quedó con el del original.`)
        }
      }

      const conPlata = logros.length ? `, ${logros.join(' y ')}` : ''
      // `IN_PROCESS` es Meta terminando de armar la copia, no un problema: se cuenta al final, para
      // que quien la busque en la tabla y la vea rara sepa que en un rato se acomoda sola.
      const procesando = copia.efectivo === 'IN_PROCESS'
        ? ' Meta todavía la está armando, así que por un rato va a figurar «en proceso».'
        : ''
      // Que la copia se haya adoptado después de un corte no cambia el resultado, pero sí explica por
      // qué tardó tanto y por qué en la auditoría la fila dice que se encontró por su nombre.
      const adoptada = dup.ok ? '' : ' (Meta tardó más de lo que esperamos y la copia se encontró por su nombre.)'
      const cola = `${pendientes.length ? ` ${pendientes.join(' ')}` : ''}${procesando}${adoptada}`
      // 🔴 Una copia que NO nació pausada está gastando ahora mismo: va primero y en rojo, aunque
      // todo lo demás haya salido bien.
      if (copia.estado && copia.estado !== 'PAUSED') {
        toast.error(`Se creó «${nombreFinal}» pero figura ${copia.estado}, no pausada. Pausala ya desde esta misma tabla o en Ads Manager.${cola}`)
      } else if (!copia.estado) {
        toast.aviso(`Se creó «${nombreFinal}», pero no se pudo confirmar que quedara pausada. Fijate en Ads Manager.${cola}`)
      } else if (!copia.conLinea) {
        // Sin marca no se la puede accionar desde el monitor —ni siquiera quien la creó—, así que
        // decir sólo «copia creada» dejaría a alguien buscando por qué no le aparecen los botones.
        toast.aviso(`Se creó «${nombreFinal}», pausada${conPlata}, pero quedó SIN MARCA: asignala en la columna «Marca» para poder accionarla.${cola}`)
      } else if (pendientes.length) {
        toast.aviso(`Se creó «${nombreFinal}», pausada${conPlata}.${cola}`)
      } else {
        toast.ok(`Copia creada: «${nombreFinal}», pausada${conPlata}.${procesando}${adoptada}`)
      }
      return true
    } finally {
      // Una sola recarga para toda la cadena, y va también cuando algo falló: la copia puede existir
      // igual y tiene que aparecer en la tabla.
      setEnCurso(null)
      recargar()
    }
  }, [enviar, recargar, toast])

  return { enCurso, mandar, cambiarEstado, duplicarYAjustar }
}

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

/**
 * El conjunto de una campaña recién copiada, **cuando es uno solo**.
 *
 * Se le pregunta a Meta en vez de asumir que la copia trae los mismos conjuntos que el original:
 * asumirlo significaría escribirle el presupuesto al primero que aparezca, y en una campaña con dos
 * conjuntos eso es ponerle la plata a la mitad de la copia sin decirlo. Si no es exactamente uno, no
 * se escribe nada y se cuenta por qué.
 */
async function conjuntoUnicoDe(copia: ObjetoMeta): Promise<{ ok: true; objeto: ObjetoMeta } | { ok: false; motivo: string }> {
  const r = await traerConjuntos(copia.id)
  if (!r.ok) {
    return { ok: false, motivo: `No se pudieron mirar los conjuntos de la copia (${r.motivo}), así que el presupuesto quedó como el del original.` }
  }
  const cs = r.dato.conjuntos
  if (cs.length !== 1) {
    return {
      ok: false,
      motivo: `La copia quedó con ${cs.length} conjuntos y no uno solo, así que el presupuesto quedó como el del original: ajustalo en la fila de cada conjunto.`,
    }
  }
  return { ok: true, objeto: { ...copia, nivel: 'conjunto', id: cs[0].id, nombre: cs[0].nombre } }
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
  onNombre: (o: ObjetoMeta) => void
  /** Abre «duplicar y ajustar». Necesita el presupuesto de la fila para poder ofrecer el campo. */
  onDuplicar: (o: ObjetoMeta, diarioCrudo: number, sinPresupuesto: boolean) => void
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
  const puedeNombre = acciones.puede('nombre', objeto.linea)
  // Un aviso no se duplica: la copia de un aviso suelto no tiene dónde entregar. Lo dice la tabla de
  // acciones (`niveles`) y acá se respeta en vez de repetir el criterio.
  const puedeDuplicar = objeto.nivel !== 'aviso' && acciones.puede('duplicar', objeto.linea)
  const trabajando = acciones.enCurso === objeto.id

  if (!puedeEstado && !puedePresupuesto && !puedeNombre && !puedeDuplicar) return <span style={{ color: color.mut2 }}>—</span>
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
      {puedeDuplicar && (
        <Button
          size="sm"
          variant="ghost"
          disabled={trabajando}
          onClick={() => acciones.onDuplicar(objeto, diarioCrudo, !!sinPresupuesto)}
          title="Crea una copia pausada, con sus conjuntos y avisos, y le pone el nombre y el presupuesto que le digas"
        >
          Duplicar
        </Button>
      )}
      {/* Renombrar va último: es lo único de esta columna que no cambia lo que Meta hace, y ponerlo
          antes de Pausar le robaría el lugar de lectura al botón que sí mueve la entrega. */}
      {puedeNombre && (
        <Button
          size="sm"
          variant="ghost"
          disabled={trabajando}
          onClick={() => acciones.onNombre(objeto)}
          title="Cambia sólo el nombre. No toca la entrega ni el presupuesto"
        >
          Renombrar
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

/**
 * Cambiar el nombre y nada más.
 *
 * # Por qué esto tiene su propio botón y no vive sólo adentro de duplicar
 *
 * Nació como el segundo paso de «duplicar y ajustar» —la copia sale con el sufijo automático y hay
 * que poderle poner el nombre de verdad—, pero la acción de renombrar sirve igual por su cuenta: los
 * nombres son el único mapa que hay para saber qué es cada campaña cuando son 170, y hasta ahora
 * arreglar uno mal puesto obligaba a ir a Ads Manager.
 *
 * Es la única escritura de esta pantalla que **no cambia lo que Meta hace**: no toca la entrega, ni
 * el presupuesto, ni el estado. Por eso el cartel es corto y el botón no es de tono de advertencia.
 */
export function ModalNombre({ o, onCerrar, onGuardar, guardando }: {
  o: ObjetoMeta
  onCerrar: () => void
  onGuardar: (nombre: string, idem: string) => void
  guardando: boolean
}) {
  const [nombre, setNombre] = useState(o.nombre)
  // El `idem` nace con el modal, no con el clic. Ver `ModalPresupuesto`.
  const [idem] = useState(nuevoIdem)

  const limpio = nombre.trim()
  const largo = limpio.length > LARGO_NOMBRE
  const invalido = !limpio || largo
  const sinCambio = limpio === o.nombre.trim()

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={`Renombrar · ${ROTULO_NIVEL[o.nivel]}`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button
            variant="solid"
            tone="brand"
            disabled={invalido || sinCambio || guardando}
            onClick={() => onGuardar(limpio, idem)}
          >
            {guardando ? 'Escribiendo en Meta…' : 'Renombrar'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field
          label="Nombre"
          hint="Sólo cambia cómo se llama. No toca la entrega, el presupuesto ni el estado."
        >
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            invalid={invalido}
            maxLength={LARGO_NOMBRE + 1}
            style={{ width: '100%' }}
            autoFocus
          />
        </Field>

        <div>
          <ConfirmDetalle label="Hoy" valor={o.nombre} />
          {o.cuenta && <ConfirmDetalle label="Cuenta" valor={o.cuenta} />}
          {o.linea && <ConfirmDetalle label="Marca" valor={ETIQUETA_LINEA[o.linea]} />}
        </div>

        {largo && <Notice tone="warning">El nombre no puede pasar de {LARGO_NOMBRE} caracteres.</Notice>}

        {/* El nombre es lo único que hay para desempatar dos campañas parecidas en Ads Manager, en
            los informes y en la auditoría de esta misma pantalla. Cambiarlo no rompe nada, pero
            quien mire un reporte viejo va a ver el nombre de antes. */}
        {!invalido && !sinCambio && (
          <div style={{ fontSize: font.xs, color: color.mut }}>
            El nombre nuevo se ve enseguida acá y en Ads Manager. Los informes ya exportados siguen
            con el viejo.
          </div>
        )}
      </div>
    </Modal>
  )
}

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
          hint="Dejalo vacío y queda el del original con la fecha y la hora («— copia 06/08 17:03»)."
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
