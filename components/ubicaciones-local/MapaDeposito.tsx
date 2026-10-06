'use client'

import { useState } from 'react'
import { EmptyState, Input, Notice, SectionCard, color, font, space } from '@/components/ui'
import { haceCuanto } from '@/lib/buzon/core'
import { DEPOSITO, DIAS_ESTANTE_VIEJO, cmpSku, partesDeEstante } from '@/lib/ubicaciones-local/core.core.js'
import type { Estante, Foto } from '@/lib/ubicaciones-local/cliente'

/**
 * El mapa del depósito: el pasillo visto desde arriba y, al tocar un módulo, sus 6 estantes de frente.
 * Sirve para lo mismo que el Mapa del local, pero para encontrar la bolsa: buscás un producto y se
 * prenden el módulo y el estante donde está.
 *
 * La forma (cuántos módulos por pared, cuántos estantes) vive en `DEPOSITO` del núcleo, ⛔ acá.
 * ⚠️ Es un esquema para ubicarse, ⛔ está a escala. Lo que sí sale de las fotos del 6-oct: la pared
 * derecha va de la puerta al fondo, y los 2 módulos de la izquierda están en el fondo.
 */

type Indice = { porClave: Map<string, { nombre: string | null }> }

/** En qué tramo del pasillo (0 = junto a la puerta) va cada módulo: la derecha ocupa todo, la izquierda el fondo. */
function tramo(lado: string, modulo: number, modulosDe: number, tramos: number) {
  return lado === 'D' ? modulo - 1 : tramos - modulosDe + modulo - 1
}

export function MapaDeposito({ foto, indice }: { foto: Foto | null; indice: Indice }) {
  const [q, setQ] = useState('')
  const [modulo, setModulo] = useState<string | null>(null)
  const [estante, setEstante] = useState<string | null>(null)
  // El «hace cuánto» se fija al abrir la pestaña: ⛔ cambia a mitad de una lectura.
  const [ahora] = useState(() => Date.now())

  if (!foto) return <Notice tone="neutral">Cargando los estantes…</Notice>

  const nombreDe = (clave: string, nombre: string | null) => nombre || indice.porClave.get(clave)?.nombre || ''
  const porNombre = new Map(foto.estantes.map((e) => [e.estante, e]))
  const busca = q.trim().toUpperCase()
  const coincide = (e: Estante | undefined) =>
    !!busca && !!e?.productos.some((p) => p.clave.includes(busca) || nombreDe(p.clave, p.nombre).toUpperCase().includes(busca))

  // Los estantes cargados con un nombre que ⛔ es del mapa (`A1`, `REJA`): se muestran aparte.
  const fuera = foto.estantes.filter((e) => !partesDeEstante(e.estante)).sort((a, b) => cmpSku(a.estante, b.estante))
  const estantesDe = (codigo: string) => Array.from({ length: DEPOSITO.niveles }, (_, i) => porNombre.get(`${codigo}${'ABCDEFGHIJ'[i]}`))
  const elegido = estante ? porNombre.get(estante) : undefined

  const tramos = Math.max(...DEPOSITO.paredes.map((p) => p.modulos))
  const W = 220
  const largo = 64
  const H = 46 + tramos * largo + 12

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por SKU o nombre: RBT-0137, remera…" style={{ maxWidth: 420 }} />
      {!foto.estantes.length && <EmptyState title="Todavía no hay estantes cargados" hint="El mapa ya está: se va llenando a medida que se escanea cada estante con sus bolsas." />}

      <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 260, display: 'block' }} role="img" aria-label="El depósito visto desde arriba">
          <rect x={6} y={30} width={W - 12} height={H - 36} rx={6} style={{ fill: color.surface, stroke: color.line2 }} strokeWidth={2} />
          {/* La puerta, al salón */}
          <line x1={W / 2 - 26} y1={30} x2={W / 2 + 26} y2={30} style={{ stroke: color.surface }} strokeWidth={4} />
          <line x1={W / 2 - 26} y1={30} x2={W / 2 + 26} y2={30} style={{ stroke: color.brand }} strokeWidth={2} strokeDasharray="4 3" />
          <text x={W / 2} y={20} textAnchor="middle" style={{ fontSize: 11, fill: color.mut, fontFamily: 'inherit' }}>PUERTA · al salón</text>
          <text x={W / 2} y={H / 2 + 20} textAnchor="middle" style={{ fontSize: 10, fill: color.mut2, fontFamily: 'inherit', letterSpacing: 2 }}>PASILLO</text>
          {DEPOSITO.paredes.flatMap((p) =>
            Array.from({ length: p.modulos }, (_, i) => {
              const codigo = `${p.lado}${i + 1}`
              const t = tramo(p.lado, i + 1, p.modulos, tramos)
              const y = 40 + t * largo
              const x = p.lado === 'I' ? 14 : W - 14 - 60
              const ests = estantesDe(codigo)
              const cargados = ests.filter(Boolean).length
              const prende = ests.some(coincide)
              const sel = modulo === codigo
              return (
                <g key={codigo} onClick={() => { setModulo(codigo); setEstante(null) }} style={{ cursor: 'pointer' }}>
                  <rect
                    x={x} y={y} width={60} height={largo - 6} rx={4}
                    style={{ fill: prende ? color.brandBg : cargados ? color.successBg : color.bg2, stroke: sel || prende ? color.brand : cargados ? color.successBorder : color.line2 }}
                    strokeWidth={sel ? 3 : prende ? 2 : 1.5}
                  />
                  <text x={x + 30} y={y + 25} textAnchor="middle" style={{ fontSize: 15, fontWeight: 700, fill: color.ink2, fontFamily: 'inherit' }}>{codigo}</text>
                  <text x={x + 30} y={y + 42} textAnchor="middle" style={{ fontSize: 10, fill: color.mut, fontFamily: 'inherit' }}>{cargados}/{DEPOSITO.niveles} cargados</text>
                </g>
              )
            }),
          )}
        </svg>

        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          {modulo ? (
            <SectionCard title={`Módulo ${modulo}`} subtitle="De frente: arriba el F, abajo el A (el del piso).">
              <div style={{ display: 'grid', gap: 4 }}>
                {estantesDe(modulo)
                  .map((e, i) => ({ e, nombre: `${modulo}${'ABCDEFGHIJ'[i]}` }))
                  .reverse()
                  .map(({ e, nombre }) => {
                    const viejo = e?.escaneadoEn ? (ahora - Date.parse(e.escaneadoEn)) / 86400000 > DIAS_ESTANTE_VIEJO : false
                    const prende = coincide(e)
                    const sel = estante === nombre
                    return (
                      <button
                        key={nombre}
                        type="button"
                        onClick={() => setEstante(nombre)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: space[2], height: 'auto', padding: `${space[2]}px ${space[3]}px`, borderRadius: 6, cursor: 'pointer', textAlign: 'left', font: 'inherit',
                          background: prende ? color.brandBg : !e ? color.bg2 : viejo ? color.warningBg : color.surface,
                          border: `${sel ? 2 : 1}px ${e ? 'solid' : 'dashed'} ${sel || prende ? color.brand : viejo ? color.warningBorder : color.line2}`,
                        }}
                      >
                        <b style={{ minWidth: 44 }}>{nombre}</b>
                        <span style={{ flex: 1, fontSize: font.sm, color: color.mut }}>
                          {e ? `${e.productos.length} productos${viejo ? ' · hace más de una semana' : ''}` : 'sin escanear'}
                        </span>
                      </button>
                    )
                  })}
              </div>
            </SectionCard>
          ) : (
            <Notice tone="neutral">Tocá un módulo para ver sus estantes.</Notice>
          )}
        </div>
      </div>

      {estante && (
        <SectionCard
          title={`Estante ${estante}`}
          subtitle={
            elegido
              ? `${elegido.productos.length} productos · ${elegido.escaneadoEn ? `escaneado ${haceCuanto(elegido.escaneadoEn, ahora)}` : 'sin escanear'}${elegido.escaneadoPor ? ` por ${elegido.escaneadoPor}` : ''}`
              : 'Todavía no se escaneó.'
          }
        >
          {elegido?.productos.length ? (
            elegido.productos.map((p) => (
              <div key={p.clave} style={{ display: 'flex', gap: space[3], padding: `${space[1]}px 0`, borderBottom: `1px solid ${color.line}`, fontWeight: coincide({ ...elegido, productos: [p] }) ? 700 : undefined }}>
                <b style={{ minWidth: 110 }}>{p.clave}</b>
                <span style={{ flex: 1, color: color.mut }}>{nombreDe(p.clave, p.nombre)}</span>
                <span>{p.bolsas} {p.bolsas === 1 ? 'bolsa' : 'bolsas'}</span>
              </div>
            ))
          ) : (
            <span style={{ color: color.mut }}>{elegido ? 'Vacío.' : 'Escaneá la etiqueta del estante y todas sus bolsas.'}</span>
          )}
        </SectionCard>
      )}

      {fuera.length > 0 && (
        <SectionCard title={`Fuera del mapa (${fuera.length})`} subtitle="Estantes cargados con un nombre que no es lado + módulo + estante (como D3C). Conviene volver a escanearlos con su etiqueta nueva.">
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            {fuera.map((e) => (
              <button
                key={e.estante}
                type="button"
                onClick={() => { setModulo(null); setEstante(e.estante) }}
                style={{ height: 'auto', padding: `${space[1]}px ${space[3]}px`, borderRadius: 6, cursor: 'pointer', font: 'inherit', background: coincide(e) ? color.brandBg : color.surface, border: `1px solid ${coincide(e) ? color.brand : color.line2}` }}
              >
                <b>{e.estante}</b> <span style={{ color: color.mut, fontSize: font.sm }}>· {e.productos.length}</span>
              </button>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
