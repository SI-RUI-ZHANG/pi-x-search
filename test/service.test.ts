import assert from "node:assert/strict";
import test from "node:test";

import type { XSearchRequestPayload } from "../src/contracts.ts";
import { XSearchError } from "../src/errors.ts";
import { executeXSearch, type XaiRequest } from "../src/service.ts";

function response(searchCallCount: number, withSource = true): unknown {
	return {
		usage: { server_side_tool_usage_details: { x_search_calls: searchCallCount } },
		output: [
			{
				content: [
					{
						type: "output_text",
						text: searchCallCount > 0 ? "Grounded answer" : "Confident but ungrounded answer",
						annotations: withSource
							? [{ type: "url_citation", url: "https://x.com/xai/status/1" }]
							: [],
					},
				],
			},
		],
	};
}

test("retries one zero-search response with the same logical payload", async () => {
	const payloads: XSearchRequestPayload[] = [];
	let calls = 0;
	let retryNotified = 0;
	const request: XaiRequest = async (_token, payload) => {
		payloads.push(payload);
		calls += 1;
		return calls === 1 ? response(0) : response(4);
	};
	const result = await executeXSearch({ query: "news" }, "token", "grok_subscription", undefined, {
		request,
		onRetry: () => {
			retryNotified += 1;
		},
	});
	assert.equal(calls, 2);
	assert.equal(retryNotified, 1);
	assert.equal(payloads[0], payloads[1]);
	assert.equal(result.status, "ok");
	assert.equal(result.searchCallCount, 4);
});

test("rejects a second zero-search response", async () => {
	let calls = 0;
	const request: XaiRequest = async () => {
		calls += 1;
		return response(0);
	};
	await assert.rejects(
		executeXSearch({ query: "news" }, "token", "xai_api_key", undefined, { request }),
		(error) => error instanceof XSearchError && error.code === "unfounded_answer",
	);
	assert.equal(calls, 2);
});

test("does not retry request failures", async () => {
	let calls = 0;
	const request: XaiRequest = async () => {
		calls += 1;
		throw new XSearchError("authentication", "auth failed");
	};
	await assert.rejects(executeXSearch({ query: "news" }, "token", "xai_api_key", undefined, { request }));
	assert.equal(calls, 1);
});

test("returns no_matches after a real search without source annotations", async () => {
	const request: XaiRequest = async () => response(2, false);
	const result = await executeXSearch({ query: "obscure query" }, "token", "xai_api_key", undefined, {
		request,
	});
	assert.equal(result.status, "no_matches");
	assert.deepEqual(result.sources, []);
	assert.equal(result.answer, "Grounded answer");
});

test("honors caller cancellation before making a request", async () => {
	const controller = new AbortController();
	controller.abort();
	let called = false;
	const request: XaiRequest = async () => {
		called = true;
		return response(1);
	};
	await assert.rejects(
		executeXSearch({ query: "news" }, "token", "xai_api_key", controller.signal, { request }),
		(error) => error instanceof XSearchError && error.code === "cancelled",
	);
	assert.equal(called, false);
});
