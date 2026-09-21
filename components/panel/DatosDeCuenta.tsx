'use client'

/**
 * Los datos de una cuenta a la que el cliente va a transferir, adentro del panel de WhatsApp.
 *
 * # Por qué es un componente y no tres copias
 *
 * Estaba escrito **tres veces** —las cuentas de acá y los acreedores del dashboard en `Pagos.tsx`,
 * y otra vez en `NuevoCompromiso.tsx`— con el mismo bloque de alias + banco + titular + CBU + los
 * dos botones de copiar. Se veían iguales de casualidad: tocar una sola las separaba. Es la misma
 * máquina que la ficha de la sección marca como causa de los dos bugs de plata (dos formularios de
 * confirmar, uno arreglado y el otro no).
 *
 * # 🔑 Una lista de datos, no una frase con puntitos
 *
 * Antes era `alias · banco · a nombre de Juan`, que en una columna de 350 px se lee como un
 * renglón corrido del que hay que extraer tres cosas. Acá cada dato tiene su rótulo al costado,
 * chico y apagado: el ojo baja por los valores sin leer los rótulos.
 *
 * ⚠️ El alias va en el tamaño del cuerpo y no chiquito: es **lo que se le dicta al cliente** si el
 * botón de copiar no está a mano, así que tiene que poder leerse en voz alta de un vistazo.
 *
 * # 🔑 Copiar es el gesto principal
 *
 * Esto se está mirando con el chat del cliente al lado y lo que sigue es pegárselo (lo levantó
 * Bruno usándolo, 21-sep-2026). Los dos botones son los dos pedidos reales: "mandame los datos" y
 * "pasame el alias".
 */

import { CopyButton } from '@/components/ui'
import { color, font, space } from '@/components/ui/tokens'
import { datosParaMandar } from '@/lib/compromisos/destino'
import type { CuentaBancaria } from '@/lib/acreedores/cliente'

function Dato({ rotulo, children, mono }: { rotulo: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: space[2], alignItems: 'baseline' }}>
      {/* ⚠️ `nowrap` y ancho fijo: sin eso "a nombre de" se parte en dos renglones y el bloque
          deja de leerse como una lista. */}
      <span style={{ flex: '0 0 76px', fontSize: font.xs, color: color.mut2, whiteSpace: 'nowrap' }}>{rotulo}</span>
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: font.sm, color: color.ink,
          fontFamily: mono ? 'monospace' : undefined,
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {children}
      </span>
    </div>
  )
}

export function DatosDeCuenta({ cuenta, destino }: {
  cuenta: CuentaBancaria
  /** El nombre de a quién es la cuenta: viaja en el texto que se copia, no se dibuja acá. */
  destino: string
}) {
  return (
    <div style={{ marginTop: 6, display: 'grid', gap: 2 }}>
      {cuenta.alias && (
        <Dato rotulo="alias">
          <b style={{ fontSize: font.md }}>{cuenta.alias}</b>
        </Dato>
      )}
      {cuenta.banco && <Dato rotulo="banco">{cuenta.banco}</Dato>}
      {cuenta.titular && <Dato rotulo="a nombre de">{cuenta.titular}</Dato>}
      {/* Sin alias, el CBU es lo que se dicta: ahí sube al cuerpo. */}
      {cuenta.cbu && (
        <Dato rotulo="CBU" mono>
          {cuenta.alias ? cuenta.cbu : <b style={{ fontSize: font.md }}>{cuenta.cbu}</b>}
        </Dato>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        <CopyButton getText={() => datosParaMandar(cuenta, destino)} label="Copiar los datos" copiedLabel="✓ Listo para pegar" />
        {cuenta.alias && <CopyButton getText={() => cuenta.alias || ''} label="Sólo el alias" variant="ghost" iconLeft="" />}
      </div>
    </div>
  )
}
