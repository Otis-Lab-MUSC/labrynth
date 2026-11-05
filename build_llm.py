"""Download, verify and stage the bundled local LLM (llama.cpp + Qwen2.5 GGUF)."""

from __future__ import annotations

import logging
import os
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import zipfile

from build_archive import DOWNLOAD_ERRORS, download_file, extract_tar_safely, extract_zip_safely, hash_file

logger = logging.getLogger(__name__)

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

LLM_DIST_DIRNAME = ".llm-dist"
EXECUTABLE_MODE = 0o755
SMOKE_TEST_TIMEOUT_SECONDS = 60
SMOKE_DETAIL_TAIL_CHARS = 500

LLAMA_CPP_TAG = "b10622"
LLAMA_RELEASE_URL = "https://github.com/ggml-org/llama.cpp/releases/download"
GGUF_NAME = "qwen2.5-1.5b-instruct-q4_k_m.gguf"
GGUF_URL = "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/" + GGUF_NAME
GGUF_SHA256 = "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e"

# SHA-256 of the official llama.cpp CPU archives for this tag.
LLAMA_ARCHIVE_SHA256 = {
    "llama-b10622-bin-ubuntu-x64.tar.gz": "6cc895c67bfa868faccda8aca06ec136e489609fc20f068550214f149d94fb4c",
    "llama-b10622-bin-ubuntu-arm64.tar.gz": "6730946e555d57cdd29ad28f9d445a9195fa3d72d5ed076fa6dcfe25a4f4c266",
    "llama-b10622-bin-macos-arm64.tar.gz": "c0116ec9957477a9c77e68d3cf31e79f9aede1a9210861c7c09d74acc3e9c3cf",
    "llama-b10622-bin-macos-x64.tar.gz": "b772320b22bc5cf845930088c985012b94e284242c2ad05fad174297eb5e373e",
    "llama-b10622-bin-win-cpu-x64.zip": "0f016b001d00a0cc25b955a5ae5eb3ce57a0b16adaa9142f8a3c3269e83fce0a",
    "llama-b10622-bin-win-cpu-arm64.zip": "fba77e5b089bf6ac669a06559c48863c84eda77c4f8678d39861b77407648850",
}

# From llama.cpp b10622, raw prompt completion lives in ``llama-completion``;
# ``llama-cli`` is chat-only and rejects ``--no-conversation``, which is the
# flag reacher's summarizer sends.
# Bundle both and let the launcher point REACHER_LLM_BIN at the right one.
LLAMA_BINARIES = ("llama-cli", "llama-completion")

# ELF sonames carry the version *after* the extension (libllama.so.0), so an
# ``endswith(".so")`` test silently drops exactly the files DT_NEEDED asks for.
# Mach-O and PE put the version before it (libllama.0.dylib, ggml.dll).
SHARED_LIB_RE = re.compile(r"\.(?:dll|dylib)$|\.so(?:\.\d+)*$", re.IGNORECASE)


def select_llama_archive() -> tuple[str, bool]:
    """Return (archive_name, is_zip) for the current OS and architecture."""
    system = platform.system()
    arm = platform.machine().lower() in ("arm64", "aarch64")
    arch = "arm64" if arm else "x64"
    if system == "Windows":
        return f"llama-{LLAMA_CPP_TAG}-bin-win-cpu-{arch}.zip", True
    if system == "Darwin":
        return f"llama-{LLAMA_CPP_TAG}-bin-macos-{arch}.tar.gz", False
    # Linux (and other Unix) — official builds are Ubuntu glibc.
    return f"llama-{LLAMA_CPP_TAG}-bin-ubuntu-{arch}.tar.gz", False


def llama_binaries(root: str) -> list[str]:
    """Return paths to the llama.cpp executables to bundle, found under *root*."""
    wanted = {n for b in LLAMA_BINARIES for n in (b, b + ".exe")}
    found = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if name.lower() in wanted:
                path = os.path.join(dirpath, name)
                if os.path.isfile(path) and os.path.getsize(path) > 0:
                    found.append(path)
    return sorted(found)


def find_llama_cli(root: str) -> str | None:
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


def list_llama_cli_candidates(root: str) -> list[tuple[int, str]]:
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


def is_shared_lib(name: str) -> bool:
    """Return True when *name* is a shared library, including versioned ELF sonames."""
    return bool(SHARED_LIB_RE.search(name))


def copy_llama_runtime(cli_path: str, dest_dir: str) -> str:
    """Copy the llama.cpp executables and sibling shared libraries into dest_dir."""
    os.makedirs(dest_dir, exist_ok=True)
    src_dir = os.path.dirname(cli_path)
    dest_cli = os.path.join(dest_dir, os.path.basename(cli_path))
    for src in llama_binaries(src_dir):
        dest = os.path.join(dest_dir, os.path.basename(src))
        shutil.copy2(src, dest)
        os.chmod(dest, EXECUTABLE_MODE)
    for name in os.listdir(src_dir):
        if is_shared_lib(name):
            shutil.copy2(os.path.join(src_dir, name), os.path.join(dest_dir, name))
    return dest_cli


def smoke_test_llama(cli_path: str) -> tuple[bool, str]:
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
            timeout=SMOKE_TEST_TIMEOUT_SECONDS,
            env=env,
            check=False,
        )
    except OSError as exc:
        return False, str(exc)
    if result.returncode != 0:
        detail = ((result.stderr or "") + (result.stdout or "")).strip()
        return False, f"exit {result.returncode}: {detail[-SMOKE_DETAIL_TAIL_CHARS:]}"
    return True, ""


def ensure_gguf(dist_dir: str) -> str:
    """Return the verified GGUF model path, downloading it if not cached."""
    gguf_path = os.path.join(dist_dir, GGUF_NAME)
    if os.path.isfile(gguf_path) and hash_file(gguf_path) == GGUF_SHA256:
        logger.info(f"  [OK] Cached GGUF: {gguf_path}")
        return gguf_path
    logger.info(f"  [INFO] Downloading {GGUF_NAME} (~1.1 GB)")
    tmp = gguf_path + ".part"
    try:
        download_file(GGUF_URL, tmp)
    except DOWNLOAD_ERRORS as exc:
        logger.error(f"  [ERROR] Failed to download GGUF: {exc}")
        sys.exit(1)
    actual = hash_file(tmp)
    if actual != GGUF_SHA256:
        os.remove(tmp)
        logger.error(f"  [ERROR] GGUF checksum mismatch — refusing to bundle. expected={GGUF_SHA256} actual={actual}")
        sys.exit(1)
    os.replace(tmp, gguf_path)
    logger.info(f"  [OK] Verified GGUF SHA-256: {actual}")
    return gguf_path


def find_cached_llama(runtime_dir: str) -> str | None:
    """Return the cached llama-cli when the whole cached runtime still runs, else None.

    A cached runtime that is incomplete or fails its smoke test is deleted.
    """
    cached_cli = find_llama_cli(runtime_dir) if os.path.isdir(runtime_dir) else None
    if not cached_cli:
        return None
    cached = llama_binaries(runtime_dir)
    checks = [smoke_test_llama(b) for b in cached]
    complete = len(cached) == len(LLAMA_BINARIES)
    if complete and all(c[0] for c in checks):
        logger.info(f"  [OK] Cached llama-cli: {cached_cli}")
        return cached_cli
    detail = next((c[1] for c in checks if not c[0]), "incomplete binary set")
    logger.info(f"  [WARN] Cached llama-cli is not runnable ({detail}); re-extracting")
    shutil.rmtree(runtime_dir, ignore_errors=True)
    return None


def download_llama_archive(dist_dir: str, archive_name: str, expected: str) -> str:
    """Download the llama.cpp archive and verify its SHA-256; exit on failure."""
    archive_path = os.path.join(dist_dir, archive_name)
    url = f"{LLAMA_RELEASE_URL}/{LLAMA_CPP_TAG}/{archive_name}"
    logger.info(f"  [INFO] Downloading llama.cpp {LLAMA_CPP_TAG}: {archive_name}")
    try:
        download_file(url, archive_path)
    except DOWNLOAD_ERRORS as exc:
        logger.error(f"  [ERROR] Failed to download llama.cpp: {exc}")
        sys.exit(1)
    actual = hash_file(archive_path)
    if actual != expected:
        os.remove(archive_path)
        logger.error(f"  [ERROR] llama.cpp checksum mismatch — refusing to bundle. expected={expected} actual={actual}")
        sys.exit(1)
    logger.info(f"  [OK] Verified llama.cpp SHA-256: {actual}")
    return archive_path


def extract_llama_archive(archive_path: str, is_zip: bool, extract_dir: str) -> None:
    """Extract the llama.cpp archive into a fresh *extract_dir*; exit on failure."""
    if os.path.isdir(extract_dir):
        shutil.rmtree(extract_dir)
    os.makedirs(extract_dir)
    try:
        if is_zip:
            with zipfile.ZipFile(archive_path) as zip_archive:
                extract_zip_safely(zip_archive, extract_dir)
        else:
            with tarfile.open(archive_path, "r:gz") as tar_archive:
                extract_tar_safely(tar_archive, extract_dir)
    except (OSError, tarfile.TarError, zipfile.BadZipFile, RuntimeError) as exc:
        logger.error(f"  [ERROR] Failed to extract llama.cpp archive: {exc}")
        sys.exit(1)


def smoke_test_runtime(runtime_dir: str) -> None:
    """Smoke-test every bundled llama.cpp binary; exit if any is not runnable."""
    for binary in llama_binaries(runtime_dir):
        ok, detail = smoke_test_llama(binary)
        if not ok:
            logger.error(f"  [ERROR] Bundled {os.path.basename(binary)} is not runnable — refusing to bundle. {detail}")
            sys.exit(1)
        logger.info(f"  [OK] {os.path.basename(binary)} smoke test passed")


def install_llama_runtime(extract_dir: str, runtime_dir: str) -> str:
    """Copy the extracted runtime into *runtime_dir*, smoke-test it and return llama-cli."""
    found = find_llama_cli(extract_dir)
    if not found:
        logger.error("  [ERROR] llama-cli not found in downloaded archive")
        for size, path in list_llama_cli_candidates(extract_dir):
            logger.info(f"           {size:>10}  {path}")
        sys.exit(1)
    cli_path = copy_llama_runtime(found, runtime_dir)
    smoke_test_runtime(runtime_dir)
    logger.info(f"  [OK] llama-cli: {cli_path} ({os.path.getsize(found)} bytes)")
    return cli_path


def ensure_llama_cli(dist_dir: str) -> str:
    """Return the llama-cli path, using the cached runtime or downloading the pinned one."""
    archive_name, is_zip = select_llama_archive()
    expected = LLAMA_ARCHIVE_SHA256.get(archive_name)
    if not expected:
        logger.error(f"  [ERROR] No pinned SHA-256 for {archive_name}")
        sys.exit(1)

    plat_key = archive_name.replace(f"llama-{LLAMA_CPP_TAG}-bin-", "").rsplit(".", 1)[0]
    runtime_dir = os.path.join(dist_dir, plat_key)
    cached_cli = find_cached_llama(runtime_dir)
    if cached_cli:
        return cached_cli

    archive_path = download_llama_archive(dist_dir, archive_name, expected)
    extract_dir = os.path.join(dist_dir, f"_extract-{plat_key}")
    extract_llama_archive(archive_path, is_zip, extract_dir)
    return install_llama_runtime(extract_dir, runtime_dir)


def ensure_llm(skip: bool = False) -> tuple[str | None, str | None]:
    """Return (llama-cli path, GGUF path), downloading pinned artifacts if needed.

    Returns (None, None) when *skip* is True.  Exits the process if a required
    download or checksum fails — the GUI bundle is supposed to ship the model.
    """
    if skip:
        return None, None
    dist_dir = os.path.join(PROJECT_ROOT, LLM_DIST_DIRNAME)
    os.makedirs(dist_dir, exist_ok=True)
    gguf_path = ensure_gguf(dist_dir)
    return ensure_llama_cli(dist_dir), gguf_path
