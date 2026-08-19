/**
 * El recorrido guiado de Envíos: dónde se aprieta cada cosa, en el orden real del trabajo.
 *
 * ⚠️ **El orden de los pasos NO es el de las pestañas.** La primera pestaña es «El día» —que es la
 * que se abre todas las mañanas— pero el trabajo de un envío empieza en «Sin fecha». La guía sigue
 * al envío, no a la pantalla.
 *
 * 🔑 **Acá NO van reglas de negocio.** Por qué el precio nunca es $0, por qué un entregado sin
 * cobrar no es una deuda, qué pasa si la clienta no confirma: todo eso vive en el **manual**
 * (`seccion: envios`, se edita sin deploy). Si las dos cosas cuentan lo mismo, derivan; el día que
 * cambie una regla se corrige en un solo lado.
 *
 * # Las anclas
 *
 * Cada paso se para en algo que está SIEMPRE en esa pestaña —la card de arriba, un botón del
 * encabezado— y sólo *afina* sobre el control puntual cuando está en pantalla. Ver `lib/guia/core`
 * para por qué un paso nunca se saltea. Los `data-guia` viven en `components/envios/Envios.tsx` y
 * `tests/guia.test.ts` los afirma uno por uno: si alguien saca un botón, el test se pone rojo en
 * vez de dejar un globo señalando el vacío.
 */

import type { PasoGuia } from '@/lib/guia/core'

export const GUIA_ENVIOS: readonly PasoGuia[] = [
  {
    pestania: 'pendientes',
    ancla: 'envios.traer',
    texto: 'Todo arranca acá: baja de Tienda Nube los pedidos que van en moto. Los que despacha el correo quedan afuera solos.',
  },
  {
    pestania: 'pendientes',
    ancla: 'envios.bandeja',
    texto: '«Sin fecha» no es una bandeja de entrada: es la lista de trabajo. Los pedidos se quedan acá hasta que la clienta confirme el día.',
  },
  {
    pestania: 'pendientes',
    ancla: 'envios.bandeja',
    anclaFina: 'envios.sugerir',
    texto: '«Sugerir precios» le pregunta la zona al mapa para todas juntas. No guarda nada: cada una se confirma con «usar».',
    siNoEsta: 'Ahora no aparece porque no hay ninguna fila sin cotizar.',
  },
  {
    pestania: 'pendientes',
    ancla: 'envios.bandeja',
    anclaFina: 'envios.precio',
    texto: 'Cuando el mapa no propone, el precio se tipea en esta columna.',
    siNoEsta: 'La columna aparece con la primera fila; ahora la bandeja está vacía.',
  },
  {
    pestania: 'pendientes',
    ancla: 'envios.bandeja',
    anclaFina: 'envios.whatsapp',
    texto: 'Este botón abre el chat con el primer mensaje ya escrito. Verde es que el mensaje está adentro; gris, que todavía falta el precio.',
    siNoEsta: 'Está en cada fila que tenga teléfono; ahora no hay ninguna a la vista.',
  },
  {
    pestania: 'pendientes',
    ancla: 'envios.bandeja',
    anclaFina: 'envios.agendar',
    texto: 'Cuando ella confirma, este botón lo manda a un día. El día y el turno van juntos.',
    siNoEsta: 'Está en cada fila, y se prende recién cuando el envío tiene precio.',
  },
  {
    pestania: 'dia',
    ancla: 'envios.dia',
    texto: 'La hoja del día es una sola para las dos marcas: el cadete sale con todo en la misma mochila y las separa el color.',
  },
  {
    pestania: 'dia',
    ancla: 'envios.imprimir',
    texto: 'Los tickets salen de acá, uno por paquete y pegado afuera. En el ticket sí va el número entero que se cobra en la puerta.',
  },
  {
    pestania: 'dia',
    // La card se dibuja recién cuando vuelve su propia lectura (`if (cargando) return null`), así
    // que el ancla estable es la de arriba: mientras carga, el paso se dice igual.
    ancla: 'envios.dia',
    anclaFina: 'envios.link',
    texto: 'Acá se genera el link con el PIN que el cadete usa en el teléfono. Generar uno nuevo apaga el anterior en el acto.',
    siNoEsta: 'La card está al pie de esta hoja; si todavía no se ve, está cargando.',
  },
  {
    pestania: 'cuenta',
    ancla: 'envios.anotar',
    texto: 'Cuando el cadete pasa a rendir, la plata se anota acá. El saldo se arrastra solo, día a día.',
  },
]
