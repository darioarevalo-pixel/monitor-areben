# Ficha del cliente — la extensión de WhatsApp

Abrís un chat en WhatsApp Web y al costado aparece la ficha del cliente: qué compró, qué se le
dijo la última vez, y los botones para anotar cómo te fue y cuándo volver a hablarle.

## Cómo se instala (una sola vez, en la computadora)

1. En Chrome, entrá a `chrome://extensions`.
2. Arriba a la derecha, prendé **Modo de desarrollador**.
3. Botón **Cargar descomprimida** y elegí esta carpeta (`extension`).
4. Abrí `https://web.whatsapp.com` y hacé clic en el ícono de la extensión (arriba a la derecha,
   en el rompecabezas). El panel se abre al costado.
5. La **primera vez** te va a pedir usuario y contraseña del monitor, aunque ya estés adentro en
   otra pestaña. Es una vez sola: Chrome guarda la sesión del panel por separado.

Después de eso queda abierto solo y va cambiando de cliente a medida que cambiás de chat.

**El panel vive únicamente en la pestaña de WhatsApp.** Si te vas a otra pestaña —o a otra
ventana de Chrome— desaparece, y al volver a WhatsApp vuelve a aparecer. Por eso el clic en el
ícono sólo abre el panel estando en WhatsApp Web: en cualquier otra pestaña no hay nada que abrir.

> Si venís de la v0.2.1 y el panel te seguía apareciendo en todos lados: eso era el panel
> **global** que declaraba el manifest. Apagarlo pestaña por pestaña no alcanzaba, porque el
> global gana. Desde la v0.2.2 el manifest no declara ninguno y cada pestaña de WhatsApp lo
> enciende por su cuenta.

## Qué hace y qué no

- Lee **el número del chat abierto** y nada más. No lee mensajes, no los guarda y no los manda a
  ningún lado.
- La ficha, los botones y el guardado son del monitor: adentro del panel corre
  `monitorareben.vercel.app/panel/<numero>`, con tu sesión y tus permisos de siempre.
- Los **grupos no tienen ficha** (a propósito: en un grupo el número que aparece es el del que
  escribió último).
- Un chat recién abierto, sin ningún mensaje, tampoco: el número sale de los mensajes.

## Si cambiaste algo de esta carpeta

Dos pasos, y el segundo se olvida siempre:

1. En `chrome://extensions`, apretá el **⟳** de la extensión.
2. **Recargá la pestaña de WhatsApp Web.** Los cambios no entran solos en una pestaña ya abierta.

## Qué pasa cuando tocás un nombre en la lista

Dos cosas a la vez, y por eso se siente rápido:

1. **La ficha** se pide en ese mismo instante, por el id del cliente —que la lista ya sabe—, sin
   esperar a que la conversación abra.
2. **El chat** se abre pidiéndole a WhatsApp que cambie de conversación, sin recargar la página.
   Si esa puerta interna deja de funcionar, la extensión cae sola a la dirección de siempre
   (`send?phone=`): abre igual, pero recarga WhatsApp Web y tarda varios segundos.

## Si un día deja de aparecer la ficha

Lo que se rompe es siempre lo mismo: de dónde sale el número de la conversación. Está en una sola
función, `telefonoDelChatAbierto()` de `pagina.js`, y arriba está explicado de dónde lo saca y por
qué. No hay nada más que mantener de este lado.

El panel te va a decir qué pasó en vez de quedarse mudo: si dice "no puedo leer con quién estás
hablando", WhatsApp movió esa puerta de lugar.
