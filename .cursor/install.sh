#!/usr/bin/env bash
#
# Idempotent bootstrap for the Labrynth development environment.
#
# Layers set up here:
#   1. A Python virtualenv (.venv) with the REACHER backend + the Labrynth CLI.
#   2. The React frontend (web/) dependencies and a production build (web/dist/).
#
# The REACHER backend lives in a separate repository (reacher2p / `import reacher`).
# It is preferred from a sibling checkout (declared via `repositoryDependencies`)
# so backend changes are picked up locally; otherwise it falls back to the pinned
# release on PyPI.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# --- System dependency: python venv support (Debian/Ubuntu splits it out) ------
if ! python3 -c 'import ensurepip, venv' >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo apt-get install -y python3-venv python3-full
  else
    apt-get update -qq
    apt-get install -y python3-venv python3-full
  fi
fi

# --- Python: backend + CLI -----------------------------------------------------
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

python -m pip install --upgrade pip

# Install the REACHER backend: prefer the sibling source checkout, else PyPI.
if [ -d ../reacher ]; then
  echo "Installing reacher backend from sibling checkout (../reacher)"
  pip install -e ../reacher
else
  echo "Sibling reacher checkout not found; installing reacher2p from PyPI"
  pip install "reacher2p"
fi

# Labrynth's own package + CLI extras (prompt_toolkit, httpx, websockets).
pip install -e ".[cli]"

# --- Frontend: install deps + build static bundle ------------------------------
cd web
npm ci
npm run build

echo "Labrynth environment setup complete."
