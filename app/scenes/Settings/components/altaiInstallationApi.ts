import { client } from "~/utils/ApiClient";
import type {
  AltaiAction,
  AltaiInstallationData,
} from "./altaiInstallationState";
import { parseAltaiInstallationResponse } from "./altaiInstallationState";

/**
 * Reads whether Altai is enabled for the current workspace.
 *
 * @returns the installation state, never including a token.
 */
export async function fetchAltaiInstallation(): Promise<AltaiInstallationData> {
  const body: unknown = await client.post("/altaiInstallation.info", {});
  const { enabled } = parseAltaiInstallationResponse(body);
  return { enabled };
}

/**
 * Enables, rotates or disables the Altai installation. The response from
 * enable and rotate carries a one-time token, which callers must keep only in
 * component state.
 *
 * @param action the administrative action to perform.
 * @returns the resulting installation state.
 */
export async function performAltaiAction(
  action: AltaiAction
): Promise<AltaiInstallationData> {
  const body: unknown = await client.post(`/altaiInstallation.${action}`, {});
  return parseAltaiInstallationResponse(body);
}
