"""Exception groups the REACHER CLI catches around backend calls."""

from __future__ import annotations

import httpx

# A REST call failed: network or HTTP-status trouble (httpx.HTTPError covers
# both), or the reply was not the JSON shape the CLI expects.
API_ERRORS: tuple[type[Exception], ...] = (httpx.HTTPError, ValueError, KeyError, TypeError)

# A local file could not be read or written.
FILE_ERRORS: tuple[type[Exception], ...] = (OSError,)
