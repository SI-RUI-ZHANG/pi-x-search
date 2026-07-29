<p align="center">
  <img src="https://raw.githubusercontent.com/SI-RUI-ZHANG/pi-x-search/main/docs/assets/hero.png" alt="pi-x-search — quote the post, not the summary" width="800"/>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"/></a>
  <a href="https://www.npmjs.com/package/pi-x-search"><img src="https://img.shields.io/npm/v/pi-x-search.svg" alt="npm version"/></a>
  <img src="https://img.shields.io/badge/pi-0.82.1%20live--tested-1d9bf0.svg" alt="pi 0.82.1 live-tested"/>
  <a href="https://github.com/SI-RUI-ZHANG/pi-x-search/actions/workflows/ci.yml"><img src="https://github.com/SI-RUI-ZHANG/pi-x-search/actions/workflows/ci.yml/badge.svg" alt="CI status"/></a>
</p>

# pi-x-search

Search X from the [pi](https://pi.dev) coding agent.

xAI runs `x_search` on their own servers and hands back a paragraph. The posts
it read do not come back with it, and the `citations` field the documentation
points at is `null` in practice, so a client that reads it ends up with a
confident summary and nothing behind it.

`pi-x-search` asks for the posts' own words, takes the URLs from where they
actually are, and throws out answers that never searched.

## Install

```bash
pi install npm:pi-x-search
pi install git:github.com/SI-RUI-ZHANG/pi-x-search@v0.1.1
```

Then ask for what you want:

```text
Find the latest posts from @<handle> about <topic>.
Quote the key ones and include their URLs.
```

## What it looks like

```text
❯ Search X for what people are saying about the Responses API

9 sources · 4 search calls · Grok subscription

“the annotations carry the source URLs. the top-level citations
field has been null in every response i have seen.”
https://x.com/i/status/1951…

“it reads the video attached to a post. web search cannot do that.”
https://x.com/i/status/1950…
```

The quoted text above is illustrative and the post ids are cut short. Real
results carry the full URL.

## How it works

1. **Ask.** Every request carries the same instruction: answer the question,
   then quote the key posts word for word with each URL beside its quote.
   Without it, nothing is ever quoted in full and there is nothing to cite. It
   also makes the answer shorter rather than longer, because the model stops
   padding with paraphrase.
2. **Read.** Sources come from the `url_citation` annotations on the output
   text. Reading the documented top-level `citations` field instead returns
   nothing at all.
3. **Check.** `usage.server_side_tool_usage_details.x_search_calls` records
   whether a search ran. Zero means the model answered from memory, which
   happened in roughly one run in eight: retry once, then fail instead of
   passing it off as a result.

The measurements behind those choices, the request contract, and the full
failure matrix are in [docs/design.md](./docs/design.md).

## Filters

| Parameter | Behavior |
|---|---|
| `allowed_x_handles` | Search only these handles, up to 20 |
| `excluded_x_handles` | Skip these handles, up to 20 |
| `from_date` / `to_date` | Inclusive calendar dates, `YYYY-MM-DD` |
| `enable_image_understanding` | Look at images attached to matching posts |
| `enable_video_understanding` | Look at video attached to matching posts |

A leading `@` is optional and duplicate handles are dropped. The two handle
lists are mutually exclusive. Video understanding is specific to X search;
ordinary web search cannot inspect a video attached to a post.

## Authentication

Either path works, and both belong to pi's built-in `xai` provider.

**Grok subscription.** Run `/login` in pi and pick **xAI (Grok/X subscription)**.
pi stores the credential and serializes refresh; the extension only receives the
resolved token at the moment a search runs.

**API key.** Set `XAI_API_KEY` before starting pi. A stored subscription login
takes precedence, and a failed refresh or a rejected request never quietly falls
through to the billed key.

Subscription login goes through the first-party CLI's OAuth client id, because
xAI publishes no way for anyone else to register their own. If you would rather
not rely on that, use `XAI_API_KEY` alone.

The extension never touches the Grok CLI's credential store. xAI's refresh
tokens are single-use, so borrowing one would log you out of your own CLI.

## Safety model

- Requests go to `https://api.x.ai/v1/responses` and nowhere else. Redirects are
  rejected before an Authorization header can follow one somewhere else.
- No credential value is logged, returned, or placed in tool details.
- Upstream error bodies are classified by status code and then dropped, so a
  hostile error page cannot reach your agent's context.
- Response size, JSON depth, and node count are capped before anything is read,
  and model-facing output stays under pi's 50 KB limit.
- Post text is untrusted third-party content. It is labeled that way for the
  model, and terminal control sequences are stripped before anything renders.

## Limitations

- xAI does the searching. Recall, ranking, and freshness are theirs.
- The API returns synthesized text and citations, not post objects. There are no
  engagement counts, no author metadata, and no thread trees; that is the API
  boundary, not something a client can work around.
- Verbatim is an instruction to the search model, not a guarantee. The URL sits
  beside every quote so you can check the ones that matter.

## Compatibility

Requires pi v0.82.1 or later.

`pi-x-search` and [`pi-grok`](https://github.com/stnly/pi-grok) both register a
tool named `x_search`. Enable one or the other; pi reports the duplicate and
keeps whichever loaded first.

## Acknowledgements

Built on lessons from [`stnly/pi-grok`](https://github.com/stnly/pi-grok) and
[Hermes Agent](https://github.com/NousResearch/hermes-agent), which were useful
prior art for pi integration and for xAI's annotation-based citation shape.

## Contributing

Issues and PRs are welcome. Keep the invariants intact: the official xAI origin
only, credentials owned by the host, sources taken from annotations, untrusted
content bounded, and no answer accepted that never searched.

## License

[MIT](./LICENSE)
