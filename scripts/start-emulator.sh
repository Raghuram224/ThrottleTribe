#!/bin/bash
# Starts the Android emulator with DNS servers that actually work on the current network.
# Office networks block public DNS (8.8.8.8 times out); home/hotspot networks often hand out an IPv6
# link-local resolver the emulator can't use. So: probe candidates from the Mac and pass the first
# working IPv4 servers via -dns-server. Always cold-boots (snapshots ignore -dns-server).
#
#   scripts/start-emulator.sh [avd-name]
set -euo pipefail
AVD="${1:-Medium_Phone_API_37.0}"
EMU="$HOME/Library/Android/sdk/emulator/emulator"

candidates=$(scutil --dns | awk '/nameserver\[[0-9]+\]/ {print $3}' | grep -E '^[0-9.]+$' | sort -u || true)
candidates="$candidates 8.8.8.8 1.1.1.1"

working=()
for ns in $candidates; do
  if dig +short +time=2 +tries=1 @"$ns" supabase.co | grep -qE '^[0-9.]+$'; then
    working+=("$ns")
  fi
  [ ${#working[@]} -ge 2 ] && break
done

if [ ${#working[@]} -eq 0 ]; then
  echo "No reachable DNS server found; starting with emulator defaults." >&2
  exec "$EMU" -avd "$AVD" -no-snapshot-load -memory 3072 -cores 4 -gpu host -no-audio
fi

dns=$(IFS=,; echo "${working[*]}")
echo "Using DNS: $dns"
exec "$EMU" -avd "$AVD" -no-snapshot-load -memory 3072 -cores 4 -gpu host -no-audio -dns-server "$dns"
