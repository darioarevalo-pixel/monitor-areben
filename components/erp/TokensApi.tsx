'use client'

/**
 * ERP › Configuración › Tokens de la API (estándar de Ger B.13): quién consulta el ERP desde afuera. Lista, token nuevo con resumen de lo que
 * puede y no puede hacer, editar, regenerar, revocar, probar y actividad. Núcleo `lib/erp/tokens.core.js`, servidor `api/_erp-tokens.js`.
 * 🔴 El token se ve UNA vez y vive sólo en el estado de la ventana: al cerrarla, se va.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState, Field, Input, Modal, Notice, Select, color, font, space, useConfirmar, weight } from '@/components/ui'
import { ListaTrabajo, type ColumnaLista } from '@/components/ui/ListaTrabajo'
import { ChipEstado } from '@/components/ui/PiezasLista'
import {
  crearTokenApi, editarTokenApi, leerActividadToken, leerTokens, probarTokenApi, regenerarTokenApi, revocarTokenApi,
  type CatalogoTokens, type ConsultaToken, type PruebaToken, type TokenApi,
} from '@/lib/erp/cliente'
import { errorDeAlta, errorDeEdicion, ESTADOS_TOKEN, estadoToken, resumenDePermisos, vencePorDefecto } from '@/lib/erp/tokens.core.js'

const ESTADOS = ESTADOS_TOKEN as unknown as Record<string, readonly ['success' | 'warning' | 'danger' | 'neutral', string]>
const fecha = (x: string | null) => (x ? new Date(x).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—')
const fechaHora = (x: string | null) => (x ? new Date(x).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Nunca')
/** El día guardado, para la casilla de fecha. */
const dia = (x: string | null) => (x ? new Date(new Date(x).getTime() - 3 * 3600e3).toISOString().slice(0, 10) : '')
const mensaje = (e: unknown, fallo: string) => (e instanceof Error ? e.message : fallo)
const lista: React.CSSProperties = { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }
const nota: React.CSSProperties = { margin: 0, color: color.mut, fontSize: font.sm }

function ElegirPermisos({ catalogo, valor, onCambio }: { catalogo: CatalogoTokens['permisos']; valor: string[]; onCambio: (v: string[]) => void }) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <legend style={{ fontWeight: weight.bold, color: color.ink, marginBottom: 6 }}>Permisos</legend>
      {Object.entries(catalogo).map(([p, c]) => (
        <label key={p} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={valor.includes(p)} onChange={(e) => onCambio(e.target.checked ? [...valor, p] : valor.filter((x) => x !== p))} />
          <span>{c.explica}</span>
        </label>
      ))}
    </fieldset>
  )
}

/** El token, la única vez. */
function TokenUnaVez({ token, prefijo, onCerrar }: { token: string; prefijo: string; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => { await navigator.clipboard?.writeText(token); setCopiado(true) }
  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Token ${prefijo}…`} cerrarConFondo={false} pie={<Button variant="outline" onClick={onCerrar}>Ya lo guardé</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Notice tone="warning">Se ve una sola vez. Guardalo en Bitwarden y pasalo por ahí: nunca por mail, WhatsApp ni chat.</Notice>
        <code data-testid="token-una-vez" style={{ wordBreak: 'break-all', padding: 12, background: color.bg2, borderRadius: 8, fontSize: font.sm }}>{token}</code>
        <div><Button onClick={copiar}>{copiado ? 'Copiado' : 'Copiar'}</Button></div>
      </div>
    </Modal>
  )
}

function NuevoToken({ cat, onCerrar, onHecho }: { cat: CatalogoTokens; onCerrar: () => void; onHecho: (t: { token: string; key_prefix: string }) => void }) {
  const negocios = Object.keys(cat.negocios)
  const [d, setD] = useState({ negocio: negocios[0] ?? '', app: '', dueno: '', permisos: [] as string[], vence: vencePorDefecto() })
  const [resumen, setResumen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const r = resumenDePermisos(d.permisos, cat.permisos, cat.nunca)
  const seguir = () => {
    const e = errorDeAlta(d, { catalogo: cat.permisos, negocios: cat.negocios })
    setError(e)
    if (!e) setResumen(true)
  }
  const confirmar = async () => {
    setGuardando(true)
    try { onHecho(await crearTokenApi(d)) } catch (e) { setError(mensaje(e, 'No se pudo crear el token.')); setGuardando(false) }
  }
  return (
    <Modal abierto onCerrar={onCerrar} titulo={resumen ? 'Antes de crearlo' : 'Nuevo token'} cerrarConFondo={false} pie={resumen
      ? <><Button variant="outline" onClick={() => setResumen(false)}>Volver</Button><Button onClick={confirmar} disabled={guardando}>Crear token</Button></>
      : <><Button variant="outline" onClick={onCerrar}>Cancelar</Button><Button onClick={seguir}>Seguir</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
        {resumen ? (
          <>
            <p style={{ margin: 0 }}><b>{d.app}</b> · {cat.negocios[d.negocio]} · a nombre de <b>{d.dueno}</b> · vence el {d.vence.split('-').reverse().join('/')}</p>
            <div><b>Qué puede hacer</b><ul style={lista}>{r.puede.map((p) => <li key={p.permiso}>{p.explica}</li>)}</ul></div>
            <div><b>Qué datos salen</b><ul style={lista}>{r.puede.map((p) => <li key={p.permiso}>{p.datos}</li>)}</ul></div>
            <div><b>Qué no puede hacer nunca</b><ul style={lista}>{r.nunca.map((n) => <li key={n}>{n}</li>)}</ul></div>
          </>
        ) : (
          <>
            <Field label="Nombre de la app" required><Input value={d.app} onChange={(e) => setD({ ...d, app: e.target.value })} placeholder="Logística" /></Field>
            <Field label="Negocio" required>
              <Select value={d.negocio} onChange={(e) => setD({ ...d, negocio: e.target.value })}>{negocios.map((n) => <option key={n} value={n}>{cat.negocios[n]}</option>)}</Select>
            </Field>
            <Field label="A nombre de quién queda" required><Input value={d.dueno} onChange={(e) => setD({ ...d, dueno: e.target.value })} placeholder="Administración" /></Field>
            <ElegirPermisos catalogo={cat.permisos} valor={d.permisos} onCambio={(permisos) => setD({ ...d, permisos })} />
            <Field label="Vence" required><Input type="date" value={d.vence} onChange={(e) => setD({ ...d, vence: e.target.value })} /></Field>
          </>
        )}
      </div>
    </Modal>
  )
}

function EditarToken({ t, cat, onCerrar, onHecho }: { t: TokenApi; cat: CatalogoTokens; onCerrar: () => void; onHecho: () => void }) {
  const [permisos, setPermisos] = useState(t.permisos)
  const [vence, setVence] = useState(dia(t.vence_en))
  const [error, setError] = useState<string | null>(null)
  const guardar = async () => {
    const e = errorDeEdicion({ permisos, vence }, { catalogo: cat.permisos })
    if (e) { setError(e); return }
    try { await editarTokenApi(t.id, { permisos, vence }); onHecho() } catch (x) { setError(mensaje(x, 'No se pudo guardar.')) }
  }
  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Editar ${t.app} · ${t.key_prefix}…`} pie={<><Button variant="outline" onClick={onCerrar}>Cancelar</Button><Button onClick={guardar}>Guardar</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
        <p style={nota}>El token sigue siendo el mismo: quien lo tiene no tiene que cambiar nada.</p>
        <ElegirPermisos catalogo={cat.permisos} valor={permisos} onCambio={setPermisos} />
        <Field label="Vence" required><Input type="date" value={vence} onChange={(e) => setVence(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function ProbarToken({ onCerrar }: { onCerrar: () => void }) {
  const [token, setToken] = useState('')
  const [r, setR] = useState<PruebaToken | null>(null)
  const [error, setError] = useState<string | null>(null)
  const probar = async () => {
    setError(null); setR(null)
    try { setR(await probarTokenApi(token)) } catch (e) { setError(mensaje(e, 'No se pudo probar.')) }
  }
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Probar un token" pie={<><Button variant="outline" onClick={onCerrar}>Cerrar</Button><Button onClick={probar} disabled={!token.trim()}>Probar</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="Token"><Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="erk_…" /></Field>
        {error && <Notice tone="danger">{error}</Notice>}
        {r?.ok && r.token && <Notice tone="success">Funciona: {r.token.app} · {r.token.negocio} · a nombre de {r.token.dueno} · vence el {fecha(r.token.vence_en)}.</Notice>}
        {r && !r.ok && <Notice tone="danger">{r.detalle}{r.token ? ` (${r.token.app} · ${r.token.key_prefix}…)` : ''}</Notice>}
      </div>
    </Modal>
  )
}

function Actividad({ t, onCerrar }: { t: TokenApi; onCerrar: () => void }) {
  const [filas, setFilas] = useState<ConsultaToken[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { leerActividadToken(t.id).then((r) => setFilas(r.consultas), (e) => setError(mensaje(e, 'No se pudo leer la actividad.'))) }, [t.id])
  return (
    <Modal abierto ancho="ancho" onCerrar={onCerrar} titulo={`Actividad de ${t.app} · ${t.key_prefix}…`} pie={<Button variant="outline" onClick={onCerrar}>Cerrar</Button>}>
      {error && <Notice tone="danger">{error}</Notice>}
      {!error && !filas && <p style={nota}>Leyendo…</p>}
      {filas && !filas.length && <EmptyState title="Este token todavía no consultó nada." />}
      {filas && filas.length > 0 && (
        <table style={{ width: '100%', fontSize: font.sm }}>
          <thead><tr><th align="left">Cuándo</th><th align="left">Qué pidió</th><th align="right">Respuesta</th><th align="right">Filas</th><th align="left">Desde</th></tr></thead>
          <tbody>{filas.map((f, i) => (
            <tr key={i}><td>{fechaHora(f.en)}</td><td>{f.metodo} {f.molde}</td><td align="right">{f.status}{f.code ? ` ${f.code}` : ''}</td><td align="right">{f.cantidad ?? '—'}</td><td>{f.ip ?? '—'}</td></tr>
          ))}</tbody>
        </table>
      )}
      <p style={{ ...nota, marginTop: 8 }}>Las últimas 50 consultas; se guardan 30 días.</p>
    </Modal>
  )
}

type Ventana = { tipo: 'nuevo' | 'probar' } | { tipo: 'editar' | 'actividad'; t: TokenApi } | { tipo: 'entregado'; token: string; prefijo: string } | null

export function TokensApi() {
  const [cat, setCat] = useState<CatalogoTokens | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ventana, setVentana] = useState<Ventana>(null)
  const { confirmar } = useConfirmar()
  const leer = useCallback(() => leerTokens().then(setCat, (e) => setError(mensaje(e, 'No se pudieron leer los tokens.'))), [])
  useEffect(() => { void leer() }, [leer])

  const regenerar = async (t: TokenApi) => {
    const ok = await confirmar({ titulo: `Regenerar ${t.app}`, mensaje: 'El token de ahora deja de funcionar en el acto. Quien lo usa tiene que cambiarlo por el nuevo.', ok: 'Regenerar', tono: 'danger' })
    if (!ok) return
    try { const r = await regenerarTokenApi(t.id); setVentana({ tipo: 'entregado', token: r.token, prefijo: r.key_prefix }); void leer() } catch (e) { setError(mensaje(e, 'No se pudo regenerar.')) }
  }
  const revocar = async (t: TokenApi) => {
    const ok = await confirmar({ titulo: `Revocar ${t.app}`, mensaje: 'Deja de funcionar para siempre. Para volver a darle acceso hay que crear otro.', ok: 'Revocar', tono: 'danger' })
    if (!ok) return
    try { await revocarTokenApi(t.id); void leer() } catch (e) { setError(mensaje(e, 'No se pudo revocar.')) }
  }

  const columnas: ColumnaLista[] = [
    { key: 'acciones', titulo: '', ancho: '300px', movil: 'oculta' },
    { key: 'app', titulo: 'App', ancho: 'minmax(170px, 1fr)', movil: 'titulo' },
    { key: 'negocio', titulo: 'Negocio', ancho: '120px', movil: 'chico' },
    { key: 'dueno', titulo: 'A nombre de', ancho: '140px', movil: 'oculta' },
    { key: 'permisos', titulo: 'Permisos', ancho: '80px', movil: 'oculta' },
    { key: 'vence', titulo: 'Vence', ancho: '100px', movil: 'chico' },
    { key: 'uso', titulo: 'Último uso', ancho: '120px', movil: 'oculta' },
    { key: 'estado', titulo: 'Estado', ancho: '140px', movil: 'chico' },
  ]
  const celda = (t: TokenApi, k: string): React.ReactNode => {
    if (k === 'acciones') {
      const vivo = !t.revocado_en
      return (
        <span style={{ display: 'flex', gap: 4 }}>
          {vivo && <Button size="sm" variant="outline" onClick={() => setVentana({ tipo: 'editar', t })}>Editar</Button>}
          {vivo && <Button size="sm" variant="outline" onClick={() => regenerar(t)}>Regenerar</Button>}
          {vivo && <Button size="sm" variant="outline" onClick={() => revocar(t)}>Revocar</Button>}
          <Button size="sm" variant="outline" onClick={() => setVentana({ tipo: 'actividad', t })}>Actividad</Button>
        </span>
      )
    }
    if (k === 'app') return <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><b style={{ color: color.ink }}>{t.app}</b><span style={{ color: color.mut, fontSize: font.sm }}>{t.key_prefix}…</span></span>
    if (k === 'negocio') return cat?.negocios[t.negocio] ?? t.negocio
    if (k === 'dueno') return t.dueno
    if (k === 'permisos') return <span title={t.permisos.map((p) => cat?.permisos[p]?.explica ?? p).join('\n')}>{t.permisos.length}</span>
    if (k === 'vence') return fecha(t.vence_en)
    if (k === 'uso') return fechaHora(t.ultimo_uso_en)
    if (k === 'estado') return <ChipEstado mapa={ESTADOS} k={estadoToken(t)} />
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <p style={{ margin: 0, color: color.mut }}>Quién consulta el ERP desde afuera. Un token es de un solo negocio y actúa a nombre de una persona.</p>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <div style={{ display: 'flex', gap: space[2] }}>
        <Button onClick={() => setVentana({ tipo: 'nuevo' })} disabled={!cat}>Nuevo token</Button>
        <Button variant="outline" onClick={() => setVentana({ tipo: 'probar' })}>Probar un token</Button>
      </div>
      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <ListaTrabajo
          columnas={columnas} filas={cat?.tokens ?? []} claveDe={(t: TokenApi) => String(t.id)} celda={celda} etiquetaFila={(t: TokenApi) => `el token de ${t.app}`}
          vacio={cat ? <div style={{ padding: space[6] }}><EmptyState title="Todavía no hay tokens." /></div> : null}
        />
      </div>
      {ventana?.tipo === 'nuevo' && cat && <NuevoToken cat={cat} onCerrar={() => setVentana(null)} onHecho={(t) => { setVentana({ tipo: 'entregado', token: t.token, prefijo: t.key_prefix }); void leer() }} />}
      {ventana?.tipo === 'editar' && cat && <EditarToken t={ventana.t} cat={cat} onCerrar={() => setVentana(null)} onHecho={() => { setVentana(null); void leer() }} />}
      {ventana?.tipo === 'probar' && <ProbarToken onCerrar={() => setVentana(null)} />}
      {ventana?.tipo === 'actividad' && <Actividad t={ventana.t} onCerrar={() => setVentana(null)} />}
      {ventana?.tipo === 'entregado' && <TokenUnaVez token={ventana.token} prefijo={ventana.prefijo} onCerrar={() => setVentana(null)} />}
    </div>
  )
}
