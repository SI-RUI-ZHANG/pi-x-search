import assert from "node:assert/strict";
import test from "node:test";

import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

import { loginRequiredMessage, resolveXaiCredential } from "../src/auth.ts";
import { XSearchError } from "../src/errors.ts";

type AuthRegistry = Pick<ModelRegistry, "getProviderAuth">;

test("uses stored OAuth as the subscription source", async () => {
	const registry = {
		getProviderAuth: async () => ({ auth: { apiKey: "oauth-access" }, source: "OAuth" }),
	} satisfies AuthRegistry;
	assert.deepEqual(await resolveXaiCredential(registry), {
		accessToken: "oauth-access",
		credentialSource: "grok_subscription",
	});
});

test("does not mislabel an explicitly stored API key as OAuth", async () => {
	const registry = {
		getProviderAuth: async () => ({ auth: { apiKey: "stored-key" }, source: "stored credential" }),
	} satisfies AuthRegistry;
	assert.equal((await resolveXaiCredential(registry)).credentialSource, "xai_api_key");
});

test("uses ambient xAI auth only when pi resolves it", async () => {
	const registry = {
		getProviderAuth: async () => ({ auth: { apiKey: "api-key" }, source: "XAI_API_KEY" }),
	} satisfies AuthRegistry;
	assert.deepEqual(await resolveXaiCredential(registry), {
		accessToken: "api-key",
		credentialSource: "xai_api_key",
	});
});

test("gives exact login guidance when no auth is configured", async () => {
	const registry = {
		getProviderAuth: async () => undefined,
	} satisfies AuthRegistry;
	await assert.rejects(
		resolveXaiCredential(registry),
		(error) =>
			error instanceof XSearchError &&
			error.code === "authentication" &&
			error.message === loginRequiredMessage() &&
			error.message.includes("/login"),
	);
});

test("sanitizes refresh failures", async () => {
	const registry = {
		getProviderAuth: async () => {
			throw new Error("secret upstream response");
		},
	} satisfies AuthRegistry;
	await assert.rejects(
		resolveXaiCredential(registry),
		(error) =>
			error instanceof XSearchError &&
			error.code === "authentication" &&
			!error.message.includes("secret upstream response"),
	);
});
