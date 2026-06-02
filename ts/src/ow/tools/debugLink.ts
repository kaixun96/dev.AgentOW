/**
 * Extracts debug link URLs from rush start output.
 * rush start prints a landing page URL after initial build completes.
 */
export function extractDebugLinks(rushOutput: string): {
  landingPage?: string;
  debugQueryString?: string;
  devhostLink?: string;
} {
  const lines = rushOutput.split("\n");
  let landingPage: string | undefined;
  let debugQueryString: string | undefined;
  let devhostLink: string | undefined;

  for (const line of lines) {
    // Look for landing page URL (https://localhost:PORT) - prefer the bare URL on its own line
    const urlMatch = line.match(/https:\/\/localhost:\d+(?:\/)?$/);
    if (urlMatch) landingPage = urlMatch[0].replace(/\/$/, "");

    // SPFx debug query string pattern (sometimes printed inline by older rush)
    const spfxMatch = line.match(/\?.*(?:debugManifestsFile|loadSPFX).*$/);
    if (spfxMatch) debugQueryString = spfxMatch[0];

    // Devhost link pattern
    const devhostMatch = line.match(/https?:\/\/.*devhost.*/i);
    if (devhostMatch) devhostLink = devhostMatch[0];
  }

  return { landingPage, debugQueryString, devhostLink };
}

/**
 * Fetches a rush dev-server landing page (https://localhost:PORT/) and extracts
 * the sp-loader-assembly URL and debugManifestsFile URL embedded in the HTML.
 * Skips TLS verification because rush serves a self-signed dev cert.
 */
export async function fetchDebugUrlsFromLanding(landingPage: string, signal?: AbortSignal): Promise<{
  loader?: string;
  manifests?: string;
}> {
  // Bypass self-signed dev cert with a scoped env var around the fetch.
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  let html: string;
  try {
    const resp = await fetch(landingPage, { signal });
    if (!resp.ok) {
      throw new Error(`Failed to fetch landing page ${landingPage}: ${resp.status}`);
    }
    html = await resp.text();
  } finally {
    if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
  }
  const loaderMatch = html.match(/https:\/\/localhost:\d+\/hashed\/sp-loader-assembly_default_[a-f0-9]+\.js/);
  const manifestsMatch = html.match(/https:\/\/localhost:\d+\/dev\/manifests\.js/);
  return {
    loader: loaderMatch?.[0],
    manifests: manifestsMatch?.[0],
  };
}

/**
 * Combines a SharePoint page URL with a debug query string into a full test URL.
 * Handles both cases: page URL with existing query params and without.
 */
export function buildFullTestUrl(pageUrl: string, debugQueryString: string): string {
  const cleanDebug = debugQueryString.replace(/^\?/, "");
  const separator = pageUrl.includes("?") ? "&" : "?";
  return pageUrl + separator + cleanDebug;
}

/**
 * Builds the full debug query string from a loader URL + manifests URL.
 * Result: `debug=true&noredir=true&loader=<encoded>&debugManifestsFile=<encoded>`
 */
export function buildDebugQueryString(loader: string, manifests: string, flights?: string): string {
  const parts = [
    "debug=true",
    "noredir=true",
    `loader=${encodeURIComponent(loader)}`,
    `debugManifestsFile=${encodeURIComponent(manifests)}`,
  ];
  if (flights) parts.push(`debugFlights=${flights}`);
  return parts.join("&");
}
