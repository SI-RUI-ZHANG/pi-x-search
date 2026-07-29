import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

import { type CredentialSource, XAI_PROVIDER_ID } from "./contracts.ts";
import { XSearchError } from "./errors.ts";

export interface ResolvedXaiCredential {
	accessToken: string;
	credentialSource: CredentialSource;
}

export function loginRequiredMessage(): string {
	return [
		"No xAI credential is configured in pi.",
		'Run /login and choose "xAI (Grok/X subscription)", or set XAI_API_KEY before starting pi.',
		"pi-x-search never reads credentials from the Grok CLI.",
	].join(" ");
}

/** Resolve through pi so stored OAuth, environment fallback, and refresh stay host-owned. */
export async function resolveXaiCredential(
	modelRegistry: Pick<ModelRegistry, "getProviderAuth">,
): Promise<ResolvedXaiCredential> {
	let resolved: Awaited<ReturnType<ModelRegistry["getProviderAuth"]>>;
	try {
		resolved = await modelRegistry.getProviderAuth(XAI_PROVIDER_ID);
	} catch {
		throw new XSearchError(
			"authentication",
			'xAI authentication could not be refreshed. Run /login and sign in to "xAI (Grok/X subscription)" again.',
		);
	}

	const accessToken = resolved?.auth.apiKey;
	if (!accessToken) {
		throw new XSearchError("authentication", loginRequiredMessage());
	}

	const usesStoredOAuth = resolved?.source === "OAuth";
	return {
		accessToken,
		credentialSource: usesStoredOAuth ? "grok_subscription" : "xai_api_key",
	};
}
