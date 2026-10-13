// Kept free of Supabase imports so pure logic and tests can use it.
export const MESSAGE_KINDS = {
  fuel: { label: 'Fuel stop', icon: '⛽' },
  puncture: { label: 'Puncture', icon: '🛞' },
  slow_down: { label: 'Slow down', icon: '🐢' },
  regroup: { label: 'Regroup', icon: '🧭' },
  break: { label: 'Break', icon: '☕' },
  all_good: { label: 'All good', icon: '👍' },
  // Only offered from the SOS takeover (07); never in the quick-messages grid.
  on_my_way: { label: 'On my way', icon: '🏍' },
} as const;

export type MessageKind = keyof typeof MESSAGE_KINDS;

export const MESSAGE_KIND_LIST = Object.keys(MESSAGE_KINDS) as MessageKind[];

/** Kinds shown in the quick-messages sheet, in grid order. */
export const QUICK_MESSAGE_KINDS: MessageKind[] = MESSAGE_KIND_LIST.filter((k) => k !== 'on_my_way');

export function isMessageKind(value: unknown): value is MessageKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MESSAGE_KINDS, value);
}
