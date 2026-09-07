'use client'

import { Badge, Button, Card, color, font, space } from '@/components/ui'

/**
 * El encabezado del memo: qué semana se está mirando y en qué estado está.
 *
 * 🔴 **Existe por un defecto, y el defecto era que esta tarjeta AFIRMABA.** Vive fuera del
 * esqueleto de carga —el título tiene que cambiar apenas se aprieta la flecha—, así que durante los
 * segundos que tarda la lectura de la semana nueva mostraba el estado de la semana **anterior**:
 * el título decía "24 al 30" y el chip decía "Cerrado" porque lo era la que se acababa de dejar.
 * Dicho por Bruno el 29-ago-2026: *"el estado queda del anterior por unos segundos, y luego
 * actualiza"*. No hay error y no hay aviso; el chip se ve perfectamente razonable.
 *
 * 🔑 **Por eso `estado` es `null` cuando todavía no se sabe, y `null` no es "abierto".** Un chip de
 * tres valores donde el tercero es "no lo sé" es la única forma de que la pantalla no conteste una
 * pregunta que no tiene contestada. Misma familia que la etiqueta del tilde de las metas: una
 * pantalla que no pregunta, igual afirma.
 *
 * ⚠️ **Y con `estado: null` el botón de cerrar NO se dibuja**, que es lo que de verdad muerde:
 * cerrar apaga los avances y el botón de señales de una vez, y ofrecerlo sobre un estado que
 * todavía es el de otra semana es ofrecer apagar lo que no se está mirando.
 *
 * 🔑 **Hay TRES estados y no dos, porque desbloquear existe** (7-sep-2026): abierta, cerrada, y
 * abierta **con la foto ya congelada**. La tercera no es "en curso" ni "sin cerrar" —sus números ya
 * no se mueven— y dibujarla como cualquiera de las otras dos sería la pantalla afirmando lo que no
 * pasó. Por eso el chip dice "Desbloqueado" y el botón dice "Volver a cerrar", que es lo que hace:
 * no vuelve a congelar nada.
 */
export function EncabezadoSemana({
  etiqueta, estado, semanaTerminada, puedeEscribir, fotoTomada, cerradoPor, cerradoAt, onCerrar, onReabrir,
}: {
  etiqueta: string
  /** `null` = todavía se está leyendo esta semana. ⛔ No es "abierto". */
  estado: 'abierto' | 'cerrado' | null
  semanaTerminada: boolean
  puedeEscribir: boolean
  /** ¿Los números de esta semana ya están congelados? Con la semana desbloqueada siguen estándolo. */
  fotoTomada: boolean
  cerradoPor?: string | null
  cerradoAt?: string | null
  onCerrar: () => void
  onReabrir: () => void
}) {
  const desbloqueada = estado === 'abierto' && fotoTomada
  return (
    <Card padding={4} style={{ marginBottom: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <div style={{ fontSize: font.xl, fontWeight: 700, color: color.ink }}>{etiqueta}</div>
        {estado === null ? (
          <Badge tone="neutral">Leyendo la semana…</Badge>
        ) : estado === 'cerrado' ? (
          <Badge tone="success">Cerrado</Badge>
        ) : desbloqueada ? (
          <Badge tone="warning">Desbloqueado</Badge>
        ) : semanaTerminada ? (
          <Badge tone="warning">Terminada, sin cerrar</Badge>
        ) : (
          <Badge tone="neutral">En curso</Badge>
        )}
        <div style={{ flex: 1 }} />
        {estado === 'cerrado' && puedeEscribir && (
          <Button variant="outline" onClick={onReabrir}>Desbloquear</Button>
        )}
        {estado === 'abierto' && puedeEscribir && semanaTerminada && (
          <Button variant="solid" onClick={onCerrar}>
            {desbloqueada ? 'Volver a cerrar' : 'Cerrar la semana y congelar los números'}
          </Button>
        )}
      </div>
      {estado === 'cerrado' && cerradoPor && (
        <div style={{ fontSize: font.sm, color: color.mut2, marginTop: space[2] }}>
          Cerrado por {cerradoPor}{cerradoAt ? ` · ${new Date(cerradoAt).toLocaleDateString('es-AR')}` : ''}
          {' · '}El acta se puede seguir escribiendo; para corregir un avance, desbloqueá.
        </div>
      )}
      {desbloqueada && (
        <div style={{ fontSize: font.sm, color: color.mut2, marginTop: space[2] }}>
          Desbloqueada: los números siguen congelados como se tomaron. Volvé a cerrarla cuando termines.
        </div>
      )}
    </Card>
  )
}
