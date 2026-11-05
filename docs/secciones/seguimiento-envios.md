# Seguimiento de envíos — ficha de sección

Sección `seguimiento-envios`, área Administración. Bruno, 4-nov-2026: los paquetes quedan en sucursal,
la gente no se entera y las devoluciones se pierden. **Primera entrega: sólo mira, ⛔ le manda nada a
nadie.** Lo que falta y su orden, en el `PENDIENTES.md`.

## Dónde vive

`components/seguimiento-envios/` · `lib/seguimiento-envios/core.core.js` (todas las decisiones) ·
`api/_seguimiento-envios.js`, por `?recurso=seguimiento-envios`. ⛔ Sin tabla: se lee en vivo.
Tests: `tests/seguimiento-envios*.test.*`.

## Lo que el código no dice

- ⛔ **Por fuera de Reclamos**: no usa `devoluciones` ni `Retornos`, que dependen de un módulo casi sin uso.
- 🔑 **El monitor ⛔ habla con TN**: las órdenes salen de `tiendanube-audit` de `bdi-catalogo`, que no
  entrega `shipping_tracking_url`. ⛔ Hace falta: el Correo acepta `shipping_tracking_number`.
- 🔴 **TN deja `shipped` lo que volvió, y el Correo lo termina dando por `ENTREGADO`.** Medido 5-nov en
  los 105 paquetes `shipped` de 90 días: los `ENTREGADO` con `RETORNAND0` antes los firma una planta de
  Rosario (`CDD 01 ROSARIO`, `CTP ROSARIO`), de donde salen. ⚠️ Nadie lo comprobó con el paquete en la mano.
- **La solapa Volvieron** (Bruno, 5-nov) son esos: `ENTREGADO` después de retornar. Hay que confirmarlos con el paquete.
- 🔴 **`Volvió` en Esperando retiro** es un paquete en una sucursal de Rosario que tenemos que buscar
  nosotros. ⛔ **La alerta al cliente tiene que excluirlos**: `volvio` en la fila.
- 📏 **Plazo real, medido 5-nov (18 paquetes de `EN ESPERA` a `PLAZO VENCIDO NO RECLAMO`):** de 4 a 13
  días corridos, mediana 8. ⛔ Son los 5 días que se suponían, y sigue sin confirmar la política.
- 📏 **Trabados = 7 días (`DIAS_TRABADO`)**: el 5-nov había 6 paquetes con 22 días o más y el resto con
  2 o menos, sin nada en el medio.
- ⚠️ Stunned entra por `zattia`: tiene tienda propia, pero en el monitor es línea de Zattia.
- 🔴 **El cupo de TN es compartido.** La primera versión hacía unos 66 pedidos en BDI por apertura y dio
  429 en la pantalla de Bruno (5-nov): cada consulta a `tiendanube-audit` son 3 pedidos, y un tramo de más
  de 200 órdenes se tira y se repite. Por eso `LARGO_TRAMO` va por tienda y se recuerda 5 minutos. El
  arreglo de fondo es una lectura periódica guardada en una tabla, cuando la alerta la necesite.
- ⚠️ `api/datos.js` corta a los 30 s. Se consultan 90 días de todas las tiendas de la marca.
- ⚠️ La consulta al Correo es la de su página pública, ⛔ una API oficial. `correoCaido` y `sinLeer` son
  el aviso de que dejó de contestar. Andreani ⛔ entra todavía.
- «Sin aviso» es la verdad de hoy: nada manda avisos del Correo. La serie de retiro del mailer es sólo
  del local (`esRetiroEnLocal`).
