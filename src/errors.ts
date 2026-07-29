export type XSearchErrorCode =
	| "authentication"
	| "cancelled"
	| "invalid_request"
	| "rate_limited"
	| "timeout"
	| "unfounded_answer"
	| "upstream"
	| "upstream_protocol";

/** A sanitized failure that is safe to expose as a pi tool error. */
export class XSearchError extends Error {
	readonly code: XSearchErrorCode;

	constructor(code: XSearchErrorCode, message: string) {
		super(message);
		this.name = "XSearchError";
		this.code = code;
	}
}

export function cancellationError(): XSearchError {
	return new XSearchError("cancelled", "X search was cancelled.");
}
