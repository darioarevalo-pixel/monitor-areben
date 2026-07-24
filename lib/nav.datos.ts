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

/** Un subgrupo del menú: 2º nivel dentro de un grupo (ej. Local > Actividades). */
export type NavGrupo = { id: string; label: string; keys: string[] }

export type NavCat = {
  id: string
  label: string
  keys: string[]
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
    "label": "📈 Resumen / KPIs",
    "info": "Panel principal con métricas y resumen general del negocio.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "productos",
    "area": "analisis",
    "label": "📊 Por producto",
    "info": "Análisis por producto: ventas, vida útil, stock, estado y selección de outlet/sale.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "variantes",
    "area": "analisis",
    "label": "🔠 Por variante",
    "info": "Ventas y stock por variante (talle / modelo / color).",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "ventas-mensuales",
    "area": "analisis",
    "label": "📅 Ventas mensuales",
    "info": "Evolución de las ventas mes a mes.",
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
    "key": "marketing",
    "area": "marketing",
    "label": "📸 Marketing",
    "info": "Armado de publicaciones (fotos + textos) para redes y TiendaNube.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "sesion-fotos",
    "area": "marketing",
    "label": "📷 Sesión de fotos",
    "info": "Solicitud de productos para sesión de fotos: elegís las variantes, el sistema decide depósito o local según stock, genera 2 reportes (con SKU) y guarda el historial.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "quitar-item",
        "label": "🗑 Puede quitar ítems de una solicitud",
        "info": "Puede quitar variantes de una solicitud (queda registrado quién y por qué). Los admins pueden siempre. Sin este permiso, solo ve la solicitud."
      },
      {
        "key": "editar-desc",
        "label": "✏️ Puede editar la descripción",
        "info": "Puede cambiar el texto/descripción de una solicitud. Los admins pueden siempre."
      },
      {
        "key": "editar",
        "label": "✏️ Puede editar la solicitud",
        "info": "Puede agregar productos, quitar y cambiar cantidades de una solicitud (aun con la venta creada), con motivo; queda en el historial de cambios. Los admins pueden siempre."
      }
    ]
  },
  {
    "key": "comisiones",
    "area": "analisis",
    "label": "💵 Comisiones y margen",
    "info": "Simulador de comisiones de vendedores y cálculo de markup/margen.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "margenes",
    "area": "analisis",
    "label": "📊 Margen por producto",
    "info": "Margen y markup de cada producto disponible, comparado con el objetivo.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "etiquetas",
    "area": "local",
    "label": "🏷️ Etiquetas",
    "info": "Impresión de etiquetas con código de barras.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "dep",
        "label": "🏬 Depósito",
        "info": "Etiquetas para mercadería de depósito."
      },
      {
        "key": "loc",
        "label": "🏪 Local",
        "info": "Etiquetas para el local."
      },
      {
        "key": "sku",
        "label": "🔢 SKU",
        "info": "Etiquetas con SKU + código de barras."
      },
      {
        "key": "libre",
        "label": "✏️ Libre",
        "info": "Etiqueta personalizada (texto o código a elección)."
      }
    ]
  },
  {
    "key": "gen-talles",
    "area": "marketing",
    "label": "📏 Tabla de talles",
    "info": "Generador de tablas de talles (HTML) para las descripciones de TiendaNube.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "exhib",
    "area": "local",
    "label": "👕 Chequeo de exhibición",
    "info": "Recorrido con lector de código de barras para verificar qué está exhibido en el local.",
    "brands": [
      "zattia"
    ]
  },
  {
    "key": "tncat",
    "area": "marketing",
    "label": "🛍️ Tienda Nube",
    "info": "Herramientas de TiendaNube.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "imagenes",
        "label": "📷 Carga de imágenes",
        "info": "Subir fotos y asignarlas a las variantes.",
        "brands": [
          "bdi",
          "zattia"
        ]
      },
      {
        "key": "categorias",
        "label": "🗂️ Categorías por modelo",
        "info": "Auto-categorización de fundas por modelo de iPhone según stock (solo BDI).",
        "brands": [
          "bdi"
        ]
      },
      {
        "key": "asignar",
        "label": "🗂️ Asignar categoría (Excel)",
        "info": "Asignación masiva: elegís una categoría y subís un Excel con nombres de producto; se la agrega a todos los que matcheen (solo Zattia).",
        "brands": [
          "zattia"
        ]
      },
      {
        "key": "ocultar",
        "label": "🙈 Ocultar agotados",
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
    "label": "🗳️ Diseños",
    "info": "Tablero para elegir diseños con el equipo (votación, ranking, reporte PDF).",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "ingresos",
    "area": "compras",
    "label": "📦 Ingresos proyectados",
    "info": "Importaciones de fundas por llegar: diseños con foto, modelos, cantidades, proveedor, fecha de arribo y estado. Con galería de fotos y videos del pedido.",
    "brands": [
      "bdi"
    ]
  },
  {
    "key": "reposicion",
    "area": "administracion",
    "label": "🔁 Reposición",
    "info": "Reposición diaria de local: variantes por debajo del mínimo (por categoría) con stock en depósito. Incluye mínimos editables, apagados y conteo urgente.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "conteo",
    "area": "local",
    "label": "🔢 Conteo de fundas",
    "info": "Conteo de fundas del Local por escaneo, agrupado por modelo de celular. Escaneás un modelo completo y al cerrarlo compara contra el stock VIVO de GN (ubicación Local) y genera el Excel de ajuste + lo guarda en el historial con fecha. Exclusiva de BDI.",
    "brands": [
      "bdi"
    ],
    "subs": [
      {
        "key": "aplicar",
        "label": "✅ Puede aplicar el ajuste",
        "info": "Puede cerrar un modelo y generar el ajuste (no solo contar)."
      }
    ]
  },
  {
    "key": "conteo-deposito",
    "area": "deposito",
    "label": "🔢 Conteo",
    "info": "Conteo físico del depósito por producto (cargando cantidades a mano, no por escaneo). Buscás el producto, contás sus variantes y lo terminás. El ajuste a GN se calcula con stock vivo + diferencia, así las ventas durante el conteo no lo ensucian. Guarda historial de cada conteo aplicado.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "aplicar",
        "label": "✅ Puede aplicar el ajuste",
        "info": "Puede APLICAR el ajuste (leer el vivo de GN y generar el Excel). Los admins pueden siempre. Sin este permiso, el usuario solo cuenta y termina productos, pero no ve el botón de aplicar. OJO: el conteo se guarda en el dispositivo donde se cuenta, así que quien aplique tiene que hacerlo en esa misma compu/celular."
      }
    ]
  },
  {
    "key": "conteo-estandar-zattia",
    "area": "local",
    "label": "🔢 Conteo Zattia",
    "info": "Conteo físico del LOCAL de ZATTIA (línea Zattia, SKU que NO empieza con STU). Por producto y talle: escaneás lo exhibido (suma 1 por lectura) y cargás a mano el depósito del local; el total se compara contra el stock del Local. El ajuste a GN se calcula con stock vivo + diferencia. Guarda historial y fecha del último conteo.",
    "brands": [
      "zattia"
    ],
    "subs": [
      {
        "key": "aplicar",
        "label": "✅ Puede aplicar el ajuste",
        "info": "Puede APLICAR el ajuste (leer el vivo de GN y generar el Excel). Los admins pueden siempre. Sin este permiso, el usuario solo cuenta y termina productos. OJO: el conteo se guarda en el dispositivo donde se cuenta."
      }
    ]
  },
  {
    "key": "conteo-estandar-stunned",
    "area": "local",
    "label": "👕 Conteo Stunned",
    "info": "Conteo físico del LOCAL de ZATTIA (línea STUNNED, SKU que empieza con STU). Por producto y talle: escaneás lo exhibido (suma 1 por lectura) y cargás a mano el depósito del local; el total se compara contra el stock del Local. El ajuste a GN se calcula con stock vivo + diferencia. Guarda historial y fecha del último conteo.",
    "brands": [
      "zattia"
    ],
    "subs": [
      {
        "key": "aplicar",
        "label": "✅ Puede aplicar el ajuste",
        "info": "Puede APLICAR el ajuste (leer el vivo de GN y generar el Excel). Los admins pueden siempre. Sin este permiso, el usuario solo cuenta y termina productos. OJO: el conteo se guarda en el dispositivo donde se cuenta."
      }
    ]
  },
  {
    "key": "cupones",
    "area": "local",
    "label": "🎟️ Cupones",
    "info": "Cupones y descuentos por cliente para aplicar en las ventas del local. Guardás el cupón (nombre, descuento, vencimiento) y la empleada lo busca por nombre al momento de cobrar.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "crear",
        "label": "✏️ Puede generar cupones",
        "info": "Puede CREAR cupones nuevos (admin, dueños, marketing). Sin este permiso, solo VE la lista y CONFIRMA el uso — para las chicas del local."
      }
    ]
  },
  {
    "key": "solicitudes-internas",
    "area": "local",
    "label": "📋 Solicitudes internas",
    "info": "Retiros de productos para uso interno (moldería, video, muestras, consumo). Retornable (vuelve, se repone) o consumo (no vuelve). Los consumos requieren aprobación de un gerente/admin.",
    "brands": [
      "bdi",
      "zattia"
    ],
    "subs": [
      {
        "key": "aprobar",
        "label": "✅ Puede aprobar consumos",
        "info": "Puede APROBAR o rechazar las solicitudes de consumo (las que no vuelven). Los admins pueden siempre. Solo los aprobadores ven los pendientes."
      },
      {
        "key": "editar",
        "label": "✏️ Puede editar la solicitud",
        "info": "Puede agregar productos, quitar y cambiar cantidades de una solicitud (aun con la venta creada), con motivo; queda en el historial de cambios. Los admins pueden siempre."
      }
    ]
  },
  {
    "key": "solicitudes",
    "area": "local",
    "label": "📋 Solicitudes",
    "info": "Vista unificada del ESTADO de todas las solicitudes (sesión de fotos + internas) de las marcas que ves, filtrada según tu función: Local ve lo que tiene retiro en local, Depósito lo de depósito, el resto ve todo. Solo lectura (para gestionar se entra a cada solicitud).",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "verif-ventas",
    "area": "analisis",
    "label": "🧾 Verificación de ventas",
    "info": "Control mensual: cruza los pedidos cancelados en TiendaNube con las ventas de Gestión Nube y lista las que siguen ACTIVAS en GN (hay que anularlas a mano en GN). Con checklist de resueltas.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "caducados",
    "area": "administracion",
    "label": "🗑️ Productos caducados",
    "info": "Lista de productos para depurar: sin stock en ningún depósito y con la última venta hace más de N días (default 30, la ventana de cambio). Se verifican antes de eliminarlos de TN y GN.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "ubicaciones",
    "area": "local",
    "label": "📍 Ubicaciones",
    "info": "Cargá la ubicación física (observación de GN) por producto, masivo. Para que el orden de armado de pedidos coincida con el recorrido del depósito.",
    "brands": [
      "bdi"
    ]
  },
  {
    "key": "meta-ads",
    "area": "marketing",
    "label": "💰 Meta Ads",
    "info": "Gasto y rendimiento de Meta Ads (Facebook/Instagram) por cuenta publicitaria: inversión, impresiones, clics, CTR, CPC, alcance. Datos de solo lectura vía la API de Marketing.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "gerencial",
    "area": "direccion",
    "label": "🎯 Gerencial",
    "info": "Panel de decisiones: reúne de todas las marcas lo que requiere tu atención (capital parado, productos en declive, pendientes operativos, importaciones por llegar) con la acción recomendada y un acceso directo a la sección donde se ejecuta. Solo lectura.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "integraciones",
    "area": "integraciones",
    "label": "🔌 Integraciones",
    "info": "Integraciones entre Gestión Nube y Tienda Nube: mapeo de SKU GN↔TN (la base del sync de stock y ventas de Stunned) que se valida a mano antes de que el sync escriba. Más adelante suma el panel de sincronización.",
    "brands": [
      "zattia"
    ]
  },
  {
    "key": "postventa",
    "area": "administracion",
    "label": "🧾 Post-venta",
    "info": "Post-venta unificado (Administración, MOTOR): recibe las fallas que carga el local, las confirma (genera la venta en Gestión Nube que descuenta la unidad), mueve la ubicación y las etiqueta con código de barras. Muestra cuánto tenemos en fallas a costo y a PVP de feria. Cambios / Devoluciones / Canjes llegan después.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "postventa-local",
    "area": "local",
    "label": "🧾 Fallas (carga)",
    "info": "Carga de fallas para el LOCAL: cuando recibís una prenda con falla del cliente, la cargás acá (elegís el artículo de Gestión Nube y ponés el motivo). Es solo vista/carga; el motor (recibir, confirmar, descontar stock) vive en Administración → Post-venta.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "postventa-deposito",
    "area": "deposito",
    "label": "🧾 Fallas (depósito)",
    "info": "Carga de fallas desde DEPÓSITO: igual que la carga del local, pero descuenta el stock de depósito. El motor (recibir, confirmar) vive en Administración → Post-venta.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "cambios-local",
    "area": "local",
    "label": "🔁 Cambios (iniciar)",
    "info": "Iniciar un cambio desde el LOCAL: buscás la orden de Tienda Nube, marcás qué devuelve el cliente y qué se lleva, y ves la diferencia de precio. El motor (confirmar, generar la venta en Gestión Nube, reingresar el devuelto) vive en Administración → Post-venta → Cambios.",
    "brands": [
      "bdi",
      "zattia"
    ]
  }
]

export const NAV_CATS: NavCat[] = [
  {
    "id": "inicio",
    "label": "🏠 Inicio",
    "keys": [
      "inicio"
    ]
  },
  {
    "id": "direccion",
    "label": "🎯 Dirección",
    "keys": [
      "gerencial"
    ]
  },
  {
    "id": "analisis",
    "label": "📊 Análisis",
    "keys": [
      "productos",
      "variantes",
      "ventas-mensuales",
      "verif-ventas",
      "margenes",
      "comisiones",
      "colores",
      "talles"
    ]
  },
  {
    "id": "local",
    "label": "🏪 Local",
    "keys": [
      "solicitudes",
      "cupones",
      "solicitudes-internas",
      "postventa-local",
      "cambios-local",
      "etiquetas",
      "ubicaciones"
    ],
    "grupos": [
      {
        "id": "actividades",
        "label": "🔢 Actividades",
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
    "label": "📦 Depósito",
    "keys": [
      "conteo-deposito",
      "postventa-deposito"
    ]
  },
  {
    "id": "marketing",
    "label": "📣 Marketing",
    "keys": [
      "marketing",
      "sesion-fotos",
      "tncat",
      "gen-talles",
      "meta-ads"
    ],
    "accent": "marketing"
  },
  {
    "id": "integraciones",
    "label": "🔌 Integraciones",
    "keys": [
      "integraciones"
    ]
  },
  {
    "id": "administracion",
    "label": "🗂️ Administración",
    "keys": [
      "postventa",
      "reposicion",
      "caducados"
    ]
  },
  {
    "id": "compras",
    "label": "📦 Compras",
    "keys": [
      "fundas-modelo",
      "ingresos",
      "proveedores",
      "disenos"
    ]
  },
  {
    "id": "clientes",
    "label": "👥 Clientes",
    "keys": [
      "clientes"
    ]
  },
  {
    "id": "config",
    "label": "⚙️ Config",
    "keys": [
      "usuarios"
    ],
    "adminOnly": true
  }
]
