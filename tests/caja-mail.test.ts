import { describe, expect, it } from 'vitest'
import { completarMail, mailOk } from '@/lib/caja/mail'

describe('mail del ticket de la Caja', () => {
  it('el botón de dominio completa o reemplaza lo de después de la arroba', () => {
    expect(completarMail('maria', 'gmail.com')).toBe('maria@gmail.com')
    expect(completarMail('maria@gm', 'gmail.com')).toBe('maria@gmail.com')
    expect(completarMail(' maria.perez@gmail.com ', 'hotmail.com')).toBe('maria.perez@hotmail.com')
    expect(completarMail('', 'gmail.com')).toBe('')
    expect(completarMail('@gm', 'gmail.com')).toBe('@gm')
  })
  it('vacío vale; a medio escribir, no', () => {
    expect(mailOk('')).toBe(true)
    expect(mailOk('maria@gmail.com')).toBe(true)
    expect(mailOk('maria@gmail')).toBe(false)
    expect(mailOk('maria')).toBe(false)
  })
})
