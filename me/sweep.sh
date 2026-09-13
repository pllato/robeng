#!/bin/bash
cd "$(dirname "$0")"
OUT=sweep.txt; : > $OUT
for t in "$@"; do
  R=$(timeout 240 node $t.mjs 2>&1)
  F=$(echo "$R" | grep -c ' FAIL ')
  O=$(echo "$R" | grep -c '  OK  ')
  E=$(echo "$R" | grep -c 'PAGEERROR\|TimeoutError\|Error:')
  printf '%-12s OK:%-4s FAIL:%-3s ERR:%s\n' "$t" "$O" "$F" "$E" >> $OUT
  if [ "$F" != "0" ] || [ "$E" != "0" ]; then
    echo "$R" | grep -E ' FAIL |PAGEERROR|TimeoutError|Error:' | head -8 | sed 's/^/    /' >> $OUT
  fi
done
echo "=== СВОДКА ГОТОВА ===" >> $OUT
