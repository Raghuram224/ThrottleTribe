import { Share } from 'react-native';

/** Opens the system share sheet with a text message. Never throws. */
export async function shareText(message: string): Promise<void> {
  await Share.share({ message }).catch(() => {});
}
