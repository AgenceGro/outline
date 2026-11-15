import Desktop from "~/utils/Desktop";

/**
 * Normalize a user-entered host into an origin URL, defaulting to https.
 *
 * @param input The host entered by the user.
 * @returns the normalized origin (e.g. "https://docs.example.com").
 * @throws if the input cannot be parsed into a valid URL.
 */
export function normalizeHost(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return new URL(withProtocol).origin;
}

/**
 * Check that the given host is a reachable Outline installation by requesting
 * its auth configuration. The request is performed in the desktop main process
 * to bypass renderer CORS restrictions.
 *
 * @param input The host entered by the user.
 * @returns the normalized origin of the validated installation.
 * @throws if the host is unreachable or not an Outline installation.
 */
export async function validateHost(input: string): Promise<string> {
  const origin = normalizeHost(input);

  if (!Desktop.bridge?.loadAuthConfig) {
    throw new Error("Host validation is unavailable");
  }

  const config = await Desktop.bridge.loadAuthConfig(origin);
  if (!Array.isArray(config?.providers)) {
    throw new Error("Host is not an Outline installation");
  }

  return origin;
}

/**
 * Set the given host in desktop config and navigate to it.
 *
 * @param host The normalized origin to switch to.
 */
export async function navigateToHost(host: string) {
  await Desktop.bridge?.addCustomHost(host);
  window.location.href = host;
}
