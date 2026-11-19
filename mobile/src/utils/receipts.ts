import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { errorMessage } from '@/api/client';

/**
 * Saves a PDF from the API into the app's cache and opens the iOS share sheet, where it can be
 * saved to Files, AirDropped, printed, or sent by WhatsApp or email. Resolves with an error
 * message (an English key for t()) when something went wrong, or '' on success.
 */
export async function sharePdf(download: () => Promise<{ bytes: Uint8Array; filename: string | null }>, fallbackName: string): Promise<string> {
  try {
    const { bytes, filename } = await download();
    const name = (filename ?? fallbackName).replace(/[^\w.-]+/g, '-');
    const file = new File(Paths.cache, `${Date.now()}-${name}`);
    file.create();
    await file.write(bytes);
    if (!(await Sharing.isAvailableAsync())) return 'Sharing isn’t available on this device.';
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name });
    return '';
  } catch (e) {
    return errorMessage(e, 'Unable to prepare the receipt. Please try again.');
  }
}
