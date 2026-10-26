# Change requests

One file per confirmed change request, committed in the pull request that makes
the change: `changes/YYYY-MM-DD-<slug>.md`. A change that spans labrynth and
reacher carries the same file in both pull requests.

Do not write these by hand. The `change_request_record` tool of reacher's MCP
server (`reacher-mcp`) renders the file from the request the user confirmed;
the front-matter schema (`reacher-change-request/1`) is documented in reacher's
`changes/README.md` and `docs/mcp-server.md`.
