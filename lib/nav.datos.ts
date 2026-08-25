/**
 * Estructura del monitor: qué secciones existen (PERM_CAT) y cómo se agrupan en el
 * menú (NAV_CATS). **Fuente de verdad, editable a mano.**
 *
 * Hasta jul-2026 este archivo se GENERABA desde el `index.html` del legacy con
 * `scripts/gen/nav-from-legacy.mjs`. Eso tenía sentido mientras el iframe legacy
 * servía secciones y el menú tenía que coincidir byte a byte con el suyo. Cerrada la
 * migración (19-jul-2026) el legacy ya no sirve ninguna sección, así que seguir
 * atados a él solo impedía reordenar el menú: para mover una sección de grupo había
 * que editar un HTML de 10k líneas que ya nadie ejecuta.
 *
 * Dos capacidades que el nav del legacy no tenía y acá sí:
 *  - `NavCat.grupos`: subgrupos de 2º nivel (ej. `Local > Actividades > Conteo Zattia`),
 *    para sacar de la vista lo esporádico sin esconderlo.
 *  - `PermCat.area`: a qué área principal pertenece cada sección. Es lo que permite
 *    ordenar los permisos por área en Config (antes eran una lista plana de 35 filas
 *    sin agrupar) y asignarlos por función.
 */

export type Marca = 'bdi' | 'zattia'

export type PermSub = { key: string; label: string; info?: string; brands?: Marca[] }

export type PermCat = {
  key: string
  /** Área principal (el `id` del NavCat que la contiene). Ordena los permisos en Config. */
  area: string
  label: string
  info?: string
  brands: Marca[]
  subs?: PermSub[]
}

/**
 * Una entrada del menú que apunta a una SUBÁREA de una sección (`/tncat/visibilidad`).
 *
 * Tienda Nube son cuatro herramientas distintas —fotos, categorías, visibilidad,
 * descripciones— que comparten sección, permiso y catálogo. Cada una es su propia entrada
 * en el sidebar (así se ven todas de un vistazo), pero por debajo siguen siendo la misma
 * sección: `key` es la del permiso, `sub` el sub-permiso que la habilita, y `ruta` el
 * destino real.
 */
export type NavItem = {
  ruta: string
  label: string
  key: string
  /** Ícono de la entrada (`components/ui/Icono.tsx`). */
  icono?: string
  /** Sub-permiso(s) que habilitan la entrada. Con varios, alcanza con tener uno. */
  sub?: string | string[]
}

/** Un subgrupo del menú: 2º nivel dentro de un grupo (ej. Local > Actividades). */
export type NavGrupo = { id: string; label: string; icono?: string; keys: string[]; items?: NavItem[] }

export type NavCat = {
  id: string
  label: string
  /**
   * Nombre del ícono del grupo (`components/ui/Icono.tsx`). Ocupa el lugar que tenía el
   * emoji dentro del `label` ("📊 Análisis"): el emoji traía su propio color y no se podía
   * cambiar, así que no servía para marcar el estado activo del menú.
   */
  icono?: string
  keys: string[]
  /**
   * Entradas que apuntan a una SUBÁREA, al mismo nivel que las `keys` sueltas.
   *
   * Es lo mismo que `NavGrupo.items` pero un piso más arriba, y existe por Meta: es **una sola
   * sección con nueve pantallas**, así que no tiene `keys` que listar —todas son `meta-ads`— y
   * meterla en un subgrupo la dejaba a dos clicks, que es justo lo que se venía a arreglar. Con
   * esto, una categoría puede ser un módulo con sus pantallas en vez de una bolsa de secciones.
   */
  items?: NavItem[]
  /** Subgrupos colapsables, después de las `keys` sueltas del grupo. */
  grupos?: NavGrupo[]
  /**
   * Rótulo propio de una sección DENTRO de este grupo, cuando el sector la llama de
   * otra forma (ej. `solicitudes` es "Solicitudes de productos" para Marketing y
   * "Solicitudes" para Administración). Es solo el nombre en el menú: la sección, la
   * ruta y el permiso son los mismos.
   */
  labels?: Record<string, string>
  accent?: string
  adminOnly?: boolean
}

export const PERM_CAT: PermCat[] = [
  {
    "key": "resumen",
    "area": "analisis",
    "label": "Resumen / KPIs",
    "info": "Panel principal con métricas y resumen general del negocio.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "productos",
    "area": "analisis",
    "label": "Por producto",
    "info": "Análisis por producto: ventas, vida útil, stock, estado y selección de outlet/sale.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "variantes",
    "area": "analisis",
    "label": "Por variante",
    "info": "Ventas y stock por variante (talle / modelo / color).",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "ventas-mensuales",
    "area": "analisis",
    "label": "Ventas mensuales",
    "info": "La venta mes a mes, y día a día con el corte por canal.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "fundas-modelo",
    "area": "compras",
    "label": "Fundas por modelo",
    "info": "Demanda y simulación de pedidos de fundas por modelo de iPhone.",
    "brands": [
      "bdi"
    ]
  },
  {
    "key": "clientes",
    "area": "clientes",
    "label": "Clientes (CRM)",
    "info": "Clientes mayoristas: segmentos, contacto, historial de compras.",
    "brands": [
      "bdi"
    ]
  },
  {
    "key": "pedidos-clientes",
    "area": "compras",
    "label": "Faltantes",
    "info": "Lo que los clientes piden y no tenemos, con el ranking de lo más pedido en una ventana de días. Separa lo que no trabajamos (variedad para comprar) de lo que se acabó (reposición). Se anota desde Atención al cliente, que es la pantalla abierta mientras se atiende.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "proveedores",
    "area": "compras",
    "label": "Proveedores",
    "info": "Análisis de ventas y stock por proveedor.",
    "brands": [
      "zattia"
    ]
  },
  {
    "key": "colores",
    "area": "analisis",
    "label": "Colores",
    "info": "Análisis de ventas por color de prenda.",
    "brands": [
      "zattia"
    ]
  },
  {
    "key": "talles",
    "area": "analisis",
    "label": "Talles",
    "info": "Análisis de ventas por talle.",
    "brands": [
      "zattia"
    ]
  },
  {
    "key": "mkt-ventas",
    "area": "marketing",
    "label": "Ventas",
    "info": "El objetivo de venta del sector con su barra de avance, y el contador diario de ventas online — con las flechas para ver los días anteriores. Los objetivos se cargan en Norte (Dirección): acá sólo se miran.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "marketing",
    "area": "marketing",
    "label": "Marketing",
    "info": "Armado de publicaciones (fotos + textos) para redes y TiendaNube. En Zattia tiene dos pestañas, Zattia y Stunned, porque cada una tiene su propia tienda online.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "canjes",
    "area": "marketing",
    "label": "Canjes",
    "info": "Canjes con influencers y creadoras: el padrón de personas (compartido entre las tres marcas), qué se le manda, qué prometió publicar y si cumplió.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "aprobar",
        "label": "Puede aprobar canjes",
        "info": "Firma los canjes de solo producto que estén por debajo del umbral configurado. Los admins pueden siempre. ⚠️ Este permiso NO se hereda de la función: hay que tildarlo a mano, en las dos marcas."
      },
      {
        "key": "aprobar-plata",
        "label": "Puede aprobar canjes con plata o de monto alto",
        "info": "Firma los canjes que incluyen plata y los que superan el umbral configurado. Incluye lo que puede el permiso anterior. ⚠️ Si nadie tiene este permiso, ningún canje con plata se puede aprobar nunca."
      },
      {
        "key": "cerrar",
        "label": "Puede cerrar un canje incompleto",
        "info": "Cierra un canje aunque la persona no haya cumplido todo lo que prometió, dejando el motivo. Queda marcado como incompleto y le baja el puntaje a ella."
      }
    ]
  },
  {
    "key": "calendario",
    "area": "marketing",
    "label": "Calendario",
    "info": "Cuándo se necesita cada cosa: las fechas comerciales de Argentina (calculadas solas, incluidas las que se mueven todos los años) y los hitos propios del equipo — lanzamientos, sesiones de fotos, llegada de mercadería. Cada fecha muestra qué etapas de la pauta ya tienen ideas anotadas y cuáles no. Sin sub-permisos: cargar un hito lo puede hacer cualquiera que vea la sección.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "sesion-fotos",
    "area": "marketing",
    "label": "Sesión de fotos",
    "info": "Solicitud de productos para sesión de fotos: elegís las variantes, el sistema decide depósito o local según stock, genera 2 reportes (con SKU) y guarda el historial. En Zattia tiene dos pestañas, Zattia y Stunned: cada línea pide y guarda por separado, porque las fotos van a tiendas distintas. Para el depósito y el local no cambia nada.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "quitar-item",
        "label": "Puede quitar ítems de una solicitud",
        "info": "Puede quitar variantes de una solicitud (queda registrado quién y por qué). Los admins pueden siempre. Sin este permiso, solo ve la solicitud."
      },
      {
        "key": "editar-desc",
        "label": "Puede editar la descripción",
        "info": "Puede cambiar el texto/descripción de una solicitud. Los admins pueden siempre."
      },
      {
        "key": "editar",
        "label": "Puede editar la solicitud",
        "info": "Puede agregar productos, quitar y cambiar cantidades de una solicitud (aun con la venta creada), con motivo; queda en el historial de cambios. Los admins pueden siempre."
      }
    ]
  },
  {
    "key": "liquidacion",
    "area": "analisis",
    "label": "Liquidación",
    "info": "Campañas de sale: los productos se mandan desde Por producto, se les define el precio uno por uno con el simulador de margen al lado, y la campaña queda guardada y compartida — no en el navegador de una persona.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "aplicar",
        "label": "Puede escribir los precios en Gestión Nube",
        "info": "Aplica la campaña: le escribe el precio promocional a cada producto en Gestión Nube, que es quien manda sobre el precio de la tienda. ⚠️ Este permiso NO se hereda de la función: hay que tildarlo a mano, en las dos marcas."
      }
    ]
  },
  {
    "key": "comisiones",
    "area": "analisis",
    "label": "Comisiones y margen",
    "info": "Simulador de comisiones de vendedores y cálculo de markup/margen.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "margenes",
    "area": "analisis",
    "label": "Margen por producto",
    "info": "Margen y markup de cada producto disponible, comparado con el objetivo.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "envios",
    "area": "local",
    "label": "Envíos del día",
    "info": "Los envíos que salen hoy, con la dirección, lo que hay que cobrar y la etiqueta para el cadete.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "buzon",
    "area": "local",
    "label": "Mensajes de clientes",
    "info": "Lo que la clienta escribió (por mail o por donde sea) y todavía no se resolvió, atado al número de orden. Mientras un mensaje esté sin resolver, Envíos avisa antes de dejar avanzar el paquete de esa orden: es lo que evita que un cambio pedido el domingo se despache el lunes sin leer.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "etiquetas",
    "area": "local",
    "label": "Etiquetas",
    "info": "Etiquetas nombradas por lo que dicen (información de producto · precio · precio rebajado · SKU · libre), y la cola de lo que hay que reetiquetar.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "dep",
        "label": "Información de producto",
        "info": "Nombre, variante, SKU y código de barras. Sin precio."
      },
      {
        "key": "loc",
        "label": "Precio",
        "info": "La misma información, más el precio que la tienda cobra hoy."
      },
      {
        "key": "promo",
        "label": "Precio rebajado",
        "info": "El precio anterior tachado y el nuevo grande, para lo que está en oferta."
      },
      {
        "key": "sku",
        "label": "SKU",
        "info": "Sólo el SKU, grande y centrado."
      },
      {
        "key": "libre",
        "label": "Libre",
        "info": "Etiqueta personalizada (texto o código a elección)."
      },
      {
        "key": "cola",
        "label": "Para reetiquetar",
        "info": "La cola de prendas cuyo precio cambió después de la última etiqueta."
      }
    ]
  },
  {
    "key": "gen-talles",
    "area": "marketing",
    "label": "Tabla de talles",
    "info": "Generador de tablas de talles (HTML) para las descripciones de TiendaNube.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "gen-desc",
    "area": "marketing",
    "label": "Redacción",
    "info": "Cola de descripciones de producto: el insumo que carga el local y el borrador que se aprueba antes de que salga a la tienda.",
    "brands": [
      "zattia"
    ],
    "subs": [
      {
        "key": "publicar",
        "label": "Aprobar y publicar",
        "info": "Escribir el borrador aprobado en la descripción de TiendaNube. Sin esto sólo se puede cargar el insumo."
      }
    ]
  },
  {
    "key": "exhib",
    "area": "local",
    "label": "Chequeo de exhibición",
    "info": "Recorrido con lector de código de barras para verificar qué está exhibido en el local.",
    "brands": [
      "zattia"
    ]
  },
  {
    "key": "tncat",
    "area": "marketing",
    "label": "Tienda Nube",
    "info": "Herramientas de TiendaNube.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "imagenes",
        "label": "Carga de imágenes",
        "info": "Subir fotos y asignarlas a las variantes. En Zattia elegí la pestaña antes de subir: la foto va a la tienda de la línea que diga arriba, y Zattia y Stunned son dos tiendas distintas.",
        "brands": [
          "bdi",
          "zattia"
        ]
      },
      {
        "key": "categorias",
        "label": "Categorías por modelo",
        "info": "Auto-categorización de fundas por modelo de iPhone según stock (solo BDI).",
        "brands": [
          "bdi"
        ]
      },
      {
        "key": "asignar",
        "label": "Asignar categoría (Excel)",
        "info": "Asignación masiva: elegís una categoría y subís un Excel con nombres de producto; se la agrega a todos los que matcheen (solo Zattia).",
        "brands": [
          "zattia"
        ]
      },
      {
        "key": "ocultar",
        "label": "Ocultar agotados",
        "info": "Despublicar de la tienda los productos sin stock que siguen visibles (reversible). Escribe en la tienda online en vivo.",
        "brands": [
          "bdi",
          "zattia"
        ]
      }
    ]
  },
  {
    "key": "disenos",
    "area": "compras",
    "label": "Diseños",
    "info": "Tablero para elegir diseños con el equipo (votación, ranking, reporte PDF).",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "ingresos",
    "area": "compras",
    "label": "Ingresos proyectados",
    "info": "Importaciones de fundas por llegar: diseños con foto, modelos, cantidades, proveedor, fecha de arribo y estado. Con galería de fotos y videos del pedido.",
    "brands": [
      "bdi"
    ],
    "subs": [
      {
        "key": "nombre",
        "label": "Puede poner el nombre comercial",
        "info": "Puede escribir el nombre comercial de cada diseño desde la vista Lector — el nombre con el que el producto se va a cargar en Gestión Nube cuando llegue. No puede tocar cantidades, modelos, estados ni fotos. Es el permiso de quien decide cómo se va a llamar el producto sin manejar la importación."
      },
      {
        "key": "editar",
        "label": "Puede editar la importación completa",
        "info": "Abre la vista Editar: cantidades, modelos, diseños, bloques, estado, fotos y alta/baja de importaciones. Los admins pueden siempre. Sin esto ni el permiso de nombre, la sección es de solo lectura."
      }
    ]
  },
  {
    "key": "reposicion",
    "area": "administracion",
    "label": "Reposición",
    "info": "Reposición diaria de local: variantes por debajo del mínimo (por categoría) con stock en depósito. Incluye mínimos editables, apagados y conteo urgente.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "conteo",
    "area": "local",
    "label": "Conteo de fundas",
    "info": "Conteo de fundas del Local por escaneo, agrupado por modelo de celular. Escaneás un modelo completo y al cerrarlo compara contra el stock VIVO de GN (ubicación Local) y genera el Excel de ajuste + lo guarda en el historial con fecha. Exclusiva de BDI.",
    "brands": [
      "bdi"
    ],
    "subs": [
      {
        "key": "aplicar",
        "label": "Puede aplicar el ajuste",
        "info": "Puede cerrar un modelo y generar el ajuste (no solo contar)."
      }
    ]
  },
  {
    "key": "conteo-deposito",
    "area": "deposito",
    "label": "Conteo",
    "info": "Conteo físico del depósito por producto (cargando cantidades a mano, no por escaneo). Buscás el producto, contás sus variantes y lo terminás. El ajuste a GN se calcula con stock vivo + diferencia, así las ventas durante el conteo no lo ensucian. Guarda historial de cada conteo aplicado.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "aplicar",
        "label": "Puede aplicar el ajuste",
        "info": "Puede APLICAR el ajuste (leer el vivo de GN y generar el Excel). Los admins pueden siempre. Sin este permiso, el usuario solo cuenta y termina productos, pero no ve el botón de aplicar. OJO: el conteo se guarda en el dispositivo donde se cuenta, así que quien aplique tiene que hacerlo en esa misma compu/celular."
      }
    ]
  },
  {
    "key": "conteo-estandar-zattia",
    "area": "local",
    "label": "Conteo Zattia",
    "info": "Conteo físico del LOCAL de ZATTIA (línea Zattia, SKU que NO empieza con STU). Por producto y talle: escaneás lo exhibido (suma 1 por lectura) y cargás a mano el depósito del local; el total se compara contra el stock del Local. El ajuste a GN se calcula con stock vivo + diferencia. Guarda historial y fecha del último conteo.",
    "brands": [
      "zattia"
    ],
    "subs": [
      {
        "key": "aplicar",
        "label": "Puede aplicar el ajuste",
        "info": "Puede APLICAR el ajuste (leer el vivo de GN y generar el Excel). Los admins pueden siempre. Sin este permiso, el usuario solo cuenta y termina productos. OJO: el conteo se guarda en el dispositivo donde se cuenta."
      }
    ]
  },
  {
    "key": "conteo-estandar-stunned",
    "area": "local",
    "label": "Conteo Stunned",
    "info": "Conteo físico del LOCAL de ZATTIA (línea STUNNED, SKU que empieza con STU). Por producto y talle: escaneás lo exhibido (suma 1 por lectura) y cargás a mano el depósito del local; el total se compara contra el stock del Local. El ajuste a GN se calcula con stock vivo + diferencia. Guarda historial y fecha del último conteo.",
    "brands": [
      "zattia"
    ],
    "subs": [
      {
        "key": "aplicar",
        "label": "Puede aplicar el ajuste",
        "info": "Puede APLICAR el ajuste (leer el vivo de GN y generar el Excel). Los admins pueden siempre. Sin este permiso, el usuario solo cuenta y termina productos. OJO: el conteo se guarda en el dispositivo donde se cuenta."
      }
    ]
  },
  {
    "key": "atencion",
    "area": "local",
    "label": "Atención al cliente",
    "info": "Links y mensajes listos para copiar y pegar mientras se atiende por Instagram o WhatsApp. Las fundas por modelo de celular se arman solas desde el menú de la tienda —cuando entra un iPhone nuevo aparece solo—, y al lado va lo que carga el equipo: envíos, cambios, talles, promos.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "editar",
        "label": "Puede cargar y borrar links",
        "info": "Puede AGREGAR, editar y borrar links y mensajes, y cambiar el texto con el que se arma el mensaje de las fundas. Sin este permiso solo se copia y se pega — que es lo que necesita quien está atendiendo."
      }
    ]
  },
  {
    "key": "cupones",
    "area": "local",
    "label": "Cupones y canjes",
    "info": "Lo que el mostrador entrega por fuera de una venta normal. CUPONES: descuentos por cliente para aplicar al cobrar (nombre, descuento, vencimiento) — la empleada lo busca por nombre. CANJES (solo BDI): las creadoras que pasan por el local a buscar lo suyo; se carga qué se lleva y al entregarlo se descuenta el stock con una venta a $0 en Gestión Nube.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "crear",
        "label": "Puede generar cupones",
        "info": "Puede CREAR cupones nuevos (admin, dueños, marketing). Sin este permiso, solo VE la lista y CONFIRMA el uso — para las chicas del local. Quien puede generar también puede corregir y anular."
      },
      {
        "key": "editar",
        "label": "Puede corregir y anular",
        "info": "Puede EDITAR un cupón ya generado y anularlo o reactivarlo, pero no crear nuevos — para quien arregla un error de carga o corta un cupón que se fue de las manos. Quien puede generar ya lo tiene."
      }
    ]
  },
  {
    "key": "solicitudes-internas",
    "area": "local",
    "label": "Solicitudes internas",
    "info": "Retiros de productos para uso interno (moldería, video, muestras, consumo). Retornable (vuelve, se repone) o consumo (no vuelve). Los consumos requieren aprobación de un gerente/admin.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "aprobar",
        "label": "Puede aprobar consumos",
        "info": "Puede APROBAR o rechazar las solicitudes de consumo (las que no vuelven). Los admins pueden siempre. Solo los aprobadores ven los pendientes."
      },
      {
        "key": "editar",
        "label": "Puede editar la solicitud",
        "info": "Puede agregar productos, quitar y cambiar cantidades de una solicitud (aun con la venta creada), con motivo; queda en el historial de cambios. Los admins pueden siempre."
      }
    ]
  },
  {
    "key": "solicitudes",
    "area": "local",
    "label": "Solicitudes",
    "info": "Vista unificada del ESTADO de todas las solicitudes (sesión de fotos + internas) de las marcas que ves, filtrada según tu función: Local ve lo que tiene retiro en local, Depósito lo de depósito, el resto ve todo. Solo lectura (para gestionar se entra a cada solicitud).",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "verif-ventas",
    "area": "analisis",
    "label": "Verificación de ventas",
    "info": "Control mensual: cruza los pedidos cancelados en TiendaNube con las ventas de Gestión Nube y lista las que siguen ACTIVAS en GN (hay que anularlas a mano en GN). Con checklist de resueltas.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "caducados",
    "area": "administracion",
    "label": "Productos caducados",
    "info": "Lista de productos para depurar: sin stock en ningún depósito y con la última venta hace más de N días (default 30, la ventana de cambio). Se verifican antes de eliminarlos de TN y GN.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "ubicaciones",
    "area": "deposito",
    "label": "Ubicaciones",
    "info": "Cargá la ubicación física (observación de GN) por producto, masivo. Para que el orden de armado de pedidos coincida con el recorrido del depósito.",
    "brands": [
      "bdi"
    ]
  },
  {
    "key": "meta-ads",
    "area": "meta",
    "label": "Meta",
    "info": "La pauta de Meta (Facebook/Instagram), en once pantallas. Panel: qué está al aire y qué hay que decidir. Campañas: todas las de una marca ordenadas por gasto, con los botones para accionar —pausar, reactivar, cambiar el presupuesto diario, renombrar y duplicar ajustando la copia—, bajando hasta el conjunto y el aviso. Biblioteca: todos los avisos de todas las cuentas en una grilla, con la pieza a la vista y sus números al lado, para poder ordenar por gasto o por retorno y decidir qué creativo producir después. Automatizaciones: seis reglas que miran solas la foto diaria y avisan qué se quedó sin avisos, qué gastó sin vender, qué se está quemando y qué conviene escalar. Ninguna toca la pauta: dejan el aviso en el Panel y accionar sigue siendo apretar un botón. Piezas: se arrastran los videos y las fotos nuevas y sale una tanda donde cada pieza va a su propio conjunto, con la segmentación de un conjunto que ya entrega y el texto de un aviso que ya está al aire; todo nace pausado. Embudo: a quién le está hablando la plata (a quien no te conoce, a quien te está considerando, a quien está por comprar) y qué etapa está vacía. Ideas: el tablero de las piezas que hay que producir. Rendimiento: los números de una cuenta publicitaria (inversión, impresiones, clics, CTR, CPC, alcance, ROAS). Registro: qué se accionó, quién y cómo terminó, y las decisiones tomadas a mano en Ads Manager con su motivo — para que no se vuelva a discutir lo ya resuelto y las automatizaciones no propongan revertir algo que se hizo a propósito. Informes: el análisis en prosa de cada fecha —qué estaba pasando con la pauta y qué se decidió hacer—, uno por fecha y por marca, y el anterior no se toca. Es la única pantalla que no calcula nada: guarda el texto que explica lo que las otras miden. Rentabilidad: hasta cuánto se puede pagar por una compra sin perder plata, calculado con la economía real del producto —precio, descuentos, IVA, Ingresos Brutos, impuesto al cheque y comisiones—, con el ROAS de equilibrio al lado. Es la única que no mira la pauta, y es la que le pone el número al «rinde / no rinde» de todas las demás: el semáforo es el costo por compra y no el ROAS, porque el ROAS depende del mix de medios de pago y el techo casi no. Accionar tiene permisos aparte y deja registro.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "pausar",
        "label": "Puede pausar y activar anuncios",
        "info": "Pausa o reactiva una campaña, un conjunto o un aviso desde el Monitor: deja de mostrarse y de gastar en el acto. Es reversible, y su peor caso es perder un día de entrega. Los admins pueden siempre. ⚠️ Este permiso NO se hereda de la función: hay que tildarlo a mano, en las dos marcas."
      },
      {
        "key": "presupuesto",
        "label": "Puede cambiar el presupuesto",
        "info": "Sube o baja el presupuesto DIARIO de una campaña o de un conjunto. Va aparte de pausar porque no es la misma clase de acto: pausar se deshace reactivando, pero subir un diario de $5.000 a $50.000 es plata gastada que no vuelve. Los admins pueden siempre. ⚠️ NO se hereda de la función: hay que tildarlo a mano, en las dos marcas."
      },
      {
        "key": "crear",
        "label": "Puede duplicar y crear campañas",
        "info": "Duplica una campaña o un conjunto que ya existe, con sus conjuntos y avisos, y le pone a la copia el nombre y el presupuesto diario que se le digan. La copia nace SIEMPRE pausada y con la marca del original, así que no gasta hasta que alguien la prenda a mano. Habilita además renombrar cualquier campaña, conjunto o aviso, que es la otra mitad de la misma operación. Va aparte de pausar y de presupuesto porque crea objetos nuevos en la cuenta: lo que hace no se deshace apretando otra vez, hay que ir a borrarlos. Los admins pueden siempre. ⚠️ NO se hereda de la función: hay que tildarlo a mano, en las dos marcas."
      },
      {
        "key": "pautar",
        "label": "Puede aprobar ideas y corregir la etapa de una campaña",
        "info": "En Etapas de la pauta: aprueba o descarta las ideas de creativos que anota el equipo, las marca como pauteadas, y corrige a mano la etapa de una campaña mal clasificada. Sin esto se pueden anotar ideas y moverlas por producción, pero no aprobarlas. ⚠️ NO se hereda de la función: hay que tildarlo a mano, en las dos marcas."
      }
    ]
  },
  {
    "key": "gerencial",
    "area": "direccion",
    "label": "Gerencial",
    "info": "Panel de decisiones: reúne de todas las marcas lo que requiere tu atención (capital parado, productos en declive, pendientes operativos, importaciones por llegar) con la acción recomendada y un acceso directo a la sección donde se ejecuta. Solo lectura.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "memo",
    "area": "direccion",
    "label": "Memo semanal",
    "info": "El memo de la semana (lunes a domingo), que es la otra mitad del panel Gerencial: aquél dice qué decidir ahora, éste dice qué pasó. Arriba, la foto que arma el monitor: venta de la semana contra la anterior por línea (BDI, Zattia y Stunned), gasto y costo por compra contra el techo de rentabilidad, capital parado y lo que quedó abierto. Abajo, lo que se escribe: el avance de cada uno de los ocho sistemas, y el acta con siete temas —qué se logró, qué aprendimos, qué viene, insights, bloqueos, decisiones y cambios de estrategia—, cada uno con la casilla de cada persona, así dos pueden escribir el mismo tema el mismo día sin pisarse. Venta y pauta se congelan cuando la semana termina; capital parado y pendientes se congelan cuando se toman y van con la fecha puesta. Queda el histórico de todas las semanas. Escribir es de administradores.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "norte",
    "area": "direccion",
    "label": "Norte",
    "info": "Hacia dónde vamos: el stock que entra contra el que sale, los pagos que vienen y las metas de mediano plazo con su avance. Es el tercer tiempo de Dirección — Gerencial dice qué decidir hoy, el Memo dice qué pasó, Norte dice si llegamos. Cruza el ritmo de venta real con las importaciones proyectadas y sus plazos de pago, y contesta una sola pregunta arriba de todo: si el stock que entra sale a tiempo para pagarlo. Lo único que se carga a mano es la economía de cada importación (costo, moneda y cuotas), que es el dato que hoy no vive en ninguna pantalla; cargarla es de administradores.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "integraciones",
    "area": "integraciones",
    "label": "Integraciones",
    "info": "Integraciones entre Gestión Nube y Tienda Nube: mapeo de SKU GN↔TN (la base del sync de stock y ventas de Stunned) que se valida a mano antes de que el sync escriba. Más adelante suma el panel de sincronización.",
    "brands": [
      "zattia"
    ]
  },
  {
    "key": "postventa",
    "area": "administracion",
    "label": "Post-venta",
    "info": "Post-venta unificado (Administración, MOTOR): recibe las fallas que carga el local, las confirma (genera la venta en Gestión Nube que descuenta la unidad), mueve la ubicación y las etiqueta con código de barras. Muestra cuánto tenemos en fallas a costo y a PVP de feria. Cambios / Devoluciones / Canjes llegan después.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "postventa-local",
    "area": "local",
    "label": "Fallas (carga)",
    "info": "Carga de fallas para el LOCAL: cuando recibís una prenda con falla del cliente, la cargás acá (elegís el artículo de Gestión Nube y ponés el motivo). Es solo vista/carga; el motor (recibir, confirmar, descontar stock) vive en Administración → Post-venta.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "postventa-deposito",
    "area": "deposito",
    "label": "Fallas (depósito)",
    "info": "Carga de fallas desde DEPÓSITO: igual que la carga del local, pero descuenta el stock de depósito. El motor (recibir, confirmar) vive en Administración → Post-venta.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "cambios-local",
    "area": "local",
    "label": "Cambios",
    "info": "Armar un cambio DE PUNTA A PUNTA desde el local: buscás la orden de Tienda Nube, marcás qué devuelve el cliente y qué se lleva, sale la diferencia con el descuento por forma de pago y el envío, se guarda como borrador hasta que el cliente pague, y ahí mismo se genera la venta en Gestión Nube. No hace falta que Administración apruebe nada: un cambio ya está decidido. Lo único que pasa por Administración es la plata que SALE de la caja, o sea cuando la cuenta queda a favor del cliente. Un cambio es un reclamo más (mismo número R-00XX) y aparece también en Reclamos.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "reclamos-local",
    "area": "local",
    "label": "Reclamos (iniciar)",
    "info": "Abrir un reclamo desde el LOCAL, por cualquier motivo: se arrepintió, vino fallado, le faltó un producto, le llegó otro, no le llegó nunca. Buscás la orden de Tienda Nube, marcás qué pasó, y le pasás al cliente un link para que suba las fotos. Acá ves en qué anda cada uno. Decidir qué se hace y devolver la plata es de Administración → Post-venta → Reclamos.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "novedades",
    "area": "sistema",
    "label": "Novedades",
    "info": "Qué cambió en los sistemas, en un solo lugar. LA VE TODO EL EQUIPO SIEMPRE: está en KEYS_PARA_TODOS (lib/permisos.core.js), así que tildar o destildar esta fila NO cambia nada — es la contracara de que exista, una novedad que no le llega a alguien no sirve. Lo único que se puede dar acá es el permiso de publicar.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "publicar",
        "label": "Puede publicar novedades",
        "info": "Puede escribir, editar, publicar, archivar y borrar. Sin esto sólo se leen — que es lo que necesita el resto del equipo. Como una novedad no tiene marca, alcanza con tenerlo tildado en cualquiera de las dos."
      }
    ]
  },
  {
    "key": "manuales",
    "area": "sistema",
    "label": "Manuales",
    "info": "Cómo se hace cada cosa: el procedimiento de trabajo, no el paso a paso de la pantalla. El manual de una sección se lee desde esa misma sección, con el botón «Cómo se usa» del encabezado; acá están todos juntos, más los que no son de ninguna pantalla (cerrar la caja, dónde están las contraseñas). LOS VE TODO EL EQUIPO SIEMPRE: tildar o destildar esta fila NO cambia nada.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "editar",
        "label": "Puede escribir manuales",
        "info": "Puede crear, editar, publicar y borrar manuales. Sin esto sólo se leen. Alcanza con tenerlo tildado en cualquiera de las dos marcas, porque un manual no tiene marca."
      }
    ]
  },
  {
    "key": "agenda",
    "area": "agenda",
    "label": "Agenda",
    "info": "Lo que hay que hacer o saber HOY: qué promoción bancaria corre hoy y cómo se cobra, con sus condiciones y el paso a paso. LA VE TODO EL EQUIPO SIEMPRE: está en KEYS_PARA_TODOS (lib/permisos.core.js), así que tildar o destildar esta fila NO cambia nada — una promo que no le llega a quien cobra no sirve. Lo único que se da acá es el permiso de cargar. Es distinta del Calendario, que es de Marketing y habla de fechas comerciales.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "cargar",
        "label": "Puede cargar en la agenda",
        "info": "Puede dar de alta, editar, apagar y borrar las promociones bancarias. Sin esto sólo se leen — que es lo que necesita el mostrador. Alcanza con tenerlo tildado en cualquiera de las dos marcas, porque una promo la define el banco y no tiene marca. ⚠️ Un sub NO se hereda de la función: si no se lo tildás a alguien a mano, nadie puede cargar nada."
      }
    ]
  }
]

export const NAV_CATS: NavCat[] = [
  {
    "id": "inicio",
      "icono": "inicio",
    "label": "Inicio",
    "keys": [
      "inicio"
    ]
  },
  {
    "id": "agenda",
      "icono": "agenda",
    "label": "Agenda",
    "keys": [
      "agenda"
    ]
  },
  {
    "id": "sistema",
      "icono": "sistema",
    "label": "Sistema",
    "keys": [
      "novedades",
      "manuales"
    ]
  },
  {
    "id": "direccion",
      "icono": "direccion",
    "label": "Dirección",
    "keys": [
      "gerencial",
      "memo",
      "norte"
    ]
  },
  {
    "id": "analisis",
      "icono": "analisis",
    "label": "Análisis",
    "keys": [
      "productos",
      "variantes",
      "ventas-mensuales",
      "verif-ventas",
      "margenes",
      "comisiones",
      "liquidacion",
      "colores",
      "talles"
    ]
  },
  {
    "id": "local",
      "icono": "local",
    "label": "Local",
    "keys": [
      "atencion",
      "envios",
      "buzon",
      "solicitudes",
      "cupones",
      "postventa-local",
      "cambios-local",
      "reclamos-local",
      "etiquetas"
    ],
    "grupos": [
      {
        "id": "actividades",
      "icono": "actividades",
        "label": "Actividades",
        "keys": [
          "conteo-estandar-zattia",
          "conteo-estandar-stunned",
          "conteo",
          "exhib"
        ]
      }
    ]
  },
  {
    "id": "deposito",
      "icono": "deposito",
    "label": "Depósito",
    "keys": [
      "solicitudes",
      "conteo-deposito",
      "postventa-deposito",
      "ubicaciones"
    ],
    "labels": {
      "solicitudes": "Solicitudes a preparar"
    }
  },
  // Meta es categoría de primer nivel y no un grupo adentro de Marketing: es la herramienta desde
  // la que se pautea todos los días, y colgada de Marketing costaba dos clicks llegar al Panel.
  // Va acá, entre Depósito y Marketing.
  //
  // ⚠️ Mover esto obligó a mover el `area` de `meta-ads` en `PERM_CAT` (lo exige
  // `tests/nav-estructura.test.ts`) y su espejo en `SECCION_AREA`. La **key sigue siendo
  // `meta-ads`**, que es lo que está guardado como tilde por persona en la base: nadie tiene que
  // volver a tildar nada. Lo que sí hubo que sumar es `'meta'` a las áreas de la función
  // `marketing` — ver el comentario en `lib/permisos.core.js`.
  {
    "id": "meta",
      "icono": "meta-ads",
    "label": "Meta",
    "keys": [],
    "items": [
      { "ruta": "/meta-ads", "label": "Panel", "icono": "meta-ads", "key": "meta-ads" },
      { "ruta": "/meta-ads/campanias", "label": "Campañas", "icono": "marketing", "key": "meta-ads" },
      { "ruta": "/meta-ads/biblioteca", "label": "Biblioteca", "icono": "tn-fotos", "key": "meta-ads" },
      { "ruta": "/meta-ads/piezas", "label": "Piezas", "icono": "disenos", "key": "meta-ads" },
      { "ruta": "/meta-ads/automatizaciones", "label": "Automatizaciones", "icono": "integraciones", "key": "meta-ads" },
      { "ruta": "/meta-ads/embudo", "label": "Embudo", "icono": "etapas", "key": "meta-ads" },
      { "ruta": "/meta-ads/ideas", "label": "Ideas", "icono": "actividades", "key": "meta-ads" },
      { "ruta": "/meta-ads/rendimiento", "label": "Rendimiento", "icono": "analisis", "key": "meta-ads" },
      { "ruta": "/meta-ads/registro", "label": "Registro", "icono": "historial", "key": "meta-ads" },
      { "ruta": "/meta-ads/informes", "label": "Informes", "icono": "manuales", "key": "meta-ads" },
      { "ruta": "/meta-ads/rentabilidad", "label": "Rentabilidad", "icono": "margenes", "key": "meta-ads" }
    ]
  },
  {
    "id": "marketing",
      "icono": "marketing",
    "label": "Marketing",
    "keys": [
      "mkt-ventas",
      "marketing",
      "calendario",
      "canjes",
      "solicitudes"
    ],
    "grupos": [
      {
        "id": "tienda-nube",
      "icono": "tienda-nube",
        "label": "Tienda Nube",
        "keys": [],
        "items": [
          { "ruta": "/tncat/fotos", "label": "Fotos", "icono": "tn-fotos", "key": "tncat", "sub": "imagenes" },
          { "ruta": "/tncat/cola", "label": "La cola de fotos", "icono": "tn-fotos", "key": "tncat", "sub": "imagenes" },
          { "ruta": "/tncat/categorias", "label": "Categorías", "icono": "tn-categorias", "key": "tncat", "sub": ["categorias", "asignar"] },
          { "ruta": "/tncat/visibilidad", "label": "Visibilidad", "icono": "tn-visibilidad", "key": "tncat", "sub": "ocultar" },
          { "ruta": "/tncat/descripciones", "label": "Tabla de talles", "icono": "talles", "key": "gen-talles" },
          { "ruta": "/tncat/redaccion", "label": "Redacción", "icono": "talles", "key": "gen-desc" }
        ]
      }
    ],
    "labels": {
      "solicitudes": "Solicitudes de productos"
    },
    "accent": "marketing"
  },
  {
    "id": "integraciones",
      "icono": "integraciones",
    "label": "Integraciones",
    "keys": [
      "integraciones"
    ]
  },
  {
    "id": "administracion",
      "icono": "administracion",
    "label": "Administración",
    "keys": [
      "solicitudes",
      "postventa",
      "reposicion",
      "caducados"
    ],
    "labels": {
      "solicitudes": "Solicitudes (todas las marcas)"
    }
  },
  {
    "id": "compras",
      "icono": "compras",
    "label": "Compras",
    "keys": [
      "pedidos-clientes",
      "fundas-modelo",
      "ingresos",
      "proveedores",
      "disenos"
    ]
  },
  {
    "id": "clientes",
      "icono": "clientes",
    "label": "Clientes",
    "keys": [
      "clientes"
    ]
  },
  {
    "id": "config",
      "icono": "config",
    "label": "Config",
    "keys": [
      "usuarios"
    ],
    "adminOnly": true
  }
]
