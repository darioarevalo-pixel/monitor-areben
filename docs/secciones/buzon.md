# Mensajes de clientes — ficha de sección

Sección `buzon`, área `local`. En prod desde el 23-ago-2026.

Lo que la clienta escribió y todavía no se resolvió, atado al número de orden. **No reemplaza
ninguna pantalla**: reemplaza a la casilla de mail, que el fin de semana no la abre nadie.

🔑 **El problema no era que los mails no se contestaran: era CUÁNDO.** Entra un mail el domingo
pidiendo cambiar un talle, el lunes a las 9 se arma el paquete y sale con lo que la clienta ya había
pedido cambiar. El mail existía y la orden existía; lo que no existía era un lugar donde las dos
cosas se tocaran, así que el despacho no tenía forma de frenarse.

⇒ **Esta sección no es donde el problema se arregla: es donde el dato existe.** El arreglo está en
**Envíos**, que pregunta antes de dejar avanzar un paquete cuya orden tiene un mensaje sin resolver.

⛔ **No es Reclamos y Cambios** (`reclamos-local` / `cambios-local`, hoy frenados): ahí vive el
proceso de una devolución ya aceptada. Acá la unidad de medida es el tiempo.

## Dónde vive

| qué | archivo |
|---|---|
| Pantalla | `components/buzon/Buzon.tsx` + `useBuzon.ts` |
| **La regla del freno** | `lib/buzon/core.ts` — puro, con tests |
| **Lo que también lee el handler** | `lib/buzon/reglas.core.js` (⛔ `.js` plano: los `api/*.js` no pueden importar TypeScript) |
| Cliente / tipos | `lib/buzon/cliente.ts` · `lib/buzon/tipos.ts` |
| Handler | `api/_buzon.js`, por `datos.js?recurso=buzon` — ⛔ **no es una función de Vercel**, el prefijo `_` lo garantiza |
| Tabla (base de **BDI**, como Envíos y Canjes) | `buzon_mensajes` |
| Migración | `sql/migrate-buzon.sql` + `scripts/apply-buzon.mjs` |
| Ícono | `buzon` en `components/ui/Icono.tsx` (un sobre con un punto) |
| Tests | `tests/buzon-core.test.ts` · `tests/buzon-handler.test.ts` · la fila de `_buzon` en `tests/handlers-autorizacion.test.ts` |

## ⛔ Lo que comparte con otras secciones

**`lib/buzon/core.ts` lo importa `components/envios/Envios.tsx`**, y ahí está todo el valor de la
sección. Tocar `indiceDeAbiertos`, `abiertosDe` o `frenaElDespacho` es tocar Envíos.
⛔ Antes de tocar `components/envios/`, leer `docs/secciones/envios.md`.

## Reglas que el código no dice

- 🔴 **Un mensaje sin número de orden no frena nada.** Se guarda bien, se ve bien, y no protege
  ningún paquete. Por eso la pantalla **cuenta aparte** los abiertos sin orden y lo dice en un cartel
  ámbar: sin eso, «hay 4 mensajes abiertos» se lee como «hay 4 paquetes cubiertos». El número se
  edita en la fila misma (`onBlur`), que es el camino más corto entre ver el problema y arreglarlo.
- 🔴 **`normalizarOrden` es lo que hace que el freno frene.** Envíos guarda `'1234'`; la clienta y el
  asunto del mail escriben `#1234`, `# 1234`, `Nº 1234`, `01234`. Guardado tal cual, el mensaje queda
  atado a una orden que no existe: no falla nada, no hay error, y la fila de Envíos no muestra
  ninguna pastilla. O sea, el defecto que la sección viene a evitar, otra vez y en silencio.
- ⚠️ **El freno AVISA y DEJA PASAR.** Mismo criterio que la advertencia de duplicado de
  Integraciones. Un freno duro deja al mostrador sin salida un sábado a la tarde, y lo que hace falta
  es que la persona **lea**, no que no pueda trabajar. Los botones lo dicen: «Voy a leerlo» /
  «Seguir igual».
- 🔑 **Frena en tres estados y en `agendar`, y NO en las correcciones.** `preparado`, `en_transito` y
  `entregado` son el paquete avanzando; `no_entregado` y el «Corregir» de los cerrados son
  correcciones de algo que ya pasó, y un cartel ahí no cambia ninguna decisión — es el ruido que hace
  que los carteles se aprieten sin leer. Vive en `ESTADOS_QUE_DESPACHAN`.
- 🔴 **`indice` es un parámetro OBLIGATORIO de `abiertosDe`, no un opcional con default.** Con
  default, una pantalla nueva que se olvide de pasarlo compila, corre y contesta «no hay mensajes»
  para todo: el freno se apaga entero y en silencio. Obligatorio, esa pantalla no compila.
- 🔴 **Que el buzón no conteste se DICE, en Envíos.** Un 500 del buzón deja el índice vacío y la hoja
  del día se comporta exactamente igual que un día sin mensajes. Por eso `useEnvios` devuelve
  `errorBuzon` y la pantalla pinta un cartel ámbar: es el mismo defecto que un 403 leído como «no hay
  datos». El buzón se pide **después** de la hoja y en su propio `try`: que falle no puede dejar al
  cadete sin hoja, pero tampoco puede pasar callado.
- 🔑 **`recibido_en` es la fecha del MAIL, no la de la carga.** Un mail del domingo cargado el martes
  sigue siendo del domingo, y «hace 2 días» es justamente el número que hace que alguien lo mire. El
  input es `datetime-local` y usa **getters locales** (`aInputLocal`): el atajo
  `toISOString().slice(0,16)` muestra UTC, o sea que un mail de las 21:00 del domingo se cargaría
  como las 00:00 del lunes — el día equivocado, en el único dato del que depende todo esto.
- 🔑 **La bandeja va con lo más VIEJO arriba**, al revés que casi toda lista del monitor: acá el que
  espera hace más es el que más urge.
- 🔑 **Resolver exige decir qué se hizo** (`accion`, obligatoria en el handler). Un «resuelto» a
  secas no le dice nada a quien lo lee el martes, y es lo único que queda cuando el paquete ya salió.
- 🔑 **Reabrir limpia los TRES campos**, no sólo el tilde. Un mensaje abierto que dice «resuelto por
  Sofi el lunes» es el registro de algo que se dio por atendido y no lo está — mismo criterio que
  `selloDeEntrega` en Envíos, que borra la hora al volver atrás.
- 🔑 **El handler recorta a las marcas del perfil, a diferencia de `_envios.js`.** Envíos no valida
  `store` en la puerta porque la mochila es una; acá lo guardado es **nombre, mail y lo que escribió
  una persona**, y un puesto clavado a una marca no tiene por qué leer la correspondencia de la otra.
  Por eso el POST tiene su propio chequeo: sin él, mandar `store: 'bdi'` a mano en el body alcanzaba.
- ⚠️ **RLS prendido** (y `migrate-atencion.sql` **no** es el molde: aquélla lo apaga porque guarda
  links de la empresa). El molde es `envios_reparto`, que también guarda datos de clientes.

## Lo que ya se rompió acá

Todavía nada: la sección nació el 23-ago-2026. Lo que sí está fijado con tests son los modos de falla
que se vieron venir y ya costaron caro en otras secciones — el `#` que rompe el cruce, el índice
vacío leído como «no hay nada», la hora corrida por usar UTC, y el `store` mandado a mano en el body.

## Pendiente

- ▶️ **Fase B: traer los mails solos de la casilla.** Hoy alguien tiene que leer la casilla y cargar
  el mensaje. La casilla es de **Hotmail** ⇒ Microsoft Graph (IMAP ya pide OAuth igual). La columna
  `mensaje_ext_id` y su índice único parcial **ya están puestos** para eso: son la llave que impide
  que traer la casilla dos veces deje el mismo mail dos veces en la bandeja. ⚠️ Antes de construir
  nada, el ensayo: un script suelto que liste 5 asuntos. Si no lista, la Fase B no se hace.
- ▶️ **El pendiente rutinario de los lunes** («revisar la casilla del fin de semana») se carga en
  Agenda con `EditorRegla`. Es **dato, no código**.
- ⚠️ **No hay búsqueda ni paginado**: el GET trae 500 filas y la pantalla las dibuja todas. Con el
  volumen de hoy (unidades por semana) sobra; el día que el histórico moleste, el corte natural es la
  pestaña «Todos».
- ⚠️ **El mensaje no sale al portal del cadete y es a propósito**: `paraElCadeteCuenta` arma su
  respuesta campo por campo y hay un test de lista cerrada que lo obliga. Si alguna vez tiene que
  salir, se decide ahí y no acá.

## Cómo se prueba

```bash
npx vitest run tests/buzon-core.test.ts --reporter=dot
npx vitest run tests/buzon-handler.test.ts --reporter=dot
node scripts/apply-buzon.mjs      # idempotente; EJERCE el check, el índice único y el RLS
```

**Lo que ningún test ejerce y hay que caminar a mano** — el freno sólo existe si se ve en Envíos:

1. Cargar un mensaje contra una orden que esté hoy en la bandeja «Sin fecha» de Envíos.
2. Abrir **Envíos** (otra pantalla, otro camino que el hecho): la fila tiene la pastilla roja con el
   asunto.
3. Apretar «Mandar a un día» → sale el cartel. Cancelar, resolver el mensaje en Buzón, volver: la
   pastilla no está y el botón no pregunta.
4. Lo mismo con el botón de estado en la hoja del día («Preparado»).
5. Con un perfil **no admin** del local, que es quien lo va a usar.
