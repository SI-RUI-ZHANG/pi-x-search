import assert from "node:assert/strict";
import test from "node:test";

import {
	buildPayload,
	formatModelContent,
	normalizeParams,
	parseSearchResponse,
	sanitizeUntrustedText,
	VERBATIM_INSTRUCTION,
	type XSearchResultDetails,
} from "../src/contracts.ts";
import { XSearchError } from "../src/errors.ts";

test("normalizes handles and preserves supported filters", () => {
	const normalized = normalizeParams({
		query: "  launch reactions  ",
		allowed_x_handles: ["@xai", "XAI", "sama"],
		from_date: "2026-07-01",
		to_date: "2026-07-29",
		enable_image_understanding: true,
	});
	assert.deepEqual(normalized, {
		query: "launch reactions",
		allowed_x_handles: ["xai", "sama"],
		from_date: "2026-07-01",
		to_date: "2026-07-29",
		enable_image_understanding: true,
	});
});

test("removes terminal controls from queries, answers, and source titles", () => {
	const dirty = "before\u001B]52;c;clipboard\u0007after\u001B[2J!\u009B31mred\u009B0m\rnext\tok";
	assert.equal(sanitizeUntrustedText(dirty), "beforeafter!red\nnext\tok");
	assert.equal(normalizeParams({ query: `topic\u001B[2J` }).query, "topic");

	const parsed = parseSearchResponse({
		usage: { server_side_tool_usage_details: { x_search_calls: 1 } },
		output: [
			{
				content: [
					{
						type: "output_text",
						text: "safe\u001B]52;c;clipboard\u0007 answer\u001B[2J",
						annotations: [
							{ type: "url_citation", url: "https://x.com/a/status/1", title: "A\u0007 post" },
						],
					},
				],
			},
		],
	});
	assert.equal(parsed.answer, "safe answer");
	assert.equal(parsed.sources[0]?.title, "A post");
	const content = formatModelContent({
		...parsed,
		status: "ok",
		credentialSource: "grok_subscription",
	});
	assert.doesNotMatch(content, /clipboard|\u001B|\u0007|\u009B/);
});

test("rejects contradictory handles and invalid dates", () => {
	assert.throws(
		() => normalizeParams({ query: "x", allowed_x_handles: ["xai"], excluded_x_handles: ["sama"] }),
		(error) => error instanceof XSearchError && error.code === "invalid_request",
	);
	assert.throws(
		() => normalizeParams({ query: "x", from_date: "2026-02-30" }),
		(error) => error instanceof XSearchError && error.code === "invalid_request",
	);
	assert.throws(
		() => normalizeParams({ query: "x", from_date: "2026-08-01", to_date: "2026-07-01" }),
		(error) => error instanceof XSearchError && error.code === "invalid_request",
	);
});

test("builds the coupled verbatim and no-inline payload", () => {
	const payload = buildPayload(normalizeParams({ query: "what changed?", enable_video_understanding: true }));
	assert.equal(payload.input, "what changed?");
	assert.equal(payload.instructions, VERBATIM_INSTRUCTION);
	assert.deepEqual(payload.include, ["no_inline_citations"]);
	assert.deepEqual(payload.tools, [{ type: "x_search", enable_video_understanding: true }]);
	assert.equal(payload.store, false);
});

test("parses output text and annotation citations, then deduplicates top-level citations", () => {
	const parsed = parseSearchResponse({
		usage: { server_side_tool_usage_details: { x_search_calls: 3 } },
		output: [
			{
				type: "message",
				content: [
					{
						type: "output_text",
						text: "Answer\n\n\"Quoted post\" https://x.com/a/status/1",
						annotations: [
							{
								type: "url_citation",
								url: "https://x.com/a/status/1",
								// xAI's live shape: the title restates the URL.
								title: "https://x.com/a/status/1",
								start_index: 0,
								end_index: 0,
							},
							{ type: "url_citation", url: "javascript:alert(1)" },
						],
					},
				],
			},
		],
		citations: ["https://x.com/a/status/1", "https://x.com/b/status/2"],
	});
	assert.equal(parsed.answer.startsWith("Answer"), true);
	assert.equal(parsed.searchCallCount, 3);
	assert.equal(
		parseSearchResponse({ usage: { x_search_calls: 2 } }).searchCallCount,
		2,
		"the flat path remains a defensive fallback",
	);
	assert.deepEqual(
		parsed.sources,
		[{ url: "https://x.com/a/status/1" }, { url: "https://x.com/b/status/2" }],
		"a title that only restates the URL is dropped instead of printed twice",
	);
});

test("model-facing content stays bounded and excludes credential metadata", () => {
	const details: XSearchResultDetails = {
		status: "ok",
		answer: "post text ".repeat(20_000),
		sources: [{ url: "https://x.com/a/status/1" }],
		searchCallCount: 2,
		credentialSource: "grok_subscription",
	};
	const content = formatModelContent(details);
	assert.ok(Buffer.byteLength(content, "utf8") <= 50 * 1024);
	assert.match(content, /Tool output truncated/);
	assert.doesNotMatch(content, /grok_subscription|XAI_API_KEY|credential/i);
});
