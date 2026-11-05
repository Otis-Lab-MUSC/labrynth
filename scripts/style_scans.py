"""Source scanners for the style ratchet: comment, docstring, AST and JS/TS text scans."""

from __future__ import annotations

import ast
import io
import re
import tokenize
from pathlib import Path

MAX_FUNCTION_LINES = 50
BROAD_EXCEPTION_NAMES = {"Exception", "BaseException"}

# Comments and docstrings that narrate history belong in git, not in the source.
HISTORY_PATTERNS = (
    r"\bfix(?:es|ed)?[\s:]+[A-Za-z]*-?\d",  # the word fix followed by a ticket or step number
    r"(?<![\w&])#\d+\b",  # issue or PR number
    r"\b(?:PR|issue)s?\s*#?\d+",  # a pull request or issue cited by number
    r"\blegacy\b",
    r"\bno longer\b",
    r"\bpreviously\b",
)
HISTORY_REGEX = re.compile("|".join(HISTORY_PATTERNS), re.IGNORECASE)


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
