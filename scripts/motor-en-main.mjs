#!/usr/bin/env node
/**
 * El CI del monitor falla si `motor/VERSION.json` ⛔ es un commit de `main` de `areben-motor` (auditoría 20-oct, «copia sin
 * deriva»): una copia traída de una rama es un motor que ⛔ publicó nadie. Pregunta a GitHub con `MOTOR_LECTURA` (token
 * fine-grained, `contents:read` sólo de `areben-motor`: el motor es privado y vive en otra cuenta). Falla CERRADO: sin
 * token, o si GitHub ⛔ contesta, es rojo — un verde que ⛔ miró nada es peor que un rojo.
 *
 *   MOTOR_LECTURA=… node scripts/motor-en-main.mjs
 */
import { readFileSync } from 'node:fs'

const REPO = 'brunoarevalo-arbn/areben-motor'
const { commit } = JSON.parse(readFileSync(new URL('../motor/VERSION.json', import.meta.url), 'utf8'))
const token = process.env.MOTOR_LECTURA
const salir = (msg, ok = false) => { (ok ? console.log : console.error)(msg); process.exit(ok ? 0 : 1) }

if (!/^[0-9a-f]{40}$/.test(commit ?? '')) salir(`motor/VERSION.json sin commit válido («${commit}»)`)
if (!token) salir('Falta MOTOR_LECTURA (secret de Actions): sin él ⛔ se puede saber si motor/ es de main del motor')

// compare main...commit: `identical` o `behind` = el commit está en la historia de main.
const r = await fetch(`https://api.github.com/repos/${REPO}/compare/main...${commit}`, {
  headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
})
if (r.status === 404) salir(`El commit ${commit.slice(0, 8)} ⛔ existe en ${REPO} (o el token ⛔ lo ve)`)
if (!r.ok) salir(`GitHub contestó ${r.status} al comparar ${commit.slice(0, 8)} con main`)
const { status, behind_by } = await r.json()
if (status === 'identical' || status === 'behind') salir(`✓ motor/ = ${commit.slice(0, 8)}, de main del motor${behind_by ? ` (${behind_by} commits atrás)` : ''}`, true)
salir(`✗ motor/ = ${commit.slice(0, 8)} ⛔ está en main del motor (${status}): traelo de main con npm run traer-motor`)
