/** An administrative action that changes the Altai installation. */
export type AltaiAction = "enable" | "rotate" | "disable";

/** Response payload shared by every Altai installation endpoint. */
export interface AltaiInstallationData {
  enabled: boolean;
  token?: string;
}

/** Component-local state for the Altai installation settings page. */
export interface AltaiInstallationState {
  /** Progress of the initial installation lookup. */
  load: "loading" | "loaded" | "failed";
  /** Whether Altai is currently enabled for the workspace. */
  enabled: boolean;
  /** The action currently in flight, if any. */
  pending: AltaiAction | null;
  /** The last failed action, kept so it can be retried. */
  failedAction: AltaiAction | null;
  /** The server message for the last failure, if any. */
  errorMessage: string | null;
  /**
   * The token returned by the last enable or rotate. It is shown once and
   * must never leave component state.
   */
  token: string | null;
  /** Whether the last enable or rotate succeeded without returning a token. */
  tokenMissing: boolean;
  /**
   * The action that could not run because the installation had already
   * changed elsewhere; the state now reflects the server.
   */
  conflict: AltaiAction | null;
}

/** Events that drive the Altai installation state. */
export type AltaiInstallationEvent =
  | { type: "loadStarted" }
  | { type: "loadSucceeded"; data: AltaiInstallationData }
  | { type: "loadFailed"; message: string }
  | { type: "actionStarted"; action: AltaiAction }
  | {
      type: "actionSucceeded";
      action: AltaiAction;
      data: AltaiInstallationData;
    }
  | { type: "actionFailed"; action: AltaiAction; message: string }
  | { type: "actionConflicted"; action: AltaiAction; enabled: boolean }
  | { type: "tokenDismissed" };

/** The state before the installation has been loaded. */
export const initialAltaiInstallationState: AltaiInstallationState = {
  load: "loading",
  enabled: false,
  pending: null,
  failedAction: null,
  errorMessage: null,
  token: null,
  tokenMissing: false,
  conflict: null,
};

/**
 * Reduces Altai installation events into the next page state. Tokens are only
 * kept from enable and rotate responses, and are cleared by any later change.
 *
 * @param state the current state.
 * @param event the event to apply.
 * @returns the next state.
 */
export function altaiInstallationReducer(
  state: AltaiInstallationState,
  event: AltaiInstallationEvent
): AltaiInstallationState {
  switch (event.type) {
    case "loadStarted":
      return { ...state, load: "loading", errorMessage: null };
    case "loadSucceeded":
      return {
        ...state,
        load: "loaded",
        enabled: event.data.enabled,
        errorMessage: null,
      };
    case "loadFailed":
      return { ...state, load: "failed", errorMessage: event.message };
    case "actionStarted":
      return {
        ...state,
        pending: event.action,
        failedAction: null,
        errorMessage: null,
        token: null,
        tokenMissing: false,
        conflict: null,
      };
    case "actionSucceeded": {
      const issuesToken = event.action !== "disable";
      const token = issuesToken && event.data.token ? event.data.token : null;
      return {
        ...state,
        pending: null,
        enabled: event.data.enabled,
        token,
        tokenMissing: issuesToken && event.data.enabled && token === null,
      };
    }
    case "actionFailed":
      return {
        ...state,
        pending: null,
        failedAction: event.action,
        errorMessage: event.message,
      };
    case "actionConflicted":
      return {
        ...state,
        pending: null,
        enabled: event.enabled,
        failedAction: null,
        errorMessage: null,
        conflict: event.action,
      };
    case "tokenDismissed":
      return { ...state, token: null, tokenMissing: false };
    default:
      return state;
  }
}

/**
 * Whether an action failed because the installation was not in the state the
 * page assumed, judged from a fresh read after the failure.
 *
 * @param action the action that failed.
 * @param enabledNow whether Altai is enabled according to the server.
 * @returns true when the failure is a conflict rather than an error.
 */
export function isAltaiConflict(
  action: AltaiAction,
  enabledNow: boolean
): boolean {
  return action === "enable" ? enabledNow : !enabledNow;
}

/**
 * Narrows an unknown API response body to the Altai installation payload.
 *
 * @param body the parsed response body.
 * @returns the installation data.
 * @throws {Error} if the body does not match the expected shape.
 */
export function parseAltaiInstallationResponse(
  body: unknown
): AltaiInstallationData {
  if (typeof body !== "object" || body === null || !("data" in body)) {
    throw new Error("Unexpected response from the server");
  }
  const { data } = body;
  if (
    typeof data !== "object" ||
    data === null ||
    !("enabled" in data) ||
    typeof data.enabled !== "boolean"
  ) {
    throw new Error("Unexpected response from the server");
  }
  const token =
    "token" in data && typeof data.token === "string" && data.token !== ""
      ? data.token
      : undefined;
  return token ? { enabled: data.enabled, token } : { enabled: data.enabled };
}
