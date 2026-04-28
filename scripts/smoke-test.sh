#!/usr/bin/env bash
# Solar AI OS — smoke test
# Run: bash scripts/smoke-test.sh
# Requires: curl, jq (optional)

BASE="http://localhost:3000"
PASS=0; FAIL=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

fmt() {
  if command -v jq &>/dev/null; then
    echo "$1" | jq . 2>/dev/null || echo "$1"
  else
    echo "$1" | python3 -m json.tool 2>/dev/null || echo "$1"
  fi
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Solar AI OS — Smoke Test"
echo " Server: $BASE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Metrics (no-auth GET) ──────────────────────────────────────────
echo ""
echo "1. GET /api/metrics"
R=$(curl -sf "$BASE/api/metrics" 2>&1)
if echo "$R" | grep -q '"requests"'; then
  ok "/api/metrics → JSON with requests field"
  echo "   requests=$(echo "$R" | grep -o '"requests":[0-9]*' | head -1)"
else
  fail "/api/metrics returned: ${R:0:120}"
fi

# ── 2. Claude direct ─────────────────────────────────────────────────
echo ""
echo "2. POST /api/claude"
R=$(curl -sf -X POST "$BASE/api/claude" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Reply with exactly one word: SOLAR"}]}' 2>&1)
if echo "$R" | grep -qi '"reply"'; then
  ok "/api/claude → has reply field"
  echo "   reply=$(echo "$R" | grep -o '"reply":"[^"]*"' | head -1)"
else
  fail "/api/claude returned: ${R:0:200}"
fi

# ── 3. GPT direct ────────────────────────────────────────────────────
echo ""
echo "3. POST /api/gpt"
R=$(curl -sf -X POST "$BASE/api/gpt" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Reply with exactly one word: SOLAR"}]}' 2>&1)
if echo "$R" | grep -qi '"reply"'; then
  ok "/api/gpt → has reply field"
else
  fail "/api/gpt returned: ${R:0:200}"
fi

# ── 4. Router (simple query → single) ─────────────────────────────────
echo ""
echo "4. POST /api/router (simple: '2+2')"
R=$(curl -sf -X POST "$BASE/api/router" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"2+2"}]}' 2>&1)
if echo "$R" | grep -q '"mode"'; then
  MODE=$(echo "$R" | grep -o '"mode":"[^"]*"' | head -1)
  PROV=$(echo "$R" | grep -o '"provider":"[^"]*"' | head -1)
  ok "/api/router → $MODE $PROV"
else
  fail "/api/router returned: ${R:0:200}"
fi

# ── 5. Router (medium query → dual) ────────────────────────────────────
echo ""
echo "5. POST /api/router (medium: 'compare gpt vs claude')"
R=$(curl -sf -X POST "$BASE/api/router" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"compare gpt vs claude strengths"}]}' 2>&1)
if echo "$R" | grep -q '"mode"'; then
  MODE=$(echo "$R" | grep -o '"mode":"[^"]*"' | head -1)
  CONF=$(echo "$R" | grep -o '"confidence":[0-9.]*' | head -1)
  ok "/api/router → $MODE $CONF"
else
  fail "/api/router medium: ${R:0:200}"
fi

# ── 6. Streaming ─────────────────────────────────────────────────────
echo ""
echo "6. POST /api/stream (SSE)"
R=$(curl -sf -X POST "$BASE/api/stream" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Say: hi"}],"provider":"claude"}' \
  --max-time 10 2>&1)
if echo "$R" | grep -q '"token"'; then
  TOKEN_COUNT=$(echo "$R" | grep -c '"token"')
  ok "/api/stream → $TOKEN_COUNT token events received"
else
  fail "/api/stream returned: ${R:0:200}"
fi

if echo "$R" | grep -q '\[DONE\]'; then
  ok "/api/stream → [DONE] received"
else
  fail "/api/stream → [DONE] missing"
fi

# ── 7. Cost tracking ─────────────────────────────────────────────────
echo ""
echo "7. Cost tracking in metrics"
R=$(curl -sf "$BASE/api/metrics" 2>&1)
if echo "$R" | grep -q '"totalCost_usd"'; then
  COST=$(echo "$R" | grep -o '"totalCost_usd":[0-9.]*' | head -1)
  ok "/api/metrics → cost tracked: $COST"
else
  fail "/api/metrics → totalCost_usd missing"
fi

# ── 8. Pages load ────────────────────────────────────────────────────
echo ""
echo "8. Pages"
for path in "/" "/dashboard"; do
  CODE=$(curl -so /dev/null -w "%{http_code}" "$BASE$path" 2>&1)
  if [ "$CODE" = "200" ]; then
    ok "$path → 200"
  else
    fail "$path → HTTP $CODE"
  fi
done

# ── Summary ─────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Results: $PASS passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "⚠️  Check your .env.local:"
  echo "   OPENAI_API_KEY=sk-proj-..."
  echo "   ANTHROPIC_API_KEY=sk-ant-..."
  echo ""
fi
