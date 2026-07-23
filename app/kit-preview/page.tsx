'use client'

/**
 * TEMPORAL — showcase del kit de UI (design-system) para aprobar la estética.
 * Ruta: /kit-preview. Se elimina antes de cerrar la tanda. No está en la nav.
 */
import { useState } from 'react'
import {
  Button, Card, SectionCard, Badge, StatusPill, Field, Input, Select, NumberField,
  Tabs, EmptyState, KpiCard, TableWrap, THead, TBody, Tr, Th, Td,
  MoneyText, Notice, CopyButton, color, space, font, weight, type Tone,
} from '@/components/ui'

const TONES: Tone[] = ['neutral', 'brand', 'action', 'success', 'warning', 'danger']
const H = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: font.xs, fontWeight: weight.bold, color: color.mut, textTransform: 'uppercase', letterSpacing: 0.6, margin: '4px 0' }}>{children}</div>
)

export default function KitPreview() {
  const [tab, setTab] = useState('cambios')
  const [n, setN] = useState<number | ''>(2)
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 36, display: 'flex', flexDirection: 'column', gap: 28, background: color.bg2, minHeight: '100vh' }}>
      <div>
        <div style={{ fontSize: font['3xl'], fontWeight: weight.heavy, color: color.ink }}>Design system · preview</div>
        <div style={{ fontSize: font.md, color: color.mut }}>Kit reutilizable para todo el monitor. Estética moderna tipo SaaS, acento ámbar de marca.</div>
      </div>

      <SectionCard title="Botones" subtitle="variant (forma) + tone (color) + size (densidad)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(['solid', 'soft', 'outline', 'ghost'] as const).map((v) => (
            <div key={v}>
              <H>{v}</H>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TONES.map((t) => <Button key={t} variant={v} tone={t}>{t}</Button>)}
                <Button variant={v} tone="brand" disabled>disabled</Button>
              </div>
            </div>
          ))}
          <div>
            <H>tamaños</H>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button size="sm" tone="brand" variant="solid">sm</Button>
              <Button size="md" tone="brand" variant="solid">md</Button>
              <Button size="lg" tone="brand" variant="solid">lg</Button>
              <Button size="md" tone="brand" variant="solid" iconLeft="＋">con icono</Button>
              <Button size="md" variant="solid" tone="action" loading>guardando</Button>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Estados y avisos">
        <H>StatusPill</H>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {TONES.map((t) => <StatusPill key={t} tone={t} label={t} />)}
        </div>
        <H>Badge</H>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {TONES.map((t) => <Badge key={t} tone={t}>{t}</Badge>)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Notice tone="success" icon="✓">Cambio guardado como borrador.</Notice>
          <Notice tone="warning" icon="⏳">2 cambios con reingreso pendiente.</Notice>
          <Notice tone="danger" icon="⚠">No se pudo procesar la venta en GN.</Notice>
        </div>
      </SectionCard>

      <SectionCard title="KPIs">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <KpiCard label="En tenencia" value="14 u." />
          <KpiCard label="Valuado a costo" value={<MoneyText value={183400} />} tone="brand" />
          <KpiCard label="Valuado a PVP feria" value={<MoneyText value={399900} />} tone="success" />
          <KpiCard label="Pendientes" value="3" sub="cobro + reingreso" tone="warning" />
        </div>
      </SectionCard>

      <SectionCard title="Formulario" subtitle="Field + Input + Select + NumberField (foco ámbar accesible)">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Nº de orden" width={200}><Input placeholder="ej. 1234" /></Field>
          <Field label="Vía de envío" width={160}>
            <Select defaultValue="andreani"><option value="andreani">Andreani</option><option value="correo">Correo</option><option value="cadete">Cadete</option></Select>
          </Field>
          <Field label="Cantidad"><NumberField value={n} onChange={setN} min={1} prefix="×" width={90} /></Field>
          <Field label="Precio"><NumberField value={39990} onChange={() => {}} min={0} prefix="$" width={120} /></Field>
          <Button variant="solid" tone="brand" iconLeft="＋">Guardar borrador</Button>
        </div>
      </SectionCard>

      <SectionCard title="Tabs">
        <Tabs variant="pill" value={tab} onChange={setTab} items={[
          { key: 'fallas', label: 'Fallas' },
          { key: 'cambios', label: 'Cambios' },
          { key: 'devoluciones', label: 'Devoluciones', disabled: true, hint: 'Próximamente' },
          { key: 'canjes', label: 'Canjes', disabled: true, hint: 'Próximamente' },
        ]} />
        <div style={{ height: 10 }} />
        <Tabs variant="underline" value={tab} onChange={setTab} items={[
          { key: 'fallas', label: 'Todos', badge: 12 },
          { key: 'cambios', label: 'Borrador', badge: 3 },
          { key: 'devoluciones', label: 'En tránsito', badge: 5 },
        ]} />
      </SectionCard>

      <SectionCard title="Tabla" subtitle="primitivas componibles · tabular-nums" actions={<CopyButton getText={() => 'detalle de ejemplo'} label="Copiar detalle" share />}>
        <TableWrap>
          <THead><Tr>
            <Th>Reclamo</Th><Th>Cliente</Th><Th>Se lleva</Th><Th align="right">Total</Th><Th>Estado</Th><Th>Acciones</Th>
          </Tr></THead>
          <TBody>
            {[
              { r: 'C-0045', c: 'Jean Torin', p: '2× Falda Honey', t: 39990, e: 'Borrador', tone: 'warning' as Tone },
              { r: 'C-0046', c: 'Lucía P.', p: '1× Remera Boxy', t: 12000, e: 'En tránsito', tone: 'action' as Tone },
              { r: 'C-0047', c: 'Marté', p: '—', t: null, e: 'Esperando elección', tone: 'neutral' as Tone },
            ].map((row) => (
              <Tr key={row.r}>
                <Td mono strong>{row.r}</Td>
                <Td>{row.c}</Td>
                <Td>{row.p}</Td>
                <Td align="right"><MoneyText value={row.t} placeholder="a definir" strong /></Td>
                <Td><StatusPill tone={row.tone} label={row.e} /></Td>
                <Td><div style={{ display: 'flex', gap: 6 }}>
                  <Button size="sm">✏️ Editar</Button>
                  <Button size="sm" tone="success" variant="outline">Procesar</Button>
                  <Button size="sm" tone="danger" variant="outline">Eliminar</Button>
                </div></Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      </SectionCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        <SectionCard title="Empty state">
          <EmptyState icon="📭" title="No hay cambios" hint="Cuando el local inicie un cambio, aparece acá." action={<Button variant="solid" tone="brand">Nuevo cambio</Button>} />
        </SectionCard>
        <Card padding={4} style={{ position: 'sticky', top: 12 }}>
          <H>Resumen (checkout)</H>
          {[['Devuelve', 39990], ['Se lleva', 79980]].map(([k, v]) => (
            <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.base, color: color.mut, padding: '3px 0' }}>
              <span>{k}</span><MoneyText value={v as number} />
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${color.line}`, margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.base, padding: '3px 0' }}>
            <span style={{ color: color.mut }}>Diferencia</span><StatusPill tone="warning" label="A cobrar" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.base, color: color.success, padding: '3px 0' }}>
            <span>Descuento</span><MoneyText value={-3999} tone="success" />
          </div>
          <div style={{ borderTop: `2px solid ${color.ink}`, margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.xl, fontWeight: weight.bold, padding: '4px 0' }}>
            <span>Total</span><MoneyText value={35991} strong />
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CopyButton getText={() => '*CAMBIO C-0045*'} label="Copiar detalle" share size="md" fullWidth />
            <Button variant="solid" tone="brand" fullWidth>Guardar borrador</Button>
          </div>
        </Card>
      </div>

      <div style={{ height: space[8] }} />
    </div>
  )
}
