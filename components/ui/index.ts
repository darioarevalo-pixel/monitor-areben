/**
 * Kit de UI del monitor (design-system). Importá desde acá:
 *   import { Button, Card, StatusPill, Field, MoneyText } from '@/components/ui'
 * Los tokens son la fuente de verdad de color/espaciado: '@/components/ui/tokens'.
 */
export * from '@/components/ui/tokens'
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from '@/components/ui/Button'
export { Card, SectionCard, type CardProps, type SectionCardProps } from '@/components/ui/Card'
export { Badge, StatusPill, type BadgeProps, type StatusPillProps } from '@/components/ui/Badge'
export { Field, Input, Select, NumberField, fieldControlStyle, fieldRowGap, type FieldProps, type InputProps, type SelectProps, type NumberFieldProps } from '@/components/ui/Field'
export { Toolbar, type ToolbarProps } from '@/components/ui/Toolbar'
export { Tabs, type TabItem, type TabsProps } from '@/components/ui/Tabs'
export { EmptyState, type EmptyStateProps } from '@/components/ui/EmptyState'
export { KpiCard, type KpiCardProps } from '@/components/ui/KpiCard'
export { TableWrap, THead, TBody, Tr, Th, Td, type ThProps, type TdProps } from '@/components/ui/Table'
export { MoneyText, formatMoney, type MoneyTextProps } from '@/components/ui/MoneyText'
export { Notice, type NoticeProps } from '@/components/ui/Notice'
export { CopyButton, type CopyButtonProps } from '@/components/ui/CopyButton'
