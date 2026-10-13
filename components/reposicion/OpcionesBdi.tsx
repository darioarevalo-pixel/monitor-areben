'use client'

/**
 * Lo que quedó de la ventana «Configurar mínimos» de BDI cuando pasó a reponer según ventas
 * (Darío, 12-oct-2026): los **productos que no se reponen** (🔌, los respeta `porVentas.ts`) y las
 * **categorías a ignorar al agrupar** (las lee también Conteo, `catsOff`). Los mínimos por modelo y
 * los topes por producto ya no se aplican y no se muestran: siguen guardados en la config.
 */

import { useMemo, useState } from 'react'
import { catsDisponibles } from '@/lib/reposicion/core'
import type { RepoCfg, RepoItem } from '@/lib/reposicion/tipos'
import { Button, Modal, color } from '@/components/ui'

export function OpcionesBdi({ abierto, inv, cfg, puede, shareStatus, guardarCfg, onClose }: {
  abierto: boolean
  inv: RepoItem[]
  cfg: RepoCfg
  puede: boolean
  shareStatus: { txt: string; color: string }
  guardarCfg: (c: RepoCfg) => void
  onClose: () => void
}) {
  const [buscar, setBuscar] = useState('')
  const catsDisp = useMemo(() => catsDisponibles(inv), [inv])
  const offSet = new Set((cfg.catsOff || []).map((s) => s.toLowerCase()))
  const toggleCatOff = (cat: string) => {
    const l = cat.toLowerCase()
    const catsOff = offSet.has(l) ? cfg.catsOff.filter((x) => x.toLowerCase() !== l) : [...cfg.catsOff, cat]
    guardarCfg({ ...cfg, catsOff })
  }
  const toggleApagar = (pid: string) => {
    const apagados = cfg.apagados.includes(pid) ? cfg.apagados.filter((x) => x !== pid) : [...cfg.apagados, pid]
    guardarCfg({ ...cfg, apagados })
  }

  const productos = useMemo(() => {
    const m = new Map<string, { pid: string; name: string; local: number; dep: number }>()
    inv.forEach((it) => {
      const p = m.get(it.pid) ?? { pid: it.pid, name: it.name, local: 0, dep: 0 }
      p.local += it.local
      p.dep += it.deposito
      m.set(it.pid, p)
    })
    return [...m.values()].filter((p) => p.local + p.dep > 0).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [inv])
  const q = buscar.toLowerCase().trim()
  const apagados = productos.filter((p) => cfg.apagados.includes(p.pid))
  const encontrados = q.length >= 2 ? productos.filter((p) => !cfg.apagados.includes(p.pid) && p.name.toLowerCase().includes(q)).slice(0, 30) : []

  const fila = (p: { pid: string; name: string; local: number; dep: number }, off: boolean) => (
    <div key={p.pid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 8px', border: `1px solid ${color.bg2}`, borderRadius: 6, marginBottom: 4 }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.name} <span style={{ color: color.mut2 }}>· Local {p.local} · Depósito {p.dep}</span>
      </span>
      {puede && (
        <Button size="sm" variant="ghost" onClick={() => toggleApagar(p.pid)}>
          {off ? 'Volver a reponer' : 'No reponer'}
        </Button>
      )}
    </div>
  )

  return (
    <Modal abierto={abierto} onCerrar={onClose} titulo="Productos que no se reponen y categorías" ancho="ancho" pie={<Button variant="solid" tone="brand" onClick={onClose}>Listo</Button>}>
      <div style={{ fontSize: 12, color: color.mut, marginBottom: 10 }}>
        {puede ? 'Los cambios se aplican para todo el equipo.' : 'Solo Darío y Bruno pueden editar.'} <span style={{ color: shareStatus.color }}>{shareStatus.txt}</span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '6px 0' }}>Productos que no se reponen</div>
      {apagados.length ? apagados.map((p) => fila(p, true)) : <div style={{ fontSize: 12, color: color.mut2, marginBottom: 6 }}>Ninguno.</div>}
      {puede && (
        <>
          <input className="mo-input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar producto…" style={{ margin: '6px 0' }} />
          {encontrados.map((p) => fila(p, false))}
        </>
      )}

      {catsDisp.length > 0 && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${color.line}`, paddingTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Categorías a ignorar al agrupar</div>
          <div style={{ fontSize: 11.5, color: color.mut2, marginBottom: 8 }}>Para productos con varias categorías en Tienda Nube. Las de promoción ya se ignoran.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {catsDisp.map((c) => {
              const off = offSet.has(c.toLowerCase())
              return (
                <button
                  key={c}
                  disabled={!puede}
                  onClick={() => toggleCatOff(c)}
                  style={{ height: 'auto', fontSize: 12, border: `1px solid ${off ? color.dangerBorder : color.successBorder}`, background: off ? color.dangerBg : color.successBg, color: off ? color.dangerInk : color.successInk, borderRadius: 14, padding: '3px 10px', cursor: puede ? 'pointer' : 'default', textDecoration: off ? 'line-through' : 'none' }}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}
