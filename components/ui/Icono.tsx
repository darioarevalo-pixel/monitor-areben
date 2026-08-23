/**
 * Icono — el set de íconos del monitor.
 *
 * Reemplaza a los emojis que llevaban los labels del menú (🏠 Inicio, 📊 Análisis…).
 * La diferencia que importa no es estética: **un emoji trae su propio color y no se puede
 * cambiar**, así que en el sidebar oscuro el 🏠 seguía siendo naranja tanto en reposo como
 * activo, y el estado activo tenía que gritarse solo con el texto. Estos son trazos con
 * `stroke="currentColor"`: heredan el color de quien los contiene, así que se ponen grises
 * en reposo y blancos/índigo cuando la sección está activa, gratis.
 *
 * Son SVG inline y no un paquete de íconos: son trece, pesan nada, y sumar una dependencia
 * para esto traía un bundle entero (o, peor, un request por ícono) a cambio de nada.
 *
 * **Para sumar uno:** una entrada en `TRAZOS` con su `path`, y el nombre en el `icono` del
 * grupo en `lib/nav.datos.ts`. Todos dibujan sobre una grilla de 24×24, solo trazo (sin
 * relleno), para que el peso óptico sea el mismo en toda la lista.
 */

export type NombreIcono = keyof typeof TRAZOS

const TRAZOS = {
  /** Inicio — casa. */
  inicio: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.8 20v-5.2h4.4V20" />
    </>
  ),
  /**
   * Agenda — una hoja de almanaque con el día marcado.
   *
   * Es a propósito un almanaque y no un reloj ni un check: lo que la sección contesta es "qué corre
   * HOY", y el día es el eje. El calendario editorial no compite: ése no está en el sidebar de todos.
   */
  agenda: (
    <>
      <rect x="3.8" y="5.4" width="16.4" height="14.2" rx="2.2" />
      <path d="M3.8 9.6h16.4" />
      <path d="M8.4 3.8v3.2M15.6 3.8v3.2" />
      <circle cx="12" cy="14.4" r="1.9" />
    </>
  ),
  /** Sistema — megáfono: el grupo de lo que hay que contarle al equipo. */
  sistema: (
    <>
      <path d="M4.5 10.2v3.6h3.1l2.1 4h1.8l-1.4-4 7.2 3.1V7.1L9.7 10.2H4.5Z" />
      <path d="M19.6 10.6a2.4 2.4 0 0 1 0 2.8" />
    </>
  ),
  /** Novedades — campana. */
  novedades: (
    <>
      <path d="M6.6 16.4h10.8l-1.5-2.3V10a3.9 3.9 0 0 0-7.8 0v4.1l-1.5 2.3Z" />
      <path d="M10.2 18.6a2 2 0 0 0 3.6 0" />
      <path d="M12 6.1V4.4" />
    </>
  ),
  /** Manuales — libro abierto. */
  manuales: (
    <>
      <path d="M12 7.4C10.3 6.3 8.2 5.9 5.2 6.1v11.6c3-.2 5.1.2 6.8 1.3 1.7-1.1 3.8-1.5 6.8-1.3V6.1c-3-.2-5.1.2-6.8 1.3Z" />
      <path d="M12 7.4V19" />
    </>
  ),
  /** Dirección — diana: es el grupo de los objetivos del negocio. */
  direccion: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </>
  ),
  /** Análisis — barras. */
  analisis: (
    <>
      <path d="M3.8 20.2h16.4" />
      <path d="M7.4 20.2v-7.4" />
      <path d="M12 20.2V5.4" />
      <path d="M16.6 20.2v-10.4" />
    </>
  ),
  /** Local — el frente del negocio, con su toldo. */
  local: (
    <>
      <path d="M3.5 8.5 5 4.5h14l1.5 4" />
      <path d="M3.5 8.5h17" />
      <path d="M5.2 8.5V20h13.6V8.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </>
  ),
  /** Depósito — caja cerrada, en isométrica. */
  deposito: (
    <>
      <path d="M3.6 7.6 12 3.2l8.4 4.4v8.8L12 20.8l-8.4-4.4z" />
      <path d="M3.6 7.6 12 12l8.4-4.4" />
      <path d="M12 12v8.8" />
    </>
  ),
  /** Marketing — megáfono. */
  marketing: (
    <>
      <path d="M3.5 10.2v3.6a1 1 0 0 0 1 1h2.2L12 18.5V5.5L6.7 9.2H4.5a1 1 0 0 0-1 1z" />
      <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
      <path d="M18.2 6.6a7.6 7.6 0 0 1 0 10.8" />
    </>
  ),
  /** Administración — carpeta. */
  administracion: (
    <>
      <path d="M3.5 7.2a1.7 1.7 0 0 1 1.7-1.7h3.6l2 2.6h7.5a1.7 1.7 0 0 1 1.7 1.7v8.4a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7z" />
    </>
  ),
  /** Compras — changuito. */
  compras: (
    <>
      <path d="M3 4.5h2.1l2.4 10.4h9.6L19 7.6H6" />
      <circle cx="9" cy="19" r="1.3" />
      <circle cx="16.5" cy="19" r="1.3" />
    </>
  ),
  /** Clientes — dos personas. */
  clientes: (
    <>
      <circle cx="9.2" cy="8.4" r="3.2" />
      <path d="M3.4 19.8c0-3.1 2.6-5.2 5.8-5.2s5.8 2.1 5.8 5.2" />
      <path d="M16.2 5.6a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17.6 15c1.9.8 3 2.6 3 4.8" />
    </>
  ),
  /**
   * Config — controles deslizantes.
   *
   * Empezó siendo un engranaje (círculo + 8 dientes radiales), pero a 16px los dientes se
   * funden con el círculo y lo que se lee es un **sol**. Dos sliders con su perilla se leen
   * a ese tamaño y dicen lo mismo.
   */
  config: (
    <>
      <path d="M3.5 8.2h5" />
      <circle cx="11" cy="8.2" r="2.1" />
      <path d="M13.1 8.2h7.4" />
      <path d="M3.5 15.8h9.4" />
      <circle cx="15.4" cy="15.8" r="2.1" />
      <path d="M17.5 15.8h3" />
    </>
  ),
  /** Actividades (subgrupo de Local) — planilla con tilde: son los conteos. */
  actividades: (
    <>
      <path d="M9.2 4.2h5.6v2.2H9.2z" />
      <path d="M8.4 5.3H6.2a1.6 1.6 0 0 0-1.6 1.6v12.3a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6V6.9a1.6 1.6 0 0 0-1.6-1.6h-2.2" />
      <path d="m9.2 13.4 2 2 3.6-3.8" />
    </>
  ),
  /** Tienda Nube (subgrupo) — bolsa de compras. */
  'tienda-nube': (
    <>
      <path d="M5.6 8.4h12.8l1 11.4H4.6z" />
      <path d="M9.2 8.4V6.6a2.8 2.8 0 0 1 5.6 0v1.8" />
    </>
  ),
  /** Integraciones (subgrupo) — enchufe. */
  integraciones: (
    <>
      <path d="M9.2 3.2v4.6M14.8 3.2v4.6" />
      <path d="M6.8 7.8h10.4v3a5.2 5.2 0 0 1-10.4 0z" />
      <path d="M12 16v4.8" />
    </>
  ),

  // ── Secciones (3er nivel del menú) ──────────────────────────────────────────────
  // Varias se comparten a propósito: los cuatro conteos son el mismo trabajo, y las dos
  // post-ventas y los dos cambios también. Repetir el ícono es lo correcto: dice
  // "esto es lo mismo, en otro lado".

  /** Gerencial — panel de control con aguja. */
  gerencial: (
    <>
      <path d="M4 18a8.6 8.6 0 1 1 16 0" />
      <path d="m12 18 4-5.4" />
      <circle cx="12" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  /**
   * Norte — la brújula, con la aguja apuntando arriba a la derecha.
   *
   * Es el tercer ícono de Dirección y los tres dicen su tiempo: `gerencial` es el tablero de
   * ahora, `historial` es la flecha que vuelve, y la brújula es la única que apunta a algo que
   * todavía no pasó. Un gráfico con la flecha subiendo habría dicho «resultados», que es lo que
   * esa pantalla justamente no muestra.
   */
  norte: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m15.6 8.4-2 5.2-5.2 2 2-5.2z" />
    </>
  ),
  /** Por producto — etiqueta colgante. */
  productos: (
    <>
      <path d="M11 3.6H20.4V13l-8.2 8.2a1.6 1.6 0 0 1-2.3 0l-7-7a1.6 1.6 0 0 1 0-2.3z" />
      <circle cx="16.4" cy="7.6" r="1.4" />
    </>
  ),
  /** Por variante — capas: una variante es un corte del producto. */
  variantes: (
    <>
      <path d="m12 3.4 8.6 4.4-8.6 4.4-8.6-4.4z" />
      <path d="m4.6 12.4 7.4 3.8 7.4-3.8" />
      <path d="m4.6 16.6 7.4 3.8 7.4-3.8" />
    </>
  ),
  /** Ventas mensuales — calendario. */
  'ventas-mensuales': (
    <>
      <rect x="3.6" y="5.2" width="16.8" height="15.2" rx="1.8" />
      <path d="M3.6 10h16.8" />
      <path d="M8.2 3.4v3.4M15.8 3.4v3.4" />
    </>
  ),
  /** Verificación de ventas — comprobante con tilde. */
  'verif-ventas': (
    <>
      <path d="M5.4 3.6h13.2v17l-2.2-1.6-2.2 1.6-2.2-1.6-2.2 1.6-2.2-1.6-2.2 1.6z" />
      <path d="m8.8 10.6 2.2 2.2 4.2-4.4" />
    </>
  ),
  /** Margen por producto — porcentaje. */
  margenes: (
    <>
      <path d="m5.6 18.4 12.8-12.8" />
      <circle cx="7.6" cy="7.6" r="2.4" />
      <circle cx="16.4" cy="16.4" r="2.4" />
    </>
  ),
  /**
   * Liquidación — la etiqueta de precio con la flecha para abajo. La etiqueta sola sería
   * "productos"; la flecha es lo que dice de qué se trata la sección, que es bajar un precio a
   * propósito y por un rato.
   */
  liquidacion: (
    <>
      <path d="M12.4 3.4H20.6v8.2l-8.8 8.8a1.4 1.4 0 0 1-2 0l-6.2-6.2a1.4 1.4 0 0 1 0-2z" />
      <circle cx="16.6" cy="7.4" r="1.3" />
      <path d="M9.4 9.4v5.6" />
      <path d="m7.2 12.8 2.2 2.2 2.2-2.2" />
    </>
  ),
  /** Comisiones — billete. */
  comisiones: (
    <>
      <rect x="2.8" y="6.4" width="18.4" height="11.2" rx="1.8" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.4 12h.1M17.5 12h.1" />
    </>
  ),
  /** Colores — paleta. */
  colores: (
    <>
      <path d="M12 3.4a8.6 8.6 0 0 0 0 17.2c1.3 0 1.9-.9 1.9-1.8 0-1.4-1.2-1.7-1.2-2.9 0-.9.8-1.6 1.8-1.6h1.8a4.3 4.3 0 0 0 4.3-4.3c0-3.7-3.8-6.6-8.6-6.6z" />
      <circle cx="8" cy="10.4" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16.2" cy="10.4" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  /** Talles / tabla de talles — regla. */
  talles: (
    <>
      <rect x="2.6" y="8.4" width="18.8" height="7.2" rx="1.4" />
      <path d="M7 8.4v2.8M12 8.4v3.8M17 8.4v2.8" />
    </>
  ),
  /** Solicitudes — planilla con renglones. */
  solicitudes: (
    <>
      <path d="M9.2 3.4h5.6v2.4H9.2z" />
      <path d="M8.4 4.6H6.2a1.7 1.7 0 0 0-1.7 1.7v12.6a1.7 1.7 0 0 0 1.7 1.7h11.6a1.7 1.7 0 0 0 1.7-1.7V6.3a1.7 1.7 0 0 0-1.7-1.7h-2.2" />
      <path d="M8.6 11.4h6.8M8.6 15.2h4.6" />
    </>
  ),
  /** Cupones — ticket picado al medio. */
  cupones: (
    <>
      <path d="M3.4 8.4a1.6 1.6 0 0 1 1.6-1.6h14a1.6 1.6 0 0 1 1.6 1.6v1.8a2 2 0 0 0 0 3.6v1.8a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6v-1.8a2 2 0 0 0 0-3.6z" />
      <path d="M13.4 6.8v2M13.4 11.4v1.4M13.4 15.4v1.8" />
    </>
  ),
  /** Post-venta — la flecha que vuelve. */
  postventa: (
    <>
      <path d="M3.6 8.6h11.6a5.2 5.2 0 0 1 0 10.4H8.6" />
      <path d="m7.4 4.4-3.8 4.2 3.8 4.2" />
    </>
  ),
  /** Cambios — dos flechas que se cruzan. */
  cambios: (
    <>
      <path d="M3.8 8.4h13.4" />
      <path d="m14 5 3.2 3.4L14 11.8" />
      <path d="M20.2 15.6H6.8" />
      <path d="M10 12.2 6.8 15.6 10 19" />
    </>
  ),
  /** Etiquetas — código de barras. */
  etiquetas: (
    <>
      <rect x="2.8" y="5.4" width="18.4" height="13.2" rx="1.6" />
      <path d="M6.6 9v6M9.6 9v6M13 9v6M16.2 9v6M18.6 9v6" />
    </>
  ),
  /** Ubicaciones — chinche en el mapa. */
  ubicaciones: (
    <>
      <path d="M12 21c4-4.4 6.2-7.6 6.2-10.4a6.2 6.2 0 1 0-12.4 0C5.8 13.4 8 16.6 12 21z" />
      <circle cx="12" cy="10.4" r="2.4" />
    </>
  ),
  /** Conteo — planilla numerada (los cuatro conteos comparten ícono). */
  conteo: (
    <>
      <path d="M4.2 6.4h2M4.2 12h2M4.2 17.6h2" />
      <path d="M9.4 6.4h10.4M9.4 12h10.4M9.4 17.6h10.4" />
    </>
  ),
  /** Chequeo de exhibición — percha. */
  exhib: (
    <>
      <path d="M12 8.6a2.3 2.3 0 1 1 2.3-2.3" />
      <path d="M12 8.6 3.4 15.4a1.2 1.2 0 0 0 .8 2.2h15.6a1.2 1.2 0 0 0 .8-2.2z" />
    </>
  ),
  /** Envíos del día — camión de reparto. */
  envios: (
    <>
      <rect x="3" y="5.6" width="10.6" height="9.4" rx="1.2" />
      <path d="M13.6 9.4h3.4l2.6 2.9V15h-6z" />
      <circle cx="7.2" cy="16.8" r="1.8" />
      <circle cx="16.6" cy="16.8" r="1.8" />
    </>
  ),
  /**
   * Mensajes de clientes — un sobre con un punto: hay algo adentro que nadie abrió.
   *
   * El punto no es decoración: la sección existe por lo que NO se leyó, y un sobre a secas se lee
   * como "correo", que es la carpeta donde el problema vive hoy.
   */
  buzon: (
    <>
      <rect x="3" y="5.5" width="15" height="13" rx="1.6" />
      <path d="M3.4 7 10.5 12l7.1-5" />
      <circle cx="19" cy="6" r="2.4" />
    </>
  ),
  /** Canjes — dos flechas que se cruzan: le mandamos producto, nos manda contenido. */
  canjes: (
    <>
      <path d="M4 8.4h13.2" />
      <path d="M14.2 5.2 17.6 8.4l-3.4 3.2" />
      <path d="M20 15.6H6.8" />
      <path d="M9.8 12.4 6.4 15.6l3.4 3.2" />
    </>
  ),
  /** Meta Ads — la curva que sube. */
  'meta-ads': (
    <>
      <path d="m3.6 16.4 5-5.2 3.6 3.4 5-5.6" />
      <path d="M14.2 8.6h3.4v3.4" />
      <path d="M3.6 20.4h16.8" />
    </>
  ),
  /**
   * Etapas de la pauta — un embudo de tres tramos. Es la forma con la que ya se piensa el problema
   * (arriba entra mucha gente, abajo compran pocos), y las tres barras se leen como las tres etapas.
   */
  etapas: (
    <>
      <path d="M3.8 5.2h16.4" />
      <path d="M6.6 11.2h10.8" />
      <path d="M9.4 17.2h5.2" />
    </>
  ),
  /**
   * Qué se accionó sobre la pauta — el reloj con la flecha que vuelve. Es la forma con la que ya se
   * lee "lo que pasó antes"; un candado o una planilla darían a entender permisos o carga, que es
   * justo lo que esa pantalla NO es.
   */
  historial: (
    <>
      <path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1" />
      <path d="M5.8 3.6v3.6h3.6" />
      <path d="M12 7.8V12l3 1.9" />
    </>
  ),
  /**
   * Calendario editorial — la hoja del almanaque con un día marcado. El punto no es decorativo: es
   * lo que separa "un calendario" de "la fecha que se te viene encima", que es de lo que habla la
   * pantalla.
   */
  calendario: (
    <>
      <path d="M4.4 6.4h15.2v13.2H4.4z" />
      <path d="M4.4 10.4h15.2" />
      <path d="M8.4 4.4v4" />
      <path d="M15.6 4.4v4" />
      <path d="M12 14.4h.01" />
    </>
  ),
  /** Reposición — flechas en círculo. */
  reposicion: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20.4 4.4v4.2h-4.2" />
    </>
  ),
  /** Productos caducados — reloj. */
  caducados: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  /** Fundas por modelo — celular. */
  'fundas-modelo': (
    <>
      <rect x="6.6" y="2.8" width="10.8" height="18.4" rx="2.2" />
      <path d="M10.6 5.4h2.8" />
      <path d="M12 18.2h.1" />
    </>
  ),
  /** Ingresos proyectados — la caja que entra. */
  ingresos: (
    <>
      <path d="M20.4 13.6v5a1.7 1.7 0 0 1-1.7 1.7H5.3a1.7 1.7 0 0 1-1.7-1.7v-5" />
      <path d="M7.8 9.4 12 13.6l4.2-4.2" />
      <path d="M12 13.6V3.4" />
    </>
  ),
  /** Proveedores — camión. */
  proveedores: (
    <>
      <path d="M2.8 6.6h10.6v9.8H2.8z" />
      <path d="M13.4 10.2h3.4l3.4 3v3.2h-6.8z" />
      <circle cx="7" cy="18.2" r="1.7" />
      <circle cx="16.8" cy="18.2" r="1.7" />
    </>
  ),
  /** Diseños — la imagen con su sol y su montaña. */
  disenos: (
    <>
      <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="1.8" />
      <circle cx="8.6" cy="9.6" r="1.6" />
      <path d="m3.8 16.6 4.8-4.4 4 3.6 3.2-2.8 4.4 4" />
    </>
  ),
  /** Usuarios — persona con su ficha. */
  usuarios: (
    <>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.6 20.4c0-3.7 3.3-6.2 7.4-6.2s7.4 2.5 7.4 6.2" />
    </>
  ),
  /** TN › Fotos — cámara. */
  'tn-fotos': (
    <>
      <path d="M3.4 8.6a1.7 1.7 0 0 1 1.7-1.7h2.6l1.4-2.2h5.8l1.4 2.2h2.6a1.7 1.7 0 0 1 1.7 1.7v9.2a1.7 1.7 0 0 1-1.7 1.7H5.1a1.7 1.7 0 0 1-1.7-1.7z" />
      <circle cx="12" cy="12.8" r="3.4" />
    </>
  ),
  /** TN › Categorías — carpetas apiladas. */
  'tn-categorias': (
    <>
      <path d="M3.6 8.4a1.5 1.5 0 0 1 1.5-1.5h3l1.7 2.2h9.7a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H5.1a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M6.4 6.9V5.4a1.5 1.5 0 0 1 1.5-1.5h2.6l1.4 1.8" />
    </>
  ),
  /** TN › Visibilidad — ojo. */
  'tn-visibilidad': (
    <>
      <path d="M2.6 12S6.2 5.8 12 5.8 21.4 12 21.4 12 17.8 18.2 12 18.2 2.6 12 2.6 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  /** Eliminar — papelera. Los tres de abajo son acciones de fila, no secciones del menú. */
  papelera: (
    <>
      <path d="M4.5 6.8h15" />
      <path d="M9.5 6.8V4.6h5v2.2" />
      <path d="M6.6 6.8 7.6 20h8.8l1-13.2" />
      <path d="M10.3 10.2v6.4M13.7 10.2v6.4" />
    </>
  ),
  /** Editar — lápiz. */
  lapiz: (
    <>
      <path d="M16.4 3.9a2.2 2.2 0 0 1 3.1 3.1L8.2 18.3l-4.1 1 1-4.1z" />
      <path d="M14.6 5.7l3.1 3.1" />
    </>
  ),
  /** Quitar / cerrar — cruz. */
  cruz: (
    <>
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  /** Llamar — auricular. */
  telefono: (
    <>
      <path d="M6.4 3.8h3l1.5 3.7-1.9 1.4a11 11 0 0 0 5.1 5.1l1.4-1.9 3.7 1.5v3a1.7 1.7 0 0 1-1.9 1.7A15.6 15.6 0 0 1 4.7 5.7a1.7 1.7 0 0 1 1.7-1.9z" />
    </>
  ),
  /**
   * Escribir por WhatsApp — burbuja con auricular.
   *
   * Es una burbuja genérica y no el logo: el logotipo de WhatsApp es marca registrada, y además un
   * ícono de trazo se pinta con `currentColor`, que es lo que permite apagarlo cuando el botón está
   * deshabilitado. Un logo a todo color se ve igual habilitado que no.
   */
  whatsapp: (
    <>
      <path d="M20.2 11.6a8.1 8.1 0 0 1-11.9 7.2L4 20.1l1.4-4.2a8.1 8.1 0 1 1 14.8-4.3z" />
      <path d="M9.3 9.1c.4 2.4 2.4 4.4 4.8 4.8l.9-1.3 1.7.8v1.3c0 .6-.5 1-1.1 1a7 7 0 0 1-6.4-6.4c0-.6.4-1.1 1-1.1h1.3l.8 1.7z" />
    </>
  ),
  /** Imprimir — impresora con la hoja saliendo. */
  impresora: (
    <>
      <path d="M7.2 9.2V3.9h9.6v5.3" />
      <path d="M7.2 17.6H5.4a1.6 1.6 0 0 1-1.6-1.6v-4.2a2.6 2.6 0 0 1 2.6-2.6h11.2a2.6 2.6 0 0 1 2.6 2.6V16a1.6 1.6 0 0 1-1.6 1.6h-1.8" />
      <path d="M7.2 14.4h9.6v5.7H7.2z" />
    </>
  ),
  /** Listo — tilde. */
  check: (
    <>
      <path d="M4.8 12.6l4.6 4.6L19.2 7.4" />
    </>
  ),
} as const

export function Icono({ nombre, size = 16, style }: { nombre: NombreIcono; size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      // `flex: none` porque viven dentro de filas flex del menú: sin eso el ícono se
      // achica cuando el label es largo, y entonces no todos miden lo mismo.
      style={{ flex: 'none', ...style }}
    >
      {TRAZOS[nombre]}
    </svg>
  )
}

/** ¿Existe un ícono con este nombre? Para no romper si un grupo trae uno que no está. */
export function hayIcono(nombre: string | undefined): nombre is NombreIcono {
  return !!nombre && nombre in TRAZOS
}
