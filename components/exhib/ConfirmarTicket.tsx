'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Button, Notice, color, font, space, useConfirmar, useToast, weight } from '@/components/ui'
import { coincidencias } from '@/lib/exhib/core'
import { nombrePropio } from '@/lib/exhib/aviso'
import { guardarConfirmacion } from '@/lib/exhib/cliente'
import { anotar, juntarMarcas, resolverEscaneo, resumenConfirmacion, type Confirmacion, type RenglonTicket } from '@/lib/exhib/confirmacion'
import type { Cobertura, RecorridoLibre } from '@/lib/exhib/libre'
import type { ExhibItem } from '@/lib/exhib/tipos'
import { avisar, prepararSonido } from '@/lib/sonido'

/**
 * **Exhibir y retirar con el lector** (Darío, 17-oct-2026): con el ticket impreso en la mano, la
 * empleada pasa por el lector cada prenda al exhibirla y cada duplicada al retirarla. Es el paso
 * de después de la búsqueda, y la prueba para los dueños: al terminar les llega qué se hizo y qué ⛔.
 * La cuenta vive en `lib/exhib/confirmacion.ts`; se guarda en el primer recorrido del día.
 *
 * 🔊 Lo que se oye: el nombre propio («ivory») = anotada; «ya está» = ya se había pasado; «no está
 * en el ticket» = esa prenda ⛔ hay que exhibirla ni retirarla; «no leído» = pasala de nuevo.
 * 🔑 Las marcas quedan también en el teléfono hasta que el servidor las tiene: el local se queda sin
 * señal, y una prenda pasada que ⛔ figura es justo lo que esto viene a evitar.
 */

/** El rebote del lector (dos Enter de la misma lectura): ⛔ se contesta, para ⛔ cortar el nombre. */
const REBOTE_MS = 800
const EN_AR = { timeZone: 'America/Argentina/Buenos_Aires' } as const
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { ...EN_AR, hour: '2-digit', minute: '2-digit' })

type Marcas = Pick<Confirmacion, 'exhibidos' | 'retirados'>
const claveLocal = (id: string) => `monitor_exhib_conf_${id}`
function leerLocal(id: string): Marcas | null {
  try {
    const v = JSON.parse(localStorage.getItem(claveLocal(id)) || 'null')
    return v && typeof v === 'object' ? { exhibidos: v.exhibidos || {}, retirados: v.retirados || {} } : null
  } catch {
    return null
  }
}
function guardarLocal(id: string, m: Marcas) {
  try {
    localStorage.setItem(claveLocal(id), JSON.stringify(m))
  } catch {
    /* sin el respaldo del teléfono */
  }
}

type Fb = { tipo: 'exhibido' | 'retirado' | 'ya' | 'fuera' | 'no'; texto: string }

export function ConfirmarTicket({ marca, recorrido, buscables, onCobertura }: { marca: string; recorrido: RecorridoLibre; buscables: ExhibItem[]; onCobertura: (id: string, c: Cobertura) => void }) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const delServidor = recorrido.cobertura?.confirmacion ?? null
  /** Las marcas de ESTE teléfono (con el respaldo del `localStorage`): las del servidor pueden venir atrasadas. */
  const [propias, setPropias] = useState<Marcas>(() => leerLocal(recorrido.id) ?? { exhibidos: {}, retirados: {} })
  const [activo, setActivo] = useState(false)
  const [fb, setFb] = useState<Fb | null>(null)
  const [sinSubir, setSinSubir] = useState(false)
  const [terminando, setTerminando] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const ultima = useRef<{ codigo: string; ms: number }>({ codigo: '', ms: 0 })

  // Lo del servidor + lo que el teléfono todavía ⛔ pudo subir. Un ticket reimpreso trae lista nueva,
  // y de las marcas quedan sólo las que siguen en ella.
  const conf = useMemo<Confirmacion | null>(() => {
    if (!delServidor) return null
    const enLista = (m: Record<string, string>, l: RenglonTicket[]) => Object.fromEntries(Object.entries(m).filter(([k]) => l.some((r) => r.clave === k)))
    return {
      ...delServidor,
      exhibidos: enLista(juntarMarcas(delServidor.exhibidos, propias.exhibidos), delServidor.lista.pendientes),
      retirados: enLista(juntarMarcas(delServidor.retirados, propias.retirados), delServidor.lista.duplicadas),
    }
  }, [delServidor, propias])

  /**
   * Sube el estado ENTERO del teléfono, de a un envío por vez: si llega otro escaneo mientras sube,
   * se manda otra vez al terminar (con todo lo nuevo). Ver la acción `confirmacion` de `api/_exhib.js`.
   */
  const subiendo = useRef(false)
  const otraVez = useRef<Marcas | null>(null)
  const subir = useCallback(
    async (m: Marcas) => {
      if (subiendo.current) {
        otraVez.current = m
        return
      }
      subiendo.current = true
      try {
        const c = await guardarConfirmacion(marca, recorrido.id, m)
        onCobertura(recorrido.id, c)
        setSinSubir(false)
      } catch {
        setSinSubir(true)
      } finally {
        subiendo.current = false
        const sig = otraVez.current
        otraVez.current = null
        if (sig) void subir(sig)
      }
    },
    [marca, recorrido.id, onCobertura],
  )

  if (!conf) {
    return <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[4] }}>Cuando se imprima el ticket, acá se escanea lo exhibido y lo retirado.</div>
  }
  const res = resumenConfirmacion(conf)

  function escanear(codigo: string) {
    const c = codigo.trim()
    if (!c || !conf) return
    const ahora = Date.now()
    if (c === ultima.current.codigo && ahora - ultima.current.ms < REBOTE_MS) return
    ultima.current = { codigo: c, ms: ahora }
    const exactas = coincidencias(buscables, c)
    if (exactas.length !== 1) {
      avisar('no', 'no leído')
      setFb({ tipo: 'no', texto: `NO LEYÓ «${c}» — pasala de nuevo` })
      return
    }
    const it = exactas[0]
    const r = resolverEscaneo(conf, it)
    if (r.que === 'exhibido' || r.que === 'retirado') {
      const nuevo = anotar(conf, r, new Date().toISOString())
      const m = { exhibidos: nuevo.exhibidos, retirados: nuevo.retirados }
      setPropias(m)
      guardarLocal(recorrido.id, m)
      void subir(m)
      avisar('ok', nombrePropio(it.name))
      setFb({ tipo: r.que, texto: `${r.que === 'exhibido' ? 'Exhibido' : 'Retirado'}: ${it.name}${it.size && it.size !== 'Variante Única' ? ` ${it.size}` : ''}` })
    } else if (r.que === 'ya') {
      avisar('suma', 'ya está')
      setFb({ tipo: 'ya', texto: `Ya estaba ${r.lista === 'exhibidos' ? 'exhibido' : 'retirado'}: ${it.name}` })
    } else {
      avisar('no', 'no está en el ticket')
      setFb({ tipo: 'fuera', texto: `No está en el ticket: ${it.name}${it.size && it.size !== 'Variante Única' ? ` ${it.size}` : ''}` })
    }
  }

  async function terminar() {
    if (!conf) return
    const faltan = res.sinExhibir.length + res.sinRetirar.length
    if (faltan) {
      const ok = await confirmar({
        titulo: '¿Terminar?',
        tono: 'warning',
        ok: 'Terminar',
        mensaje: `Quedan ${res.sinExhibir.length} sin exhibir y ${res.sinRetirar.length} sin retirar. Van así en el correo.`,
      })
      if (!ok) return
    }
    setTerminando(true)
    try {
      const c = await guardarConfirmacion(marca, recorrido.id, { exhibidos: conf.exhibidos, retirados: conf.retirados, terminar: true })
      onCobertura(recorrido.id, c)
      setSinSubir(false)
      setActivo(false)
      setFb(null)
      if (c.confirmacion?.correo?.enviado_en) toast.ok('Listo. Se avisó por correo.')
      else toast.aviso('Quedó guardado, pero el correo no salió.')
    } catch (e) {
      toast.error('No se pudo terminar: ' + (e as Error).message + '. Probá de nuevo cuando haya señal.')
    } finally {
      setTerminando(false)
    }
  }

  const tonoFb = fb?.tipo === 'exhibido' || fb?.tipo === 'retirado' ? 'success' : fb?.tipo === 'ya' ? 'neutral' : 'danger'

  return (
    <div style={{ marginBottom: space[4], padding: space[3], border: `1px solid ${color.line}`, borderRadius: 10 }}>
      <div style={{ fontWeight: weight.bold, fontSize: font.md, color: color.ink }}>Exhibir y retirar con el lector</div>
      <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>
        Exhibidos <b style={{ color: color.ink }}>{res.exhibidos} de {res.pendientes}</b> · Retirados <b style={{ color: color.ink }}>{res.retirados} de {res.duplicadas}</b>
        {conf.terminado_en && <> · terminado {hora(conf.terminado_en)}</>}
        {sinSubir && <b style={{ color: color.warning }}> · sin subir (falta señal)</b>}
      </div>

      {!activo ? (
        <div style={{ marginTop: space[3] }}>
          <Button
            size="lg"
            variant={conf.terminado_en ? 'outline' : 'solid'}
            tone="brand"
            fullWidth
            onClick={() => {
              prepararSonido()
              avisar('ok', 'listo')
              setActivo(true)
              setTimeout(() => scanRef.current?.focus(), 150)
            }}
          >
            {conf.terminado_en ? 'Seguir escaneando' : res.exhibidos + res.retirados ? 'Retomar' : 'Empezar'}
          </Button>
        </div>
      ) : (
        <>
          <input
            ref={scanRef}
            className="mo-input"
            type="text"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                escanear((e.target as HTMLInputElement).value)
                ;(e.target as HTMLInputElement).value = ''
              }
            }}
            placeholder="código de barras"
            aria-label="Código de barras"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{ display: 'block', width: '100%', maxWidth: 320, margin: `${space[3]}px 0`, height: 46, fontSize: 17, textAlign: 'center', borderWidth: 2, borderColor: color.brandSolid }}
          />
          {fb && (
            <Notice tone={tonoFb} style={{ marginBottom: space[3] }}>
              <b>{fb.texto}</b>
            </Notice>
          )}
          <Button variant="solid" tone="brand" onClick={() => void terminar()} loading={terminando}>
            Terminar
          </Button>
        </>
      )}

      {/* Lo que queda, plegado: se mira cuando se quiere, ⛔ se rearma a la vista con cada lectura. */}
      <Falta titulo="Falta exhibir" lista={res.sinExhibir} />
      <Falta titulo="Falta retirar" lista={res.sinRetirar} />
    </div>
  )
}

function Falta({ titulo, lista }: { titulo: string; lista: RenglonTicket[] }) {
  if (!lista.length) return null
  return (
    <details style={{ marginTop: space[2] }}>
      <summary style={{ cursor: 'pointer', fontSize: font.sm, fontWeight: weight.bold, color: color.ink, padding: `${space[1]}px 0` }}>
        {titulo} ({lista.length})
      </summary>
      <div style={{ fontSize: font.sm, color: color.ink }}>
        {lista.map((r) => (
          <div key={r.clave} style={{ padding: '3px 0', borderTop: `1px solid ${color.line}` }}>
            <b>{r.sku || '—'}</b> {r.nombre}
            {r.variante && r.variante !== 'Variante Única' ? <span style={{ color: color.mut }}> · {r.variante}</span> : null}
          </div>
        ))}
      </div>
    </details>
  )
}
