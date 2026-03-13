#!/usr/bin/env bash
# StackWise — unified dev startup script
# Usage: ./dev.sh [command]
#   ./dev.sh          — install deps + start app
#   ./dev.sh start    — start app only (deps already installed)
#   ./dev.sh auto     — start app + n8n automation stack
#   ./dev.sh test     — run all test suites (requires app running)
#   ./dev.sh stop     — stop automation containers
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# ── Helpers ──────────────────────────────────────────────────────
info()  { echo -e "\033[0;36m▸\033[0m $1"; }
ok()    { echo -e "\033[0;32m✓\033[0m $1"; }
warn()  { echo -e "\033[0;33m!\033[0m $1"; }
err()   { echo -e "\033[0;31m✗\033[0m $1" >&2; }

ensure_node() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    nvm use 22 --silent 2>/dev/null || nvm install 22
  fi

  local ver
  ver="$(node -v 2>/dev/null || echo "")"
  if [[ ! "$ver" =~ ^v2[2-9] ]]; then
    err "Node 22+ required (got ${ver:-none}). Install via nvm: nvm install 22"
    exit 1
  fi
  ok "Node $ver"
}

ensure_bun() {
  if ! command -v bun &>/dev/null; then
    warn "Bun not found — falling back to npm for package management"
    PKG_CMD="npm"
  else
    PKG_CMD="bun"
    ok "Bun $(bun --version)"
  fi
}

# ── Commands ─────────────────────────────────────────────────────
cmd_deps() {
  info "Installing dependencies..."
  if [ "$PKG_CMD" = "bun" ]; then
    bun install
  else
    npm install
  fi
  ok "Dependencies installed"
}

cmd_start() {
  info "Starting StackWise on http://localhost:3000"
  npm run dev
}

cmd_automation_up() {
  if [ ! -f automation/docker-compose.yml ]; then
    warn "No automation/docker-compose.yml found — skipping"
    return
  fi

  if ! command -v docker &>/dev/null; then
    warn "Docker not installed — skipping automation stack"
    return
  fi

  info "Starting automation stack (n8n + Whisper)..."
  if [ ! -f automation/.env ]; then
    if [ -f automation/.env.example ]; then
      cp automation/.env.example automation/.env
      warn "Created automation/.env from example — edit with your API keys"
    fi
  fi
  docker compose -f automation/docker-compose.yml up -d
  ok "n8n running on http://localhost:5678"
  ok "Whisper running on http://localhost:8000"
}

cmd_automation_down() {
  if [ -f automation/docker-compose.yml ]; then
    info "Stopping automation stack..."
    docker compose -f automation/docker-compose.yml down
    ok "Automation stack stopped"
  fi
}

cmd_test() {
  info "Running test suites..."
  echo ""

  local exit_code=0

  if [ -f tests/test_api.sh ]; then
    bash tests/test_api.sh || exit_code=1
    echo ""
  fi

  if [ -f tests/test_data_flow.sh ]; then
    bash tests/test_data_flow.sh || exit_code=1
    echo ""
  fi

  if [ $exit_code -eq 0 ]; then
    ok "All tests passed"
  else
    err "Some tests failed"
  fi
  return $exit_code
}

# ── Main ─────────────────────────────────────────────────────────
CMD="${1:-default}"

echo ""
echo "  StackWise Dev"
echo "  ─────────────"
echo ""

ensure_node
ensure_bun

case "$CMD" in
  start)
    cmd_start
    ;;
  auto)
    cmd_automation_up
    cmd_start
    ;;
  test)
    cmd_test
    ;;
  stop)
    cmd_automation_down
    ;;
  default)
    cmd_deps
    cmd_start
    ;;
  *)
    echo "Usage: ./dev.sh [setup|start|auto|test|stop]"
    exit 1
    ;;
esac
