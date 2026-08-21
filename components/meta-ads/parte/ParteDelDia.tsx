'use client'

/**
 * El PARTE DEL DÍA, en el Panel.
 *
 * # Por qué es un botón del Panel y no una vista más
 *
 * 🔑 Sumar una vista a esta sección obliga a releer **los tres textos que las cuentan** —el
 * encabezado de `MetaAds.tsx`, la descripción de `lib/nav.ts` y el `info` de `PERM_CAT`— y eso ya
 * mordió cuatro veces, siempre igual: los tres quedan diciendo «en seis pantallas» en silencio.
 * Y hay un motivo mejor: **un segundo lugar al que hay que acordarse de entrar es uno al que no se
 * entra**, que es la regla que esta sección ya tiene escrita para los hallazgos.
 *
 * # Por qué el verbo principal es COPIAR y no descargar
 *
 * El destino de esto es una conversación: se pega en un chat o en una nota y se decide ahí. Un
 * `.xlsx` obliga a bajarlo, abrirlo y volver a sacarlo; el texto ya viene agregado por conjunto,
 * comparado contra ayer y juzgado contra el techo. El Excel queda como el verbo de al lado, para
 * mirarlo y archivarlo.
 *
 * # ⛔ No se pide solo
 *
 * Cada parte son cinco llamadas a Graph y el cupo de la Marketing API es un porcentaje de la
 * cuenta. Se pide cuando alguien lo pide: un `useEffect` que lo trajera al abrir el Panel gastaría
 * cupo en cada visita, incluidas las que entran a mirar otra cosa.
 */
import { useCallback, useState } from 'react'
import { traerParte } from '@/lib/meta-ads/cliente'
import { descargarXlsx, type Filas } from '@/lib/excel'
import { Button, Card, CopyButton, Notice, SectionCard, color, font, radius, space, weight } from '@/components/ui'

/** Cada bloque del parte a filas de celdas, para el `.xlsx`. Los `## TITULO` quedan de separador. */
function aFilas(texto: string): Filas {
  return texto.split('\n').map((l) => (l.includes('|') ? l.split('|') : [l]))
}

export function ParteDelDia({ cuenta, linea }: { cuenta: string | null; linea?: string }) {
  const [texto, setTexto] = useState<string | null>(null)
  const [faltantes, setFaltantes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const pedir = useCallback(async () => {
    if (!cuenta) return
    setCargando(true)
    setError(null)
    const r = await traerParte(cuenta, linea)
    setCargando(false)
    if (!r.ok) {
      setError(r.motivo)
      return
    }
    setTexto(r.dato.texto)
    setFaltantes(r.dato.faltantes || [])
  }, [cuenta, linea])

  // 🔑 Con «Todas» no hay parte: el parte es de UNA cuenta publicitaria, y armar uno de varias
  // sumaría gastos de cuentas con monedas distintas. Se dice en vez de dibujar un botón muerto.
  if (!cuenta) {
    return (
      <SectionCard title="Parte del día" subtitle="Todo lo que hace falta para decidir presupuestos, en un texto para copiar.">
        <div style={{ color: color.mut2, fontSize: font.sm }}>
          Elegí una cuenta publicitaria arriba: el parte es de una sola cuenta.
        </div>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Parte del día"
      subtitle="Hoy contra ayer por conjunto y por aviso, el embudo, y el cruce contra los pedidos reales de la tienda."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <Button onClick={pedir} disabled={cargando} variant="solid" tone="brand" size="sm" iconLeft="📋">
            {cargando ? 'Armando el parte…' : texto ? 'Volver a armarlo' : 'Armar el parte'}
          </Button>
          {texto && (
            <>
              <CopyButton getText={() => texto} label="Copiar el parte" copiedLabel="✓ Copiado" />
              <Button
                onClick={() => descargarXlsx(aFilas(texto), { archivo: `parte-pauta-${cuenta}.xlsx`, hoja: 'Parte' })}
                variant="soft"
                tone="neutral"
                size="sm"
                iconLeft="⬇️"
              >
                Bajar Excel
              </Button>
            </>
          )}
        </div>

        {error && <Notice tone="danger">No se pudo armar el parte: {error}</Notice>}

        {/* Lo que no se pudo leer se DICE. Un bloque vacío por una falla se ve igual que un bloque
            vacío porque no hubo nada, y esa es la diferencia entre un día flojo y un dato roto. */}
        {faltantes.length > 0 && (
          <Notice tone="warning">
            El parte salió, pero sin esto:
            <ul style={{ margin: `${space[1]} 0 0`, paddingLeft: space[4] }}>
              {faltantes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Notice>
        )}

        {texto && (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {/* `overflow-x: auto` en el contenedor: las filas del parte son largas a propósito y la
                página nunca tiene que scrollear horizontal por culpa de esto. */}
            <pre
              style={{
                margin: 0,
                padding: space[3],
                overflowX: 'auto',
                maxHeight: 420,
                overflowY: 'auto',
                fontSize: font.xs,
                lineHeight: 1.5,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: color.ink,
                background: color.bg2,
                borderRadius: radius.md,
                whiteSpace: 'pre',
              }}
            >
              {texto}
            </pre>
          </Card>
        )}

        {!texto && !error && (
          <div style={{ color: color.mut2, fontSize: font.sm }}>
            <strong style={{ fontWeight: weight.medium }}>No se pide solo.</strong> Cada parte son cinco llamadas a
            Meta y el cupo de la API es un porcentaje de la cuenta.
          </div>
        )}
      </div>
    </SectionCard>
  )
}
