'use client'

/**
 * El PARTE DEL DÍA: el texto plano para copiar y pegar.
 *
 * # Por qué es un bloque de la zona y no una vista más
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
 * # 🔴 Ya NO cuesta apretar el botón — y eso corrige lo que este archivo decía
 *
 * Hasta el 26-ago-2026 acá decía «⛔ no se pide solo: cada parte son cinco llamadas a Graph y el
 * cupo es un porcentaje que se agota». 🔑 **Eso era una suposición de magnitud, nunca una
 * medición**: medido el 26-ago contra prod, el `call_count` de la cuenta está en **1-3%**.
 *
 * ⇒ el parte ahora lo trae `useParte`, que **es el mismo que alimenta la banda de hoy**. Las cinco
 * llamadas ocurren UNA vez por cada diez minutos y sirven a las dos cosas: apretar «Ver el texto»
 * ya no pide nada, sólo revela lo que la banda de arriba ya trajo.
 */
import { useState } from 'react'
import { useParte } from '@/components/meta-ads/parte/useParte'
import { descargarXlsx, type Filas } from '@/lib/excel'
import { Button, Card, CopyButton, Notice, SectionCard, color, font, radius, space, weight } from '@/components/ui'

/** Cada bloque del parte a filas de celdas, para el `.xlsx`. Los `## TITULO` quedan de separador. */
function aFilas(texto: string): Filas {
  return texto.split('\n').map((l) => (l.includes('|') ? l.split('|') : [l]))
}

export function ParteDelDia({ cuenta, linea }: { cuenta: string | null; linea?: string }) {
  const { estado } = useParte(cuenta, linea)
  // 🔑 El texto ya está: lo único que este estado guarda es si se está MIRANDO. Antes guardaba el
  // texto, y por eso apretar el botón costaba cinco llamadas cada vez.
  const [abierto, setAbierto] = useState(false)

  const cargando = estado.fase === 'cargando'
  const texto = abierto && estado.fase === 'ok' ? estado.dato.texto : null
  const faltantes = estado.fase === 'ok' ? estado.dato.faltantes || [] : []
  const error = estado.fase === 'error' ? estado.motivo : null
  const pedir = () => setAbierto((v) => !v)

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
      subtitle="Lo mismo que la banda de arriba pero entero y en texto: por conjunto y por aviso, el embudo, y el cruce contra los pedidos reales de la tienda. Para copiar y pegar."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <Button onClick={pedir} disabled={cargando} variant="solid" tone="brand" size="sm" iconLeft="📋">
            {cargando ? 'Armando el parte…' : texto ? 'Ocultar el texto' : 'Ver el texto para copiar'}
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

        {!texto && !error && !cargando && (
          <div style={{ color: color.mut2, fontSize: font.sm }}>
            <strong style={{ fontWeight: weight.medium }}>Ya está traído.</strong> Es el mismo parte que armó la
            banda de arriba: el texto sirve para pegarlo en una conversación y decidir ahí.
          </div>
        )}
      </div>
    </SectionCard>
  )
}
