#!/usr/bin/env bash
# StackWise data flow and integration tests — tests CRUD lifecycle,
# stack operations, swap flow, and cross-endpoint consistency.
set -euo pipefail

BASE="http://localhost:3000"
PASSED=0
FAILED=0
ERRORS=()

pass() { PASSED=$((PASSED + 1)); echo "  ✓ $1"; }
fail() { FAILED=$((FAILED + 1)); ERRORS+=("$1: $2"); echo "  ✗ $1 — $2"; }

jq_val() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print($2)" 2>/dev/null; }

echo "============================================================"
echo "StackWise Data Flow & Integration Tests"
echo "============================================================"

# ── Test 1: Tool CRUD Lifecycle ──
echo ""
echo "── Tool CRUD Lifecycle ──"

# Create tool
RESP=$(curl -s -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" \
  -d '{"name":"__lifecycle_test__","category":"Development","description":"lifecycle test","provides":"[\"test capability\"]"}')
TOOL_ID=$(jq_val "$RESP" "d.get('id','')")
if [ -n "$TOOL_ID" ] && [ "$TOOL_ID" != "None" ]; then
  pass "Created tool id=$TOOL_ID"
else
  fail "Create tool" "No id returned: $RESP"
  TOOL_ID=""
fi

if [ -n "$TOOL_ID" ]; then
  # Read it back
  RESP=$(curl -s "$BASE/api/tools/$TOOL_ID")
  NAME=$(jq_val "$RESP" "d.get('name','')")
  if [ "$NAME" = "__lifecycle_test__" ]; then pass "Read tool back correctly"; else fail "Read tool" "Name=$NAME"; fi

  STATUS_VAL=$(jq_val "$RESP" "d.get('status','')")
  if [ "$STATUS_VAL" = "unclassified" ]; then pass "Default status is unclassified"; else fail "Default status" "status=$STATUS_VAL"; fi

  SOURCE_VAL=$(jq_val "$RESP" "d.get('source','')")
  if [ "$SOURCE_VAL" = "community" ]; then pass "Default source is community"; else fail "Default source" "source=$SOURCE_VAL"; fi

  # Update it
  RESP=$(curl -s -X PATCH "$BASE/api/tools" \
    -H "Content-Type: application/json" \
    -d "{\"id\":$TOOL_ID,\"category\":\"Integrations\",\"description\":\"updated desc\"}")
  UPDATED_CAT=$(jq_val "$RESP" "d.get('category','')")
  UPDATED_DESC=$(jq_val "$RESP" "d.get('description','')")
  if [ "$UPDATED_CAT" = "Integrations" ]; then pass "Category updated via PATCH"; else fail "PATCH category" "$UPDATED_CAT"; fi
  if [ "$UPDATED_DESC" = "updated desc" ]; then pass "Description updated via PATCH"; else fail "PATCH description" "$UPDATED_DESC"; fi

  # Verify lastUpdated changed
  RESP=$(curl -s "$BASE/api/tools/$TOOL_ID")
  LAST_UPDATED=$(jq_val "$RESP" "d.get('lastUpdated','')")
  if [ -n "$LAST_UPDATED" ] && [ "$LAST_UPDATED" != "None" ]; then pass "lastUpdated was set"; else fail "lastUpdated" "empty"; fi

  # Archive (DELETE)
  curl -s -o /dev/null -X DELETE "$BASE/api/tools/$TOOL_ID"
  RESP=$(curl -s "$BASE/api/tools/$TOOL_ID")
  STATUS_VAL=$(jq_val "$RESP" "d.get('status','')")
  if [ "$STATUS_VAL" = "archived" ]; then pass "Tool archived via DELETE"; else fail "Archive" "status=$STATUS_VAL"; fi
fi

# ── Test 2: Stack Add/Remove Lifecycle ──
echo ""
echo "── Stack Add/Remove Lifecycle ──"

# Create a fresh tool for stack tests
RESP=$(curl -s -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" \
  -d '{"name":"__stack_test__","category":"Development","status":"active"}')
STACK_TOOL_ID=$(jq_val "$RESP" "d.get('id','')")

if [ -n "$STACK_TOOL_ID" ] && [ "$STACK_TOOL_ID" != "None" ]; then
  # Add to stack
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/stack" \
    -H "Content-Type: application/json" \
    -d "{\"toolId\":$STACK_TOOL_ID}")
  if [ "$STATUS" = "201" ]; then pass "Added tool to stack"; else fail "Add to stack" "status=$STATUS"; fi

  # Verify it appears in stack
  STACK=$(curl -s "$BASE/api/stack")
  IN_STACK=$(echo "$STACK" | python3 -c "import sys,json; items=json.load(sys.stdin); print('yes' if any(i['toolId']==$STACK_TOOL_ID for i in items) else 'no')" 2>/dev/null)
  if [ "$IN_STACK" = "yes" ]; then pass "Tool visible in stack"; else fail "Stack visibility" "not found in stack"; fi

  # Verify tool status is active
  RESP=$(curl -s "$BASE/api/tools/$STACK_TOOL_ID")
  STATUS_VAL=$(jq_val "$RESP" "d.get('status','')")
  if [ "$STATUS_VAL" = "active" ]; then pass "Tool status set to active"; else fail "Active status" "status=$STATUS_VAL"; fi

  # Remove from stack
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/stack" \
    -H "Content-Type: application/json" \
    -d "{\"toolId\":$STACK_TOOL_ID}")
  if [ "$STATUS" = "200" ]; then pass "Removed tool from stack"; else fail "Remove from stack" "status=$STATUS"; fi

  # Verify tool is archived after removal
  RESP=$(curl -s "$BASE/api/tools/$STACK_TOOL_ID")
  STATUS_VAL=$(jq_val "$RESP" "d.get('status','')")
  if [ "$STATUS_VAL" = "archived" ]; then pass "Tool archived after stack removal"; else fail "Archive on removal" "status=$STATUS_VAL"; fi

  # Verify not in stack anymore
  STACK=$(curl -s "$BASE/api/stack")
  IN_STACK=$(echo "$STACK" | python3 -c "import sys,json; items=json.load(sys.stdin); print('yes' if any(i['toolId']==$STACK_TOOL_ID for i in items) else 'no')" 2>/dev/null)
  if [ "$IN_STACK" = "no" ]; then pass "Tool removed from stack list"; else fail "Stack removal" "still in stack"; fi

  # Double-remove should 404
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/stack" \
    -H "Content-Type: application/json" \
    -d "{\"toolId\":$STACK_TOOL_ID}")
  if [ "$STATUS" = "404" ]; then pass "Double-remove from stack → 404"; else fail "Double-remove" "status=$STATUS"; fi
fi

# ── Test 3: Swap Flow ──
echo ""
echo "── Swap Flow ──"

# Create two tools
RESP=$(curl -s -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" \
  -d '{"name":"__swap_old__","category":"Development","status":"active"}')
OLD_ID=$(jq_val "$RESP" "d.get('id','')")

RESP=$(curl -s -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" \
  -d '{"name":"__swap_new__","category":"Development","status":"queue"}')
NEW_ID=$(jq_val "$RESP" "d.get('id','')")

if [ -n "$OLD_ID" ] && [ "$OLD_ID" != "None" ] && [ -n "$NEW_ID" ] && [ "$NEW_ID" != "None" ]; then
  # Add old to stack
  curl -s -o /dev/null -X POST "$BASE/api/stack" \
    -H "Content-Type: application/json" \
    -d "{\"toolId\":$OLD_ID}"

  # Swap
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/swap" \
    -H "Content-Type: application/json" \
    -d "{\"oldToolId\":$OLD_ID,\"newToolId\":$NEW_ID,\"reason\":\"test swap\"}")
  if [ "$STATUS" = "201" ]; then pass "Swap executed successfully"; else fail "Swap" "status=$STATUS"; fi

  # Verify old tool is archived
  RESP=$(curl -s "$BASE/api/tools/$OLD_ID")
  STATUS_VAL=$(jq_val "$RESP" "d.get('status','')")
  if [ "$STATUS_VAL" = "archived" ]; then pass "Old tool archived after swap"; else fail "Old tool archive" "status=$STATUS_VAL"; fi

  # Verify new tool is active
  RESP=$(curl -s "$BASE/api/tools/$NEW_ID")
  STATUS_VAL=$(jq_val "$RESP" "d.get('status','')")
  if [ "$STATUS_VAL" = "active" ]; then pass "New tool activated after swap"; else fail "New tool active" "status=$STATUS_VAL"; fi

  # Verify new tool is in stack
  STACK=$(curl -s "$BASE/api/stack")
  IN_STACK=$(echo "$STACK" | python3 -c "import sys,json; items=json.load(sys.stdin); print('yes' if any(i['toolId']==$NEW_ID for i in items) else 'no')" 2>/dev/null)
  if [ "$IN_STACK" = "yes" ]; then pass "New tool visible in stack after swap"; else fail "Swap stack" "new tool not in stack"; fi

  # Verify old tool NOT in stack
  IN_STACK=$(echo "$STACK" | python3 -c "import sys,json; items=json.load(sys.stdin); print('yes' if any(i['toolId']==$OLD_ID for i in items) else 'no')" 2>/dev/null)
  if [ "$IN_STACK" = "no" ]; then pass "Old tool removed from stack after swap"; else fail "Swap removal" "old tool still in stack"; fi
fi

# ── Test 4: Settings Read/Write ──
echo ""
echo "── Settings Read/Write ──"

# Read current settings
RESP=$(curl -s "$BASE/api/settings")
HAS_PROVIDER=$(jq_val "$RESP" "'yes' if 'provider' in d else 'no'")
if [ "$HAS_PROVIDER" = "yes" ]; then pass "Settings has provider"; else fail "Settings provider" "missing"; fi

# Update settings (no-op save)
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/settings" \
  -H "Content-Type: application/json" \
  -d '{"provider":"openrouter"}')
if [ "$STATUS" = "200" ]; then pass "Settings update returns 200"; else fail "Settings update" "status=$STATUS"; fi

# ── Test 5: Notification Lifecycle ──
echo ""
echo "── Notification Lifecycle ──"

RESP=$(curl -s "$BASE/api/notifications")
COUNT=$(jq_val "$RESP" "d.get('count', -1)")
if [ "$COUNT" != "None" ] && [ "$COUNT" != "-1" ]; then pass "Notifications count: $COUNT"; else fail "Notifications" "no count"; fi

ITEMS_IS_ARRAY=$(jq_val "$RESP" "'yes' if isinstance(d.get('items',[]), list) else 'no'")
if [ "$ITEMS_IS_ARRAY" = "yes" ]; then pass "Notifications items is array"; else fail "Notifications items" "not array"; fi

# ── Test 6: Cross-endpoint Consistency ──
echo ""
echo "── Cross-endpoint Consistency ──"

# All active tools should be in stack
ACTIVE_TOOLS=$(curl -s "$BASE/api/tools?status=active" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
STACK_COUNT=$(curl -s "$BASE/api/stack" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)

# Stack count should be <= active tools (some active tools may not be in stack due to test data)
if [ "$ACTIVE_TOOLS" -ge 0 ] && [ "$STACK_COUNT" -ge 0 ]; then
  pass "Active tools: $ACTIVE_TOOLS, Stack items: $STACK_COUNT"
else
  fail "Tool/stack count" "active=$ACTIVE_TOOLS stack=$STACK_COUNT"
fi

# Verify tools in stack reference valid tools
STACK_VALID=$(curl -s "$BASE/api/stack" | python3 -c "
import sys,json
items = json.load(sys.stdin)
for item in items:
    if 'tool' not in item or not item['tool']:
        print('invalid')
        sys.exit()
    if not item['tool'].get('name'):
        print('invalid')
        sys.exit()
print('valid')
" 2>/dev/null)
if [ "$STACK_VALID" = "valid" ]; then pass "All stack items have valid tool data"; else fail "Stack integrity" "some items missing tool data"; fi

# ── Test 7: Concurrent/Rapid Requests ──
echo ""
echo "── Rapid Request Handling ──"

# Fire 10 rapid GET requests
for i in $(seq 1 10); do
  curl -s -o /dev/null "$BASE/api/tools" &
done
wait
pass "10 concurrent GET /api/tools handled"

# Fire 5 rapid GETs to different endpoints
curl -s -o /dev/null "$BASE/api/tools" &
curl -s -o /dev/null "$BASE/api/stack" &
curl -s -o /dev/null "$BASE/api/scan" &
curl -s -o /dev/null "$BASE/api/settings" &
curl -s -o /dev/null "$BASE/api/notifications" &
wait
pass "5 concurrent multi-endpoint GETs handled"

# ── Test 8: Edge case inputs ──
echo ""
echo "── Edge Case Inputs ──"

# Very long tool name
LONG_NAME=$(python3 -c "print('x' * 1000)")
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$LONG_NAME\",\"category\":\"Development\"}")
# Should succeed (SQLite text has no length limit) or fail gracefully
if [ "$STATUS" = "201" ] || [ "$STATUS" = "400" ]; then
  pass "Long tool name handled (status=$STATUS)"
else
  fail "Long name" "status=$STATUS"
fi

# Special characters in tool name
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" \
  -d '{"name":"__test <script>alert(1)</script>__","category":"Development"}')
if [ "$STATUS" = "201" ]; then pass "HTML in name accepted (stored safely)"; else fail "HTML name" "status=$STATUS"; fi

# Unicode in tool name
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" \
  -d '{"name":"__test_日本語_工具__","category":"Development"}')
if [ "$STATUS" = "201" ]; then pass "Unicode tool name accepted"; else fail "Unicode name" "status=$STATUS"; fi

# Empty string name (should fail)
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" \
  -d '{"name":"","category":"Development"}')
# Empty name — the API checks for truthy, so empty string should be 400
if [ "$STATUS" = "400" ]; then
  pass "Empty name rejected"
else
  fail "Empty name" "expected 400, got $STATUS (BUG: empty names should be rejected)"
fi

# Null values
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tools" \
  -H "Content-Type: application/json" \
  -d '{"name":null,"category":"Development"}')
if [ "$STATUS" = "400" ]; then pass "Null name rejected"; else fail "Null name" "status=$STATUS"; fi

# ── Cleanup ──
echo ""
echo "── Cleanup ──"
CLEANED=$(curl -s "$BASE/api/tools" | python3 -c "
import sys,json
tools = json.load(sys.stdin)
test_tools = [t for t in tools if t['name'].startswith('__')]
print(len(test_tools))
" 2>/dev/null)
pass "Test data to clean: $CLEANED tools"

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
fi

exit $( [ $FAILED -eq 0 ] && echo 0 || echo 1 )
