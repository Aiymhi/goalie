// UI layer (effects only). The certificate DOMAIN (src/domain/certificates)
// stays pure; every native effect — rendering HTML to a PDF, relocating it to a
// stable documents location, and presenting the share sheet — lives here.
//
// Honesty: sharing is guarded by Sharing.isAvailableAsync() so an unavailable
// platform is reported honestly rather than faked; a user who dismisses the
// share sheet is a clean no-op, never surfaced as an error.

import { File, Paths } from 'expo-file-system';
import { printToFileAsync } from 'expo-print';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

export class SharingUnavailableError extends Error {
  constructor() {
    super('Sharing is not available on this device.');
    this.name = 'SharingUnavailableError';
  }
}

// Render a self-contained HTML string to a PDF in the app cache directory and
// return its file:// URI. The domain builds the HTML; this only performs the
// native print effect.
export async function generateCertificatePdf(html: string): Promise<string> {
  const { uri } = await printToFileAsync({ html });
  return uri;
}

// Relocate a generated PDF into the stable documents directory (survives cache
// eviction) and return the new file:// URI. Idempotent on name collision
// (overwrites), so re-saving the same certificate is safe.
export async function savePdf(uri: string): Promise<string> {
  const source = new File(uri);
  const destination = new File(Paths.document, source.name);
  if (destination.exists) {
    destination.delete();
  }
  source.copy(destination);
  return destination.uri;
}

// Present the native share sheet for a local PDF. Throws SharingUnavailableError
// when sharing is not available on this platform (honest, not faked). A user
// cancelling the sheet resolves normally (clean no-op).
export async function sharePdf(uri: string): Promise<void> {
  const available = await isAvailableAsync();
  if (!available) {
    throw new SharingUnavailableError();
  }
  await shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Share your certificate',
  });
}
