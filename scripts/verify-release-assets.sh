#!/usr/bin/env bash
# Checks that a release artifacts directory holds all 8 assets a complete
# Labrynth release ships. Usage:
#   verify-release-assets.sh <artifacts-dir>
#   verify-release-assets.sh --self-test
set -euo pipefail

# label|glob|gui — GUI globs must not match the labrynth-cli-* tarballs, which
# share the same suffix as the GUI Linux tarball.
ASSETS=(
  "GUI Windows exe|labrynth-*-windows-x64.exe|1"
  "GUI macOS dmg|labrynth-*-macos-arm64.dmg|1"
  "GUI Linux AppImage|labrynth-*-linux-x64.AppImage|1"
  "GUI Linux tarball|labrynth-*-linux-x64.tar.gz|1"
  "GUI Debian package|labrynth_*_amd64.deb|1"
  "CLI Linux tarball|labrynth-cli-*-linux-x64.tar.gz|0"
  "CLI macOS tarball|labrynth-cli-*-macos-arm64.tar.gz|0"
  "CLI Windows tarball|labrynth-cli-*-windows-x64.tar.gz|0"
)

has_match() {
  local dir=$1 glob=$2 gui=$3
  if [[ $gui == 1 ]]; then
    [[ -n $(find "$dir" -maxdepth 1 -type f -name "$glob" ! -name 'labrynth-cli-*' -print -quit) ]]
  else
    [[ -n $(find "$dir" -maxdepth 1 -type f -name "$glob" -print -quit) ]]
  fi
}

verify() {
  local dir=$1 missing=0 entry label glob gui
  if [[ ! -d $dir ]]; then
    echo "not a directory: $dir" >&2
    return 2
  fi
  for entry in "${ASSETS[@]}"; do
    IFS='|' read -r label glob gui <<<"$entry"
    if has_match "$dir" "$glob" "$gui"; then
      echo "PASS     $label  ($glob)"
    else
      echo "MISSING  $label  ($glob)"
      missing=$((missing + 1))
    fi
  done
  if (( missing > 0 )); then
    echo "$missing of ${#ASSETS[@]} assets missing" >&2
    return 1
  fi
  echo "all ${#ASSETS[@]} assets present"
}

self_test() {
  local self=$0 fails=0 i label glob gui out status
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT

  # Fixture for each asset: its glob with * replaced by a sample version.
  make_fixture() {
    local dir=$1 skip=$2 idx=0 entry label glob gui name
    mkdir -p "$dir"
    for entry in "${ASSETS[@]}"; do
      IFS='|' read -r label glob gui <<<"$entry"
      if (( idx != skip )); then
        name=${glob//\*/3.0.1-beta.9}
        touch "$dir/$name"
      fi
      idx=$((idx + 1))
    done
  }

  run_verify() {
    status=0
    out=$("$self" "$1" 2>&1) || status=$?
  }

  check() {
    local desc=$1 ok=$2
    if (( ok )); then
      echo "ok    $desc"
    else
      echo "FAIL  $desc"
      fails=$((fails + 1))
    fi
  }

  make_fixture "$tmp/full" -1
  run_verify "$tmp/full"
  check "all 8 present passes" $(( status == 0 ))

  for i in "${!ASSETS[@]}"; do
    IFS='|' read -r label glob gui <<<"${ASSETS[$i]}"
    make_fixture "$tmp/missing-$i" "$i"
    run_verify "$tmp/missing-$i"
    check "missing $label fails" $(( status == 1 && $(grep -c "^MISSING  $label " <<<"$out") == 1 ))
  done

  mkdir -p "$tmp/cli-only"
  touch "$tmp/cli-only/labrynth-cli-3.0.1-beta.9-linux-x64.tar.gz"
  run_verify "$tmp/cli-only"
  check "CLI linux tarball alone does not satisfy GUI linux tarball" \
    $(( status == 1 && $(grep -c '^MISSING  GUI Linux tarball ' <<<"$out") == 1 ))

  if (( fails > 0 )); then
    echo "self-test: $fails check(s) failed" >&2
    return 1
  fi
  echo "self-test: all checks passed"
}

case ${1:-} in
  --self-test) self_test ;;
  "")
    echo "usage: $0 <artifacts-dir> | --self-test" >&2
    exit 2
    ;;
  *) verify "$1" ;;
esac
