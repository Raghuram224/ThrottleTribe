// Supabase calls for emergency contacts (supabase/migrations/0008_emergency_contacts.sql).
// Owner CRUD plus the receiver read that RLS allows only while the owner's SOS is on.
import type { Tables } from '@/lib/database.types';
import {
  MAX_CONTACTS,
  positionUpdates,
  sortContacts,
  type ContactDraft,
  type EmergencyContact,
} from '@/lib/emergency-contacts';
import { ensureSignedIn } from '@/lib/ride-api';
import { supabase } from '@/lib/supabase';

const COLUMNS = 'id, name, phone, relation, position';

type Row = Pick<Tables<'emergency_contacts'>, 'id' | 'name' | 'phone' | 'relation' | 'position'>;

const toContact = (r: Row): EmergencyContact => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  relation: r.relation,
  position: r.position,
});

/** Throws the raw Postgrest error; screens turn it into text with contactErrorText(). */
export async function listMyContacts(): Promise<EmergencyContact[]> {
  const userId = await ensureSignedIn();
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toContact);
}

/** Appends at the end. Throws `contact_limit_reached` (server) when there are already 5. */
export async function addContact(draft: ContactDraft, existingCount: number): Promise<EmergencyContact> {
  await ensureSignedIn();
  const { data, error } = await supabase
    .from('emergency_contacts')
    .insert({ ...draft, position: Math.min(existingCount, MAX_CONTACTS - 1) })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toContact(data);
}

export async function updateContact(id: string, draft: ContactDraft): Promise<EmergencyContact> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .update(draft)
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toContact(data);
}

/** Writes the positions that changed (the list is already in the wanted order). */
export async function saveOrder(rows: readonly EmergencyContact[]): Promise<void> {
  const updates = positionUpdates(rows);
  const results = await Promise.all(
    updates.map((u) => supabase.from('emergency_contacts').update({ position: u.position }).eq('id', u.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/** Deletes, then closes the gap so positions stay 0..n-1 (the next add goes last). */
export async function deleteContact(id: string, rows: readonly EmergencyContact[]): Promise<EmergencyContact[]> {
  const { error } = await supabase.from('emergency_contacts').delete().eq('id', id);
  if (error) throw error;
  const rest = sortContacts(rows).filter((r) => r.id !== id);
  const compact = rest.map((r, i) => ({ ...r, position: i }));
  // Best effort: a failed compaction only leaves a gap, which sorting tolerates.
  await saveOrder(rest).catch(() => {});
  return compact;
}

/**
 * A receiver's read of `userId`'s contacts. RLS hides them unless that rider's SOS is on in a
 * ride we share, in which case the result is simply [] (never an error). Only a real failure
 * (network) throws, so the takeover can offer "Try again" while 112 stays on screen.
 */
export async function fetchSosContacts(userId: string): Promise<EmergencyContact[]> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toContact);
}
