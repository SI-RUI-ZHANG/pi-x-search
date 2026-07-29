# Changelog

## Unreleased

## 0.1.0 - 2026-07-29

- Implement the `x_search` tool against xAI's official Responses API.
- Reuse pi's built-in `xai` provider for subscription OAuth and `XAI_API_KEY`.
- Add verbatim post quoting, annotation-based sources, filters, bounded parsing,
  sanitized errors, cancellation, and the zero-search retry guard.
- Add structured TUI rendering plus unit tests for auth, transport, contracts,
  retry outcomes, and terminal-control sanitization.
- Add package-gallery artwork, a security policy, packed-artifact CI, a
  fail-closed release manifest, and tag-gated npm provenance publishing.
- Verify isolated live searches through both subscription OAuth and
  `XAI_API_KEY`.
