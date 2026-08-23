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

## Qué hace y qué no

- Lee **el número del chat abierto** y nada más. No lee mensajes, no los guarda y no los manda a
  ningún lado.
- La ficha, los botones y el guardado son del monitor: adentro del panel corre
  `monitorareben.vercel.app/panel/<numero>`, con tu sesión y tus permisos de siempre.
- Los **grupos no tienen ficha** (a propósito: en un grupo el número que aparece es el del que
  escribió último).
- Un chat recién abierto, sin ningún mensaje, tampoco: el número sale de los mensajes.

## Si un día deja de aparecer la ficha

WhatsApp Web cambia su HTML cada tanto y lo que se rompe es siempre lo mismo: de dónde sale el
número. Está en una sola función, `numeroDelChat()` de `content.js`, y arriba está explicado cómo
lo saca. No hay nada más que mantener de este lado.
