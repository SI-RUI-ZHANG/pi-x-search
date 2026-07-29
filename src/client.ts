import { XAI_RESPONSES_URL, type XSearchRequestPayload } from "./contracts.ts";
import { cancellationError, XSearchError } from "./errors.ts";

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 40;
const MAX_JSON_NODES = 20_000;

export type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface XaiClientOptions {
	fetchImpl?: FetchImplementation;
	timeoutMs?: number;
}

interface RequestAbort {
	signal: AbortSignal;
	didTimeout(): boolean;
	dispose(): void;
}

function requestAbort(callerSignal: AbortSignal | undefined, timeoutMs: number): RequestAbort {
	const controller = new AbortController();
	let timedOut = false;
	const onCallerAbort = () => controller.abort();

	if (callerSignal?.aborted) controller.abort();
	else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	return {
		signal: controller.signal,
		didTimeout: () => timedOut,
		dispose: () => {
			clearTimeout(timer);
			callerSignal?.removeEventListener("abort", onCallerAbort);
		},
	};
}

async function discardBody(response: Response): Promise<void> {
	try {
		await response.body?.cancel();
	} catch {
		// Best effort only; the body is intentionally never exposed.
	}
}

function statusError(status: number): XSearchError {
	if (status === 400 || status === 404 || status === 422) {
		return new XSearchError(
			"invalid_request",
			`xAI rejected the search request (HTTP ${status}). Check the filters and model compatibility.`,
		);
	}
	if (status === 401 || status === 403) {
		return new XSearchError(
			"authentication",
			'xAI rejected the credential. Run /login and sign in to "xAI (Grok/X subscription)" again, or verify XAI_API_KEY.',
		);
	}
	if (status === 429) {
		return new XSearchError("rate_limited", "xAI rate-limited the search request. Try again later.");
	}
	if (status >= 500) {
		return new XSearchError("upstream", `xAI search is temporarily unavailable (HTTP ${status}).`);
	}
	return new XSearchError("upstream", `xAI search failed (HTTP ${status}).`);
}

async function readBody(response: Response): Promise<string> {
	const rawLength = response.headers.get("content-length");
	if (rawLength) {
		const length = Number(rawLength);
		if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
			await discardBody(response);
			throw new XSearchError("upstream_protocol", "xAI returned an oversized search response.");
		}
	}

	if (!response.body) {
		throw new XSearchError("upstream_protocol", "xAI returned an empty search response.");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0;
	let text = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > MAX_RESPONSE_BYTES) {
				await reader.cancel();
				throw new XSearchError("upstream_protocol", "xAI returned an oversized search response.");
			}
			text += decoder.decode(value, { stream: true });
		}
		text += decoder.decode();
	} finally {
		reader.releaseLock();
	}
	if (!text.trim()) {
		throw new XSearchError("upstream_protocol", "xAI returned an empty search response.");
	}
	return text;
}

function assertBoundedJson(root: unknown): void {
	const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
	let nodes = 0;
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) break;
		nodes += 1;
		if (nodes > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) {
			throw new XSearchError("upstream_protocol", "xAI returned an overly complex search response.");
		}
		if (Array.isArray(current.value)) {
			for (const value of current.value) stack.push({ value, depth: current.depth + 1 });
		} else if (typeof current.value === "object" && current.value !== null) {
			for (const value of Object.values(current.value)) stack.push({ value, depth: current.depth + 1 });
		}
	}
}

/** Make one authenticated request to the fixed official xAI Responses endpoint. */
export async function requestXaiResponse(
	accessToken: string,
	payload: XSearchRequestPayload,
	callerSignal?: AbortSignal,
	options: XaiClientOptions = {},
): Promise<unknown> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const abort = requestAbort(callerSignal, options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
	try {
		let response: Response;
		try {
			response = await fetchImpl(XAI_RESPONSES_URL, {
				method: "POST",
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
				redirect: "error",
				signal: abort.signal,
			});
		} catch {
			if (callerSignal?.aborted) throw cancellationError();
			if (abort.didTimeout()) {
				throw new XSearchError("timeout", "X search timed out while waiting for xAI.");
			}
			throw new XSearchError("upstream", "Could not reach the official xAI API.");
		}

		if (!response.ok) {
			await discardBody(response);
			throw statusError(response.status);
		}

		const contentType = response.headers.get("content-type");
		if (contentType && !contentType.toLowerCase().includes("json")) {
			await discardBody(response);
			throw new XSearchError("upstream_protocol", "xAI returned a non-JSON search response.");
		}

		const body = await readBody(response);
		let parsed: unknown;
		try {
			parsed = JSON.parse(body);
		} catch {
			throw new XSearchError("upstream_protocol", "xAI returned invalid JSON.");
		}
		assertBoundedJson(parsed);
		return parsed;
	} catch (error) {
		if (error instanceof XSearchError) throw error;
		if (callerSignal?.aborted) throw cancellationError();
		if (abort.didTimeout()) {
			throw new XSearchError("timeout", "X search timed out while waiting for xAI.");
		}
		throw new XSearchError("upstream", "Could not read the response from the official xAI API.");
	} finally {
		abort.dispose();
	}
}
