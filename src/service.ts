import {
	buildPayload,
	type CredentialSource,
	normalizeParams,
	parseSearchResponse,
	type XSearchParams,
	type XSearchRequestPayload,
	type XSearchResultDetails,
} from "./contracts.ts";
import { requestXaiResponse } from "./client.ts";
import { cancellationError, XSearchError } from "./errors.ts";

export type XaiRequest = (
	accessToken: string,
	payload: XSearchRequestPayload,
	signal?: AbortSignal,
) => Promise<unknown>;

export interface ExecuteXSearchOptions {
	request?: XaiRequest;
	onRetry?: () => void;
}

/** Execute one logical search, retrying only an answer whose telemetry says no search ran. */
export async function executeXSearch(
	params: XSearchParams,
	accessToken: string,
	credentialSource: CredentialSource,
	signal?: AbortSignal,
	options: ExecuteXSearchOptions = {},
): Promise<XSearchResultDetails> {
	const payload = buildPayload(normalizeParams(params));
	const request = options.request ?? requestXaiResponse;

	for (let attempt = 0; attempt < 2; attempt += 1) {
		if (signal?.aborted) throw cancellationError();
		const rawResponse = await request(accessToken, payload, signal);
		const parsed = parseSearchResponse(rawResponse);
		if (parsed.searchCallCount === 0) {
			if (attempt === 0) {
				options.onRetry?.();
				continue;
			}
			throw new XSearchError(
				"unfounded_answer",
				"xAI answered twice without running X search, so the ungrounded answer was rejected.",
			);
		}
		if (!parsed.answer) {
			throw new XSearchError("upstream_protocol", "xAI searched but returned no answer text.");
		}
		return {
			...parsed,
			status: parsed.sources.length > 0 ? "ok" : "no_matches",
			credentialSource,
		};
	}

	throw new XSearchError("unfounded_answer", "xAI did not run X search.");
}
