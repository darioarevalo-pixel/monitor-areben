'use client'

import { useCallback, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { Badge, Button, Card, Notice, Plegable, TBody, THead, TableWrap, Td, Th, Tr, color, font, space } from '@/components/ui'

/**
 * Con qué llaves entra el SERVIDOR a cada base de Supabase.
 *
 * **Por qué está acá y no en Integraciones.** Integraciones es el sync con tiendas de afuera; esto
 * es de adentro y es admin puro, igual que el resto de esta pantalla — que ya corta a los que no lo
 * son antes de renderizar. Y plegado, porque no se mira todos los días: se mira antes de aplicar
 * RLS y después de rotar una clave.
 *
 * ⛔ **No trae ninguna clave.** El endpoint devuelve sólo si la variable está, qué rol dice ser y
 * contra qué proyecto apunta. El detalle de por qué, en `lib/credenciales.core.js`.
 */

type Variable = {
  nombre: string
  presente: boolean
  rol: 'anon' | 'service_role' | 'ilegible' | null
  esperado: 'anon' | 'service_role'
  ref: string | null
  refCoincide: boolean | null
  ok: boolean
}
type MarcaCred = {
  marca: string
  nombre: string
  url: { nombre: string; presente: boolean; ref: string | null }
  anon: Variable
  servicio: Variable
  efectivo: 'anon' | 'service_role' | 'ilegible' | null
  listoParaRls: boolean
}
type Diagnostico = { marcas: MarcaCred[]; listoParaRls: boolean }

/** Qué mostrar en la columna "estado" de una variable, en palabras y no en banderas. */
function estado(v: Variable): { tono: 'success' | 'danger' | 'warning'; texto: string } {
  if (!v.presente) return { tono: 'danger', texto: 'no está' }
  if (v.rol === 'ilegible') return { tono: 'warning', texto: 'no se entiende' }
  if (v.rol !== v.esperado) return { tono: 'danger', texto: `es ${v.rol}, se esperaba ${v.esperado}` }
  if (v.refCoincide === false) return { tono: 'danger', texto: `es de otro proyecto (${v.ref})` }
  return { tono: 'success', texto: v.esperado }
}

export function Credenciales() {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState<Diagnostico | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const traer = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const r = await apiFetch('/api/datos?recurso=sistema&vista=credenciales')
      const d = await r.json()
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setDatos(d.credenciales)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }, [])

  // Se pide recién al abrir, y desde el propio gesto de abrir — no desde un efecto: abrir es un
  // evento del usuario, no una sincronización con nada de afuera.
  const alternar = () => {
    const yendoAAbrir = !abierto
    setAbierto(yendoAAbrir)
    if (yendoAAbrir && !datos && !cargando) void traer()
  }

  return (
    <Card style={{ padding: `0 ${space[4]}px ${space[3]}px`, marginTop: space[3] }}>
      <Plegable
        abierto={abierto}
        onToggle={alternar}
        titulo="Credenciales del servidor"
        ayuda="Con qué llave entra el Monitor a cada base. Se mira antes de cerrar una base con RLS y después de rotar una clave. No muestra ninguna clave."
      >
        {error && (
          <Notice tone="danger" style={{ marginBottom: space[3] }}>
            No se pudo leer: {error}
          </Notice>
        )}

        {!datos ? (
          <div style={{ color: color.mut2, fontSize: font.sm, padding: space[3] }}>{cargando ? 'Preguntando al servidor…' : '—'}</div>
        ) : (
          <>
            {datos.marcas.map((m) => (
              <div key={m.marca} style={{ marginBottom: space[4] }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
                  <b>{m.nombre}</b>
                  <Badge tone={m.listoParaRls ? 'success' : 'danger'}>
                    {m.listoParaRls ? 'escribe como servicio' : m.efectivo === 'anon' ? 'escribe como anónimo' : 'sin credenciales'}
                  </Badge>
                </div>
                <TableWrap>
                  <THead>
                    <Tr>
                      <Th>Variable</Th>
                      <Th>Estado</Th>
                      <Th>Proyecto</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {[m.anon, m.servicio].map((v) => {
                      const e = estado(v)
                      return (
                        <Tr key={v.nombre}>
                          <Td style={{ fontFamily: 'ui-monospace, monospace', fontSize: font.sm }}>{v.nombre}</Td>
                          <Td>
                            <Badge tone={e.tono} subtle>
                              {e.texto}
                            </Badge>
                          </Td>
                          <Td style={{ color: color.mut2, fontSize: font.sm }}>{v.ref || '—'}</Td>
                        </Tr>
                      )
                    })}
                    <Tr>
                      <Td style={{ fontFamily: 'ui-monospace, monospace', fontSize: font.sm }}>{m.url.nombre}</Td>
                      <Td>
                        <Badge tone={m.url.presente ? 'success' : 'danger'} subtle>
                          {m.url.presente ? 'está' : 'no está'}
                        </Badge>
                      </Td>
                      <Td style={{ color: color.mut2, fontSize: font.sm }}>{m.url.ref || '—'}</Td>
                    </Tr>
                  </TBody>
                </TableWrap>
              </div>
            ))}

            {/* El "y entonces qué": sin esto la tabla es trivia. Lo que decide es `efectivo`. */}
            <Notice tone={datos.listoParaRls ? 'success' : 'warning'}>
              {datos.listoParaRls ? (
                <>
                  Las dos marcas escriben con clave <b>de servicio</b>. Cerrarles la base con RLS no las deja sin guardar.
                </>
              ) : (
                <>
                  Alguna marca escribe hoy con la clave <b>anónima</b> (los handlers hacen <code>SERVICE_KEY || KEY</code>, así que
                  la falta no se nota mientras no haya RLS). <b>Cerrarle la base a esa marca la deja sin poder guardar nada.</b>{' '}
                  Hay que cargarle la clave de servicio en Vercel antes de correr <code>scripts/apply-rls.mjs</code>.
                </>
              )}
            </Notice>

            <div style={{ marginTop: space[3] }}>
              <Button variant="ghost" onClick={() => void traer()} loading={cargando}>
                Volver a preguntar
              </Button>
            </div>
          </>
        )}
      </Plegable>
    </Card>
  )
}
