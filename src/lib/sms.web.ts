import { smsUrl } from '@/lib/web/web-utils';

/** Browsers cannot send texts, but phones open their composer from an `sms:` link. */
export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

/** Opens the composer with the body prefilled; the result is always "unknown", like Android. */
export async function sendSMSAsync(
  addresses: string | string[],
  message: string,
): Promise<{ result: 'unknown' | 'sent' | 'cancelled' }> {
  const list = Array.isArray(addresses) ? addresses : [addresses];
  window.location.href = smsUrl(list, message);
  return { result: 'unknown' };
}
