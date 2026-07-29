<p align="center">
  <img src="https://raw.githubusercontent.com/SI-RUI-ZHANG/pi-x-search/main/docs/assets/hero.png" alt="pi-x-search — the post's actual words, with a link that lets you verify them" width="800"/>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"/></a>
  <a href="https://www.npmjs.com/package/pi-x-search"><img src="https://img.shields.io/npm/v/pi-x-search.svg" alt="npm version"/></a>
  <img src="https://img.shields.io/badge/pi-0.82.1%20live--tested-1d9bf0.svg" alt="pi 0.82.1 live-tested"/>
  <a href="https://github.com/SI-RUI-ZHANG/pi-x-search/actions/workflows/ci.yml"><img src="https://github.com/SI-RUI-ZHANG/pi-x-search/actions/workflows/ci.yml/badge.svg" alt="CI status"/></a>
</p>

# pi-x-search

Search X from the [pi](https://pi.dev) coding agent and get the posts' **actual
words with a source URL for each one**.

Not just a paragraph *about* the posts. The posts, quoted verbatim, followed by
the links a human can open and check.

> Automated verification and isolated live runs pass for both subscription OAuth
> and `XAI_API_KEY`.

## Tool

| Tool | What it does |
|---|---|
| `x_search` | Search X through xAI's official Responses API and return a direct answer, verbatim post quotes, and annotation-derived source URLs |

Optional filters narrow the search by allowed or excluded handles, date range,
and image or video understanding. Video understanding is specific to X search;
ordinary web search cannot inspect video attached to a post.

## Install

```bash
pi install npm:pi-x-search
pi install git:github.com/SI-RUI-ZHANG/pi-x-search@v0.1.0
```

Then start pi and ask naturally:

```text
Use x_search to find the latest posts from @<handle> about <topic>.
Quote the key posts verbatim and include their URLs.
```

## What it looks like

Illustrative output—the public example intentionally uses placeholders:

```text
❯ Search X for <topic> from @<handle>

N sources · M search calls · Grok subscription

> “<verbatim post text>”
  https://x.com/<handle>/status/<post-id>
```

An isolated subscription-OAuth acceptance run returned nonzero search telemetry,
an annotation-derived URL, and a quote that matched the linked post. Its account,
post text, and identifiers are intentionally not reproduced here. A narrower
query in the same pass produced no grounded result and was rejected rather than
returned as a plausible answer.

## How it works

1. **Authenticate through pi** — resolve pi's built-in `xai` provider. The
   extension never reads the Grok CLI's credential store and implements no token
   persistence or refresh logic of its own.
2. **Search one fixed origin** — send the request only to
   `https://api.x.ai/v1/responses`, with redirects rejected before an
   Authorization header can follow them elsewhere.
3. **Prove that search happened** — inspect
   `usage.server_side_tool_usage_details.x_search_calls`. A zero-search answer is
   retried once and then rejected if it still did not search.
4. **Recover the real sources** — parse `url_citation` annotations from output
   text. The documented top-level `citations` field is usually `null` in live
   responses, so trusting it alone loses every source.

The full request contract, failure matrix, and measured API behavior are in
[docs/design.md](./docs/design.md).

## Authentication

Choose either path:

### Grok subscription

Run `/login` in pi and select **xAI (Grok/X subscription)**. Pi owns credential
persistence and serialized refresh. The extension receives only the
resolved access credential at execution time.

### xAI API key

Set `XAI_API_KEY` before starting pi. A stored subscription login takes
precedence; an OAuth refresh or request failure never silently falls through to
the billed API key.

Subscription OAuth uses the public first-party CLI client id built into pi's
`xai` provider because xAI currently publishes no third-party client-registration
endpoint. Users who do not want that path can use `XAI_API_KEY` exclusively.

## Safety model

- The authenticated search endpoint is immutable and official.
- Redirects are rejected; upstream error bodies never enter agent context.
- Response bytes, JSON depth, and JSON node count are bounded before traversal.
- Model-facing tool output is capped below pi's 50 KB limit.
- Post text is labeled as untrusted source material, and terminal control
  sequences are removed before model or TUI rendering.
- No credential value is logged, returned, placed in details, or read from the
  Grok CLI.
- A confident answer with zero recorded X-search calls fails closed.

## Filters

| Parameter | Behavior |
|---|---|
| `allowed_x_handles` | Search only these handles; maximum 20 |
| `excluded_x_handles` | Exclude these handles; maximum 20 |
| `from_date` / `to_date` | Inclusive real calendar dates in `YYYY-MM-DD` |
| `enable_image_understanding` | Analyze images attached to matching posts |
| `enable_video_understanding` | Analyze video attached to matching posts |

Leading `@` characters are normalized and duplicate handles are removed.
Allow- and deny-lists are mutually exclusive.

## Limitations

- xAI performs the server-side search. Recall, ranking, and freshness are theirs.
- The API exposes synthesized text and citation annotations, not structured post
  objects, engagement metrics, complete thread trees, or authoritative authorship
  metadata.
- “Verbatim” is an instruction to the search model, not a cryptographic proof.
  The URL is included so important quotes can be checked.

## Compatibility

Requires pi v0.82.1 or later.

`pi-x-search` and [`pi-grok`](https://github.com/stnly/pi-grok) both register the
conventional `x_search` name. They are alternative implementations and should
not be enabled together; pi reports the duplicate and keeps the first one loaded.

## Acknowledgements

The extension builds on lessons from
[`stnly/pi-grok`](https://github.com/stnly/pi-grok) and
[Hermes Agent](https://github.com/NousResearch/hermes-agent). Their work provided
valuable prior art for pi integration and xAI's annotation-based citation shape.

## Contributing

Issues and PRs are welcome. Keep the core invariants intact: official xAI origin
only, host-owned credentials only, annotation-derived sources, bounded untrusted
content, and no acceptance of an answer that never searched.

## License

[MIT](./LICENSE)
