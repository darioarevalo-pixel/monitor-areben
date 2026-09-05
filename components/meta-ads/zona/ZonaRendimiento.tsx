'use client'

/**
 * LA ZONA DE RENDIMIENTO — la entrada de Meta. **Qué apago, qué escalo, qué testeo hoy.**
 *
 * # Por qué esta pantalla existe
 *
 * Medido contra producción el 25-ago-2026: `meta_ads_regla`, `meta_ads_umbral` y
 * `meta_ads_hallazgo` estaban **las tres en cero** —el cron corría todas las mañanas y no producía
 * nada— y `meta_ads_accion` tenía 37 filas, todas de una sola persona. ⇒ **el módulo se usaba para
 * EJECUTAR y nunca para DECIDIR.** La prueba más incómoda es que ese mismo día se hizo una sesión
 * entera de análisis de la pauta —cruce con pedidos reales, elasticidad, techo re-medido, veredicto
 * por conjunto— y **no se abrió el monitor ni una vez**: se contestó con ~20 consultas a la base.
 * *Si la pantalla contestara la pregunta, se habría abierto.*
 *
 * # 🔑 Sale de la FOTO, y eso es lo que la deja ser una pantalla
 *
 * El Parte del día contesta casi lo mismo y **es un botón que copia texto para pegar en otro lado**:
 * la herramienta admitía que la decisión se toma afuera. No podía ser otra cosa, porque se arma con
 * cinco llamadas a Graph y el cupo de la Marketing API es un porcentaje. Esto sale de
 * `meta_ads_snapshot_dia`: se pide sola al entrar, tiene 90 días de historia y sigue contestando con
 * el token vencido.
 *
 * ⚠️ **Lo que no tiene es el día EN CURSO**, y se dice arriba en vez de disimularlo. Para eso sigue
 * estando el Parte, que ahora es lo que es: el botón que trae hoy.
 *
 * # Lo que NO está acá, a propósito
 *
 * Un bloque de hallazgos vacío igual se dibuja **y dice por qué está vacío**. Un bloque que sólo
 * aparece con malas noticias deja sin saber si el silencio es «está todo bien» o «no se miró» — que
 * es exactamente el estado en que estaba el motor.
 *
 * 🔴 Y el porqué **se pregunta, ⛔ no se afirma**: el primer texto decía «no hay reglas cargadas»
 * clavado, y siguió diciéndolo la tarde del 26-ago en que se prendieron las once. Hoy sale de
 * `silencioDeReglas()`, que separa las tres causas del silencio —sin reglas, prendidas pero todavía
 * sin correr, y corrieron sin encontrar nada— porque **sólo la última significa «está todo bien»**.
 */

import { useState } from 'react'
import Link from 'next/link'
import { ModalesDeAccion, useAccionMeta } from '@/components/meta-ads/acciones'
import { useMeta } from '@/components/meta-ads/ContextoMeta'
import { SelectorMeta } from '@/components/meta-ads/SelectorMeta'
import { BandaDeHoy } from '@/components/meta-ads/parte/BandaDeHoy'
import { TiraDeDias } from '@/components/meta-ads/zona/TiraDeDias'
import { ParteDelDia } from '@/components/meta-ads/parte/ParteDelDia'
import { useParte } from '@/components/meta-ads/parte/useParte'
import { PlanesEnCurso } from '@/components/meta-ads/planes/PlanesEnCurso'
import { useReglas } from '@/components/meta-ads/reglas/useReglas'
import { TablaCeldas } from '@/components/meta-ads/zona/TablaCeldas'
import { useZona } from '@/components/meta-ads/zona/useZona'
import { entero, plata } from '@/lib/meta-ads/formato'
import { diasDeLaFoto, fusionarVivo, VENTANAS_ZONA, ventanaZona, type Celda, type CeldaViva, type RespuestaZona, type TotalesVivos, type VentanaZona } from '@/lib/meta-ads/rendimiento'
import { sumarVivas } from '@/lib/meta-ads/parte'
import { cuentaDelParte, motivoSinVivo, type SinVivo } from '@/lib/meta-ads/cuentas'
import { contarParaDecidir, repartirHallazgos } from '@/lib/meta-ads/reglas'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import type { Acciones } from '@/components/meta-ads/acciones/tipos'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import {
  Button, Card, EmptyState, KpiCard, Notice, Plegable, SectionCard, TBody, TableWrap, Td, Th, THead,
  Tr, color, font, space, weight,
} from '@/components/ui'

export function ZonaRendimiento() {
  const { linea, visibles, cuenta, cuentas } = useMeta()
  // 🔑 La ventana es una CLAVE y ⛔ no un número de días, porque «Hoy» y «Hoy y ayer» ⛔ no son
  // ventanas de la foto: son Meta en vivo. Un número solo no puede distinguir la fuente, y la fuente
  // es justamente lo que cambia si el veredicto se puede calcular o no.
  const [ventanaK, setVentanaK] = useState<string>('7')
  // 🔑 El ancla es un DÍA CERRADO elegido en la tira. Con ancla la ventana pasa a 1: lo que Bruno
  // pidió es «ese día», ⛔ no «los siete que terminan ahí». Volver a la ventana entera la restaura.
  const [anclado, setAnclado] = useState<string | null>(null)
  // 🔑 La zona es de UNA línea y no es una comodidad: adentro de la misma cuenta publicitaria
  // conviven BDI y Zattia, y dividir el gasto de las dos por los pedidos de una da un costo por
  // pedido que no existe. Con una sola línea visible se elige sola; con varias, se pide.
  const laLinea: LineaPauta | null = linea !== 'todas' ? linea : visibles.length === 1 ? visibles[0] : null
  const v: VentanaZona = ventanaZona(ventanaK) || VENTANAS_ZONA[3]
  // 🔴 A la foto se le pide la VENTANA DE JUICIO aunque se esté mirando hoy: las celdas, el
  // veredicto, el desgaste y el aprendizaje salen de ahí. Lo vivo sólo pisa las mediciones.
  // 🔑 La regla vive en el núcleo (`diasDeLaFoto`) y ⛔ no acá: era una expresión suelta en el JSX, y
  // su consecuencia grande —que `hoy`, `hoy_ayer` y `7` piden LO MISMO— ⛔ no la veía ningún test.
  const diasFoto = diasDeLaFoto(v, anclado)
  const { estado, recargar } = useZona(laLinea, diasFoto, anclado)
  const acciones = useAccionMeta(recargar)
  const r = useReglas()
  // 🔴 **Se pide sola, y eso cambia una decisión que estaba escrita.** El motivo por el que el parte
  // no se pedía solo era una SUPOSICIÓN sobre el cupo; medido el 26-ago contra prod, la cuenta está
  // en 1-3%. Los candados que hacen segura la decisión —caché, dedup y la hora a la vista— viven en
  // `useParte`, ⛔ no acá.
  // 🔴 **La cuenta del parte ⛔ no es `laCuenta` a secas.** El eje arranca en «Todas» y ahí
  // `laCuenta` es `null`, así que el parte no se pedía nunca entrando por el menú: «Hoy» y «Hoy y
  // ayer» caían a la foto —que sólo tiene días cerrados— y dibujaban lo mismo que «7 días», sin
  // que saliera un solo pedido. La regla vive en el núcleo (`cuentaDelParte`), con el mismo
  // criterio que `laLinea` de arriba: con una sola se elige sola, con varias se pide.
  const delParte = cuentaDelParte(cuentas, laLinea, cuenta)
  const parte = useParte(delParte.cuenta ? delParte.cuenta.id : null, laLinea || undefined)
  // ⛔ La poda ya ⛔ NO se pide acá: se mudó a `/meta-ads/decidir` con el resto de los pendientes.
  // Rendimiento se ahorra una llamada por línea al entrar.

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* 🔴 **Los dos controles de la zona van JUNTOS y arriba de todo.** El de la marca vivía en el
          router, arriba de la sección, y el de la ventana acá abajo, después de la banda y de los
          planes: para cambiar de marca y mirar otra ventana había que subir y volver a bajar. Es lo
          primero que dijo Bruno al caminarla. Van los dos afuera del `laLinea`, porque con «Todas»
          el selector es justamente lo único que hay que poder tocar. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <SelectorMeta />
        <BarraVentana
          ventana={v}
          setVentana={(k) => { setVentanaK(k); setAnclado(null) }}
          anclado={anclado}
          volverALaVentana={() => setAnclado(null)}
        />
      </div>

      {/* 🔑 Después de los controles y antes de todo lo demás: es la pantalla de arranque. Y no rompe
          la invariante de `PlanesEnCurso` —«va antes que la zona porque no depende de la foto»—
          porque la banda TAMPOCO sale de la foto: sale de Meta, que es lo único que tiene el día en
          curso. */}
      {parte.estado.fase === 'ok' && (
        <BandaDeHoy
          b={parte.estado.dato.banda}
          fecha={parte.estado.dato.fechas.hoy}
          leidoA={parte.estado.leidoA}
          actualizar={parte.actualizar}
          error={parte.error}
        />
      )}

      {/* Va antes que todo y no depende de la zona: sale de la base, así que se ve aunque la foto
          esté vacía — que es justo cuando importa saber qué quedó a medias en Meta. */}
      <PlanesEnCurso />

      {!laLinea ? (
        <EmptyState
          title="Elegí una marca"
          hint="La zona de rendimiento es de una sola línea: el techo por compra, los pedidos reales y la meta son de una marca, y mezclarlas da un costo por pedido que no existe. El selector está acá arriba."
          dashed
        />
      ) : (
        <>
          {estado.fase === 'cargando' && <Card style={{ color: color.mut2 }}>Leyendo la foto de la pauta…</Card>}

          {estado.fase === 'error' && (
            <Notice tone="danger">
              No se pudo leer la zona: {estado.motivo}
              <div style={{ fontSize: font.sm, marginTop: space[1] }}>
                Esto sale de la base y no de Meta, así que un token vencido no es la causa.
              </div>
            </Notice>
          )}

          {estado.fase === 'ok' && (
            <Contenido
              d={estado.data}
              ventana={anclado ? null : v}
              dias={diasFoto}
              acciones={acciones.acciones}
              anclado={anclado}
              onElegir={setAnclado}
              vivas={parte.estado.fase === 'ok' ? parte.estado.dato.vivas : null}
              sinVivo={motivoSinVivo(parte.estado.fase, delParte.candidatas, parte.estado.fase === 'error' ? parte.estado.motivo : null)}
              lineaViva={laLinea}
              reglas={r}
            />
          )}
          {/* Los cinco modales de escritura, dibujados una vez para toda la pantalla. */}
          <ModalesDeAccion m={acciones.modales} />
        </>
      )}

      {/* 🔑 El Parte queda como lo que ahora es: el MISMO día en curso de la banda de arriba, pero
          entero y en texto para pegarlo en una conversación. Comparte `useParte`, así que abrirlo
          ⛔ no pide nada — las cinco llamadas ya se hicieron una vez. */}
      {/* La MISMA cuenta que la banda: comparten `useParte`, y dos criterios distintos para «de
          qué cuenta es el día» dejarían el bloque de abajo pidiendo elegir una cuenta arriba de una
          banda que ya la resolvió sola. */}
      <ParteDelDia cuenta={delParte.cuenta ? delParte.cuenta.id : null} linea={laLinea || undefined} />
    </div>
  )
}

/**
 * El selector de ventana.
 *
 * 🔑 **Las dos primeras llevan un punto: salen de Meta EN VIVO, las otras de la foto.** No es
 * decoración — la foto sólo tiene días cerrados, así que «3 días» termina AYER. Sin la marca, «3
 * días» al lado de «Hoy y ayer» se lee como «hoy, ayer y anteayer», que es otra cosa.
 */
function BarraVentana({ ventana, setVentana, anclado, volverALaVentana }: {
  ventana: VentanaZona
  setVentana: (k: string) => void
  anclado: string | null
  volverALaVentana: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
      {/* 🔑 **El infinitivo va UNA vez, en el rótulo, y cubre los seis botones.** `VOCABULARIO.md`
          §3 lo pide para los títulos de acción, y Bruno lo nombró: *«las celdas de hoy y ayer, la
          terminología que no es infinitiva no me convence»*. ⛔ Seis «Ver …» apilados repiten el
          mismo verbo seis veces y dejan de distinguir lo único que cambia, que es el período. */}
      <span style={{ fontSize: font.sm, color: color.mut }}>Mirar:</span>
      {VENTANAS_ZONA.map((x) => (
        // ⛔ Con un día anclado NINGUNO va en `solid`: la ventana no es la que dice el botón, y
        // dejarlo marcado sería que la barra afirme una cosa y la tabla muestre otra.
        <Button key={x.k} size="sm" variant={!anclado && x.k === ventana.k ? 'solid' : 'ghost'} onClick={() => setVentana(x.k)}>
          {x.label}{x.vivo ? ' •' : ''}
        </Button>
      ))}
      {anclado ? (
        <>
          <span style={{ fontSize: font.sm, color: color.brandSolid, fontWeight: weight.semibold }}>
            — anclado al {anclado}
          </span>
          {/* El MISMO gesto que el ✕ de la tira, con el mismo rótulo: escrito de dos maneras en la
              misma pantalla se lee como dos cosas distintas. */}
          <Button size="sm" variant="ghost" onClick={volverALaVentana}>Ver el período entero</Button>
        </>
      ) : (
        <span style={{ fontSize: font.xs, color: color.mut2 }}>
          • en vivo desde Meta, día en curso · el resto sale de la foto diaria y termina ayer
        </span>
      )}
    </div>
  )
}

/**
 * **Por qué no se está viendo el día en curso.**
 *
 * 🔴 Hasta el 3-sep-2026 esto decía siempre *«Meta todavía no contestó»*, y en el caso más común
 * —entrar por el menú, con el eje en «Todas»— **a Meta ni se le había preguntado**: el parte es de
 * una cuenta sola y no había ninguna elegida. Nombrar mal la causa manda a revisar un token que
 * está bien. Las cuatro se dicen distinto porque **la mano que las arregla es distinta**.
 */
function CausaDelSinVivo({ s }: { s: SinVivo | null }) {
  if (!s || s.tipo === 'pidiendo') return <>Todavía estamos pidiéndole a Meta el día en curso.</>
  if (s.tipo === 'error') return <>Meta no contestó el día en curso: {s.motivo}.</>
  if (s.tipo === 'elegir') {
    return (
      <>
        Esta marca pautea en {s.cuentas.length} cuentas ({s.cuentas.join(' y ')}) y el día en curso
        es de una sola: <b>elegí una cuenta acá arriba</b> para verlo.
      </>
    )
  }
  return <>Esta marca no tiene ninguna cuenta publicitaria con campañas asignadas, así que no hay día en curso que pedir.</>
}

/**
 * 🔑 **Se exporta para poder testear EL ORDEN**, igual que `FilaDeKpis` se exportó para poder
 * testear qué objeto lee cada tarjeta. El orden vertical de esta pantalla es una decisión de
 * producto —Bruno la reportó dos veces— y hasta el 5-sep-2026 **nada lo miraba**: la próxima tanda
 * podía mover la tabla tres bloques hacia abajo sin que se pusiera rojo nada.
 */
export function Contenido({ d, ventana, dias, acciones, anclado, onElegir, vivas, sinVivo, lineaViva, reglas }: {
  d: RespuestaZona
  /** `null` con un día anclado: ahí la ventana la manda la tira, no la barra. */
  ventana: VentanaZona | null
  dias: number
  acciones: Acciones
  anclado: string | null
  onElegir: (fecha: string | null) => void
  vivas: { hoy: CeldaViva[]; ayer: CeldaViva[] } | null
  /** Por qué no hay día en curso. `null` cuando sí lo hay. */
  sinVivo: SinVivo | null
  lineaViva: LineaPauta
  reglas: ReturnType<typeof useReglas>
}) {
  if (!d.zona) {
    return <Notice tone="warning">{d.motivo || 'La foto no tiene ningún día cerrado todavía.'}</Notice>
  }
  const z = d.zona
  // 🔑 El modo vivo se decide con LAS DOS cosas: que la ventana lo pida **y** que el parte haya
  // contestado. Si Meta no contestó, la tabla vuelve a la foto y se dice arriba — ⛔ no se dibuja
  // vacía, que es lo que haría creer que hoy no gastó nada.
  const enVivo = !!ventana?.vivo && !!vivas
  const vivo = enVivo
    ? fusionarVivo(
        z.celdas,
        ventana!.dias === 1 ? vivas!.hoy : sumarVivas(vivas!.ayer, vivas!.hoy),
        { linea: lineaViva, techo: d.techo || 0 },
      )
    : null
  const celdas: Celda[] = vivo ? vivo.celdas : z.celdas
  // `null` fuera del modo vivo: las tarjetas de arriba caen a `z.totales`, que es la foto.
  const tv = vivo ? vivo.totales : null
  // 🔴 El hallazgo que tiene fila **va en su fila**; el que no, arriba de la tabla. Ver
  // `repartirHallazgos`: medido, 21 hallazgos y ninguno accionado en cuatro días, y una de las tres
  // causas era que la mano estaba partida en dos lugares para el mismo objeto.
  const reparto = repartirHallazgos(celdas, reglas.hallazgos)
  const cuenta = contarParaDecidir(reglas.hallazgos)

  return (
    <>
      {d.problemas.length > 0 && (
        <Notice tone="warning">
          La zona salió, pero sin esto:
          <ul style={{ margin: `${space[1]}px 0 0`, paddingLeft: space[4] }}>
            {d.problemas.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </Notice>
      )}

      {/* Lo único de la cabecera vieja que ⛔ no puede bajar: invalida la columna `% techo`. */}
      <AlarmaDeFicha d={d} />

      <FilaDeKpis z={z} tv={tv} techo={d.techo} ventana={enVivo ? ventana : null} />

      {/* Es un control de período, como la barra de arriba: elegir un día. Queda pegado a los KPIs
          y arriba de la tabla, que es lo que ancla. Sale de `z.caja`, que ya viaja: ⛔ cero llamadas. */}
      <TiraDeDias caja={z.caja} techo={d.techo || 0} anclado={anclado} onElegir={onElegir} />

      {/* 🔴🔑 **LA TABLA VA ARRIBA.** Bruno: *«primordialmente en la vista rendimiento tiene que
          estar los rendimientos más arriba. Está muy muy rara la vista de esta sección, muy larga,
          comprimida toda hacia la de veredicto»*. Estaba sexta, con ≈1.080 px de contexto encima:
          la banda de hoy (4 tarjetas y dos párrafos), los planes, la cabecera, los KPIs, la tira y
          un bloque con 19 pendientes. Ahora lo primero que se ve es el rendimiento de las pautas.
          ⛔ «celda» ⛔ no se dice más en pantalla: es jerga que ⛔ no existe ni en Meta ni en el
          negocio, y él escribió «una pauta». Los SÍMBOLOS (`TablaCeldas`, `AvisosDeCelda`) ⛔ no se
          tocan — VOCABULARIO §1: se renombra lo que se lee, ⛔ no lo que se importa. */}
      <SectionCard
        title={anclado
          ? `Las pautas · el ${anclado} (${celdas.length})`
          : enVivo
            ? `Las pautas · ${ventana!.label.toLowerCase()} (${celdas.length})`
            : `Las pautas (${celdas.length})`}
        subtitle="Una fila por pauta, de la que más gasta a la que menos. Tocá cualquier lado de la fila para abrirla."
        actions={<RenglonDecidir cuenta={cuenta} linea={lineaViva} />}
      >
        {/* 🔴 El aviso más importante de la pantalla en modo vivo. Medio día de gasto contra medio
            día de compras da un costo por compra que no existe: a las 10 de la mañana casi toda
            celda «compra carísimo». Los NÚMEROS son de hoy; el VEREDICTO sigue saliendo de la
            ventana de juicio, y callarlo sería mandar a apagar cosas que rinden. */}
        {enVivo && (
          <Notice tone="warning">
            Los números son de <b>{ventana!.label.toLowerCase()}</b>, leídos de Meta hace un momento —
            y <b>hoy va por la mitad</b>. El <b>veredicto</b>, el desgaste y el aprendizaje se siguen
            midiendo sobre los <b>{z.ventanaJuicio} días</b> cerrados de la foto: con medio día no se
            juzga nada.
            {vivo!.sinEntrega.length > 0 && (
              <div style={{ fontSize: font.sm, marginTop: space[1] }}>
                {vivo!.sinEntrega.length === 1
                  ? `Y 1 celda activa todavía no entregó: «${vivo!.sinEntrega[0]}».`
                  : `Y ${vivo!.sinEntrega.length} celdas activas todavía no entregaron: ${vivo!.sinEntrega.slice(0, 4).map((n) => `«${n}»`).join(', ')}${vivo!.sinEntrega.length > 4 ? ' y otras' : ''}.`}
              </div>
            )}
          </Notice>
        )}
        {/* Lo mismo al revés: la ventana la pidió viva y el parte no contestó. Se dice qué se está
            mirando en su lugar, porque una tabla que dice «hoy» arriba y muestra la semana es peor
            que una que no ofrece «hoy». */}
        {ventana?.vivo && !vivas && (
          <Notice tone={sinVivo?.tipo === 'elegir' ? 'warning' : 'neutral'}>
            <CausaDelSinVivo s={sinVivo} />
            {' '}Abajo está la foto de los {z.ventanaJuicio} días cerrados. No es que hoy no haya gastado.
          </Notice>
        )}
        {/* 🔴 Con la ventana anclada a un día, los NÚMEROS son de ese día pero el VEREDICTO, el
            desgaste y el marginal se siguen midiendo sobre `ventanaJuicio`. Se dice: callarlo
            dejaría leerlos como del día que se está mirando, y un veredicto de un día suelto manda
            a apagar cosas que rinden. */}
        {!enVivo && z.ventanaJuicio !== dias && (
          <Notice tone="neutral">
            Los números son del {anclado || 'período'}, pero el <b>veredicto</b>, el desgaste y el
            marginal se miden sobre <b>{z.ventanaJuicio} días</b>. Un día suelto tiene una o dos
            compras: alcanza para mirarlo, ⛔ no para juzgarlo.
          </Notice>
        )}
        {celdas.length === 0 ? (
          <EmptyState
            title={enVivo ? `Ninguna celda entregó ${ventana!.label.toLowerCase()}` : 'Ninguna celda entregó en la ventana'}
            hint={enVivo ? 'Puede ser temprano: Meta tarda en registrar las primeras impresiones del día.' : 'Probá una ventana más larga.'}
            dashed
          />
        ) : (
          <TablaCeldas
            celdas={celdas}
            hallazgosDe={(id) => reparto.porCelda.get(id) || null}
            quitarHallazgo={reglas.quitar}
            moneda={z.celdas[0]?.moneda ?? null}
            acciones={acciones}
            // La cuenta sale de la FOTO y ⛔ no del selector de arriba: la que vale es la de los
            // datos que se están mirando, no la que quedó elegida en el eje.
            cuenta={z.celdas[0]?.cuentaId ?? null}
            dias={dias}
          />
        )}
      </SectionCard>

      {/* Abajo de la tabla: es de dónde salen los datos, ⛔ no una decisión. */}
      <Cabecera d={d} />

      <Oraculo d={d} dias={dias} />
    </>
  )
}

/**
 * La cabecera: **hasta cuándo llegan los datos, y si al techo se le puede creer.**
 *
 * 🔴 Lo segundo es una cicatriz. El 25-ago-2026 el monitor imprimía «zattia 6046» con cara de
 * certeza y ese techo estaba cargado a precio de LISTA con la tienda en liquidación: el ticket real
 * era 38% más bajo, y como el costo de la mercadería no baja con el precio, el techo real era casi
 * cero. Se le creyó toda una tarde. 🔑 **Una regla no protege de una ficha mal cargada: hay que
 * contrastar la ficha**, y la única manera de que eso pase es que la pantalla lo haga sola.
 */
/**
 * **El renglón que reemplaza al bloque de pendientes: un link con el número.**
 *
 * # 🔴 Por qué (5-sep-2026)
 *
 * Bruno: *«las decisiones automáticas o lo que hay que decidir no me está convenciendo,
 * principalmente porque son 14 pendientes que alargan la lista y que no estoy ejecutando nada por
 * ahí… pensaría en una sección exclusiva que sea decidir y que ahí se ponga todo»*.
 *
 * 📊 Medidos los 19 abiertos ese día, uno por uno contra el estado de la cuenta: **7 apuntaban a
 * algo ya apagado**, 1 a un objeto que ⛔ ni estaba en la ventana, 1 contradecía a la tabla de abajo
 * (decía «156% del techo, pausar» donde la fila decía «Rinde, 58%», y era del 26-ago), 4 eran
 * informativos y 1 era ruido de frecuencia. **Quedaban ~2.** ⇒ la lista ⛔ no estaba larga porque
 * faltara una pantalla: estaba larga porque el 89% ⛔ no debería estar ahí. Eso se arregla en el
 * motor; lo que se arregla acá es que ⛔ no ocupe media pantalla de Rendimiento.
 *
 * # ⚠️ Y por qué esto NO contradice «no hay pantalla de alertas»
 *
 * `HallazgosPanel` tiene escrito *«una pantalla nueva sería un segundo lugar al que hay que
 * acordarse de entrar, y el que no entra no se entera»*, y sigue valiendo. **Este renglón ES el
 * link**: el contador está donde Bruno ya mira todos los días, y el badge del sidebar, la pantalla
 * de Inicio y el mail de las 07:50 siguen empujando exactamente igual. Lo que cambia es **dónde se
 * hace**, ⛔ no **cómo se entera**. Y accionar sigue pasando en un solo lado por objeto: lo que
 * tiene fila se acciona en su fila (`repartirHallazgos`), lo que ⛔ no tiene, en `/meta-ads/decidir`.
 *
 * 🔑 **Nombra la LÍNEA.** El badge del menú cuenta todas las que la persona ve y este renglón sólo
 * la del eje: sin el nombre serían dos números distintos sobre lo mismo, que es exactamente el
 * defecto que `contarParaDecidir` existe para evitar entre la pantalla y el mail.
 */
function RenglonDecidir({ cuenta, linea }: { cuenta: { total: number; quemando: number }; linea: LineaPauta }) {
  if (cuenta.total === 0) return null
  return (
    <Link
      href={`/meta-ads/decidir?linea=${linea}`}
      style={{ fontSize: font.sm, fontWeight: weight.semibold, color: color.brandSolid, textDecoration: 'none' }}
    >
      {cuenta.total} de {ETIQUETA_LINEA[linea] || linea} para decidir
      {cuenta.quemando > 0 && (
        <span style={{ color: color.dangerInk }}> · {cuenta.quemando} para pausar</span>
      )}
      {' →'}
    </Link>
  )
}

/**
 * 🔴 **La alarma va sola y ARRIBA de la tabla, separada de la prosa** (5-sep-2026).
 *
 * Antes las dos vivían adentro de `Cabecera`, que estaba cuarta y por encima de todo. Pero son dos
 * cosas de peso opuesto: *«sale de la foto diaria y llega hasta el X»* es contexto que se lee una
 * vez, y *«el techo está mal cargado»* **invalida la columna `% techo` de todas las filas**. Lo
 * segundo va arriba de la tabla o ⛔ no sirve; lo primero puede irse abajo y devolver 80 píxeles.
 */
function AlarmaDeFicha({ d }: { d: RespuestaZona }) {
  const z = d.zona
  if (!z) return null
  const ticketReal = z.totales.compras ? z.totales.revenue / z.totales.compras : 0
  const dif = d.ficha && d.ficha.ticket > 0 && ticketReal > 0
    ? ((ticketReal - d.ficha.ticket) / d.ficha.ticket) * 100
    : null
  if (dif == null || Math.abs(dif) < 15) return null
  return (
    <Notice tone="danger">
      🔴 El techo está calculado sobre un ticket de {plata(d.ficha!.ticket)} y el ticket REAL de
      esta ventana es {plata(ticketReal)} ({dif >= 0 ? '+' : ''}{Math.round(dif)}%).{' '}
      <strong>Hasta que la ficha se corrija, el % del techo de cada pauta está mal.</strong> Y el
      error no es proporcional: el costo de la mercadería no baja con el precio, así que un
      descuento se lleva casi tres veces su valor de techo.{' '}
      <Link href="/meta-ads/rentabilidad" style={{ color: 'inherit', textDecoration: 'underline' }}>Corregirla →</Link>
    </Notice>
  )
}

/** De dónde sale y hasta cuándo llega. Contexto, ⛔ no alarma: por eso vive DEBAJO de la tabla. */
function Cabecera({ d }: { d: RespuestaZona }) {
  const z = d.zona
  if (!z) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
      <div style={{ fontSize: font.sm, color: color.mut }}>
        Sale de la <strong>foto diaria</strong>, no de Meta: llega hasta el <strong>{z.hasta}</strong>,
        que es el último día cerrado. El día en curso no entra —arrastraría medio día de gasto contra
        medio día de pedidos—; para verlo, armá el parte más abajo.
      </div>
      <div style={{ fontSize: font.sm, color: color.mut }}>
        {d.techo ? (
          <>
            Techo por compra <strong>{plata(d.techo)}</strong>
            {d.techoCaja ? <> · de caja {plata(d.techoCaja)}</> : null}
            {d.ficha?.cargadaEl && <> · ficha cargada el {String(d.ficha.cargadaEl).slice(0, 10)}</>}
          </>
        ) : (
          <span style={{ color: color.warningInk }}>
            ⛔ Esta línea no tiene fila de rentabilidad: sin techo no se puede juzgar ninguna celda, y
            no se inventa un default.{' '}
            <Link href="/meta-ads/rentabilidad" style={{ color: color.brandSolid, fontWeight: weight.semibold }}>Cargarla →</Link>
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * EL ORÁCULO: los pedidos reales de la tienda contra lo que Meta se atribuye.
 *
 * 🔴🔑 Medido el 20-ago-2026: **las dos series fueron en sentido contrario durante dos días.** Meta
 * decía que el costo por compra había bajado 34% y los pedidos reales decían que había subido 47%.
 * Ninguna mentía: el CAPI arrancó y Meta pasó de explicar el 40% de los pedidos al 89%. La mejora
 * era de ATRIBUCIÓN y **ninguna de esas compras era nueva**. ⇒ el oráculo del escalado es
 * `pedidos/día` de la tienda, ⛔ NO las `purchases` de Meta — y la forma de que eso no se olvide no
 * es un comentario: es que las dos columnas estén una al lado de la otra con la proporción en el
 * medio.
 */
function Oraculo({ d, dias }: { d: RespuestaZona; dias: number }) {
  const [abierto, setAbierto] = useState(false)
  const z = d.zona
  if (!z) return null
  const m = z.marginal
  return (
    <SectionCard
      title="Pedidos reales contra Meta"
      subtitle="El oráculo del escalado. Si atrib% sube mientras el costo por compra de Meta baja, la mejora es de atribución y no hay una sola venta nueva."
    >
      {m.marginal ? (
        <div style={{ fontSize: font.base, lineHeight: 1.5 }}>
          El pedido que se sumó costó <strong>{plata(m.marginal)}</strong>
          {d.techo && (
            m.marginal > d.techo
              ? <span style={{ color: color.dangerInk, fontWeight: weight.semibold }}> — más de lo que vale ({plata(d.techo)})</span>
              : <> , contra un techo de {plata(d.techo)}</>
          )}
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>
            {m.a!.desde}→{m.a!.hasta} ({m.a!.pedidosDia.toFixed(1)}/día) contra {m.b!.desde}→{m.b!.hasta} ({m.b!.pedidosDia.toFixed(1)}/día).
            ⛔ No multiplicar los pedidos que faltan por este número: el marginal sube en cada escalón.
          </div>
        </div>
      ) : (
        // 🔴 `null` con MOTIVO, ⛔ nunca un número: con los pedidos planos la división da un costo
        // negativo, que se lee como «cada pedido nuevo te devuelve plata».
        <div style={{ fontSize: font.base, color: color.mut }}>
          El marginal no se puede calcular — {m.motivo}.
        </div>
      )}

      <Plegable
        abierto={abierto}
        onToggle={() => setAbierto((v) => !v)}
        titulo="Día por día"
        ayuda={`Los ${dias * 2} días que entran en la comparación, con las dos versiones del mismo hecho.`}
      >
        <TableWrap>
          <THead>
            <Tr>
              <Th>Fecha</Th>
              <Th align="right">Pedidos</Th>
              <Th align="right">Gasto</Th>
              <Th align="right">Costo real</Th>
              <Th align="right">Compras Meta</Th>
              <Th align="right">Costo Meta</Th>
              <Th align="right">atrib%</Th>
            </Tr>
          </THead>
          <TBody>
            {z.caja.slice(-dias * 2).map((x) => (
              <Tr key={x.fecha}>
                <Td>{x.fecha}</Td>
                <Td align="right">{entero(x.pedidos)}</Td>
                <Td align="right">{plata(x.gasto)}</Td>
                {/* ⛔ Vacío y no 0 cuando no hay denominador. */}
                <Td align="right">{x.pedidos ? plata(x.costoPedidoReal) : <span style={{ color: color.mut2 }}>—</span>}</Td>
                <Td align="right">{entero(x.comprasMeta)}</Td>
                <Td align="right">{x.comprasMeta ? plata(x.costoCompraMeta) : <span style={{ color: color.mut2 }}>—</span>}</Td>
                {/* `null` porque sin pedidos reales no es «0%», es «no se puede saber». Y puede
                    pasar el 100%: Meta atribuye a 7 días al clic. ⛔ No se recorta. */}
                <Td align="right">{x.atrib == null ? <span style={{ color: color.mut2 }}>—</span> : `${Math.round(x.atrib)}%`}</Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      </Plegable>
    </SectionCard>
  )
}


/**
 * **La fila de KPIs: cinco números y, en cada uno, de dónde sale.**
 *
 * 🔴 **Existe como componente propio por el defecto que Bruno vio el 30-ago-2026**: *«cambio la
 * fecha en rendimiento con hoy, ayer o hace 3 días pero no cambian los resultados»*. Era cierto acá
 * y ⛔ no en el núcleo: `fusionarVivo` pisaba las CELDAS y ⛔ no los totales, así que con «Hoy»
 * estas tarjetas seguían mostrando la foto de la ventana de juicio. Y como a la foto se le pide la
 * misma ventana para las dos vivas **y** para «7 días» (`diasDeLaFoto`), las tres hacían el MISMO
 * pedido ⇒ el número era idéntico y la pantalla se veía congelada.
 *
 * 🔑 **Sale del `Contenido` para que se pueda RENDERIZAR en un test.** El núcleo ya estaba probado
 * y ⛔ no alcanzaba: el defecto vivía en qué tarjeta lee qué objeto, que es cableado de pantalla.
 *
 * 🔴 **`tv` (los totales vivos) manda sólo sobre las TRES primeras.** El marginal se mide ENTRE
 * ventanas cerradas y la concentración sale de la foto: en vivo ⛔ no se disfrazan de hoy, lo dicen
 * en su `sub`. Y los **pedidos reales** ⛔ no tienen versión viva —la caja de Tienda Nube sólo
 * cierra días—, así que en vivo la tarjeta cambia de rótulo a la fuente que sí existe, **Meta**, y
 * lo que falta se dice abajo en vez de rellenarse. 📌
 * [[feedback_areben_supuesto_tipeado_al_lado_de_un_medible]]: medir una mitad del cociente y dejar
 * la otra prestada da un número que ⛔ no es de nadie.
 */
export function FilaDeKpis({ z, tv, techo, ventana }: {
  z: RespuestaZona['zona']
  /** `null` fuera del modo vivo: ahí las tarjetas caen a `z.totales`, que es la foto. */
  tv: TotalesVivos | null
  techo: number | null
  /** La ventana viva, sólo para rotular. `null` cuando los números salen de la foto. */
  ventana: VentanaZona | null
}) {
  if (!z) return null
  const t = z.totales
  const conc = z.concentracion.mayor
  // 🔴🔑 **LA VARA ES LA DE META, y es la MISMA con la que se juzga cada fila** (5-sep-2026).
  //
  // Hasta hoy esta tarjeta dividía el gasto por los **pedidos reales de Tienda Nube** mientras la
  // tabla de abajo dividía por las **compras que Meta se atribuye**, y las dos decían «% del
  // techo»: el total marcaba 81% y las filas 106%, sobre la misma plata. No había forma de saber a
  // cuál creerle.
  //
  // Lo corrigió Bruno, y la razón es del negocio: *«los pedidos reales pueden ser de otros canales
  // que no sean Meta, por ese motivo, solo tiene que ser META»*. Los 113 pedidos de la tienda
  // incluyen orgánico, mail, directo y WhatsApp ⇒ la diferencia contra las 84 compras de Meta ⛔ no
  // es «lo que Meta no ve», y usarla para abaratar el costo de la pauta le regalaría plata.
  //
  // ⇒ los pedidos reales ⛔ no se van de la pantalla: bajan al renglón de abajo, a la tira de días y
  // al Oráculo, **rotulados y sin el tono del techo**. Son la vara del NEGOCIO, ⛔ no de la pauta.
  const pctVara = tv ? tv.pctTechoMeta : t.pctTechoMeta
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: space[2] }}>
        <KpiCard
          label="Gasto"
          value={plata(tv ? tv.spend : t.spend)}
          sub={tv ? `${(ventana ? ventana.label : 'hoy').toLowerCase()} · en vivo de Meta` : `${z.desde} → ${z.hasta}`}
        />
        <KpiCard
          label="Compras · Meta"
          value={entero(tv ? tv.compras : t.compras)}
          sub="atribuidas por Meta, ⛔ no la caja de la tienda"
        />
        <KpiCard
          label="Costo por compra · Meta"
          value={(tv ? tv.compras : t.compras) ? plata(tv ? tv.costoMeta : t.costoMeta) : '—'}
          sub={pctVara == null ? 'sin techo cargado' : `${Math.round(pctVara)}% del techo`}
          tone={pctVara != null && pctVara > 100 ? 'danger' : pctVara != null ? 'success' : 'warning'}
        />
        <KpiCard
          label="Marginal"
          value={z.marginal.marginal ? plata(z.marginal.marginal) : '—'}
          sub={z.marginal.marginal
            ? (tv ? `el pedido que se sumó · ${z.ventanaJuicio} días cerrados` : 'el pedido que se sumó')
            : z.marginal.motivo}
          tone={z.marginal.marginal && techo && z.marginal.marginal > techo ? 'danger' : 'neutral'}
        />
        {conc && (
          <KpiCard
            label="Pieza más grande"
            value={`${Math.round(conc.pct)}%`}
            /* 🔴 **Los NOMBRES se dicen, ⛔ no se callan.** La misma pieza corre con la fecha de
               lanzamiento cambiada, con `- Copia` y con el gemelo de Advantage+, y sumarlas es lo
               que lleva a la más grande de BDI de 32% a 52%. Pero la firma sale del NOMBRE, así que
               puede fusionar dos videos distintos que compartan la base: decir sobre cuántos está
               sumando es lo que deja vetarlo de un vistazo. 📌 Ver `firmaDePieza` en el núcleo. */
            sub={`«${conc.pieza}»${conc.nombres > 1 ? ` +${conc.nombres - 1} nombre${conc.nombres === 2 ? '' : 's'}` : ''} en ${conc.cajas} caja${conc.cajas === 1 ? '' : 's'}${tv ? ` · ${z.ventanaJuicio} días cerrados` : ''}`}
            tone={conc.pct >= 40 ? 'warning' : 'neutral'}
          />
        )}
      </div>

      {/* 🔑 **Los pedidos de la tienda, DECLARADOS como lo que son.** Sin tono y sin «% del techo»:
          son de todos los canales, así que ⛔ no juzgan una pauta. Sirven para dimensionar el
          negocio —de acá salen el marginal y la elasticidad— y para ver, en el Oráculo, si Meta se
          está atribuyendo de más. Va como renglón y ⛔ no como tarjeta a propósito: una tarjeta
          igual a las de arriba se lee como una vara más. */}
      <div style={{ fontSize: font.sm, color: color.mut2 }}>
        {tv ? (
          <>
            Los <b>pedidos reales de la tienda</b> ⛔ no están para hoy: la caja cierra el día. El
            último cerrado es el <b>{z.hasta}</b> — mirá «7 días» o tocá un día en la tira.
          </>
        ) : (
          <>
            <b>Pedidos de la tienda: {entero(t.pedidos)}</b> ({t.pedidosDia.toFixed(1)}/día
            {z.objetivoPedidos ? ` · meta ${z.objetivoPedidos}` : ''}
            {t.pedidos ? ` · ${plata(t.costoPedidoReal)} cada uno` : ''}). Son <b>todos los canales</b>,
            así que ⛔ no son la vara de la pauta: sirven para dimensionar el negocio. La vara de cada
            fila es la compra que <b>Meta</b> se atribuye.
          </>
        )}
      </div>
    </>
  )
}
