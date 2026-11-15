import {
  altaiInstallationReducer,
  initialAltaiInstallationState,
  isAltaiConflict,
  parseAltaiInstallationResponse,
} from "./altaiInstallationState";
import type { AltaiInstallationState } from "./altaiInstallationState";

const loaded = (enabled: boolean): AltaiInstallationState =>
  altaiInstallationReducer(initialAltaiInstallationState, {
    type: "loadSucceeded",
    data: { enabled },
  });

describe("altaiInstallationReducer", () => {
  it("loads the installation state", () => {
    expect(loaded(true)).toMatchObject({ load: "loaded", enabled: true });
  });

  it("keeps the load error and clears it on retry", () => {
    const failed = altaiInstallationReducer(initialAltaiInstallationState, {
      type: "loadFailed",
      message: "Offline",
    });
    expect(failed).toMatchObject({ load: "failed", errorMessage: "Offline" });

    const retrying = altaiInstallationReducer(failed, { type: "loadStarted" });
    expect(retrying).toMatchObject({ load: "loading", errorMessage: null });
  });

  it("keeps the token returned by enable", () => {
    const started = altaiInstallationReducer(loaded(false), {
      type: "actionStarted",
      action: "enable",
    });
    expect(started.pending).toBe("enable");

    const enabled = altaiInstallationReducer(started, {
      type: "actionSucceeded",
      action: "enable",
      data: { enabled: true, token: "secret" },
    });
    expect(enabled).toMatchObject({
      pending: null,
      enabled: true,
      token: "secret",
      tokenMissing: false,
    });
  });

  it("flags a successful rotate without a token", () => {
    const state = altaiInstallationReducer(loaded(true), {
      type: "actionSucceeded",
      action: "rotate",
      data: { enabled: true },
    });
    expect(state).toMatchObject({ token: null, tokenMissing: true });
  });

  it("never keeps a token from disable", () => {
    const state = altaiInstallationReducer(loaded(true), {
      type: "actionSucceeded",
      action: "disable",
      data: { enabled: false, token: "unexpected" },
    });
    expect(state).toMatchObject({
      enabled: false,
      token: null,
      tokenMissing: false,
    });
  });

  it("clears a shown token when another action starts", () => {
    const withToken = altaiInstallationReducer(loaded(false), {
      type: "actionSucceeded",
      action: "enable",
      data: { enabled: true, token: "secret" },
    });
    const disabling = altaiInstallationReducer(withToken, {
      type: "actionStarted",
      action: "disable",
    });
    expect(disabling.token).toBeNull();
  });

  it("records the failed action for retry and keeps the enabled state", () => {
    const state = altaiInstallationReducer(loaded(true), {
      type: "actionFailed",
      action: "rotate",
      message: "Server error",
    });
    expect(state).toMatchObject({
      enabled: true,
      pending: null,
      failedAction: "rotate",
      errorMessage: "Server error",
    });
  });

  it("dismisses the token", () => {
    const withToken = altaiInstallationReducer(loaded(true), {
      type: "actionSucceeded",
      action: "rotate",
      data: { enabled: true, token: "secret" },
    });
    expect(
      altaiInstallationReducer(withToken, { type: "tokenDismissed" }).token
    ).toBeNull();
  });

  it("shows the server state after a conflict instead of a retry", () => {
    const failing = altaiInstallationReducer(loaded(false), {
      type: "actionStarted",
      action: "enable",
    });
    const state = altaiInstallationReducer(failing, {
      type: "actionConflicted",
      action: "enable",
      enabled: true,
    });
    expect(state).toMatchObject({
      enabled: true,
      pending: null,
      failedAction: null,
      conflict: "enable",
      token: null,
    });
  });
});

describe("isAltaiConflict", () => {
  it("detects that the installation already changed", () => {
    expect(isAltaiConflict("enable", true)).toBe(true);
    expect(isAltaiConflict("enable", false)).toBe(false);
    expect(isAltaiConflict("rotate", false)).toBe(true);
    expect(isAltaiConflict("disable", false)).toBe(true);
    expect(isAltaiConflict("disable", true)).toBe(false);
  });
});

describe("parseAltaiInstallationResponse", () => {
  it("reads the enabled flag and token", () => {
    expect(
      parseAltaiInstallationResponse({ data: { enabled: true, token: "t" } })
    ).toEqual({ enabled: true, token: "t" });
  });

  it("omits empty or missing tokens", () => {
    expect(
      parseAltaiInstallationResponse({ data: { enabled: true, token: "" } })
    ).toEqual({ enabled: true });
    expect(
      parseAltaiInstallationResponse({ data: { enabled: false } })
    ).toEqual({ enabled: false });
  });

  it("rejects unexpected shapes", () => {
    expect(() => parseAltaiInstallationResponse(null)).toThrow();
    expect(() => parseAltaiInstallationResponse({ data: {} })).toThrow();
    expect(() =>
      parseAltaiInstallationResponse({ data: { enabled: "yes" } })
    ).toThrow();
  });
});
