#!/usr/bin/env python3
"""Cross-platform build orchestrator for Labrynth standalone packaging.

Orchestrates the full build pipeline:
  0. Validate environment (reacher package + its bundled firmware hex)
  1. Build React frontend (npm ci && npm run build)
  2. Validate required assets exist
  3. Run PyInstaller with labrynth.spec
  4. Report output location

Firmware hex files are no longer compiled or fetched here — they ship as
package data inside the ``reacher`` pip dependency (firmware source lives in
the reacher repo since reacher-firmware was archived). This build sources hex
straight from the installed reacher package, so the version is pinned by the
``reacher`` dependency in pyproject.toml.

Usage:
  python build.py                          # full GUI build
  python build.py --skip-frontend          # skip npm build
  python build.py --avrdude /usr/bin/avrdude  # explicit avrdude path
  python build.py --skip-llm               # skip llama.cpp + GGUF (faster local GUI builds)
  python build.py --cli                    # build GUI + LabrynthCLI console app
  python build.py --cli-only               # build only LabrynthCLI (no frontend)

Requires: Python 3.10+, Node.js, npm, PyInstaller (pip install pyinstaller),
and the reacher package installed (pip install reacher2p or -e ../reacher).
Building the CLI also requires the ``[cli]`` extras: pip install -e ".[cli]".
"""

import argparse
import hashlib
import os
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = SCRIPT_DIR

FRONTEND_DIR = os.path.join(PROJECT_ROOT, "web")
FRONTEND_DIST = os.path.join(FRONTEND_DIR, "dist")
SPEC_FILE = os.path.join(SCRIPT_DIR, "labrynth.spec")
SPEC_FILE_CLI = os.path.join(SCRIPT_DIR, "labrynth-cli.spec")

PARADIGMS = ("fr", "pr", "vi", "omission", "pavlovian")
BOARDS = ("uno", "mega")


def resolve_reacher_hex_dir():
    """Return the firmware hex directory shipped inside the installed reacher package.

    Firmware hex is package data at ``reacher/hex/<board>/<paradigm>.hex``.
    Returns the absolute path to that ``hex`` directory, or None if reacher is
    not importable or ships no hex tree. Shared by build.py (asset validation)
    and labrynth.spec (bundling) so both agree on the source of truth.
    """
    try:
        from importlib import resources

        hex_dir = resources.files("reacher") / "hex"
        path = os.fspath(hex_dir)
    except (ImportError, ModuleNotFoundError, AttributeError):
        return None
    return path if os.path.isdir(path) else None


def _run(cmd, cwd=None, env=None):
    """Run a command, streaming output. Exit on failure."""
    print(f"  $ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, env=env)
    if result.returncode != 0:
        print(f"\nERROR: Command failed with exit code {result.returncode}")
        sys.exit(result.returncode)


# ---------------------------------------------------------------------------
# Build stages
# ---------------------------------------------------------------------------

def validate_environment():
    """Verify reacher is installed and ships firmware hex as package data."""
    print("\n=== Stage 0: Validate environment ===")

    # Check reacher package
    try:
        import reacher
        version = getattr(reacher, "__version__", "unknown")
        print(f"  [OK] reacher package (v{version})")
    except ImportError:
        print("ERROR: reacher package not installed.")
        print("       Run: pip install -e ../reacher   (or: pip install reacher2p)")
        sys.exit(1)

    # Check the reacher package actually carries firmware hex
    hex_dir = resolve_reacher_hex_dir()
    if hex_dir:
        print(f"  [OK] Firmware hex (from reacher package): {hex_dir}")
    else:
        print("ERROR: reacher package ships no firmware hex (reacher/hex/).")
        print("       Reinstall reacher: pip install -e ../reacher")
        sys.exit(1)


def validate_cli_deps():
    """Verify the [cli] extras are importable so PyInstaller can bundle them."""
    print("\n=== Stage 0b: Validate CLI dependencies ===")
    missing = []
    for mod in ("prompt_toolkit", "httpx", "websockets"):
        try:
            __import__(mod)
            print(f"  [OK] {mod}")
        except ImportError:
            missing.append(mod)
    if missing:
        print(f"ERROR: CLI dependencies not importable: {', '.join(missing)}")
        print('       Run: pip install -e ".[cli]"')
        sys.exit(1)


def build_frontend():
    """Build the React frontend."""
    print("\n=== Stage 1: Build frontend ===")
    if not os.path.isfile(os.path.join(FRONTEND_DIR, "package.json")):
        print(f"ERROR: package.json not found at {FRONTEND_DIR}")
        sys.exit(1)

    npm = "npm.cmd" if platform.system() == "Windows" else "npm"
    _run([npm, "ci"], cwd=FRONTEND_DIR)
    _run([npm, "run", "build"], cwd=FRONTEND_DIR)


_AVRDUDE_VERSION = "8.1"
_AVRDUDE_MIN_SIZE = 100_000  # bytes — Chocolatey shims are ~24 KB, real binary is ~7 MB

# SHA-256 of avrdude-v<ver>-windows-x64.zip from the official GitHub release.
# Pinned in-repo because upstream publishes no per-asset checksum for this zip.
# Update together with _AVRDUDE_VERSION (and the matching CI pins in
# .github/workflows/build-installers.yml + build-prerelease.yml).
# Compute: sha256sum avrdude-v<ver>-windows-x64.zip
_AVRDUDE_SHA256 = {
    "8.1": "e4d571d81fee3387d51bfdedd0b6565e4c201e974101cac2caec7adfd6201da3",
}

# SHA-256 of the avrdude.exe extracted from that zip. Verified before the binary
# is returned — covers both a fresh download and reuse of the .avrdude-dist cache
# (which a prior run populated). Update alongside _AVRDUDE_SHA256.
# Compute: unzip -p avrdude-v<ver>-windows-x64.zip avrdude.exe | sha256sum
_AVRDUDE_EXE_SHA256 = {
    "8.1": "b08186071b0877ceed6ec3e86dd42ee6d2b7556859659b34d4e326069cafbf45",
}


def _sha256_file(path):
    """Return the lowercase hex SHA-256 of a file, read in chunks."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _safe_extract(zf, dest):
    """Extract a ZipFile to dest, rejecting members that escape dest (zip-slip).

    Validates every member path first; any single unsafe member (``..`` or an
    absolute path) aborts the whole extraction with RuntimeError.
    """
    dest_abs = os.path.abspath(dest)
    for member in zf.namelist():
        target = os.path.abspath(os.path.join(dest_abs, member))
        if target != dest_abs and not target.startswith(dest_abs + os.sep):
            raise RuntimeError(f"unsafe path in archive: {member!r}")
    zf.extractall(dest)


def _avrdude_exe_verified(path):
    """True if path is a real avrdude.exe matching the pinned SHA-256.

    Used for both a freshly extracted binary and a cached one from a prior
    run, so nothing is bundled without an integrity check.
    """
    if os.path.getsize(path) < _AVRDUDE_MIN_SIZE:
        return False
    expected = _AVRDUDE_EXE_SHA256.get(_AVRDUDE_VERSION)
    return bool(expected) and _sha256_file(path) == expected


def _ensure_real_avrdude(avrdude_path):
    """Return a path to a real avrdude binary, downloading one if necessary.

    On Windows, Chocolatey installs a small shim (~24 KB) instead of the
    real binary.  The shim breaks when relocated into a PyInstaller bundle.
    This function detects shims by file size and downloads the real avrdude
    from GitHub releases automatically.
    """
    # Happy path: the provided binary is real
    if avrdude_path and os.path.isfile(avrdude_path):
        if os.path.getsize(avrdude_path) >= _AVRDUDE_MIN_SIZE:
            return avrdude_path
        print(f"  [WARN] avrdude at {avrdude_path} is only "
              f"{os.path.getsize(avrdude_path):,} bytes (likely a shim)")

    # Only auto-download on Windows — Linux/macOS package managers install real binaries
    if platform.system() != "Windows":
        return avrdude_path

    # Check cache from a previous download — re-verify against the pinned hash so a
    # stale or tampered .avrdude-dist is never trusted on size alone.
    dist_dir = os.path.join(PROJECT_ROOT, ".avrdude-dist")
    if os.path.isdir(dist_dir):
        for root, _dirs, files in os.walk(dist_dir):
            for f in files:
                if f.lower() == "avrdude.exe":
                    cached = os.path.join(root, f)
                    if _avrdude_exe_verified(cached):
                        print(f"  [OK] Using cached avrdude: {cached}")
                        return cached

    # Download avrdude from GitHub releases (MSVC build, statically linked, no DLLs)
    import zipfile

    asset = f"avrdude-v{_AVRDUDE_VERSION}-windows-x64.zip"
    url = f"https://github.com/avrdudes/avrdude/releases/download/v{_AVRDUDE_VERSION}/{asset}"
    zip_path = os.path.join(PROJECT_ROOT, asset)
    print(f"  [INFO] Downloading avrdude v{_AVRDUDE_VERSION} from {url}")
    try:
        urllib.request.urlretrieve(url, zip_path)
    except Exception as exc:
        print(f"  [ERROR] Failed to download avrdude: {exc}")
        return avrdude_path

    # Verify integrity against the pinned checksum before trusting the archive.
    expected = _AVRDUDE_SHA256.get(_AVRDUDE_VERSION)
    if not expected:
        print(f"  [ERROR] No pinned SHA-256 for avrdude v{_AVRDUDE_VERSION} — "
              f"add it to _AVRDUDE_SHA256. Refusing to bundle.")
        os.remove(zip_path)
        return avrdude_path
    actual = _sha256_file(zip_path)
    if actual != expected:
        print(f"  [ERROR] avrdude checksum mismatch — refusing to bundle. "
              f"expected={expected} actual={actual}")
        os.remove(zip_path)
        return avrdude_path
    print(f"  [OK] Verified avrdude SHA-256: {actual}")

    os.makedirs(dist_dir, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path) as zf:
            _safe_extract(zf, dist_dir)
    finally:
        # Always drop the archive, even if extraction rejected an unsafe member.
        if os.path.exists(zip_path):
            os.remove(zip_path)

    for root, _dirs, files in os.walk(dist_dir):
        for f in files:
            if f.lower() == "avrdude.exe":
                real = os.path.join(root, f)
                if _avrdude_exe_verified(real):
                    print(f"  [OK] Downloaded avrdude: {real} "
                          f"({os.path.getsize(real):,} bytes)")
                    return real

    print("  [ERROR] verified avrdude.exe not found in downloaded archive")
    return avrdude_path


# ---------------------------------------------------------------------------
# Bundled local LLM (llama.cpp + Qwen2.5-1.5B-Instruct Q4_K_M)
# ---------------------------------------------------------------------------

_LLAMA_CPP_TAG = "b10622"
_GGUF_NAME = "qwen2.5-1.5b-instruct-q4_k_m.gguf"
_GGUF_URL = (
    "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/"
    + _GGUF_NAME
)
_GGUF_SHA256 = "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e"

# SHA-256 of the official llama.cpp CPU archives for this tag.
_LLAMA_ARCHIVE_SHA256 = {
    "llama-b10622-bin-ubuntu-x64.tar.gz": "6cc895c67bfa868faccda8aca06ec136e489609fc20f068550214f149d94fb4c",
    "llama-b10622-bin-ubuntu-arm64.tar.gz": "6730946e555d57cdd29ad28f9d445a9195fa3d72d5ed076fa6dcfe25a4f4c266",
    "llama-b10622-bin-macos-arm64.tar.gz": "c0116ec9957477a9c77e68d3cf31e79f9aede1a9210861c7c09d74acc3e9c3cf",
    "llama-b10622-bin-macos-x64.tar.gz": "b772320b22bc5cf845930088c985012b94e284242c2ad05fad174297eb5e373e",
    "llama-b10622-bin-win-cpu-x64.zip": "0f016b001d00a0cc25b955a5ae5eb3ce57a0b16adaa9142f8a3c3269e83fce0a",
    "llama-b10622-bin-win-cpu-arm64.zip": "fba77e5b089bf6ac669a06559c48863c84eda77c4f8678d39861b77407648850",
}


def _llm_platform_archive():
    """Return (archive_name, is_zip) for the current OS/arch, or None."""
    system = platform.system()
    machine = platform.machine().lower()
    arm = machine in ("arm64", "aarch64")
    tag = _LLAMA_CPP_TAG
    if system == "Windows":
        name = f"llama-{tag}-bin-win-cpu-{'arm64' if arm else 'x64'}.zip"
        return name, True
    if system == "Darwin":
        name = f"llama-{tag}-bin-macos-{'arm64' if arm else 'x64'}.tar.gz"
        return name, False
    # Linux (and other Unix) — official builds are Ubuntu glibc.
    name = f"llama-{tag}-bin-ubuntu-{'arm64' if arm else 'x64'}.tar.gz"
    return name, False


def _download(url, dest):
    """Download *url* to *dest* with a UA HuggingFace will accept."""
    req = urllib.request.Request(url, headers={"User-Agent": "labrynth-build"})
    with urllib.request.urlopen(req, timeout=600) as src, open(dest, "wb") as out:
        shutil.copyfileobj(src, out)


def _safe_extract_tar(tf, dest):
    """Extract a TarFile to dest, rejecting members that escape dest."""
    dest_abs = os.path.abspath(dest)
    for member in tf.getmembers():
        target = os.path.abspath(os.path.join(dest_abs, member.name))
        if target != dest_abs and not target.startswith(dest_abs + os.sep):
            raise RuntimeError(f"unsafe path in archive: {member.name!r}")
    tf.extractall(dest)


# llama.cpp b10622 split raw prompt completion out of ``llama-cli`` into
# ``llama-completion``; ``llama-cli`` is chat-only and no longer accepts
# ``--no-conversation``, which is the flag set reacher's summarizer sends.
# Bundle both and let the launcher point REACHER_LLM_BIN at the right one.
_LLAMA_BINARIES = ("llama-cli", "llama-completion")


def llama_binaries(root):
    """Return paths to the llama.cpp executables to bundle, found under *root*."""
    wanted = {n for b in _LLAMA_BINARIES for n in (b, b + ".exe")}
    found = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if name.lower() in wanted:
                path = os.path.join(dirpath, name)
                if os.path.isfile(path) and os.path.getsize(path) > 0:
                    found.append(path)
    return sorted(found)


def _find_llama_cli(root):
    """Return the path to llama-cli / llama-cli.exe under *root*, or None.

    Any non-empty match is accepted: Windows CPU archives ship
    ``llama-cli.exe`` as a ~9 KB loader stub whose implementation lives in
    ``llama-cli-impl.dll`` beside it, so a size floor would reject the real
    Windows binary.
    """
    wanted = {"llama-cli", "llama-cli.exe"}
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if name.lower() not in wanted:
                continue
            path = os.path.join(dirpath, name)
            if os.path.isfile(path) and os.path.getsize(path) > 0:
                return path
    return None


def _list_llama_cli_candidates(root):
    """Return ``[(size, path), ...]`` for names containing llama-cli (debug)."""
    found = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if "llama-cli" not in name.lower():
                continue
            path = os.path.join(dirpath, name)
            if os.path.isfile(path):
                found.append((os.path.getsize(path), path))
    found.sort()
    return found


# ELF sonames carry the version *after* the extension (libllama.so.0), so an
# ``endswith(".so")`` test silently drops exactly the files DT_NEEDED asks for.
# Mach-O and PE put the version before it (libllama.0.dylib, ggml.dll).
_SHARED_LIB_RE = re.compile(r"\.(?:dll|dylib)$|\.so(?:\.\d+)*$", re.IGNORECASE)


def is_shared_lib(name):
    """True when *name* is a shared library, including versioned ELF sonames."""
    return bool(_SHARED_LIB_RE.search(name))


def _copy_llama_runtime(cli_path, dest_dir):
    """Copy the llama.cpp executables and sibling shared libraries into dest_dir."""
    os.makedirs(dest_dir, exist_ok=True)
    src_dir = os.path.dirname(cli_path)
    dest_cli = os.path.join(dest_dir, os.path.basename(cli_path))
    for src in llama_binaries(src_dir):
        dest = os.path.join(dest_dir, os.path.basename(src))
        shutil.copy2(src, dest)
        os.chmod(dest, 0o755)
    for name in os.listdir(src_dir):
        if is_shared_lib(name):
            shutil.copy2(os.path.join(src_dir, name), os.path.join(dest_dir, name))
    return dest_cli


def _smoke_test_llama(cli_path):
    """Return (ok, detail) for ``<binary> --version``.

    ``--version`` does not touch the GGUF, so this stays fast and runs before
    the model is required.  It catches a bundle whose companion libraries are
    missing or unloadable, which otherwise ships fine and only fails at report
    time inside reacher's summarizer.
    """
    runtime_dir = os.path.dirname(cli_path)
    env = os.environ.copy()
    for var in ("LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH"):
        env[var] = runtime_dir + os.pathsep + env.get(var, "")
    try:
        result = subprocess.run(
            [cli_path, "--version"],
            capture_output=True,
            text=True,
            timeout=60,
            env=env,
            check=False,
        )
    except OSError as exc:
        return False, str(exc)
    if result.returncode != 0:
        detail = ((result.stderr or "") + (result.stdout or "")).strip()
        return False, f"exit {result.returncode}: {detail[-500:]}"
    return True, ""


def ensure_llm(skip=False):
    """Return (llama-cli path, GGUF path), downloading pinned artifacts if needed.

    Returns (None, None) when *skip* is True.  Exits the process if a required
    download or checksum fails — the GUI bundle is supposed to ship the model.
    """
    if skip:
        return None, None

    dist_dir = os.path.join(PROJECT_ROOT, ".llm-dist")
    os.makedirs(dist_dir, exist_ok=True)

    gguf_path = os.path.join(dist_dir, _GGUF_NAME)
    if os.path.isfile(gguf_path) and _sha256_file(gguf_path) == _GGUF_SHA256:
        print(f"  [OK] Cached GGUF: {gguf_path}")
    else:
        print(f"  [INFO] Downloading {_GGUF_NAME} (~1.1 GB)")
        tmp = gguf_path + ".part"
        try:
            _download(_GGUF_URL, tmp)
        except Exception as exc:
            print(f"  [ERROR] Failed to download GGUF: {exc}")
            sys.exit(1)
        actual = _sha256_file(tmp)
        if actual != _GGUF_SHA256:
            os.remove(tmp)
            print(f"  [ERROR] GGUF checksum mismatch — refusing to bundle. expected={_GGUF_SHA256} actual={actual}")
            sys.exit(1)
        os.replace(tmp, gguf_path)
        print(f"  [OK] Verified GGUF SHA-256: {actual}")

    archive_name, is_zip = _llm_platform_archive()
    expected = _LLAMA_ARCHIVE_SHA256.get(archive_name)
    if not expected:
        print(f"  [ERROR] No pinned SHA-256 for {archive_name}")
        sys.exit(1)

    plat_key = archive_name.replace(f"llama-{_LLAMA_CPP_TAG}-bin-", "").rsplit(".", 1)[0]
    runtime_dir = os.path.join(dist_dir, plat_key)
    cached_cli = _find_llama_cli(runtime_dir) if os.path.isdir(runtime_dir) else None
    if cached_cli:
        cached = llama_binaries(runtime_dir)
        checks = [_smoke_test_llama(b) for b in cached]
        complete = len(cached) == len(_LLAMA_BINARIES)
        ok = complete and all(c[0] for c in checks)
        detail = next((c[1] for c in checks if not c[0]), "incomplete binary set")
        if ok:
            print(f"  [OK] Cached llama-cli: {cached_cli}")
            return cached_cli, gguf_path
        print(f"  [WARN] Cached llama-cli is not runnable ({detail}); re-extracting")
        shutil.rmtree(runtime_dir, ignore_errors=True)

    archive_path = os.path.join(dist_dir, archive_name)
    url = f"https://github.com/ggml-org/llama.cpp/releases/download/{_LLAMA_CPP_TAG}/{archive_name}"
    print(f"  [INFO] Downloading llama.cpp {_LLAMA_CPP_TAG}: {archive_name}")
    try:
        _download(url, archive_path)
    except Exception as exc:
        print(f"  [ERROR] Failed to download llama.cpp: {exc}")
        sys.exit(1)
    actual = _sha256_file(archive_path)
    if actual != expected:
        os.remove(archive_path)
        print(f"  [ERROR] llama.cpp checksum mismatch — refusing to bundle. expected={expected} actual={actual}")
        sys.exit(1)
    print(f"  [OK] Verified llama.cpp SHA-256: {actual}")

    extract_dir = os.path.join(dist_dir, f"_extract-{plat_key}")
    if os.path.isdir(extract_dir):
        shutil.rmtree(extract_dir)
    os.makedirs(extract_dir)
    try:
        if is_zip:
            with zipfile.ZipFile(archive_path) as zf:
                _safe_extract(zf, extract_dir)
        else:
            with tarfile.open(archive_path, "r:gz") as tf:
                _safe_extract_tar(tf, extract_dir)
    except Exception as exc:
        print(f"  [ERROR] Failed to extract llama.cpp archive: {exc}")
        sys.exit(1)

    found = _find_llama_cli(extract_dir)
    if not found:
        print("  [ERROR] llama-cli not found in downloaded archive")
        for size, path in _list_llama_cli_candidates(extract_dir):
            print(f"           {size:>10}  {path}")
        sys.exit(1)
    cli_path = _copy_llama_runtime(found, runtime_dir)
    for _bin in llama_binaries(runtime_dir):
        ok, detail = _smoke_test_llama(_bin)
        if not ok:
            print(f"  [ERROR] Bundled {os.path.basename(_bin)} is not runnable — "
                  f"refusing to bundle. {detail}")
            sys.exit(1)
        print(f"  [OK] {os.path.basename(_bin)} smoke test passed")
    print(f"  [OK] llama-cli: {cli_path} ({os.path.getsize(found)} bytes)")
    return cli_path, gguf_path


def validate_assets(avrdude_path, require_frontend=True):
    """Validate that all required assets exist before packaging."""
    print("\n=== Stage 2: Validate assets ===")
    ok = True

    # Frontend dist (not needed for the CLI-only build, which ships no static/)
    if require_frontend:
        index_html = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.isfile(index_html):
            print(f"  [OK] Frontend dist: {FRONTEND_DIST}")
        else:
            print(f"  [MISSING] Frontend dist: {index_html}")
            ok = False

    # Hex files come from the installed reacher package (board-aware layout).
    hex_dir = resolve_reacher_hex_dir()
    if not hex_dir:
        print("  [MISSING] reacher package firmware hex (reacher/hex/)")
        ok = False
    else:
        for board in BOARDS:
            board_dir = os.path.join(hex_dir, board)
            board_hex = [p for p in PARADIGMS
                         if os.path.isfile(os.path.join(board_dir, f"{p}.hex"))]
            if board_hex:
                print(f"  [OK] Hex files ({board}): {', '.join(board_hex)}")
            else:
                print(f"  [WARN] No hex files found for {board} in {board_dir}")

    # avrdude — ensure we have a real binary, not a Chocolatey shim
    if avrdude_path and os.path.isfile(avrdude_path):
        avrdude_path = _ensure_real_avrdude(avrdude_path)
        print(f"  [OK] avrdude: {avrdude_path}")
    elif shutil.which("avrdude"):
        avrdude_path = _ensure_real_avrdude(shutil.which("avrdude"))
        print(f"  [OK] avrdude: {avrdude_path}")
    else:
        # No avrdude found — try downloading on Windows
        avrdude_path = _ensure_real_avrdude(None)
        if avrdude_path and os.path.isfile(avrdude_path):
            print(f"  [OK] avrdude (downloaded): {avrdude_path}")
        else:
            print("  [MISSING] avrdude — firmware upload won't work without it.")
            print("            Install avrdude or run on Windows to auto-download.")
            ok = False

    if not ok:
        print("\nERROR: Required assets missing. Fix the issues above or use --skip-* flags.")
        sys.exit(1)

    return avrdude_path


def run_pyinstaller(avrdude_path, spec_file=SPEC_FILE, llm_bin=None, llm_model=None):
    """Run PyInstaller with the given spec file."""
    print(f"\n=== Stage 3: Run PyInstaller ({os.path.basename(spec_file)}) ===")
    if not shutil.which("pyinstaller"):
        print("ERROR: pyinstaller not found. Install with: pip install pyinstaller")
        sys.exit(1)

    env = os.environ.copy()
    if avrdude_path:
        env["REACHER_AVRDUDE_PATH"] = avrdude_path
    if llm_bin:
        env["REACHER_LLM_BIN"] = llm_bin
    if llm_model:
        env["REACHER_LLM_MODEL"] = llm_model

    _run(
        ["pyinstaller", "--noconfirm", "--clean", spec_file],
        cwd=PROJECT_ROOT,
        env=env,
    )


def report_output(name="Labrynth"):
    """Report the location of a built artifact (GUI ``Labrynth`` or ``LabrynthCLI``)."""
    print(f"\n=== Stage 4: Build complete ({name}) ===")
    system = platform.system()

    if system == "Darwin":
        app_path = os.path.join(SCRIPT_DIR, "dist", f"{name}.app")
        if os.path.isdir(app_path):
            print(f"  Output: {app_path}")
            print(f"  Run:    open {app_path}")
            return
    elif system == "Windows":
        exe_path = os.path.join(SCRIPT_DIR, "dist", name, f"{name}.exe")
        if os.path.isfile(exe_path):
            print(f"  Output: {os.path.dirname(exe_path)}")
            print(f"  Run:    {exe_path}")
            return
    else:
        exe_path = os.path.join(SCRIPT_DIR, "dist", name, name)
        if os.path.isfile(exe_path):
            print(f"  Output: {os.path.dirname(exe_path)}")
            print(f"  Run:    {exe_path}")
            return

    # Fallback: just point to dist/
    dist_dir = os.path.join(SCRIPT_DIR, "dist")
    print(f"  Output: {dist_dir}")
    print("  Check the dist/ directory for built artifacts.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Build Labrynth standalone executable",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Example: python build.py --skip-frontend --avrdude /usr/bin/avrdude",
    )
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Skip npm build (use existing web/dist/)",
    )
    parser.add_argument(
        "--avrdude",
        metavar="PATH",
        default="",
        help="Explicit path to avrdude binary to bundle",
    )
    parser.add_argument(
        "--cli",
        action="store_true",
        help="Also build the standalone LabrynthCLI console app",
    )
    parser.add_argument(
        "--cli-only",
        action="store_true",
        help="Build only LabrynthCLI (no frontend, no GUI bundle)",
    )
    parser.add_argument(
        "--skip-llm",
        action="store_true",
        help="Skip downloading/bundling llama.cpp + GGUF (GUI builds only; issue reporting will be unavailable)",
    )
    args = parser.parse_args()

    print("Labrynth Build Orchestrator")
    print(f"  Platform: {platform.system()} {platform.machine()}")
    print(f"  Python:   {sys.version.split()[0]}")
    print(f"  Project:  {PROJECT_ROOT}")

    # Stage 0: Validate (reacher package + its bundled firmware hex)
    validate_environment()
    if args.cli or args.cli_only:
        validate_cli_deps()

    # CLI-only: skip frontend entirely; the CLI bundle ships no static/ and no LLM.
    if args.cli_only:
        avrdude_path = validate_assets(args.avrdude, require_frontend=False)
        run_pyinstaller(avrdude_path, SPEC_FILE_CLI)
        report_output("LabrynthCLI")
        return

    # Stage 1: Frontend
    if args.skip_frontend:
        print("\n=== Stage 1: Build frontend [SKIPPED] ===")
    else:
        build_frontend()

    # Stage 2: Validate
    avrdude_path = validate_assets(args.avrdude)

    print("\n=== Stage 2b: Local LLM (llama.cpp + GGUF) ===")
    llm_bin, llm_model = ensure_llm(skip=args.skip_llm)
    if args.skip_llm:
        print("  [SKIP] llama.cpp / GGUF not bundled (--skip-llm)")
    elif llm_bin:
        print(f"  [OK] llama-cli: {llm_bin}")
        print(f"  [OK] GGUF:      {llm_model}")

    # Stage 3: PyInstaller (GUI)
    run_pyinstaller(avrdude_path, llm_bin=llm_bin, llm_model=llm_model)

    # Stage 4: Report (GUI)
    report_output()

    # Optional: also build the standalone CLI bundle (no LLM)
    if args.cli:
        run_pyinstaller(avrdude_path, SPEC_FILE_CLI)
        report_output("LabrynthCLI")


if __name__ == "__main__":
    main()
