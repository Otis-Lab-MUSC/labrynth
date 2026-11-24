#!/usr/bin/env bash
# Checks that a release artifacts directory holds all 12 assets a complete
# Labrynth release ships, and that SHA256SUMS lists every file in it. With
# --stable it also requires the fixed-name aliases a stable release carries.
# Usage:
#   verify-release-assets.sh [--stable] <artifacts-dir>
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
  "GUI macOS archive|labrynth-*-macos-arm64.tar.gz|1"
  "GUI Windows archive|labrynth-*-windows-x64.zip|1"
  "Update checksums|SHA256SUMS|0"
  "Update signature|SHA256SUMS.sig|0"
)

# Fixed-name copies a stable release carries for releases/latest/download links.
ALIASES=(
  labrynth-windows-x64.exe
  labrynth-macos-arm64.dmg
  labrynth-linux-x64.AppImage
  labrynth-linux-x64.deb
)

has_match() {
  local dir=$1 glob=$2 gui=$3
  if [[ $gui == 1 ]]; then
    [[ -n $(find "$dir" -maxdepth 1 -type f -name "$glob" ! -name 'labrynth-cli-*' -print -quit) ]]
  else
    [[ -n $(find "$dir" -maxdepth 1 -type f -name "$glob" -print -quit) ]]
  fi
}

# Print each file in $1 that its SHA256SUMS does not list.
unsigned_files() {
  local dir=$1 name
  while IFS= read -r name; do
    awk -v n="$name" '$2 == n { found = 1 } END { exit !found }' "$dir/SHA256SUMS" || echo "$name"
  done < <(find "$dir" -maxdepth 1 -type f ! -name SHA256SUMS ! -name SHA256SUMS.sig -printf '%f\n' | LC_ALL=C sort)
}

verify() {
  local dir=$1 stable=${2:-0} missing=0 entry label glob gui name
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
  if (( stable )); then
    for name in "${ALIASES[@]}"; do
      if [[ -f $dir/$name ]]; then
        echo "PASS     Latest alias  ($name)"
      else
        echo "MISSING  Latest alias  ($name)"
        missing=$((missing + 1))
      fi
    done
  fi
  if [[ -f $dir/SHA256SUMS ]]; then
    while IFS= read -r name; do
      echo "UNSIGNED $name  (not listed in SHA256SUMS)"
      missing=$((missing + 1))
    done < <(unsigned_files "$dir")
  fi
  if (( missing > 0 )); then
    echo "$missing problem(s) in $dir" >&2
    return 1
  fi
  echo "all ${#ASSETS[@]} assets present and listed in SHA256SUMS"
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
    if [[ -f $dir/SHA256SUMS ]]; then
      (cd "$dir" && find . -maxdepth 1 -type f ! -name SHA256SUMS ! -name SHA256SUMS.sig -printf '%f\n' |
        LC_ALL=C sort | xargs -r sha256sum -- >SHA256SUMS)
    fi
  }

  add_aliases() {
    local name
    for name in "${ALIASES[@]}"; do
      touch "$1/$name"
    done
    (cd "$1" && find . -maxdepth 1 -type f ! -name SHA256SUMS ! -name SHA256SUMS.sig -printf '%f\n' |
      LC_ALL=C sort | xargs -r sha256sum -- >SHA256SUMS)
  }

  run_verify() {
    status=0
    out=$("$self" "$@" 2>&1) || status=$?
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
  check "all 12 present passes" $(( status == 0 ))

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

  mkdir -p "$tmp/cli-mac-only"
  touch "$tmp/cli-mac-only/labrynth-cli-3.0.1-beta.9-macos-arm64.tar.gz"
  run_verify "$tmp/cli-mac-only"
  check "CLI macOS tarball alone does not satisfy GUI macOS archive" \
    $(( status == 1 && $(grep -c '^MISSING  GUI macOS archive ' <<<"$out") == 1 ))

  make_fixture "$tmp/unsigned" -1
  rm "$tmp/unsigned/SHA256SUMS.sig"
  run_verify "$tmp/unsigned"
  check "a release without SHA256SUMS.sig fails" \
    $(( status == 1 && $(grep -c '^MISSING  Update signature ' <<<"$out") == 1 ))

  make_fixture "$tmp/late-copy" -1
  touch "$tmp/late-copy/labrynth-windows-x64.exe"
  run_verify "$tmp/late-copy"
  check "a file added after signing fails as unsigned" \
    $(( status == 1 && $(grep -c '^UNSIGNED labrynth-windows-x64.exe' <<<"$out") == 1 ))

  make_fixture "$tmp/stable" -1
  add_aliases "$tmp/stable"
  run_verify --stable "$tmp/stable"
  check "a stable release with signed aliases passes" $(( status == 0 ))

  make_fixture "$tmp/stable-no-alias" -1
  run_verify --stable "$tmp/stable-no-alias"
  check "a stable release without its aliases fails" \
    $(( status == 1 && $(grep -c '^MISSING  Latest alias ' <<<"$out") == ${#ALIASES[@]} ))

  make_fixture "$tmp/prerelease-no-alias" -1
  run_verify "$tmp/prerelease-no-alias"
  check "a prerelease needs no aliases" $(( status == 0 ))

  if (( fails > 0 )); then
    echo "self-test: $fails check(s) failed" >&2
    return 1
  fi
  echo "self-test: all checks passed"
}

case ${1:-} in
  --self-test) self_test ;;
  --stable)
    if [[ -z ${2:-} ]]; then
      echo "usage: $0 [--stable] <artifacts-dir> | --self-test" >&2
      exit 2
    fi
    verify "$2" 1
    ;;
  "")
    echo "usage: $0 [--stable] <artifacts-dir> | --self-test" >&2
    exit 2
    ;;
  *) verify "$1" ;;
esac
