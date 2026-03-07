# StackWise Project Instructions

## Runtime

- Use Node 22 via nvm: `export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm use 22`
- Use Bun as package manager (`bun add`, `bun install`) but Node for runtime (`npx tsx` for scripts).
- `better-sqlite3` does NOT work in Bun runtime — always use Node for DB scripts.

## Git

- All commits go on feature branches, never directly to main.
