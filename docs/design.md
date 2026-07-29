# pi-x-search — Design

An X (Twitter) search tool for the [pi](https://pi.dev) coding agent, built on
xAI's server-side `x_search` tool.

The design goal is narrow: **the agent should end up with the posts' actual
words and a link to each one** — not a paraphrase it cannot cite. Everything
below follows from that.

## 1. What `x_search` actually returns

`x_search` is a *server-side* tool on xAI's Responses API. The caller sends a
query; xAI runs its own search loop and returns a synthesized natural-language
answer. The internal steps are visible as `custom_tool_call` items
(`x_keyword_search`, `x_user_search`, `x_thread_fetch`) but only their **inputs**
are echoed back — the search results themselves are never returned.

Two facts constrain every client:

- **Structured post data is not retrievable.** No author objects, timestamps, or
  engagement metrics. The `include` request field accepts exactly two values —
  `no_inline_citations` and `reasoning.encrypted_content`. There is no
  `…_call.results` equivalent; every variant is rejected with
  `Argument not supported`.
- **Source URLs are retrievable, but not where the documentation implies.**
  The top-level `citations` field is `null` in practice. URLs arrive as
  `url_citation` annotations on the `output_text` content part:

  ```jsonc
  {
    "type": "url_citation",
    "url": "https://x.com/i/status/<post-id>",
    "start_index": 0, "end_index": 0,
    "title": "https://x.com/i/status/<post-id>"
  }
  ```

  A client that reads top-level `citations` silently returns zero sources.

## 2. Getting the posts' actual words

Structured post data is unavailable, but the *text* of a post is not — the search
model will reproduce it if asked. So every request carries a fixed instruction:
answer the question first, then quote the key posts verbatim, each followed by
its URL.

This was settled by experiment rather than preference, and two of the three
results were counterintuitive:

| | Quotes returned | Usable source URLs | Output length |
|---|---|---|---|
| with the instruction | yes | 45 | 5086 chars |
| without it | none | 11 | 6019 chars |

- **Without the instruction, nothing is ever quoted.** Output paraphrases, often
  with a fragment in quotation marks embedded in the model's own sentence — the
  one shape that cannot be cited.
- **The instruction makes output shorter, not longer.** Requiring quotes
  displaces padding.
- **It must be paired with `no_inline_citations`** (§3).

Fetching post pages ourselves was considered and rejected: it adds a third-party
dependency to the request path and a prompt-injection surface, to recover text
the search model already provides.

## 3. Why the two switches are coupled

`include: ["no_inline_citations"]` suppresses the `[[1]](url)` markdown xAI
otherwise weaves into the prose. On its own it is actively harmful — it strips
every URL out of the answer, leaving an annotation list that maps to no
particular claim.

Combined with the verbatim instruction it inverts: the model writes each URL
beside its own quote, so the claim-to-source mapping survives in the prose, and
the annotation list becomes pure breadth. Measured on the same query, that is 45
usable URLs against 11 with inline citations left on.

Neither switch ships without the other.

## 4. Design axioms

- **Quotes and URLs are the result.** The synthesized answer is a summary field,
  never the only output.
- **Annotations are the source of truth for citations.** Top-level `citations` is
  read defensively but never relied upon.
- **The sanctioned endpoint, and honesty about the rest.** API requests go to the
  official xAI API — no unofficial proxy, no imitated client headers. Where a
  constraint cannot be met, §6 says so plainly instead of implying otherwise.
- **Never touch another tool's credentials.** Authentication comes from pi's
  built-in `xai` provider. The extension does not read, refresh, or write the
  Grok CLI's credential store — doing so would break it (§6).
- **A search that never searched is a failure.** A response reporting zero
  `x_search_calls` is not an empty result set (§8).
- **Fail loud, fail specific.** An empty result, an expired token, and a rejected
  filter combination are three different messages.

## 5. Architecture

```
x_search tool call
   │
   ├─ resolve credentials  ──▶ pi's built-in xai provider: stored OAuth,
   │                           otherwise XAI_API_KEY
   │
   ├─ POST /responses  { model, input, instructions: <verbatim rule>,
   │                     tools:[{type:"x_search", …filters}],
   │                     include:["no_inline_citations"], store:false }
   │
   ├─ guard  ──▶ usage.server_side_tool_usage_details.x_search_calls == 0
   │              ⇒ treat as failure, not as "no posts found"
   │
   └─ parse ──▶ answer   := output[].content[].output_text (may carry narration)
                sources  := output[].content[].annotations[url_citation]
                            ∪ (top-level citations, if ever populated)
```

Stable tool details contain `status`, `answer`, `sources`, `searchCallCount`, and
`credentialSource`. Model-facing content is a concise projection of the answer
and sources, capped at pi's 50 KB tool-output limit. Credential source is shown
by the human renderer instead of being added to model context.

The package keeps pi integration thin: `extensions/x-search.ts` only registers,
executes, and renders the tool. Pure contracts and parsing, host-auth adaptation,
the fixed-origin HTTP client, and the retry state machine live in separate
`src/` modules. There is no framework, credential store, or model-provider shim.

## 6. Credentials

Two ways in, in order:

1. **A Grok subscription**, via `/login` inside pi. The extension uses pi's
   built-in `xai` provider, which stores credentials and performs serialized
   refresh with the official device-code flow.
2. **`XAI_API_KEY`**, for pay-per-use when no subscription credential is
   stored.

Both paths already belong to pi's built-in `xai` provider. A stored OAuth
credential owns that provider; the environment key is considered only when no
credential is stored. The extension calls pi's provider-auth API and never sees
or implements refresh-token storage.
A refresh failure, 401, or other request failure never switches automatically to
the API key, avoiding surprise billed usage.

### Why not reuse the Grok CLI's login

Tempting — the token is right there on disk and it works against this API. But
xAI's refresh tokens are **single-use**: refreshing rotates the token and
invalidates the old one. An extension that borrowed the CLI's credentials and
refreshed them would silently log the user out of the Grok CLI. Reading someone
else's credential store is not a shortcut here; it is a way to break their tools.

### The OAuth client id, stated plainly

xAI's OIDC discovery document publishes no `registration_endpoint`, so there is
no way for a third-party application to obtain its own OAuth client id. Any
application that authenticates against a Grok *subscription* must present the
first-party CLI's client id and request its scope. Pi's built-in `xai` provider
encapsulates that limitation for this extension.

That is a real limitation and worth naming rather than glossing. The distinction
this design does draw:

| Layer | What we do |
|---|---|
| API requests | Official `api.x.ai` only. No unofficial proxy, no imitated client headers. |
| OAuth client id | The first-party CLI's, because xAI offers no alternative. |

Users who prefer not to rely on that path can set `XAI_API_KEY` and never touch
subscription auth.

### Login is prompted, not silent

OAuth requires a human to approve in a browser, so no extension can authenticate
invisibly. What it can do is remove the need to know anything in advance: the
first search asks pi to resolve `xai` authentication and, when unauthenticated,
returns an instruction naming the exact `/login` step instead of a generic
failure.

## 7. Filters

The full `x_search` filter surface is exposed, with client-side validation for
the constraints the API enforces but reports opaquely:

| Filter | Notes |
|---|---|
| `allowed_x_handles` | Max 20. Leading `@` is normalized; duplicates are removed. Mutually exclusive with `excluded_x_handles`. |
| `excluded_x_handles` | Max 20. Leading `@` is normalized; duplicates are removed. Mutually exclusive with `allowed_x_handles`. |
| `from_date` / `to_date` | Real calendar dates in `YYYY-MM-DD`; `from_date` cannot be later than `to_date`. |
| `enable_image_understanding` | Analyzes images attached to posts. |
| `enable_video_understanding` | Analyzes video. `x_search` only — web search cannot do this. |

Passing both handle lists is rejected locally with a readable message; the API
answers that combination with a bare `400`.

## 8. Failure modes

- **The search that never ran.** In roughly one run in eight, the model asserted
  that the period being asked about "has not occurred", performed zero searches,
  and returned a short confident denial. This is indistinguishable from a real
  negative answer by content alone, but not by telemetry: a genuine search
  reports a non-zero `x_search_calls`. Zero triggers one retry of the same
  logical search. A second zero fails with a typed, sanitized error. Validation
  failures, authentication failures, and caller cancellation are never retried.
  When at least one search ran but no source annotations were returned, the tool
  returns a successful `no_matches` result with an empty source list.
- **Process narration.** The model's running commentary ("I'll search X for…")
  intermittently precedes the answer inside `output_text`. Present in some runs
  and absent in others, so the parser tolerates it rather than assuming a shape.
- **Latency scales with search depth.** Internal search calls ranged 3–20 per
  query, and wall time tracked that — seconds for a narrow lookup, up to a minute
  for a broad question. This is an inference call, not a lookup.

## 9. Limits

- No engagement metrics, follower counts, or structured author data — not exposed
  by the API at any layer, so no client can surface it.
- Quoted post text is only as faithful as the search model; the URL beside each
  quote exists so a human can check it.
- Search recall and freshness are xAI's, not ours.
- `pi-x-search` and `pi-grok` both register `x_search`. They are alternative
  implementations and should not be enabled together; pi diagnoses the duplicate
  and keeps the first registration.

## 10. Security posture

- Credentials are held by pi, requested per call, and sent to the official API
  origin only. They are never logged and never included in an error message. No
  other application's credential store is read or written (§6).
- Redirects are rejected rather than followed, so a bearer token cannot be
  replayed to another origin.
- Response bodies are size-capped while streaming and parsed under depth and node
  ceilings, so a malformed or hostile body cannot exhaust memory. Model-facing
  tool output is separately capped at 50 KB.
- Upstream error bodies are classified by HTTP status; their text is never
  forwarded into tool output, so a hostile error page cannot inject instructions
  into the agent's context.
- Quoted post text is untrusted third-party content that reaches the model's
  context. It is presented as data, delimited from tool metadata. OSC, CSI, BEL,
  and other unsafe terminal controls are removed before model or TUI rendering.
