#!/bin/bash
# Copia el overlay files/ a un router en ejecución (desarrollo). Uso: ./dev-sync.sh <ip>
set -euo pipefail
H=${1:?ip del router}
cd "$(dirname "$0")/files"
tar -czf - --exclude=etc/uci-defaults . | ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -o LogLevel=ERROR root@"$H" \
	'tar -xzf - -C / && /etc/init.d/rpcd restart'
