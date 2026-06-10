export type ErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "authorization_error"
  | "not_found_error"
  | "rate_limit_error"
  | "api_error";

export interface ApiError {
  type: ErrorType;
  code: string;
  message: string;
  param?: string | null;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export const errors = {
  unauthorized: (message = "No valid API key provided."): ApiError => ({
    type: "authentication_error",
    code: "unauthorized",
    message,
  }),
  forbidden: (message = "You do not have access to this resource."): ApiError => ({
    type: "authorization_error",
    code: "forbidden",
    message,
  }),
  notFound: (resource: string, id: string): ApiError => ({
    type: "not_found_error",
    code: "resource_not_found",
    message: `No ${resource} with ID '${id}' exists.`,
  }),
  alreadyClaimed: (message: string): ApiError => ({
    type: "invalid_request_error",
    code: "resource_already_claimed",
    message,
  }),
  notClaimable: (message: string): ApiError => ({
    type: "invalid_request_error",
    code: "resource_not_claimable",
    message,
  }),
  invalidClaimToken: (message = "Unknown claim token."): ApiError => ({
    type: "authorization_error",
    code: "invalid_claim_token",
    message,
  }),
  invalidParam: (param: string, message: string): ApiError => ({
    type: "invalid_request_error",
    code: "invalid_param",
    message,
    param,
  }),
  missingParam: (param: string): ApiError => ({
    type: "invalid_request_error",
    code: "missing_required_param",
    message: `Required parameter '${param}' is missing.`,
    param,
  }),
  internal: (message = "An unexpected error occurred."): ApiError => ({
    type: "api_error",
    code: "internal_error",
    message,
  }),
};
