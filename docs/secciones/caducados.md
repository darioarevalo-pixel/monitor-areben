# Productos caducados — ficha de sección

Sección `caducados`, área Administración. Lista lo que hay que dar de baja: **sin stock en ningún
depósito y sin vender hace más de N días** (30 por defecto). La usan Darío y Bruno para limpiar
Tienda Nube y Gestión Nube por familia («top», «jean»…).

## Dónde vive

`components/caducados/` (pantalla + `datosCaducados.ts`, que baja sus propios datos) ·
`lib/caducados.ts` (todo el cálculo, puro) · `tests/caducados.test.ts`. Lee el espejo por
`fetchAll` (inventario, productos, ventas, venta_detalles) y la tienda por `traerAudit(…,
{variantes:true})` (`lib/tn-audit.ts`, caché compartido con la sección Tienda Nube).

## Reglas que el código no dice

- **Los 30 días son el plazo máximo de cambio** (lo definió Darío, 5-oct-2026): antes de eso un
  producto puede volver por un cambio. Vale para todas las familias, temporada incluida.
- **Dos pestañas, una por sistema, y cada una mira SÓLO el suyo.** La de TN incluye productos ya
  desactivados en GN: el ETL baja sólo activos (`active=eq.1`), por eso `datosCaducados` baja
  `productos` entero. Medido el 5-oct: de 194 tops caducados, 149 ya estaban inactivos en GN y 78
  seguían (ocultos) en la tienda. Filtrar la pestaña de TN por activos en GN los vuelve invisibles.
- **Gemelos de nombre**: Zattia carga productos distintos con el mismo nombre (temporadas,
  duplicados). Una publicación de TN que cruza con un gemelo VIGENTE no se lista. → la regla
  exacta, con los casos medidos, en el comentario de `pendientesTn`. 🔴 **Ya costó una**: TOP ALO
  se eliminó de TN con un gemelo vendido 19 días antes, porque el conteo a mano miró el stock del
  gemelo y no su última venta.
- **El cruce con TN es por nombre EXACTO**, a propósito distinto de `matchTn`: ver `normNombre`.
- **Eliminar en TN no tiene vuelta atrás y TN no guarda historial.**

## Lo que falta

- **Botón «Eliminar de Tienda Nube»** (sólo Darío y Bruno), con respaldo previo de nombre, fotos,
  descripción y precio + registro de quién/cuándo. La escritura va por `bdi-catalogo` (la clave de
  TN vive ahí), que ⛔ está en el techo de 12 funciones: entra como acción de un endpoint existente.
  ⛔ Leer `docs/secciones/tncat.md` antes: un POST con acción desconocida recategoriza la tienda.
- **GN**: confirmar si la API deja desactivar (hoy el aviso dice que no). Si no, sigue a mano.
- ⛔ Desde una sesión de Claude Code en modo automático **no se puede eliminar en serie** en la
  tienda (ni por Chrome, ni por Lumi, ni con reglas `allow`): por eso el botón.
