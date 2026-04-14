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
    // Look for "Content is being served from:" or URL patterns
    const urlMatch = line.match(/https?:\/\/localhost[:\d]*/);
    if (urlMatch) landingPage = urlMatch[0];

    // SPFx debug query string pattern
    const spfxMatch = line.match(/\?.*(?:debugManifestsFile|loadSPFX).*$/);
    if (spfxMatch) debugQueryString = spfxMatch[0];

    // Devhost link pattern
    const devhostMatch = line.match(/https?:\/\/.*devhost.*/i);
    if (devhostMatch) devhostLink = devhostMatch[0];
  }

  return { landingPage, debugQueryString, devhostLink };
}
