#!/usr/bin/env bash
# Dispara un workflow de este repo y espera a que TERMINE BIEN. Lo usa `parte-manana.yml`.
#
#   scripts/lib/disparar-y-esperar.sh sync-diario.yml
#
# 🔴 **Por qué reintenta si sale `cancelled`.** Los syncs comparten el candado `gestion-nube` y la
# foto de Meta el `meta-ads-escritura` (con `avanzar-planes`, que corre cada hora). Con
# `cancel-in-progress: false` GitHub guarda UNA corrida en espera por candado, y **la que llega
# después cancela a la que esperaba** —p. ej. el cron atrasado del mismo workflow—. Eso ⛔ es una
# falla del sync: es un turno perdido, y se vuelve a pedir.
#
# Necesita `GH_TOKEN` (el `github.token` del workflow, con `actions: write`). Un `workflow_dispatch`
# hecho con ese token SÍ arranca una corrida: es la excepción documentada a la regla de que el
# GITHUB_TOKEN ⛔ dispara workflows.
set -euo pipefail

wf="$1"
for intento in 1 2 3; do
  desde=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  gh workflow run "$wf" --ref main
  id=""
  # La corrida tarda unos segundos en aparecer en la lista; se busca la creada DESPUÉS del disparo.
  for _ in $(seq 1 36); do
    id=$(gh run list --workflow "$wf" --event workflow_dispatch --limit 5 --json databaseId,createdAt \
      -q "[.[] | select(.createdAt >= \"$desde\")] | last | .databaseId // empty")
    [ -n "$id" ] && break
    sleep 5
  done
  if [ -z "$id" ]; then
    echo "✗ $wf: la corrida disparada ⛔ apareció en 3 minutos"
    exit 1
  fi
  echo "→ $wf: corrida $id (intento $intento)"
  gh run watch "$id" --interval 20 > /dev/null || true
  conclusion=$(gh run view "$id" --json conclusion -q .conclusion)
  echo "  $wf terminó: $conclusion"
  [ "$conclusion" = "success" ] && exit 0
  [ "$conclusion" != "cancelled" ] && exit 1
done
echo "✗ $wf: cancelada tres veces seguidas"
exit 1
