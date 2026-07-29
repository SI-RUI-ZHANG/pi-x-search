# Changelog

## Unreleased

- Retry release verification while the registry is still propagating, instead of
  failing the run. Genuine provenance mismatches still fail on the first check.

## 0.1.1 - 2026-07-30

- Drop source titles that only restate the URL, so the model reads each source
  once instead of twice.
- Remove the annotation offsets xAI never populates.
- Tell the model to prefer one well-scoped search per call, and name Twitter in
  the tool description so it finds the tool either way.
- Redesign the hero image and rewrite the README.
- Compare the provenance workflow path as repository-relative, matching npm's
  SLSA predicate, so release verification passes.

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
