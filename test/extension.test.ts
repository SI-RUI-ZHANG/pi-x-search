import assert from "node:assert/strict";
import test from "node:test";

import type {
	ExtensionAPI,
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";

import xSearchExtension from "../extensions/x-search.ts";
import { XSearchParameters, type XSearchResultDetails } from "../src/contracts.ts";

test("registers one tool and executes the full host-auth-to-result path", async () => {
	let registered: ToolDefinition<typeof XSearchParameters, XSearchResultDetails> | undefined;
	const pi = {
		registerTool(tool: ToolDefinition<typeof XSearchParameters, XSearchResultDetails>) {
			registered = tool;
		},
	} as unknown as ExtensionAPI;
	xSearchExtension(pi);
	assert.equal(registered?.name, "x_search");

	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () =>
		new Response(
			JSON.stringify({
				usage: { server_side_tool_usage_details: { x_search_calls: 2 } },
				output: [
					{
						content: [
							{
								type: "output_text",
								text: "Answer with a quoted post.",
								annotations: [{ type: "url_citation", url: "https://x.com/xai/status/1" }],
							},
						],
					},
				],
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		);

	try {
		const context = {
			modelRegistry: {
				getProviderAuth: async () => ({ auth: { apiKey: "test-token" }, source: "OAuth" }),
			},
		} as unknown as ExtensionContext;
		const result = await registered?.execute("call-1", { query: "latest xAI news" }, undefined, undefined, context);
		assert.equal(result?.details?.status, "ok");
		assert.equal(result?.details?.credentialSource, "grok_subscription");
		assert.match(result?.content[0]?.type === "text" ? result.content[0].text : "", /https:\/\/x\.com/);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
