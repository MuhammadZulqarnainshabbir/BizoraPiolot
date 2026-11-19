import * as ImagePicker from 'expo-image-picker';

/**
 * Takes or chooses a picture of a customer's ID card and returns it as a JPEG data URL for the
 * customers API, or null when the user cancelled. Throws with a translatable message when the
 * permission was refused. Quality is reduced so a phone camera shot stays well under the 3 MB limit.
 */
export async function pickIdPicture(source: 'camera' | 'library'): Promise<string | null> {
  const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error(source === 'camera' ? 'Camera permission is needed to take a photo.' : 'Photo library permission is needed to choose a picture.');
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true, exif: false, allowsMultipleSelection: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset?.base64) return null;
  return `data:image/jpeg;base64,${asset.base64}`;
}

export const cnicDigits = (value: string) => value.replace(/\D/g, '');
export const isCnic = (value: string) => value.trim() === '' || cnicDigits(value).length === 13;
