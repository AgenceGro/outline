import { errToString } from "@shared/utils/error";

/**
 * Returns a readable message for a failed API request. The API client turns
 * responses without a mapped error type into a bare "Error 500", which means
 * nothing to people, so those and empty messages use the fallback instead.
 *
 * @param err the caught error.
 * @param fallback the message to show when the error carries no useful text.
 * @returns the message to show beside the failed action.
 */
export function requestErrorMessage(err: unknown, fallback: string): string {
  const message = errToString(err).trim();
  return !message || /^Error \d{3}$/.test(message) ? fallback : message;
}
