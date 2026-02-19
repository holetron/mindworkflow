#!/usr/bin/env bash
# count-any.sh — Count `: any` type annotations in source code
# Part of ADR-081 MindWorkflow quality checks
# Exit code 1 if count exceeds threshold

set -euo pipefail

THRESHOLD="${ANY_THRESHOLD:-20}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Count `: any` occurrences in server/src/ and app/src/
# Excludes: node_modules, dist, test files, type declaration files
COUNT=$(grep -r ": any" \
  "$ROOT_DIR/server/src/" \
  "$ROOT_DIR/app/src/" \
  --include="*.ts" \
  --include="*.tsx" \
  --exclude="*.test.ts" \
  --exclude="*.spec.ts" \
  --exclude="*.d.ts" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  2>/dev/null | wc -l)

COUNT=$(echo "$COUNT" | tr -d ' ')

echo "========================================"
echo "  : any  Usage Report"
echo "========================================"
echo ""
echo "  Found:     ${COUNT} occurrence(s)"
echo "  Threshold: ${THRESHOLD}"
echo ""

if [ "$COUNT" -gt "$THRESHOLD" ]; then
  echo "  Status:    OVER THRESHOLD"
  echo ""
  echo "  Breakdown by file:"
  echo "  ------------------"
  grep -r ": any" \
    "$ROOT_DIR/server/src/" \
    "$ROOT_DIR/app/src/" \
    --include="*.ts" \
    --include="*.tsx" \
    --exclude="*.test.ts" \
    --exclude="*.spec.ts" \
    --exclude="*.d.ts" \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    -c 2>/dev/null | sort -t: -k2 -rn | while IFS=: read -r file count; do
      [ "$count" -gt 0 ] 2>/dev/null || continue
      relpath="${file#"$ROOT_DIR"/}"
      printf "    %-60s %s\n" "$relpath" "$count"
    done
  echo ""
  echo "========================================"
  echo "  FAIL: Reduce : any usage to <= ${THRESHOLD}"
  echo "========================================"
  exit 1
else
  echo "  Status:    OK"
  echo ""
  echo "========================================"
  echo "  PASS"
  echo "========================================"
  exit 0
fi
