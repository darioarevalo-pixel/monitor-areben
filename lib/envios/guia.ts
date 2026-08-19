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
 * # Las anclas: la PESTAÑA es el ancla estable
 *
 * 🔴 **Lo aprendí mirándolo con Bruno**: el paso que hablaba de la bandeja estaba anclado a la card
 * de arriba, o sea que **decía «Sin fecha» y resaltaba «Cargar uno a mano»**. Un tour que señala
 * una cosa mientras nombra otra enseña mal, y se ve perfecto en un test.
 *
 * Por eso el ancla estable de cada paso es **la pestaña donde vive** (`envios.tab.*`): es lo único
 * que está siempre —la tabla desaparece con la lista vacía, «Sugerir precios (N)» sólo existe si
 * hay algo sin cotizar— y, sobre todo, **es de lo que el paso habla** cuando el control fino no
 * está. Los `data-guia` viven en `components/envios/Envios.tsx` y `tests/guia.test.ts` los afirma
 * uno por uno: si alguien saca un botón, el test se pone rojo en vez de dejar un globo señalando
 * el vacío.
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
    ancla: 'envios.tab.pendientes',
    texto: '«Sin fecha» no es una bandeja de entrada: es la lista de trabajo. Los pedidos se quedan acá hasta que la clienta confirme el día.',
  },
  {
    pestania: 'pendientes',
    ancla: 'envios.tab.pendientes',
    anclaFina: 'envios.sugerir',
    texto: '«Sugerir precios» le pregunta la zona al mapa para todas juntas. No guarda nada: cada una se confirma con «usar».',
    siNoEsta: 'El botón aparece arriba de la lista, y sólo cuando hay alguna fila sin cotizar.',
  },
  {
    pestania: 'pendientes',
    ancla: 'envios.tab.pendientes',
    anclaFina: 'envios.precio',
    texto: 'Cuando el mapa no propone, el precio se tipea en esta columna.',
    siNoEsta: 'La columna aparece con la primera fila; ahora la bandeja está vacía.',
  },
  {
    pestania: 'pendientes',
    ancla: 'envios.tab.pendientes',
    anclaFina: 'envios.whatsapp',
    texto: 'Este botón abre el chat con el primer mensaje ya escrito. Verde es que el mensaje está adentro; gris, que todavía falta el precio.',
    siNoEsta: 'Está en cada fila que tenga teléfono; ahora no hay ninguna a la vista.',
  },
  {
    pestania: 'pendientes',
    ancla: 'envios.tab.pendientes',
    anclaFina: 'envios.agendar',
    texto: 'Cuando ella confirma, este botón lo manda a un día. El día y el turno van juntos.',
    siNoEsta: 'Está en cada fila, y se prende recién cuando el envío tiene precio.',
  },
  {
    pestania: 'dia',
    ancla: 'envios.tab.dia',
    texto: 'La hoja del día es una sola para las dos marcas: el cadete sale con todo en la misma mochila y las separa el color.',
  },
  {
    pestania: 'dia',
    ancla: 'envios.tab.dia',
    anclaFina: 'envios.estado',
    // Los cuatro estados y qué significa cada uno lo dijo Bruno mirando el tour: el camino está en
    // el código, pero «en tránsito es cuando se lo entregás al cadete» no se deduce de ningún lado.
    texto: 'Cada envío avanza Pendiente → Preparado → En tránsito → Entregado. En tránsito es cuando se lo entregaste al cadete. El botón dice a dónde va, no dónde está.',
    siNoEsta: 'La columna Estado aparece con el primer envío del día.',
  },
  {
    pestania: 'dia',
    ancla: 'envios.imprimir',
    texto: 'Esto imprime los tickets de todo el día, uno por paquete. Para uno solo está el ícono de impresora de su fila.',
  },
  {
    pestania: 'dia',
    ancla: 'envios.tab.dia',
    anclaFina: 'envios.link',
    texto: 'Al pie de la hoja se genera el link con el PIN que el cadete usa en el teléfono. Generar uno nuevo apaga el anterior en el acto.',
    siNoEsta: 'La card está al pie de esta hoja; si todavía no se ve, está cargando.',
  },
  {
    pestania: 'cuenta',
    // La cuenta trae sus datos por fetch: hasta que llegan, el botón no está. Sin el ancla estable
    // el globo se paraba en un rectángulo vacío arriba a la derecha — lo vio Bruno en prod.
    ancla: 'envios.tab.cuenta',
    anclaFina: 'envios.anotar',
    texto: 'Cuando el cadete pasa a rendir, la plata se anota acá. El saldo se arrastra solo, día a día.',
    siNoEsta: 'El botón está arriba de la tabla; si todavía no se ve, la cuenta está cargando.',
  },
]
