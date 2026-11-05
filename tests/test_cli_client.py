"""Reply-shape handling of ``ReacherClient._req``, driven through a real httpx transport."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from cli.client import ReacherClient
from cli.errors import API_ERRORS


def build_client(body: object) -> ReacherClient:
    """Return a client whose HTTP layer answers every request 200 with ``body`` as JSON."""
    client = ReacherClient(base_url="http://backend.test")
    client._http = httpx.AsyncClient(
        base_url="http://backend.test",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body)),
    )
    return client


async def fetch_sessions(body: object) -> dict[str, object]:
    """Call list_sessions against a client that replies with ``body``, then close it."""
    client = build_client(body)
    try:
        return await client.list_sessions()
    finally:
        await client.close()


def test_object_reply_is_returned() -> None:
    """A JSON object body comes back unchanged."""
    assert asyncio.run(fetch_sessions({"sessions": []})) == {"sessions": []}


@pytest.mark.parametrize("body", [[], [1, 2], "text", 7, None])
def test_non_object_reply_raises_a_caught_error(body: object) -> None:
    """A 2xx reply that is not a JSON object raises an error the CLI already catches."""
    with pytest.raises(API_ERRORS):
        asyncio.run(fetch_sessions(body))
