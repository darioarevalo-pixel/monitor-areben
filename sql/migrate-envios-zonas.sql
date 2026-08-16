-- El mapa de zonas de reparto: los polígonos de Rosario y cuánto sale llevar un paquete a cada uno.
--
-- ⚠️ Aditivo: crea una tabla nueva y no toca ninguna existente. Nace VACÍA — las zonas entran por la
-- pantalla, importando el JSON que exporta el mapa. Sembrarlas acá haría que la única forma de
-- corregir un polígono fuera una migración, que es exactamente lo que esta tanda vino a evitar.
--
-- # Por qué esto vive en la base y no en un archivo del repo
--
-- Porque los precios se mueven. La foto del mapa de abril y la de junio se diferencian en **mil
-- pesos en las dieciséis zonas**: si los precios vivieran en el código, cada aumento sería un commit
-- y un deploy, y el día que el deploy no salga —cosa que ya pasó, callada— el cadete cobraría el
-- precio del mes pasado. Acá se cambian desde la pantalla y el cambio es inmediato.
--
-- # 🔑 Quién manda sobre qué, que es la regla que hace que re-importar sea seguro
--
-- Son dos fuentes y cada una es dueña de una cosa:
--
--     la GEOMETRÍA manda desde el MAPA   (se dibuja en el HTML y se importa)
--     el PRECIO manda desde la APP       (se edita acá y el archivo no lo pisa)
--
-- Sin esa regla, re-importar el archivo después de corregir un polígono **revertiría en silencio
-- todos los precios** al valor que tenía el JSON el día que se exportó. El importador actualiza el
-- polígono de una zona que ya existe y le respeta el precio; sólo toma el precio del archivo cuando
-- la zona es nueva. Y una zona que está acá pero no viene en el archivo **no se borra**: se informa,
-- porque borrarla deja a esas direcciones sin precio sin que nadie se entere.
--
-- Correr con `node scripts/apply-envios.mjs`. Idempotente.

create table if not exists envios_zonas (
  id           text primary key,
  -- El nombre es dato operativo, no decoración: es lo que la pantalla muestra al lado del precio
  -- propuesto, y es lo único que permite revisar de un vistazo si el precio es el correcto.
  -- «Zona 7» no se puede revisar; «Echesortu» sí. Es también la clave con la que el importador
  -- reconoce una zona que ya existe.
  nombre       text not null,
  -- `servicio` se reparte y tiene precio. `exclusion` es «no vamos» y no tiene ninguno.
  tipo         text not null default 'servicio' check (tipo in ('servicio', 'exclusion')),
  precio       numeric(12,2),
  -- Gana la más alta cuando dos zonas se superponen. En el mapa dibujado a mano la superposición es
  -- un hecho —las zonas se tocan y a veces se pisan por un par de cuadras—, no un error.
  prioridad    integer not null default 1,
  -- 🔑 «Coordinar» NO es un precio a convenir: el precio es el de la zona y el paquete se lleva
  -- igual. Lo que se coordina es **cuándo se va**. Por eso es una marca al lado del precio y no un
  -- tipo de zona: modelarlo como «zona sin precio» haría que la pantalla no propusiera nada, que es
  -- lo contrario de lo que pasa en la calle.
  coordinar    boolean not null default false,
  -- Días (0 = domingo, como `getDay()`) y turnos en que esa zona se reparte. `null` = sin
  -- restricción, que es el caso de quince de las dieciséis. Existe por **Funes**, que sale sólo
  -- martes y jueves a la mañana: un envío a Funes agendado un lunes es un paquete que no sale y
  -- nadie se entera hasta que la clienta escribe.
  dias         integer[],
  turnos       text[],
  -- El polígono tal como lo exporta el mapa: GeoJSON `Polygon` o `MultiPolygon`, coordenadas en
  -- orden [lng, lat]. Se guarda entero y sin tocar para que el archivo y la base no puedan divergir.
  poligono     jsonb not null,
  autor        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- 🔴 El candado que importa. Una zona de servicio SIN precio, o con precio cero, haría que la
  -- pantalla propusiera «$0» para un barrio entero — y en esta sección un cero no significa «no se
  -- cobra»: significa que el reparto salió gratis, que es mentira y es plata que al cadete se le
  -- paga igual. Que la zona falte es visible (esas direcciones quedan sin precio y sin poder
  -- agendarse); que valga cero, no.
  constraint envios_zonas_precio_segun_tipo check (
    (tipo = 'servicio' and precio is not null and precio > 0) or
    (tipo = 'exclusion' and precio is null)
  )
);

-- El nombre es la clave del importador: dos zonas con el mismo nombre harían que re-importar
-- actualizara una sola y dejara la otra a la deriva, con la mitad del mapa vieja y sin aviso.
create unique index if not exists envios_zonas_nombre_idx on envios_zonas (lower(nombre));

-- ⚠️ Prender RLS no es el default: una tabla creada después de `migrate-rls.sql` nace SIN RLS y
-- sería la única abierta de la base. Acá no hay plata de nadie, pero sí está el mapa completo de a
-- dónde reparte la empresa y a cuánto, que es información del negocio. Sin políticas, `anon` no lee
-- una sola fila: todo entra por `api/datos.js?recurso=envios&zonas=1`.
alter table envios_zonas enable row level security;
