#!/usr/bin/env python3
"""Style ratchet: count style violations and fail if any count rises above style-baseline.json.

Usage:
    python scripts/style-baseline.py                 check against the baseline
    python scripts/style-baseline.py --update        lower the baseline to today's counts
    python scripts/style-baseline.py --update --allow-increase   also accept higher counts

Counts are repo-wide. Python: ruff rule families, mypy --strict, AST and comment scans over
cli/, build.py, launcher.py, scripts/. Web: line, comment and ESLint counts over web/src.
Needs ruff and mypy installed (pip install ".[dev]") and, for the web ESLint counts, web/node_modules.
"""

from __future__ import annotations

import argparse
import ast
import importlib.util
import io
import json
import re
import subprocess
import sys
import tokenize
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BASELINE = REPO_ROOT / "scripts" / "style-baseline.json"
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
MAX_FUNCTION_LINES = 50
BROAD_EXCEPTION_NAMES = {"Exception", "BaseException"}

# Comments and docstrings that narrate history belong in git, not in the source.
HISTORY_PATTERNS = (
    r"\bfix(?:es|ed)?[\s:]+[A-Za-z]*-?\d",  # "Fix 4.9", "Fix: PY-003"
    r"(?<![\w&])#\d+\b",  # issue or PR number
    r"\b(?:PR|issue)s?\s*#?\d+",  # "PR 12", "issue 7"
    r"\blegacy\b",
    r"\bno longer\b",
    r"\bpreviously\b",
)
HISTORY_REGEX = re.compile("|".join(HISTORY_PATTERNS), re.IGNORECASE)

CONSOLE_CALL_REGEX = re.compile(r"\bconsole\.\w+")
TS_IGNORE_REGEX = re.compile(r"@ts-ignore")
ESLINT_DISABLE_REGEX = re.compile(r"eslint-disable")
MYPY_ERROR_MARKER = ": error:"
NO_EXPLICIT_ANY_RULE = "@typescript-eslint/no-explicit-any"

EXIT_OK = 0
EXIT_FAILED = 1


def write_out(message: str) -> None:
    """Write one line of result output to stdout."""
    sys.stdout.write(message + "\n")


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


def count_history_comments(texts: list[str]) -> int:
    """Count the comment or docstring texts that match a history pattern."""
    return sum(1 for text in texts if HISTORY_REGEX.search(text))


def read_lines(path: Path) -> int:
    """Return the number of physical lines in a file."""
    return len(path.read_text(encoding="utf-8").splitlines())


def python_comment_texts(source: str) -> list[str]:
    """Return every # comment in Python source."""
    tokens = tokenize.generate_tokens(io.StringIO(source).readline)
    return [token.string for token in tokens if token.type == tokenize.COMMENT]


def python_docstrings(tree: ast.AST) -> list[str]:
    """Return every module, class and function docstring in a parsed tree."""
    scopes = (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
    docstrings = (ast.get_docstring(node) for node in ast.walk(tree) if isinstance(node, scopes))
    return [text for text in docstrings if text]


def is_broad_handler(handler: ast.ExceptHandler) -> bool:
    """Tell whether an except clause is bare or catches Exception or BaseException."""
    if handler.type is None:
        return True
    caught = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    return any(isinstance(node, ast.Name) and node.id in BROAD_EXCEPTION_NAMES for node in caught)


def is_any_reference(node: ast.AST) -> bool:
    """Tell whether a node names `Any` directly or as an attribute."""
    if isinstance(node, ast.Name):
        return node.id == "Any"
    return isinstance(node, ast.Attribute) and node.attr == "Any"


def long_function_count(tree: ast.AST) -> int:
    """Count functions longer than MAX_FUNCTION_LINES lines."""
    functions = (node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)))
    return sum(1 for node in functions if (node.end_lineno or node.lineno) - node.lineno + 1 > MAX_FUNCTION_LINES)


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


def scan_javascript(source: str) -> tuple[list[str], str]:
    """Split JS/TS source into its comments and its code with comments blanked out."""
    comments: list[str] = []
    code: list[str] = []
    index = 0
    length = len(source)
    while index < length:
        pair = source[index : index + 2]
        char = source[index]
        if pair in ("//", "/*"):
            end = source.find("\n" if pair == "//" else "*/", index + 2)
            end = length if end == -1 else end + (0 if pair == "//" else 2)
            comments.append(source[index:end])
            code.append(" ")
            index = end
        elif char in "\"'`":
            end = find_string_end(source, index)
            code.append(source[index:end])
            index = end
        else:
            code.append(char)
            index += 1
    return comments, "".join(code)


def find_string_end(source: str, start: int) -> int:
    """Return the index just past the string literal opening at `start`."""
    quote = source[start]
    index = start + 1
    while index < len(source):
        char = source[index]
        if char == "\\":
            index += 2
            continue
        if char == quote:
            return index + 1
        if char == "\n" and quote != "`":
            return index
        index += 1
    return len(source)


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


def measure_all(skip_mypy: bool, skip_eslint: bool) -> dict[str, int]:
    """Measure every metric, leaving out the ones the caller asked to skip."""
    counts: dict[str, int] = {}
    counts.update(measure_python_files())
    counts.update(measure_ruff())
    counts.update(measure_web_files())
    if not skip_mypy:
        counts.update(measure_mypy())
    if skip_eslint:
        write_err("note: eslint metrics skipped (--skip-eslint)")
    elif not (WEB_DIR / "node_modules").is_dir():
        write_err("note: eslint metrics skipped: web/node_modules is missing; run `npm ci` in web/")
    else:
        counts.update(measure_eslint())
    return dict(sorted(counts.items()))


def load_baseline(path: Path) -> dict[str, int]:
    """Read the baseline JSON, or return an empty baseline when the file is absent."""
    if not path.is_file():
        return {}
    return {str(name): int(value) for name, value in json.loads(path.read_text(encoding="utf-8")).items()}


def write_baseline(path: Path, values: dict[str, int]) -> None:
    """Write the baseline JSON with sorted keys, one metric per line."""
    path.write_text(json.dumps(values, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def check_against_baseline(current: dict[str, int], baseline: dict[str, int]) -> int:
    """Print every metric against its baseline and return the exit code."""
    status = EXIT_OK
    for name, value in current.items():
        if name not in baseline:
            write_out(f"{name}: {value} (no baseline; run with --update)")
            status = EXIT_FAILED
            continue
        write_out(f"{name}: {value} (baseline {baseline[name]})")
        if value > baseline[name]:
            write_err(f"FAIL {name}: {value} is above the baseline {baseline[name]}")
            status = EXIT_FAILED
        elif value < baseline[name]:
            write_out(f"  hint: {name} is below baseline; lower the baseline with --update")
    return status


def update_baseline(path: Path, current: dict[str, int], allow_increase: bool) -> int:
    """Rewrite the baseline with current counts; refuse to raise one without allow_increase."""
    baseline = load_baseline(path)
    raised = [name for name, value in current.items() if name in baseline and value > baseline[name]]
    if raised and not allow_increase:
        for name in raised:
            write_err(f"refusing to raise {name}: {baseline[name]} -> {current[name]} (use --allow-increase)")
        return EXIT_FAILED
    write_baseline(path, {**baseline, **current})
    write_out(f"updated {path}")
    return EXIT_OK


def parse_arguments(argv: list[str] | None) -> argparse.Namespace:
    """Parse the command line."""
    parser = argparse.ArgumentParser(description="Style ratchet: fail if any style count rises.")
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE, help="baseline JSON to read or write")
    parser.add_argument("--update", action="store_true", help="rewrite the baseline with current counts")
    parser.add_argument("--allow-increase", action="store_true", help="with --update, accept higher counts")
    parser.add_argument("--skip-mypy", action="store_true", help="do not run mypy (fast tests only)")
    parser.add_argument("--skip-eslint", action="store_true", help="do not run ESLint (fast tests only)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Run the ratchet and return the process exit code."""
    arguments = parse_arguments(argv)
    current = measure_all(arguments.skip_mypy, arguments.skip_eslint)
    if arguments.update:
        return update_baseline(arguments.baseline, current, arguments.allow_increase)
    return check_against_baseline(current, load_baseline(arguments.baseline))


if __name__ == "__main__":
    sys.exit(main())
