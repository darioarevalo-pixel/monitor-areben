// GENERADO por scripts/gen/nav-from-legacy.mjs — NO editar a mano.
// La fuente de verdad es PERM_CAT / NAV_CATS en index.html. Si tocás el menú del
// legacy, corré: node scripts/gen/nav-from-legacy.mjs

export type Marca = 'bdi' | 'zattia'

export type PermSub = { key: string; label: string; info?: string; brands?: Marca[] }
export type PermCat = { key: string; label: string; info?: string; brands: Marca[]; subs?: PermSub[] }
export type NavCat = { id: string; label: string; keys: string[]; accent?: string; adminOnly?: boolean }

export const PERM_CAT: PermCat[] = [
  {
    "key": "resumen",
    "label": "📈 Resumen / KPIs",
    "info": "Panel principal con métricas y resumen general del negocio.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "productos",
    "label": "📊 Por producto",
    "info": "Análisis por producto: ventas, vida útil, stock, estado y selección de outlet/sale.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "variantes",
    "label": "🔠 Por variante",
    "info": "Ventas y stock por variante (talle / modelo / color).",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "ventas-mensuales",
    "label": "📅 Ventas mensuales",
    "info": "Evolución de las ventas mes a mes.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "fundas-modelo",
    "label": "Fundas por modelo",
    "info": "Demanda y simulación de pedidos de fundas por modelo de iPhone.",
    "brands": [
      "bdi"
    ]
  },
  {
    "key": "clientes",
    "label": "Clientes (CRM)",
    "info": "Clientes mayoristas: segmentos, contacto, historial de compras.",
    "brands": [
      "bdi"
    ]
  },
  {
    "key": "proveedores",
    "label": "Proveedores",
    "info": "Análisis de ventas y stock por proveedor.",
    "brands": [
      "zattia"
    ]
  },
  {
    "key": "colores",
    "label": "Colores",
    "info": "Análisis de ventas por color de prenda.",
    "brands": [
      "zattia"
    ]
  },
  {
    "key": "talles",
    "label": "Talles",
    "info": "Análisis de ventas por talle.",
    "brands": [
      "zattia"
    ]
  },
  {
    "key": "marketing",
    "label": "📸 Marketing",
    "info": "Armado de publicaciones (fotos + textos) para redes y TiendaNube.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "sesion-fotos",
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
      }
    ]
  },
  {
    "key": "comisiones",
    "label": "💵 Comisiones y margen",
    "info": "Simulador de comisiones de vendedores y cálculo de markup/margen.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "margenes",
    "label": "📊 Margen por producto",
    "info": "Margen y markup de cada producto disponible, comparado con el objetivo.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "etiquetas",
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
    "label": "📏 Tabla de talles",
    "info": "Generador de tablas de talles (HTML) para las descripciones de TiendaNube.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "exhib",
    "label": "👕 Chequeo de exhibición",
    "info": "Recorrido con lector de código de barras para verificar qué está exhibido en el local.",
    "brands": [
      "zattia"
    ]
  },
  {
    "key": "tncat",
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
      }
    ]
  },
  {
    "key": "disenos",
    "label": "🗳️ Diseños",
    "info": "Tablero para elegir diseños con el equipo (votación, ranking, reporte PDF).",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "ingresos",
    "label": "📦 Ingresos proyectados",
    "info": "Importaciones de fundas por llegar: diseños con foto, modelos, cantidades, proveedor, fecha de arribo y estado. Con galería de fotos y videos del pedido.",
    "brands": [
      "bdi"
    ]
  },
  {
    "key": "reposicion",
    "label": "🔁 Reposición",
    "info": "Reposición diaria de local: variantes por debajo del mínimo (por categoría) con stock en depósito. Incluye mínimos editables, apagados y conteo urgente.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "conteo",
    "label": "🔢 Conteo de local",
    "info": "Conteo físico del local por código de barras (una sola persona). Cuenta por modelo/categoría, compara contra el stock del sistema y muestra diferencias. Guarda el progreso. Exclusiva de BDI (en BDI el conteo del local es 100% por código de barras).",
    "brands": [
      "bdi"
    ]
  },
  {
    "key": "conteo-deposito",
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
      }
    ]
  },
  {
    "key": "verif-ventas",
    "label": "🧾 Verificación de ventas",
    "info": "Control mensual: cruza los pedidos cancelados en TiendaNube con las ventas de Gestión Nube y lista las que siguen ACTIVAS en GN (hay que anularlas a mano en GN). Con checklist de resueltas.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "caducados",
    "label": "🗑️ Productos caducados",
    "info": "Lista de productos para depurar: sin stock en ningún depósito y con la última venta hace más de N días (default 30, la ventana de cambio). Se verifican antes de eliminarlos de TN y GN.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "ubicaciones",
    "label": "📍 Ubicaciones",
    "info": "Cargá la ubicación física (observación de GN) por producto, masivo. Para que el orden de armado de pedidos coincida con el recorrido del depósito.",
    "brands": [
      "bdi"
    ]
  },
  {
    "key": "meta-ads",
    "label": "💰 Meta Ads",
    "info": "Gasto y rendimiento de Meta Ads (Facebook/Instagram) por cuenta publicitaria: inversión, impresiones, clics, CTR, CPC, alcance. Datos de solo lectura vía la API de Marketing.",
    "brands": [
      "bdi",
      "zattia"
    ]
  },
  {
    "key": "gerencial",
    "label": "🎯 Gerencial",
    "info": "Panel de decisiones: reúne de todas las marcas lo que requiere tu atención (capital parado, productos en declive, pendientes operativos, importaciones por llegar) con la acción recomendada y un acceso directo a la sección donde se ejecuta. Solo lectura.",
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
      "reposicion",
      "conteo",
      "conteo-estandar-zattia",
      "conteo-estandar-stunned",
      "cupones",
      "solicitudes-internas",
      "etiquetas",
      "caducados",
      "ubicaciones",
      "exhib"
    ]
  },
  {
    "id": "deposito",
    "label": "📦 Depósito",
    "keys": [
      "conteo-deposito"
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
      "disenos",
      "meta-ads"
    ],
    "accent": "marketing"
  },
  {
    "id": "compras",
    "label": "📦 Compras",
    "keys": [
      "fundas-modelo",
      "ingresos",
      "proveedores"
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
