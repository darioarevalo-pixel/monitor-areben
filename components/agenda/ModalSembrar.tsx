'use client'

import { useState } from 'react'
import {
  Button, Field, Input, Modal, Notice, Select, color, font, space, useToast,
} from '@/components/ui'
import { clavesDeEje, hechoYaPaso, hoyIso, moldeCorreEnEje, moldeCorreEnMarca, type ItemAgenda, type Plantilla } from '@/lib/agenda'
import { sembrarAMano } from '@/lib/agenda/cliente'
import type { Marca } from '@/lib/nav.datos'
import { MARCAS } from './ModalItem'

/**
 * **El botón que siembra un hecho a mano** — el mismo modal para los dos, y para el que venga.
 *
 * 🔴 **Existe porque el disparador es hoy una persona acordándose.** El del ingreso: dos manuales
 * («Sesiones de fotos» y «Cómo se lanza un producto») se apoyan en un aviso de ingreso automático
 * que nunca existió, y el flujo que dispara —nombre → descripción → precio → foto → publicación—
 * es, según el propio manual, el que más se cae. El del cambio de condición comercial: el manual
 * «Las chiquitas» dice que *«una promo, una forma de pago, un cambio de envío no es un posteo: es
 * destacadas + barra de anuncios + bio + el local avisado + el mail»*, y hoy no lo prende nada.
 *
 * 🔑 **Este componente ⛔ no sabe de puertas ni de promos.** Toda la copia —el botón, el título, qué
 * se pregunta, qué dice el vacío— y el eje entero salen del catálogo (`plantillas.core.js`). Fue
 * `ModalIngreso` hasta el 29-ago-2026, con la copia adentro; el 4º disparador la habría copiado a un
 * segundo modal, y dos formularios que preguntan lo mismo se contestan distinto en un mes. ⇒ el 5º
 * con botón es **una fila del catálogo**, no un archivo.
 *
 * 🔑 **No inventa los renglones**: clona los ítems marcados como molde de esa plantilla. Si no hay
 * ninguno lo dice y no siembra nada — es preferible a crear pendientes de mentira que nadie tilda.
 */
export function ModalSembrar({ plantilla, moldes, onCerrar, onListo }: {
  plantilla: Plantilla
  moldes: ItemAgenda[]
  onCerrar: () => void
  onListo: () => Promise<void>
}) {
  const toast = useToast()
  const copia = plantilla.pantalla!
  const eje = plantilla.eje
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState(copia.cuandoArrancaEnHoy ? hoyIso() : '')
  // 🔴 **Arranca vacío y ⛔ no en el valor más común.** Un default acá se contesta solo: el que
  // carga aprieta sin mirar y los pasos que cambian de dueña —o los que no corren para este
  // valor— quedan mal puestos, que es peor que no sembrar. Un pendiente que ya tiene nombre no lo
  // revisa nadie.
  const [valorEje, setValorEje] = useState('')
  // 🔴 Y la marca arranca vacía por el mismo motivo, ⛔ no en la del header: el que carga puede
  // estar mirando BDI y estar sembrando el ingreso de ropa.
  const [marcaHecho, setMarcaHecho] = useState<Marca | ''>('')
  const [guardando, setGuardando] = useState(false)

  // Cuántos renglones va a crear ESTA combinación. El total no sirve: los pasos que cambian están
  // cargados uno por valor del eje y por marca, así que decir «se van a crear 16» sería mentir en
  // las ocho. Las dos preguntas son las mismas que hace el servidor al sembrar.
  const listo = (!eje || !!valorEje) && !!marcaHecho && !!fecha
  const paraEsta = listo
    ? moldes.filter((m) => (
      (!eje || moldeCorreEnEje((m[eje.campo] ?? []) as string[], valorEje))
      && moldeCorreEnMarca(m.marcas, marcaHecho as Marca)
    ))
    : []
  /*
    🔴 **La fecha vencida se avisa ACÁ, antes de dejar apretar** —la regla es del servidor y sigue
    siendo suya (`hechoYaPaso`), pero un 400 después de llenar cuatro campos se lee como una falla
    del sistema y no como lo que es: que ese hecho ya pasó y sus pendientes nacerían vencidos.
  */
  const vencida = !!plantilla.noSiembraSiPaso && !!fecha && hechoYaPaso(fecha)

  async function sembrar() {
    if (!nombre.trim() || !listo || vencida) return
    setGuardando(true)
    try {
      const r = await sembrarAMano(plantilla, { nombre: nombre.trim(), fecha, eje: valorEje, marca: marcaHecho as Marca })
      if (r.ya) toast.ok(`Eso ya estaba cargado: no se duplicó nada.`)
      else toast.ok(`Listo: ${r.creados} ${r.creados === 1 ? 'pendiente' : 'pendientes'}.`)
      await onListo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron cargar los pendientes.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={copia.titulo}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button
            variant="solid"
            tone="brand"
            loading={guardando}
            disabled={!nombre.trim() || !listo || vencida || paraEsta.length === 0}
            onClick={() => void sembrar()}
          >
            Cargar los pendientes
          </Button>
        </>
      }
    >
      {moldes.length === 0 ? (
        <Notice tone="warning">{copia.vacio}</Notice>
      ) : (
        <>
          <Field label={copia.queLabel} hint={copia.queHint}>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={copia.quePlaceholder} />
          </Field>
          <div style={{ marginTop: space[3] }}>
            <Field label={copia.cuandoLabel} hint={copia.cuandoHint} width={200}>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            {vencida && (
              <div style={{ marginTop: space[2] }}>
                <Notice tone="warning">
                  Esa fecha ya pasó: los pendientes nacerían vencidos —algunos fuera de la ventana en
                  que se ven— así que no se siembra nada. Poné la fecha desde la que rige.
                </Notice>
              </div>
            )}
          </div>
          {/*
            🔑 **De qué marca es el hecho.** 🆕 **Va PRIMERO desde el 1-sep-2026**, y no es orden de
            lectura: en el ingreso las puertas que existen **dependen de la marca** —Zattia tiene
            producción propia, BDI tiene importación, las dos tienen compra nacional— así que el
            desplegable de abajo no se puede dibujar sin esta respuesta. Preguntarlo después dejaría
            elegir una puerta y cambiarla sola al elegir la marca, que es la pantalla desdiciéndose.
          */}
          <div style={{ marginTop: space[3] }}>
            <Field
              label="De qué marca"
              hint="El renglón nace en esta marca, y algunos pasos son de una sola."
              width={280}
            >
              <Select
                value={marcaHecho}
                onChange={(e) => {
                  setMarcaHecho(e.target.value as Marca | '')
                  // 🔴 **Se limpia el eje al cambiar de marca**, ⛔ no se conserva: «importación» con
                  // Zattia elegida después sería un valor que la lista ya no ofrece y que el
                  // servidor rechaza — el formulario mostraría una opción imposible como elegida.
                  setValorEje('')
                }}
              >
                <option value="" disabled>Elegí la marca…</option>
                {MARCAS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          {/*
            🔑 **El eje**, que es la columna que decide de quién es cada renglón y cuáles corren: la
            puerta en el ingreso, qué cambió en la condición comercial. Sin esto los renglones que
            más se caen salen con la persona equivocada.

            🆕 **Las opciones salen de `clavesDeEje(eje, marca)`**, que es la MISMA lista por la que
            corta el servidor: sin marca elegida no hay lista, y con marca elegida sólo están las
            que existen en ese negocio.

            ⚠️ Va **sin opción vacía elegible**: el placeholder es un `disabled`, no un «cualquiera».
          */}
          {eje && (
            <div style={{ marginTop: space[3] }}>
              <Field label={eje.titulo} hint={eje.pide} width={280}>
                <Select
                  value={valorEje}
                  onChange={(e) => setValorEje(e.target.value)}
                  disabled={!marcaHecho}
                >
                  <option value="" disabled>
                    {marcaHecho ? 'Elegí…' : 'Elegí primero la marca…'}
                  </option>
                  {/*
                    🔴 **Sin marca ⛔ no hay lista, ni siquiera la de las que corren en las dos.**
                    `puertasDeMarca('')` devuelve «compra nacional» —lo que falta cierra, no abre—,
                    y dibujarla acá sería ofrecer media respuesta antes de la pregunta.
                  */}
                  {(marcaHecho ? clavesDeEje(eje, marcaHecho) : []).map((k) => (
                    <option key={k} value={k}>{eje.rotulo(k)}</option>
                  ))}
                </Select>
              </Field>
              {valorEje && eje.ayudaDe && (
                <div style={{ marginTop: space[2], color: color.mut, fontSize: font.sm }}>
                  {eje.ayudaDe(valorEje)}
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: space[3], color: color.mut, fontSize: font.sm }}>
            {!listo ? (
              <>Completá los campos para ver cuántos pendientes se van a crear.</>
            ) : paraEsta.length === 0 ? (
              <>
                <b>
                  Ninguno de los {moldes.length} moldes cargados corre
                  {eje ? ` para «${eje.rotulo(valorEje)}»` : ''}
                  {' '}en {MARCAS.find((m) => m.key === marcaHecho)?.label}.
                </b>{' '}
                Revisá en «Cargar» en qué {eje ? 'valores y en qué ' : ''}marcas corre cada paso.
              </>
            ) : (
              <>
                Se van a crear <b>{paraEsta.length}</b>{' '}
                {paraEsta.length === 1 ? 'pendiente' : 'pendientes'}, cada uno con su dueña. El mismo
                hecho cargado dos veces no los duplica.
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
