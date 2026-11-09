#!/usr/bin/env bash
# Signs a release artifacts directory for the in-app updater.
#
# Writes two files into the directory:
#   SHA256SUMS      one "<sha256>  <name>" line per asset
#   SHA256SUMS.sig  a detached Ed25519 signature over SHA256SUMS
#
# Usage:
#   UPDATE_SIGNING_KEY="<PEM text>" sign-release-assets.sh <artifacts-dir>
#   sign-release-assets.sh --self-test
#
# The signing key's public half must equal the key in
# installer/update-public-key.txt (override with UPDATE_PUBLIC_KEY_FILE). That
# is the key every installed app trusts, so signing with any other key would
# publish updates nobody can verify.
#
# Exit status: 0 signed, 1 refused (bad key, wrong key, nothing to sign),
# 2 usage or missing input.
set -euo pipefail

# Print the 32 raw bytes of a private key's public half, base64 encoded.
public_key_b64() {
  openssl pkey -in "$1" -pubout -outform DER | tail -c 32 | base64 | tr -d '\n'
}

# Refuse unless the PEM at $1 is an Ed25519 private key whose public half
# equals the base64 key in file $2.
check_signing_key() {
  local key_file=$1 public_file=$2 expected actual
  if ! openssl pkey -in "$key_file" -noout 2>/dev/null; then
    echo "UPDATE_SIGNING_KEY is not a readable private key" >&2
    return 1
  fi
  if ! openssl pkey -in "$key_file" -text -noout 2>/dev/null | grep -qi '^ED25519 Private-Key'; then
    echo "UPDATE_SIGNING_KEY is not an Ed25519 key" >&2
    return 1
  fi
  expected=$(tr -d '[:space:]' <"$public_file")
  actual=$(public_key_b64 "$key_file")
  if [[ $actual != "$expected" ]]; then
    echo "UPDATE_SIGNING_KEY does not match the public key shipped in the app ($public_file)" >&2
    return 1
  fi
}

# Write one "<sha256>  <name>" line per asset in $1 to $2, sorted by name.
# SHA256SUMS and its signature are never listed.
write_sums() {
  local dir=$1 sums_file=$2 name count=0
  : >"$sums_file"
  while IFS= read -r name; do
    (cd "$dir" && sha256sum -- "$name") >>"$sums_file"
    count=$((count + 1))
  done < <(find "$dir" -maxdepth 1 -type f ! -name SHA256SUMS ! -name SHA256SUMS.sig -printf '%f\n' | LC_ALL=C sort)
  if (( count == 0 )); then
    echo "no assets to sign in $dir" >&2
    return 1
  fi
}

sign() {
  local dir=$1 script_dir public_file work status=0
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  public_file=${UPDATE_PUBLIC_KEY_FILE:-$script_dir/../installer/update-public-key.txt}

  if [[ ! -d $dir ]]; then
    echo "not a directory: $dir" >&2
    return 2
  fi
  if [[ -z ${UPDATE_SIGNING_KEY:-} ]]; then
    echo "UPDATE_SIGNING_KEY is not set" >&2
    return 2
  fi
  if [[ ! -r $public_file ]]; then
    echo "public key file not found: $public_file" >&2
    return 2
  fi

  # Everything is built in a private temp dir and copied in only when whole,
  # so a refused run leaves the artifacts directory untouched.
  work=$(mktemp -d)
  trap 'rm -rf "$work"' RETURN
  chmod 700 "$work"
  printf '%s\n' "$UPDATE_SIGNING_KEY" >"$work/key.pem"

  check_signing_key "$work/key.pem" "$public_file" || return 1
  write_sums "$dir" "$work/SHA256SUMS" || return 1
  openssl pkeyutl -sign -inkey "$work/key.pem" -rawin -in "$work/SHA256SUMS" -out "$work/SHA256SUMS.sig" || status=$?
  if (( status != 0 )); then
    echo "signing failed" >&2
    return 1
  fi

  cp "$work/SHA256SUMS" "$work/SHA256SUMS.sig" "$dir/"
  echo "signed $(wc -l <"$work/SHA256SUMS") assets in $dir"
}

# Test helpers. tmp is global so the EXIT trap can still read it.
tmp=""
fails=0
out=""
status=0
self=""

check() {
  local desc=$1
  shift
  if "$@" >/dev/null 2>&1; then
    echo "ok    $desc"
  else
    echo "FAIL  $desc"
    fails=$((fails + 1))
  fi
}

not() { ! "$@"; }

make_assets() {
  mkdir -p "$1"
  printf 'one' >"$1/labrynth-3.0.1-beta.9-linux-x64.tar.gz"
  printf 'two' >"$1/labrynth-3.0.1-beta.9-windows-x64.zip"
  printf 'cli' >"$1/labrynth-cli-3.0.1-beta.9-linux-x64.tar.gz"
}

# verifies <dir> <public-key-pem>: the signature in dir is valid for its SHA256SUMS.
verifies() {
  openssl pkeyutl -verify -pubin -inkey "$2" -rawin \
    -in "$1/SHA256SUMS" -sigfile "$1/SHA256SUMS.sig"
}

sums_list_three_assets_only() {
  [[ $(wc -l <"$1/SHA256SUMS") -eq 3 ]] && ! grep -q SHA256SUMS "$1/SHA256SUMS"
}

sums_match_files() {
  (cd "$1" && sha256sum -c --quiet SHA256SUMS)
}

signature_is_64_bytes() {
  [[ $(wc -c <"$1/SHA256SUMS.sig") -eq 64 ]]
}

wrote_nothing() {
  [[ ! -e $1/SHA256SUMS && ! -e $1/SHA256SUMS.sig ]]
}

output_hides_key() {
  local second_line
  second_line=$(sed -n 2p "$2")
  [[ $1 != *"PRIVATE KEY"* && $1 != *"$second_line"* ]]
}

status_is() { [[ $status -eq $1 ]]; }

# run_sign <dir> <private-key-file> <expected-public-key-file>
# Sets out and status. A missing key file means the secret is unset.
run_sign() {
  local key_text=""
  [[ -f $2 ]] && key_text=$(cat "$2")
  status=0
  out=$(UPDATE_SIGNING_KEY=$key_text UPDATE_PUBLIC_KEY_FILE=$3 "$self" "$1" 2>&1) || status=$?
}

self_test() {
  self=$0
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT

  openssl genpkey -algorithm ed25519 -out "$tmp/key.pem" 2>/dev/null
  openssl genpkey -algorithm ed25519 -out "$tmp/other.pem" 2>/dev/null
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$tmp/rsa.pem" 2>/dev/null
  printf 'not a key' >"$tmp/garbage.pem"
  public_key_b64 "$tmp/key.pem" >"$tmp/key.pub.txt"
  openssl pkey -in "$tmp/key.pem" -pubout -out "$tmp/key.pub.pem"
  openssl pkey -in "$tmp/other.pem" -pubout -out "$tmp/other.pub.pem"

  make_assets "$tmp/a"
  run_sign "$tmp/a" "$tmp/key.pem" "$tmp/key.pub.txt"
  check "signing a directory succeeds" status_is 0
  check "SHA256SUMS lists the three assets and not itself" sums_list_three_assets_only "$tmp/a"
  check "SHA256SUMS matches the files" sums_match_files "$tmp/a"
  check "signature is 64 raw bytes" signature_is_64_bytes "$tmp/a"
  check "signature verifies under the signing key's public half" verifies "$tmp/a" "$tmp/key.pub.pem"
  check "signature does not verify under a different key" not verifies "$tmp/a" "$tmp/other.pub.pem"
  check "output never prints key material" output_hides_key "$out" "$tmp/key.pem"

  printf 'tampered' >>"$tmp/a/SHA256SUMS"
  check "editing SHA256SUMS after signing breaks the signature" not verifies "$tmp/a" "$tmp/key.pub.pem"

  make_assets "$tmp/b"
  run_sign "$tmp/b" "$tmp/key.pem" "$tmp/key.pub.txt"
  run_sign "$tmp/b" "$tmp/key.pem" "$tmp/key.pub.txt"
  check "signing twice succeeds" status_is 0
  check "signing twice still lists three assets" sums_list_three_assets_only "$tmp/b"
  check "the second signature still verifies" verifies "$tmp/b" "$tmp/key.pub.pem"

  make_assets "$tmp/c"
  run_sign "$tmp/c" "$tmp/other.pem" "$tmp/key.pub.txt"
  check "a key that is not the shipped key is refused" status_is 1
  check "a refused run writes no signature files" wrote_nothing "$tmp/c"

  run_sign "$tmp/c" "$tmp/missing.pem" "$tmp/key.pub.txt"
  check "a missing key is refused with status 2" status_is 2

  run_sign "$tmp/c" "$tmp/garbage.pem" "$tmp/key.pub.txt"
  check "an unreadable key is refused with status 1" status_is 1

  run_sign "$tmp/c" "$tmp/rsa.pem" "$tmp/key.pub.txt"
  check "a non-Ed25519 key is refused with status 1" status_is 1

  mkdir -p "$tmp/empty"
  run_sign "$tmp/empty" "$tmp/key.pem" "$tmp/key.pub.txt"
  check "an empty directory is refused with status 1" status_is 1

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
  *) sign "$1" ;;
esac
