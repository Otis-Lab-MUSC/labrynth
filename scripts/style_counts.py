"""Metric measurement for the style ratchet: Python, ruff, mypy, web source and ESLint counts."""

from __future__ import annotations

import ast
import importlib.util
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

from style_scans import (
    count_history_comments,
    is_any_reference,
    is_broad_handler,
    long_function_count,
    python_comment_texts,
    python_docstrings,
    read_lines,
    scan_javascript,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = REPO_ROOT / "web"

PYTHON_ROOTS = ("cli", "build.py", "launcher.py", "scripts")
WEB_SOURCE_DIR = WEB_DIR / "src"
WEB_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs"}
# Generated files are rewritten by `npm run gen:tables` and never edited by hand.
GENERATED_PYTHON = {"cli/reacher_tables.py"}
GENERATED_WEB_DIR = "generated"

# bump-version.py prints the version on stdout and CI reads it through `$(...)`,
# so its print calls are a machine interface, not diagnostics (decided 2026-10-28).
PRINT_EXEMPT_FILES = {"scripts/bump-version.py"}

RUFF_RULE_FAMILIES = ("ANN", "D1", "BLE", "S110", "T20", "PLR2004", "C901", "PLR0912", "PLR0915", "ERA")
MAX_FILE_LINES = 300

CONSOLE_CALL_REGEX = re.compile(r"\bconsole\.\w+")
TS_IGNORE_REGEX = re.compile(r"@ts-ignore")
ESLINT_DISABLE_REGEX = re.compile(r"eslint-disable")
MYPY_ERROR_MARKER = ": error:"
NO_EXPLICIT_ANY_RULE = "@typescript-eslint/no-explicit-any"

EXIT_OK = 0
EXIT_FAILED = 1


def write_err(message: str) -> None:
    """Write one line of diagnostics to stderr."""
    sys.stderr.write(message + "\n")


def relative_name(path: Path) -> str:
    """Return the repo-relative POSIX path of a file."""
    return path.resolve().relative_to(REPO_ROOT).as_posix()


def list_python_files() -> list[Path]:
    """List the hand-written Python files under the gated roots."""
    found: list[Path] = []
    for root in PYTHON_ROOTS:
        target = REPO_ROOT / root
        candidates = [target] if target.is_file() else sorted(target.rglob("*.py"))
        found.extend(path for path in candidates if relative_name(path) not in GENERATED_PYTHON)
    return found


def list_web_files() -> list[Path]:
    """List the hand-written web source files, skipping web/src/generated."""
    return [
        path
        for path in sorted(WEB_SOURCE_DIR.rglob("*"))
        if path.suffix in WEB_SUFFIXES and GENERATED_WEB_DIR not in path.relative_to(WEB_SOURCE_DIR).parts
    ]


def measure_python_files() -> Counter[str]:
    """Count the AST, line and comment metrics over the Python files."""
    counts: Counter[str] = Counter({"py_any_uses": 0, "py_except_exception_sites": 0, "py_files_over_300_lines": 0})
    counts["py_functions_over_50_lines"] = 0
    counts["py_history_comments"] = 0
    for path in list_python_files():
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source)
        nodes = list(ast.walk(tree))
        counts["py_any_uses"] += sum(1 for node in nodes if is_any_reference(node))
        counts["py_except_exception_sites"] += sum(
            1 for node in nodes if isinstance(node, ast.ExceptHandler) and is_broad_handler(node)
        )
        counts["py_files_over_300_lines"] += read_lines(path) > MAX_FILE_LINES
        counts["py_functions_over_50_lines"] += long_function_count(tree)
        counts["py_history_comments"] += count_history_comments(python_comment_texts(source) + python_docstrings(tree))
    return counts


def require_tool(module: str) -> None:
    """Exit with a clear message when a required Python tool is not installed."""
    if importlib.util.find_spec(module) is None:
        write_err(f"error: {module} is not installed; run: pip install '.[dev]'")
        sys.exit(EXIT_FAILED)


def measure_ruff() -> Counter[str]:
    """Count ruff findings per rule family, repo-wide."""
    require_tool("ruff")
    command = [sys.executable, "-m", "ruff", "check", *PYTHON_ROOTS]
    command += ["--select", ",".join(RUFF_RULE_FAMILIES), "--output-format", "json", "--exit-zero"]
    result = subprocess.run(command, cwd=REPO_ROOT, capture_output=True, text=True, check=False)
    if result.returncode != EXIT_OK:
        write_err(f"error: ruff failed:\n{result.stderr}")
        sys.exit(EXIT_FAILED)
    counts: Counter[str] = Counter({f"ruff_{family}": 0 for family in RUFF_RULE_FAMILIES})
    for finding in json.loads(result.stdout):
        name = relative_name(Path(finding["filename"]))
        if name in GENERATED_PYTHON:
            continue
        family = next(f for f in RUFF_RULE_FAMILIES if finding["code"].startswith(f))
        if family == "T20" and name in PRINT_EXEMPT_FILES:
            continue
        counts[f"ruff_{family}"] += 1
    return counts


def measure_mypy() -> Counter[str]:
    """Count mypy --strict errors; fails rather than report 0 when mypy is missing."""
    require_tool("mypy")
    command = [sys.executable, "-m", "mypy", "--strict", "--no-incremental"]
    result = subprocess.run(command, cwd=REPO_ROOT, capture_output=True, text=True, check=False)
    errors = sum(1 for line in result.stdout.splitlines() if MYPY_ERROR_MARKER in line)
    if errors == 0 and result.returncode != EXIT_OK:
        write_err(f"error: mypy failed without reporting errors:\n{result.stdout}{result.stderr}")
        sys.exit(EXIT_FAILED)
    return Counter({"mypy_strict_errors": errors})


def measure_web_files() -> Counter[str]:
    """Count the line and comment metrics over web/src."""
    counts: Counter[str] = Counter({"web_console_calls": 0, "web_eslint_disable": 0, "web_files_over_300_lines": 0})
    counts["web_history_comments"] = 0
    counts["web_ts_ignore"] = 0
    for path in list_web_files():
        source = path.read_text(encoding="utf-8")
        comments, code = scan_javascript(source)
        counts["web_console_calls"] += len(CONSOLE_CALL_REGEX.findall(code))
        counts["web_eslint_disable"] += sum(len(ESLINT_DISABLE_REGEX.findall(text)) for text in comments)
        counts["web_files_over_300_lines"] += read_lines(path) > MAX_FILE_LINES
        counts["web_history_comments"] += count_history_comments(comments)
        counts["web_ts_ignore"] += sum(len(TS_IGNORE_REGEX.findall(text)) for text in comments)
    return counts


def measure_eslint() -> Counter[str]:
    """Count ESLint warnings, errors and explicit `any` from `eslint . --format json`."""
    command = ["npx", "eslint", ".", "--format", "json"]
    result = subprocess.run(command, cwd=WEB_DIR, capture_output=True, text=True, check=False)
    try:
        reports = json.loads(result.stdout)
    except json.JSONDecodeError:
        write_err(f"error: eslint produced no JSON:\n{result.stdout}{result.stderr}")
        sys.exit(EXIT_FAILED)
    messages = [message for report in reports for message in report["messages"]]
    return Counter(
        {
            "web_eslint_errors": sum(report["errorCount"] + report["fatalErrorCount"] for report in reports),
            "web_eslint_warnings": sum(report["warningCount"] for report in reports),
            "web_explicit_any": sum(1 for message in messages if message.get("ruleId") == NO_EXPLICIT_ANY_RULE),
        }
    )
