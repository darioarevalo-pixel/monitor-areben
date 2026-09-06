/**
 * El recorrido guiado de Sesión de fotos: dónde se aprieta cada cosa, en el orden real del trabajo.
 *
 * # Por qué esta sección lo pidió antes que ninguna
 *
 * El octavo (la sesión como EVENTO, el banco, los outfits, la orden recibida) subió entero el
 * 4-sep-2026 y **estuvo cinco días sin que nadie lo abriera**. Lo primero que faltaba era la puerta
 * —`sesion-fotos` no estaba en el menú, y se arregló el 5-sep—, pero lo segundo lo dijo Bruno
 * mirando la pantalla ya abierta: *«si cambia mucho, no estaría mal pensar en un tour virtual»*.
 * La mitad de lo que hay acá adentro **no existía la semana pasada**, y quien la abre no tiene cómo
 * saber que el banco va ANTES de pedir.
 *
 * 🔑 **Acá NO van reglas de negocio.** Que la venta salga por lo PREPARADO y no por lo pedido, que
 * separar no sea retirar, que la anulación se haga a mano en Gestión Nube: todo eso vive en el
 * **manual** (se edita sin deploy) y en `docs/secciones/sesionfotos.md`. Si las dos cosas cuentan
 * lo mismo, derivan. Acá se contesta una sola pregunta: **¿dónde se aprieta?**
 *
 * # Las anclas: por qué casi todas caen en el mismo lugar
 *
 * Esta pantalla ⛔ **no tiene pestañas**: tiene ESTADOS. La lista, el borrador, el detalle de una
 * solicitud y —lo nuevo— una sesión abierta con su banco adentro. Y el tour ⛔ no puede abrir una
 * sesión por su cuenta: no hay ninguna que abrir hasta que alguien cree la primera, y apretar
 * botones ajenos en una pantalla que **crea ventas en Gestión Nube** es exactamente lo que ⛔ no
 * tiene que hacer un tour.
 *
 * Por eso el ancla estable de casi todos los pasos es **el bloque «Sesiones planificadas»**
 * (`sf.eventos`), que es de lo que el paso habla, y el control puntual va como `anclaFina`: si la
 * sesión no está abierta, el globo se para en el bloque y el texto dice **dónde aparece**. Es la
 * misma lección que dejó Envíos —un tour que resalta una cosa mientras nombra otra enseña mal, y se
 * ve perfecto en un test—, y el motor de `lib/guia/core.ts` ya la sostiene: ningún paso se saltea.
 *
 * ⚠️ Las anclas viven repartidas en CINCO archivos (la pantalla, los eventos, la ficha de la
 * modelo, el banco y el traído desde la OC), y `tests/guia.test.ts` las afirma una por una: si
 * alguien saca un botón, el test se pone rojo en vez de dejar un globo señalando el vacío.
 */

import type { PasoGuia } from '@/lib/guia/core'
import { ID_SESION_DE_MUESTRA, type SesionEvento } from '@/lib/sesionfotos/evento'

export const GUIA_SESION_FOTOS: readonly PasoGuia[] = [
  {
    ancla: 'sf.linea',
    texto: 'Empezá parándote en la línea que vas a fotografiar. El catálogo se corta acá: una sesión que retrata Zattia y Stunned son dos pedidos, uno en cada pestaña.',
  },
  {
    ancla: 'sf.eventos',
    texto: 'Una sesión de fotos es un evento: el día, la hora, cuánto dura y la modelo. Los pedidos de productos se le cuelgan adentro, y pueden ser varios.',
  },
  {
    ancla: 'sf.eventos',
    anclaFina: 'sf.nuevaSesion',
    texto: 'Todo arranca acá. Si todavía no sabés la hora, dejala vacía: no se inventa ninguna. Lo que sí conviene cargar es «De dónde viene», porque con eso los pasos de la sesión caen solos en la Agenda de cada una.',
    siNoEsta: 'El botón está arriba a la derecha de este bloque, y lo ve quien puede pedir productos.',
  },
  {
    ancla: 'sf.eventos',
    anclaFina: 'sf.abrir',
    // ⚠️ El texto ⛔ no nombra «Abrir»: en el ejemplo la sesión nace DESPLEGADA, así que este mismo
    // botón dice «Cerrar». Un globo que resalta «Cerrar» mientras el texto dice «Abrir» es la
    // misma falla que dejó Envíos —señalar una cosa y nombrar otra—, y se ve perfecta en un test.
    texto: 'Este botón despliega la sesión, y adentro está todo el trabajo: la modelo, el banco de productos y los pedidos que ya le colgaste. Acá está desplegada para que puedas verlo.',
    siNoEsta: 'Está a la derecha de cada sesión de la lista.',
  },
  {
    ancla: 'sf.eventos',
    anclaFina: 'sf.modelo',
    texto: 'La modelo se elige del padrón. Lo único obligatorio es el talle: es el que sale después a la descripción del producto. Se guarda al salir de cada campo, no con Enter.',
    siNoEsta: 'Está adentro de la sesión, arriba de todo: abrí una con «Abrir» y aparece.',
  },
  {
    ancla: 'sf.eventos',
    anclaFina: 'sf.banco',
    texto: 'El banco son los candidatos: las prendas que estás mirando ANTES de pedir nada. Poner algo acá no pide ni separa stock. Es el cambio de orden — antes era buscar, pedir y después agrupar; ahora es juntar, armar los outfits y recién ahí pedir.',
    siNoEsta: 'El banco vive adentro de la sesión, debajo de la modelo.',
  },
  {
    ancla: 'sf.eventos',
    anclaFina: 'sf.bancoOC',
    texto: 'Para lo que acaba de entrar no hace falta tipear nada: elegí la orden recibida y sus prendas caen al banco con el cartelito «de la OC». Volver a agregar la misma no duplica, y lo que no entró se cuenta con su motivo.',
    siNoEsta: 'Está arriba del buscador del banco, adentro de la sesión.',
  },
  {
    ancla: 'sf.eventos',
    anclaFina: 'sf.bancoBuscar',
    texto: 'Y lo que no vino por una orden se busca acá, por nombre o SKU, y se suma talle por talle.',
    siNoEsta: 'El buscador está adentro del banco, arriba de la lista de candidatos.',
  },
  {
    ancla: 'sf.eventos',
    anclaFina: 'sf.bancoPedir',
    texto: 'A cada prenda le ponés número de outfit —un outfit es arriba y abajo, o una prenda entera— y el aviso te dice si a alguno le falta la mitad. Después tildás y pedís: el top puede salir del depósito y el jean del local, y siguen siendo el mismo outfit.',
    siNoEsta: 'Los dos botones están al pie del banco, y se prenden cuando tildás alguna prenda.',
  },
  {
    ancla: 'sf.eventos',
    anclaFina: 'sf.pedirProductos',
    texto: 'Si no querés pasar por el banco, «+ Pedir productos» abre un pedido suelto que igual queda colgado de la sesión.',
    siNoEsta: 'Está en la fila de cada sesión, al lado de «Abrir».',
  },
  {
    ancla: 'sf.historial',
    texto: 'Abajo está el historial: cada pedido con lo que lleva, de dónde sale y en qué anda. Los que nacieron de una sesión llevan el cartelito «de una sesión»; el resto son sueltos.',
  },
  {
    ancla: 'sf.historial',
    anclaFina: 'sf.nuevaSolicitud',
    texto: 'Este botón pide productos sin sesión de por medio. Sirve igual, pero lo que se pide así ⛔ no queda enganchado a ninguna producción.',
    siNoEsta: 'El botón está arriba del historial, y lo ve quien puede pedir: el depósito y el local preparan, no piden.',
  },
  {
    ancla: 'sf.historial',
    anclaFina: 'sf.filtroOrigen',
    texto: 'Y esto filtra por de dónde vino el pedido: un ingreso de mercadería, una campaña o un faltante de catálogo. Es el mismo dato que hace que los pasos caigan en la Agenda.',
    siNoEsta: 'El filtro está a la derecha del título «Historial».',
  },
]

/**
 * ── La sesión de EJEMPLO que el tour muestra mientras corre ──
 *
 * 🔴 **La pidió Bruno caminando el tour, y era el defecto entero**: *«desde la 4 no muestra nada,
 * porque no hay nada creado»*. De los 13 pasos, **nueve hablan de lo que hay ADENTRO de una sesión**
 * —la modelo, el banco, los outfits, los dos botones de pedir— y con la lista vacía los nueve caían
 * al ancla estable. El motor hacía lo correcto (⛔ no saltear, decir dónde aparece), pero un tour
 * que explica nueve veces seguidas *«esto aparece cuando abrís una sesión»* ⛔ no enseña nada:
 * enseñar dónde está un botón **es mostrarlo**.
 *
 * ⛔ **Y ⛔ NO se crea una sesión de verdad para eso.** El cajón es compartido: la vería el equipo
 * entero, alguien la abriría, y desde adentro se piden productos que **crean ventas en Gestión
 * Nube**. Una sesión de mentira que se puede pedir ⛔ no es una demo: es un pedido real esperando.
 *
 * Por eso ésta vive **sólo en memoria y sólo mientras el globo está abierto**: se dibuja arriba de
 * la lista, rotulada **«Ejemplo»**, con todos sus botones inertes, y desaparece al cerrar el tour.
 * ⛔ No se guarda, ⛔ no se sincroniza y ⛔ no la ve nadie más. Mientras el tour corre, además, el
 * overlay tapa la pantalla: cualquier click cierra el tour antes de llegar a un botón.
 *
 * 🔑 **El banco trae DOS prendas y un outfit armado a propósito**: un top y un short, los dos en el
 * outfit 1. Es el estado que hay que entender —arriba + abajo = un look— y el único que muestra de
 * una que el aviso «le falta el abajo» está apagado porque el outfit está completo. Con una sola
 * prenda se vería el aviso; con tres, el ejemplo dejaría de ser un ejemplo.
 */
export function sesionDeMuestra(hoy: string): SesionEvento {
  return {
    id: ID_SESION_DE_MUESTRA,
    fecha: hoy,
    hora: '15:30',
    duracionMin: 90,
    descripcion: 'Cápsula primavera (ejemplo)',
    disparador: 'campania',
    modelo: { nombre: 'Ejemplo', talle: 'S', altura: '1,70' },
    estado: 'planificado',
    creado: 0,
    creadoPor: 'el tour',
    banco: [
      {
        vid: 'guia:arriba',
        pid: null,
        sid: null,
        nombre: 'TOP CANDELA',
        variante: 'S',
        sku: 'EJEMPLO-1',
        candidato: 'oc',
        ocLabel: 'OC-0000',
        outfit: 1,
      },
      {
        vid: 'guia:abajo',
        pid: null,
        sid: null,
        nombre: 'SHORT MILA',
        variante: 'S',
        sku: 'EJEMPLO-2',
        candidato: 'stock',
        outfit: 1,
      },
    ],
  }
}
