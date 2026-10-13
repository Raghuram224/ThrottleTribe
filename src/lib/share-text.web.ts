import { showToast } from '@/store/toast-store';

/** navigator.share when the browser has it (iPhone Safari does), else copy to the clipboard. */
export async function shareText(message: string): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ text: message });
      return;
    }
  } catch (e) {
    // The person closed the share sheet: nothing more to do.
    if ((e as { name?: string })?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(message);
    showToast('Copied to your clipboard');
  } catch {
    showToast('Could not share. Copy the ride code from the screen instead.');
  }
}
