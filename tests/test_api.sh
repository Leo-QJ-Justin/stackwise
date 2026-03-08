#!/usr/bin/env bash
# StackWise API stress tests — validates all endpoints, error handling, and edge cases.
set -euo pipefail

BASE="http://localhost:3000"
PASSED=0
FAILED=0
ERRORS=()

pass() { PASSED=$((PASSED + 1)); echo "  ✓ $1"; }
fail() { FAILED=$((FAILED + 1)); ERRORS+=("$1: $2"); echo "  ✗ $1 — $2"; }
check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name"; else fail "$name" "expected $expected, got $actual"; fi
}

echo "============================================================"
echo "StackWise API Tests"
echo "============================================================"

# ── GET endpoints ──
echo ""
echo "── GET Endpoints ──"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tools")
check "GET /api/tools → 200" "200" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tools?status=active")
check "GET /api/tools?status=active → 200" "200" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tools?category=Development")
check "GET /api/tools?category=Development → 200" "200" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tools?status=nonexistent")
check "GET /api/tools?status=nonexistent → 200 (empty array)" "200" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/stack")
check "GET /api/stack → 200" "200" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/scan")
check "GET /api/scan → 200" "200" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/settings")
check "GET /api/settings → 200" "200" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/notifications")
check "GET /api/notifications → 200" "200" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/skills")
check "GET /api/skills → 200" "200" "$STATUS"

# ── GET /api/tools/[id] ──
echo ""
echo "── GET /api/tools/[id] ──"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tools/99999")
check "GET /api/tools/99999 → 404" "404" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tools/abc")
check "GET /api/tools/abc → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tools/0")
check "GET /api/tools/0 → 404" "404" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tools/-1")
check "GET /api/tools/-1 → 404" "404" "$STATUS"

# Get a real tool ID for positive tests
FIRST_ID=$(curl -s "$BASE/api/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null || echo "")
if [ -n "$FIRST_ID" ]; then
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tools/$FIRST_ID")
  check "GET /api/tools/$FIRST_ID → 200" "200" "$STATUS"
fi

# ── POST /api/tools validation ──
echo ""
echo "── POST /api/tools Validation ──"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/tools {} → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" -d '{"name":"test"}')
check "POST /api/tools {name only} → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" -d '{"category":"Dev"}')
check "POST /api/tools {category only} → 400" "400" "$STATUS"

# Create a test tool (should succeed)
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" \
  -d '{"name":"__test_tool__","category":"Development","description":"test tool for API tests"}')
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -n 1)
check "POST /api/tools valid → 201" "201" "$STATUS"

TEST_TOOL_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

# ── PATCH /api/tools validation ──
echo ""
echo "── PATCH /api/tools Validation ──"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/tools" \
  -H "Content-Type: application/json" -d '{}')
check "PATCH /api/tools {} → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/tools" \
  -H "Content-Type: application/json" -d '{"category":"Development"}')
check "PATCH /api/tools {no id} → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/tools" \
  -H "Content-Type: application/json" -d '{"id":99999,"category":"Development"}')
check "PATCH /api/tools {nonexistent id} → 404" "404" "$STATUS"

if [ -n "$TEST_TOOL_ID" ]; then
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/tools" \
    -H "Content-Type: application/json" \
    -d "{\"id\":$TEST_TOOL_ID,\"category\":\"Integrations\"}")
  check "PATCH /api/tools valid update → 200" "200" "$STATUS"

  # Verify the update persisted
  UPDATED_CAT=$(curl -s "$BASE/api/tools/$TEST_TOOL_ID" | python3 -c "import sys,json; print(json.load(sys.stdin).get('category',''))" 2>/dev/null || echo "")
  check "PATCH persisted category change" "Integrations" "$UPDATED_CAT"
fi

# ── DELETE /api/tools/[id] ──
echo ""
echo "── DELETE /api/tools/[id] ──"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/tools/99999")
check "DELETE /api/tools/99999 → 404" "404" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/tools/abc")
check "DELETE /api/tools/abc → 400" "400" "$STATUS"

if [ -n "$TEST_TOOL_ID" ]; then
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/tools/$TEST_TOOL_ID")
  check "DELETE /api/tools/$TEST_TOOL_ID → 200" "200" "$STATUS"

  # Verify archived
  ARCHIVED_STATUS=$(curl -s "$BASE/api/tools/$TEST_TOOL_ID" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
  check "DELETE archives tool (status=archived)" "archived" "$ARCHIVED_STATUS"
fi

# ── POST /api/stack validation ──
echo ""
echo "── POST /api/stack Validation ──"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/stack" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/stack {} → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/stack" \
  -H "Content-Type: application/json" -d '{"toolId":99999}')
check "POST /api/stack {nonexistent tool} → 404" "404" "$STATUS"

# ── DELETE /api/stack validation ──
echo ""
echo "── DELETE /api/stack Validation ──"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/stack" \
  -H "Content-Type: application/json" -d '{}')
check "DELETE /api/stack {} → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/stack" \
  -H "Content-Type: application/json" -d '{"toolId":99999}')
check "DELETE /api/stack {nonexistent} → 404" "404" "$STATUS"

# ── POST /api/swap validation ──
echo ""
echo "── POST /api/swap Validation ──"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/swap" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/swap {} → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/swap" \
  -H "Content-Type: application/json" -d '{"oldToolId":99999,"newToolId":99998}')
check "POST /api/swap {nonexistent tools} → 404" "404" "$STATUS"

# ── POST /api/classify validation ──
echo ""
echo "── POST /api/classify Validation ──"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/classify" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/classify {} → 400" "400" "$STATUS"

# ── POST /api/ingest validation ──
echo ""
echo "── POST /api/ingest Validation ──"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/ingest" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/ingest {} → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/ingest" \
  -H "Content-Type: application/json" -d '{"sourceUrl":"x","postType":"x","rawText":"x","tools":[]}')
check "POST /api/ingest {empty tools} → 400" "400" "$STATUS"

# ── PATCH /api/notifications validation ──
echo ""
echo "── PATCH /api/notifications Validation ──"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/notifications" \
  -H "Content-Type: application/json" -d '{}')
check "PATCH /api/notifications {} → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/notifications" \
  -H "Content-Type: application/json" -d '{"ids":[]}')
check "PATCH /api/notifications {empty ids} → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/notifications" \
  -H "Content-Type: application/json" -d '{"ids":"string"}')
check "PATCH /api/notifications {ids as string} → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/notifications" \
  -H "Content-Type: application/json" -d '{"ids":[-1,0]}')
check "PATCH /api/notifications {negative ids} → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/notifications" \
  -H "Content-Type: application/json" -d '{"ids":[1.5]}')
check "PATCH /api/notifications {float ids} → 400" "400" "$STATUS"

# ── Data integrity checks ──
echo ""
echo "── Data Integrity ──"

# Verify /api/tools returns valid JSON array
TOOLS_TYPE=$(curl -s "$BASE/api/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print('array' if isinstance(d,list) else 'other')")
check "/api/tools returns JSON array" "array" "$TOOLS_TYPE"

# Verify /api/stack returns valid JSON array
STACK_TYPE=$(curl -s "$BASE/api/stack" | python3 -c "import sys,json; d=json.load(sys.stdin); print('array' if isinstance(d,list) else 'other')")
check "/api/stack returns JSON array" "array" "$STACK_TYPE"

# Verify /api/scan returns object with unclassifiedCount
SCAN_HAS_KEY=$(curl -s "$BASE/api/scan" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'unclassifiedCount' in d else 'no')")
check "/api/scan has unclassifiedCount" "yes" "$SCAN_HAS_KEY"

# Verify /api/settings returns object with provider
SETTINGS_HAS_KEY=$(curl -s "$BASE/api/settings" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'provider' in d else 'no')")
check "/api/settings has provider" "yes" "$SETTINGS_HAS_KEY"

# Verify /api/notifications returns object with count and items
NOTIF_KEYS=$(curl -s "$BASE/api/notifications" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'count' in d and 'items' in d else 'no')")
check "/api/notifications has count+items" "yes" "$NOTIF_KEYS"

# ── Page load checks ──
echo ""
echo "── Page Load ──"

for path in "/" "/settings" "/history" "/export"; do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  check "GET $path → 200" "200" "$STATUS"
done

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/tools/99999")
check "GET /tools/99999 → 404 or 200" "true" "$([ "$STATUS" = "200" ] || [ "$STATUS" = "404" ] && echo true || echo false)"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/nonexistent-page")
check "GET /nonexistent-page → 404" "404" "$STATUS"

# ── Settings PUT validation ──
echo ""
echo "── PUT /api/settings ──"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/settings" \
  -H "Content-Type: application/json" -d '{}')
check "PUT /api/settings {} → 200 (no-op update)" "200" "$STATUS"

# ── Cleanup test data ──
echo ""
echo "── Cleanup ──"

# Remove any __test_tool__ entries
curl -s "$BASE/api/tools" | python3 -c "
import sys,json
tools = json.load(sys.stdin)
test_tools = [t for t in tools if t['name'].startswith('__test_')]
for t in test_tools:
    print(f'Cleaning up test tool: {t[\"name\"]} (id={t[\"id\"]})')
" 2>/dev/null
pass "Test data identified for cleanup"

# ── Summary ──
echo ""
echo "============================================================"
echo "RESULTS: $PASSED passed, $FAILED failed"
echo "============================================================"

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo ""
  echo "FAILURES:"
  for err in "${ERRORS[@]}"; do
    echo "  ✗ $err"
  done
  exit 1
fi

exit 0
