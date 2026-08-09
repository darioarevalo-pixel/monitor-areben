'use client'

/**
 * La plomería de todo lo que ESCRIBE en Meta: confirmar → mandar → contar cómo salió → recargar.
 *
 * # Por qué está junto y no en cada botón
 *
 * Las cuatro tandas de «accionar sobre la pauta» —pausar, escalar, duplicar, crear— comparten
 * exactamente la misma coreografía. Escribirla en cada botón sería garantizar que el tercero se
 * olvide del `idem` (y duplique una campaña dos veces) o del recargar (y muestre el valor viejo
 * como si nada hubiera pasado).
 *
 * # El `idem` se genera al APRETAR, no al mandar
 *
 * Si se generara al mandar, un doble clic haría dos claves distintas y dos escrituras — que es
 * justo lo que evita. Generado al apretar, el segundo pedido choca contra el índice único de
 * `meta_ads_accion` y devuelve el resultado del primero sin llamar a Meta. En pausar eso es
 * cosmético; en duplicar es lo único que evita dos campañas.
 *
 * # Los modales viven acá y no en la pantalla
 *
 * 🔑 Antes el estado de los tres modales estaba suelto en `Etapas.tsx`, así que **la única pantalla
 * que podía accionar era esa**. Al repartirla en Embudo y Campañas habría habido que copiar los
 * tres `useState`, los tres handlers y sus conversiones de moneda a los dos lados — y el `/100` es
 * exactamente el cálculo que no puede estar dos veces. Ahora el hook devuelve `modales` y cualquier
 * pantalla los dibuja con `<ModalesDeAccion>`.
 */

import { useCallback, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { accionarMeta, reconciliarCopia, traerConjuntos, traerContextoEscalada } from '@/lib/meta-ads/cliente'
import { aMonto, nuevoIdem, permiteAccion, type ClaveAccion } from '@/lib/meta-ads/acciones'
import { money } from '@/lib/meta-ads/formato'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import { ConfirmDetalle, space, useConfirmar, useToast } from '@/components/ui'
import { ROTULO_NIVEL, type Acciones, type AjustesCopia, type ObjetoMeta } from '@/components/meta-ads/acciones/tipos'

/** El modal abierto, si hay alguno. Los tres son excluyentes: se acciona de a un objeto. */
export type ModalesAccion = {
  presu: { o: ObjetoMeta; diarioCrudo: number } | null
  ren: ObjetoMeta | null
  dup: { o: ObjetoMeta; diarioCrudo: number; sinPresupuesto: boolean } | null
  /** «Nueva campaña con esta segmentación», siempre sobre un conjunto. */
  nueva: { o: ObjetoMeta; diarioCrudo: number } | null
  /**
   * «Escalar por escalones». Trae el `techoCrudo` de la marca **ya leído del servidor**: el modal no
   * lo tipea ni lo adivina, porque es el mismo número con el que después se va a frenar cada escalón.
   * `null` mientras se lo está pidiendo, para que el modal no dibuje una previsión con un techo en 0.
   */
  esc: { o: ObjetoMeta; diarioCrudo: number; techoCrudo: number } | null
  /** Se está pidiendo el techo para abrir la escalada de este objeto. */
  abriendoEscalada: string | null
  enCurso: string | null
  cerrar: () => void
  guardarPresupuesto: (nuevoCrudo: number, idem: string) => void
  guardarNombre: (nombre: string, idem: string) => void
  duplicar: (aj: AjustesCopia) => void
}

export type AccionMeta = {
  /** El id del objeto que se está escribiendo, o `null`. */
  enCurso: string | null
  /** Lo que consumen `BotonesAccion` y las tablas. */
  acciones: Acciones
  /** Lo que consume `<ModalesDeAccion>`. */
  modales: ModalesAccion
}

/**
 * `recargar` no es opcional a propósito. Meta contesta el valor releído, pero la pantalla también
 * tiene los subtotales por etapa, el diagnóstico y el reparto por marca calculados sobre el censo:
 * parchear una fila a mano dejaría todo lo demás mintiendo.
 */
export function useAccionMeta(recargar: () => void): AccionMeta {
  const { perfil } = useSesion()
  const { confirmar } = useConfirmar()
  const toast = useToast()
  const [enCurso, setEnCurso] = useState<string | null>(null)
  const [presu, setPresu] = useState<{ o: ObjetoMeta; diarioCrudo: number } | null>(null)
  const [dup, setDup] = useState<{ o: ObjetoMeta; diarioCrudo: number; sinPresupuesto: boolean } | null>(null)
  const [nueva, setNueva] = useState<{ o: ObjetoMeta; diarioCrudo: number } | null>(null)
  const [esc, setEsc] = useState<{ o: ObjetoMeta; diarioCrudo: number; techoCrudo: number } | null>(null)
  const [abriendoEscalada, setAbriendoEscalada] = useState<string | null>(null)
  const [ren, setRen] = useState<ObjetoMeta | null>(null)

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
      const dupR = await enviar(o, 'duplicar', {}, aj.idemDuplicar)

      /**
       * 🔑 **El corte por tiempo NO es un final.** Duplicar algo con avisos tarda más que los 8 s del
       * `fetch` (medido el 8-ago-2026), o sea que este camino es el normal y no el raro: la copia se
       * creó y del lado de acá se cortó. Reintentar haría dos copias; lo que se hace es **ir a
       * buscarla por el sufijo** —una lectura— y, si está, seguir con el nombre y el presupuesto como
       * si nada hubiera pasado. Si todavía no aparece, se dice eso, que no es «no se creó».
       */
      let copia = dupR.ok ? dupR.dato.copia : undefined
      if (!dupR.ok && dupR.puedeExistir) {
        const rec = await reconciliarCopia(aj.idemDuplicar)
        if (rec.ok && rec.encontrada) copia = rec.copia
        else {
          // No se la encontró (o no se pudo mirar): la única respuesta honesta es «no sabemos», con
          // el nombre para buscarla. Decir «no se creó» sería invitar a apretar de nuevo.
          const donde = dupR.sufijo ? ` Buscá «${dupR.sufijo}» en Ads Manager antes de volver a intentarlo.` : ''
          toast.aviso(`${rec.ok ? rec.motivo : `No se pudo confirmar si la copia se creó (${rec.motivo}).`}${donde}`)
          return false
        }
      }

      if (!dupR.ok && !copia) {
        if (dupR.sinLinea) toast.error('Esta campaña todavía no tiene marca. Asignala en la columna «Marca» de esta tabla y volvé.')
        else toast.error(dupR.motivo)
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
      const adoptada = dupR.ok ? '' : ' (Meta tardó más de lo que esperamos y la copia se encontró por su nombre.)'
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

  /**
   * Abrir la escalada pide primero el techo de la marca.
   *
   * 🔑 **Se pregunta al abrir y no al armar**, y esa es toda la diferencia entre un modal que dice
   * «falta definir el techo, cargalo en Automatizaciones» y uno que deja llenar un formulario para
   * después rechazarlo. Es una consulta chica —los umbrales de una línea— y la contesta la misma
   * tabla con la que después se va a frenar cada escalón.
   */
  const abrirEscalada = useCallback(async (o: ObjetoMeta, diarioCrudo: number) => {
    if (!o.linea) { toast.error('Esta campaña todavía no tiene marca: asignala antes de escalar.'); return }
    setAbriendoEscalada(o.id)
    const r = await traerContextoEscalada(o.linea)
    setAbriendoEscalada(null)
    if (!r.ok) { toast.error(`No se pudo leer el techo de presupuesto de la marca: ${r.motivo}`); return }
    // ⚠️ Se abre IGUAL sin techo: el modal es el lugar donde se explica qué falta y dónde se carga.
    // Un toast de error dejaría a alguien sin saber que eso se arregla en dos minutos.
    setEsc({ o, diarioCrudo, techoCrudo: r.dato.techoCrudo })
  }, [toast])

  /**
   * El permiso se pregunta por la LÍNEA de cada objeto, no por la marca de la sesión: en una misma
   * tabla puede haber una campaña de BDI que esta persona acciona y una de Zattia que no. Es la
   * misma función que usa el servidor para contestar 403, importada, no copiada.
   */
  const acciones: Acciones = useMemo(() => ({
    puede: (accion: ClaveAccion, linea: LineaPauta | null) => !!linea && permiteAccion(perfil, accion, linea).ok,
    enCurso,
    onEstado: (o: ObjetoMeta, estadoActual: string | null) => { void cambiarEstado(o, estadoActual) },
    onPresupuesto: (o: ObjetoMeta, diarioCrudo: number) => setPresu({ o, diarioCrudo }),
    onNombre: (o: ObjetoMeta) => setRen(o),
    onDuplicar: (o: ObjetoMeta, diarioCrudo: number, sinPresupuesto: boolean) => setDup({ o, diarioCrudo, sinPresupuesto }),
    onCrear: (o: ObjetoMeta, diarioCrudo: number) => setNueva({ o, diarioCrudo }),
    onEscalar: (o: ObjetoMeta, diarioCrudo: number) => { void abrirEscalada(o, diarioCrudo) },
  }), [perfil, enCurso, cambiarEstado, abrirEscalada])

  const cerrar = useCallback(() => { setPresu(null); setRen(null); setDup(null); setNueva(null); setEsc(null) }, [])

  const guardarPresupuesto = useCallback(async (nuevoCrudo: number, idem: string) => {
    if (!presu) return
    // `aMonto` y no un `/100`: el factor depende de la moneda de la cuenta y hardcodearlo es la
    // trampa número uno de esta tanda.
    const monto = money(aMonto(nuevoCrudo, presu.o.moneda), presu.o.moneda)
    if (await mandar(presu.o, 'presupuesto', { daily_budget: nuevoCrudo }, idem, `Presupuesto diario en ${monto}.`)) setPresu(null)
  }, [presu, mandar])

  const guardarNombre = useCallback(async (nombre: string, idem: string) => {
    if (!ren) return
    if (await mandar(ren, 'nombre', { name: nombre }, idem, `Ahora se llama «${nombre}».`)) setRen(null)
  }, [ren, mandar])

  const duplicar = useCallback(async (aj: AjustesCopia) => {
    if (!dup) return
    if (await duplicarYAjustar(dup.o, aj)) setDup(null)
  }, [dup, duplicarYAjustar])

  // ⚠️ `nueva` y `esc` no llevan handler de guardado, y no es una asimetría descuidada: ni crear una
  // campaña ni escalar pasan por `mandar`. Son planes de punta a punta —los arma el modal y los
  // ejecuta el motor—, así que lo único que hace falta acá es saber si están abiertos y sobre qué.
  const modales: ModalesAccion = {
    presu, ren, dup, nueva, esc, abriendoEscalada, enCurso, cerrar, guardarPresupuesto, guardarNombre, duplicar,
  }
  return { enCurso, acciones, modales }
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
