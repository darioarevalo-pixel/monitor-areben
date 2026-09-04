'use client'

import { useMemo, useState } from 'react'
import { Badge, Button, Input, color } from '@/components/ui'
import { InfoPopover } from '@/components/ui/InfoPopover'
import {
  agregarAlBanco,
  alertasDelBanco,
  aplicaOutfitsBanco,
  bloqueoSacarDelBanco,
  conOutfit,
  conZonaBanco,
  outfitsDe,
  proximoOutfit,
  resumenBanco,
  sacarDelBanco,
  sinZonaBanco,
  zonasDelBanco,
  type ItemBanco,
} from '@/lib/sesionfotos/banco'
import { ROTULO_ZONA, type ZonaPrenda } from '@/lib/sesionfotos/outfits'
import { buscarProductos } from '@/lib/sesionfotos/draft'
import type { Origen } from '@/lib/sesionfotos/tipos'
import type { Variante } from '@/lib/etl/tipos'

/**
 * El BANCO de productos de una sesión: los candidatos, su clasificación y los outfits — **antes de
 * pedir nada** (Fase 3 del octavo).
 *
 * 🔑 **Es el paso que faltaba entre elegir y pedir.** Antes el orden era «busco → pido → después
 * veo cómo lo agrupo»; ahora es **candidatos → outfits → pido**, y cada pieza sale ya con su
 * número de outfit puesto, que del otro lado es la bolsa que la etiqueta y el reporte de armado
 * ya sabían imprimir.
 *
 * ⛔ **Poner algo en el banco ⛔ no lo pide ni lo separa**: no toca Gestión Nube ni el stock. Es
 * una mesa donde se apoyan candidatos, y el pedido es el botón de abajo.
 */
export function BancoSesion({
  banco,
  variantes,
  editable,
  onCambiar,
  onPedir,
}: {
  banco: ItemBanco[]
  variantes: Variante[]
  editable: boolean
  onCambiar: (b: ItemBanco[]) => void
  /** Crea la solicitud hija con lo elegido. Devuelve los `vid` que ⛔ no entraron, o `null` si falló. */
  onPedir: (vids: string[], destino: Origen) => Promise<string[] | null>
}) {
  const [busq, setBusq] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pidiendo, setPidiendo] = useState(false)
  const [ausentes, setAusentes] = useState<string[]>([])

  const zonas = zonasDelBanco(banco)
  const alertas = alertasDelBanco(banco)
  const hayOutfits = aplicaOutfitsBanco(banco)
  const aClasificar = sinZonaBanco(banco)
  const grupos = outfitsDe(banco)
  const res = resumenBanco(banco)
  const prox = proximoOutfit(banco)
  const yaEn = useMemo(() => new Set(banco.map((i) => String(i.pid))), [banco])

  const elegibles = banco.filter((i) => !i.pedidoEn)
  const elegidos = [...sel].filter((v) => elegibles.some((i) => i.vid === v))

  const agregarVariante = (v: Variante) => {
    onCambiar(
      agregarAlBanco(banco, [
        {
          vid: String(v.id),
          pid: v.pid == null ? null : String(v.pid),
          sid: v.sid == null ? null : String(v.sid),
          nombre: v.name || '—',
          variante: v.size || '—',
          sku: v.sku || '',
          stockDep: v.deposito || 0,
          stockLoc: v.local || 0,
          candidato: 'stock',
        },
      ]),
    )
  }

  const pedir = async (destino: Origen) => {
    if (!elegidos.length || pidiendo) return
    setPidiendo(true)
    const faltaron = await onPedir(elegidos, destino)
    setPidiendo(false)
    if (faltaron == null) return
    setAusentes(faltaron)
    setSel(new Set())
  }

  return (
    <div style={{ border: `1px solid ${color.line}`, borderRadius: 8, padding: '8px 10px', marginTop: 8, background: color.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          Banco de productos{res.total ? ` (${res.total})` : ''}{' '}
          <InfoPopover titulo="Los candidatos, antes de pedirlos">
            Acá se apoyan las prendas candidatas de la sesión y se arman los outfits: arriba + abajo,
            o una prenda entera. Poner algo en el banco no lo pide ni lo separa del stock. Cuando el
            outfit está armado, «Pedir al depósito» o «Pedir al local» crean la solicitud, y cada
            prenda viaja con su número de outfit ya puesto — que es la bolsa que después se imprime.
            Un mismo outfit puede salir en dos pedidos: el top del depósito y el jean del local.
          </InfoPopover>
        </div>
        {res.total ? (
          <div style={{ fontSize: 12, color: color.mut2 }}>
            {res.outfits} {res.outfits === 1 ? 'outfit' : 'outfits'}
            {hayOutfits ? ` · ${res.outfitsCompletos} completos` : ''}
            {res.sinOutfit ? ` · ${res.sinOutfit} sin repartir` : ''}
            {res.pedidos ? ` · ${res.pedidos} ya pedidas` : ''}
          </div>
        ) : null}
      </div>

      {editable ? (
        <div style={{ marginBottom: 8 }}>
          <Input value={busq} onChange={(e) => setBusq(e.target.value)} placeholder="Buscar por nombre o SKU para agregar al banco…" style={{ width: '100%', maxWidth: 420 }} />
          {busq.trim().length >= 2 ? (
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
              {buscarProductos(variantes, busq, yaEn).slice(0, 15).map((r) => (
                <div key={r.pid} style={{ background: '#fff', border: `1px solid ${color.line}`, borderRadius: 7, padding: '5px 8px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                    {r.vars.map((vv) => (
                      <button
                        key={vv.vid}
                        onClick={() => {
                          const v = variantes.find((x) => String(x.id) === String(vv.vid))
                          if (v) agregarVariante(v)
                        }}
                        title={`Agregar ${vv.size} al banco`}
                        style={{ fontSize: 11, border: `1px solid ${color.brandBorder}`, background: '#fff', borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}
                      >
                        + {vv.size} <span style={{ color: color.mut2 }}>({vv.stock})</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!res.total ? (
        <div style={{ fontSize: 12, color: color.mut2 }}>
          El banco está vacío. Buscá prendas arriba para armar los outfits antes de pedir; también se puede
          seguir pidiendo directo, como siempre.
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {grupos.map((g) => {
          const aviso = g.n != null ? alertas.find((a) => a.n === g.n) : null
          return (
            <div key={g.n ?? 'sin'} style={{ border: `1px solid ${g.n != null ? color.brandBorder : color.line}`, background: '#fff', borderRadius: 7, padding: '6px 8px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: g.n != null ? color.brand : color.mut2, marginBottom: 3 }}>
                {g.n != null ? `Outfit ${g.n}` : 'Sin repartir'}
                {aviso ? <span style={{ fontWeight: 500, color: color.warningInk }}> · {aviso.texto}</span> : null}
              </div>
              {g.items.map((i) => (
                <div key={i.vid} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, padding: '2px 0' }}>
                  {editable && !i.pedidoEn ? (
                    <input
                      type="checkbox"
                      checked={sel.has(i.vid)}
                      onChange={(e) =>
                        setSel((s) => {
                          const n = new Set(s)
                          if (e.target.checked) n.add(i.vid)
                          else n.delete(i.vid)
                          return n
                        })
                      }
                      style={{ width: 15, height: 15, cursor: 'pointer' }}
                    />
                  ) : null}
                  <span style={{ flex: 1, minWidth: 140, color: i.pedidoEn ? color.mut2 : color.ink2 }}>
                    {i.nombre} · {i.variante}
                    {i.candidato === 'oc' ? <Badge tone="brand" subtle style={{ marginLeft: 5 }}>de la OC</Badge> : null}
                    {i.pedidoEn ? <Badge tone="success" subtle style={{ marginLeft: 5 }}>ya pedida</Badge> : null}
                  </span>
                  {hayOutfits && editable && !i.pedidoEn ? (
                    <select
                      value={i.zona ?? ''}
                      onChange={(e) => onCambiar(conZonaBanco(banco, i.vid, (e.target.value || null) as ZonaPrenda | null))}
                      title={zonas[i.vid] ? `Zona: ${ROTULO_ZONA[zonas[i.vid] as ZonaPrenda]}` : 'Sin zona: el nombre no dice si va arriba o abajo.'}
                      style={{
                        fontSize: 11,
                        border: `1px solid ${zonas[i.vid] ? color.line : color.warningInk}`,
                        background: zonas[i.vid] ? '#fff' : color.warningBg,
                        borderRadius: 5,
                        padding: '1px 2px',
                        maxWidth: 96,
                      }}
                    >
                      <option value="">{zonas[i.vid] ? `· ${ROTULO_ZONA[zonas[i.vid] as ZonaPrenda]}` : '· sin zona'}</option>
                      <option value="arriba">{ROTULO_ZONA.arriba}</option>
                      <option value="abajo">{ROTULO_ZONA.abajo}</option>
                      <option value="entero">{ROTULO_ZONA.entero}</option>
                    </select>
                  ) : hayOutfits && zonas[i.vid] ? (
                    <span style={{ fontSize: 11, color: color.mut2 }}>{ROTULO_ZONA[zonas[i.vid] as ZonaPrenda]}</span>
                  ) : null}
                  {editable && !i.pedidoEn ? (
                    <>
                      <input
                        type="number"
                        min={1}
                        value={i.outfit ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.trim()
                          onCambiar(conOutfit(banco, i.vid, v === '' ? null : parseInt(v, 10)))
                        }}
                        title={`Outfit (vacío = sin repartir; próximo libre: ${prox})`}
                        style={{ width: 38, textAlign: 'center', border: `1px solid ${color.line}`, borderRadius: 5, padding: '1px 2px', fontSize: 12 }}
                      />
                      <button
                        onClick={() => {
                          const bloqueo = bloqueoSacarDelBanco(banco, i.vid)
                          if (!bloqueo) onCambiar(sacarDelBanco(banco, i.vid))
                        }}
                        title="Sacar del banco"
                        style={{ border: 'none', background: 'none', color: color.mut, fontSize: 13, cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Lo que el sistema ⛔ no pudo decidir. Se muestra en vez de asumirlo: una prenda sin zona
          ⛔ no cuenta para el aviso, así que sin este renglón «no falta nada» podría ser «no sé». */}
      {hayOutfits && aClasificar.length ? (
        <div style={{ fontSize: 11, color: color.warningInk, marginTop: 6 }}>
          {aClasificar.length === 1 ? 'Falta decir de qué zona es' : `Faltan clasificar ${aClasificar.length}`}:{' '}
          {aClasificar.slice(0, 4).map((i) => i.nombre).join(' · ')}
          {aClasificar.length > 4 ? ` y ${aClasificar.length - 4} más` : ''}.
        </div>
      ) : null}

      {/* 🔴 Lo que se pidió y NO entró. Se nombra con su causa: una prenda que se agotó entre que
          entró al banco y que se pidió ⛔ no puede desaparecer en silencio — la sesión saldría
          corta y nadie sabría por qué. */}
      {ausentes.length ? (
        <div style={{ fontSize: 11, color: color.dangerInk, background: color.dangerBg, borderRadius: 6, padding: '4px 7px', marginTop: 6 }}>
          {ausentes.length === 1 ? 'Una prenda no entró al pedido' : `${ausentes.length} prendas no entraron al pedido`} porque ya ⛔ no tienen stock:{' '}
          {ausentes.map((v) => banco.find((i) => i.vid === v)?.nombre || v).join(' · ')}. Siguen en el banco.
        </div>
      ) : null}

      {editable && elegibles.length ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: color.mut2 }}>
            {elegidos.length ? `${elegidos.length} elegidas` : 'Tildá lo que querés pedir'}
          </span>
          <Button size="sm" variant="outline" disabled={!elegidos.length || pidiendo} onClick={() => pedir('deposito')}>
            Pedir al depósito
          </Button>
          <Button size="sm" variant="outline" disabled={!elegidos.length || pidiendo} onClick={() => pedir('local')}>
            Pedir al local
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set(elegibles.map((i) => i.vid)))}>
            Tildar todas
          </Button>
        </div>
      ) : null}
    </div>
  )
}
