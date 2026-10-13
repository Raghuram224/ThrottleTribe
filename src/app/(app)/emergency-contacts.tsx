import { Contact, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ContactEditSheet, type ContactFormInitial } from '@/components/contact-edit-sheet';
import { ContactRow } from '@/components/contact-row';
import { ErrorText } from '@/components/error-text';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { TopBar } from '@/components/top-bar';
import { copy, fill } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import {
  addContact,
  deleteContact,
  listMyContacts,
  saveOrder,
  updateContact,
} from '@/lib/emergency-contacts-api';
import {
  AMBULANCE_NUMBER,
  contactErrorText,
  formatPhone,
  MAX_CONTACTS,
  moveContact,
  normalisePhone,
  type ContactDraft,
  type EmergencyContact,
} from '@/lib/emergency-contacts';
import { useSosStore } from '@/store/sos-store';
import { showToast } from '@/store/toast-store';
import { elevate, family, font, radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Editor = { mode: 'add' | 'edit'; id?: string; initial: ContactFormInitial } | null;
type PickedNumber = { name: string; numbers: string[] } | null;

const EMPTY: ContactFormInitial = { name: '', phone: '', relation: '' };

/** Profile -> Safety -> Emergency contacts (docs/design/11 §1-2). */
export default function EmergencyContacts() {
  const { colors, scheme } = useTheme();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [menu, setMenu] = useState<EmergencyContact | null>(null);
  const [removing, setRemoving] = useState<EmergencyContact | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [explainPerm, setExplainPerm] = useState(false);
  const [numbers, setNumbers] = useState<PickedNumber>(null);

  // Keep the ride-layout cache in step so the SOS panel never shows a stale list.
  const apply = useCallback((rows: EmergencyContact[]) => {
    setContacts(rows);
    useSosStore.getState().setMyContacts(rows);
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await listMyContacts());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoaded(true);
    }
  }, [apply]);

  useEffect(() => {
    let alive = true;
    listMyContacts()
      .then((rows) => {
        if (!alive) return;
        apply(rows);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setLoadFailed(true);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [apply]);

  const full = contacts.length >= MAX_CONTACTS;
  const ambulanceSaved = contacts.some((c) => c.phone === AMBULANCE_NUMBER);

  // ------------------------------------------------------------ save / move / remove

  const saveDraft = async (value: ContactDraft) => {
    if (editor?.mode === 'edit' && editor.id) {
      const updated = await updateContact(editor.id, value);
      apply(contacts.map((c) => (c.id === updated.id ? updated : c)));
      showToast(copy['contacts.saved']);
    } else {
      const created = await addContact(value, contacts.length);
      apply([...contacts, created]);
      showToast(fill(copy['contacts.added'], { name: created.name }));
    }
    setEditor(null);
  };

  const quickAddAmbulance = async () => {
    haptic('select');
    try {
      const created = await addContact({ name: 'Ambulance', phone: AMBULANCE_NUMBER, relation: null }, contacts.length);
      apply([...contacts, created]);
      showToast(fill(copy['contacts.added'], { name: created.name }));
    } catch (e) {
      showToast(contactErrorText(e));
    }
  };

  const move = async (c: EmergencyContact, dir: -1 | 1) => {
    const next = moveContact(contacts, c.id, dir);
    const before = contacts;
    apply(next);
    try {
      await saveOrder(next);
    } catch (e) {
      apply(before);
      showToast(contactErrorText(e));
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      apply(await deleteContact(removing.id, contacts));
      setRemoving(null);
    } catch (e) {
      setRemoving(null);
      showToast(contactErrorText(e));
    } finally {
      setRemoveBusy(false);
    }
  };

  // ------------------------------------------------------------ pick from contacts

  const openPicker = async () => {
    try {
      const contact = await Contact.presentPicker();
      if (!contact) return;
      const phones = (await contact.getPhones()).map((p) => p.number ?? '').filter((n) => n.trim() !== '');
      const name = ((await contact.getFullName()) ?? '').trim();
      // Same number twice (mobile + home saved alike) would only add noise to the choice.
      const unique = Array.from(new Set(phones.map((n) => normalisePhone(n) ?? n)));
      if (unique.length === 0) {
        showToast(copy['contacts.noNumber']);
        return;
      }
      if (unique.length === 1) startFromPick(name, unique[0]);
      else setNumbers({ name, numbers: unique });
    } catch {
      showToast(copy['errors.unknown']);
    }
  };

  const startFromPick = (name: string, phone: string) => {
    setNumbers(null);
    setEditor({
      mode: 'add',
      initial: { name: name.slice(0, 40), phone: formatPhone(normalisePhone(phone) ?? phone), relation: '' },
    });
  };

  // Just-in-time permission, explained first. Without it the manual form is still one tap away.
  const addFromContacts = async () => {
    try {
      const current = await getPermissionsAsync();
      if (current.granted) {
        await openPicker();
      } else if (current.canAskAgain) {
        setExplainPerm(true);
      } else {
        showToast(copy['contacts.permDenied']);
      }
    } catch {
      showToast(copy['contacts.permDenied']);
    }
  };

  const allowContacts = async () => {
    setExplainPerm(false);
    try {
      const res = await requestPermissionsAsync();
      if (res.granted) await openPicker();
      else showToast(copy['contacts.permDenied']);
    } catch {
      showToast(copy['contacts.permDenied']);
    }
  };

  // ------------------------------------------------------------ render

  const count = contacts.length;
  return (
    <Screen
      scroll
      top={<TopBar title={copy['contacts.title']} onBack={() => router.back()} />}
      footer={
        loaded && !loadFailed ? (
          full ? (
            <AppText muted style={styles.center}>
              {copy['contacts.full']}
            </AppText>
          ) : (
            <>
              {Platform.OS === 'web' ? null : (
                <BigButton
                  label={copy['contacts.addFromContacts']}
                  variant="secondary"
                  icon="contacts"
                  onPress={() => void addFromContacts()}
                />
              )}
              <BigButton
                label={copy['contacts.add']}
                icon="phonePlus"
                onPress={() => setEditor({ mode: 'add', initial: EMPTY })}
              />
            </>
          )
        ) : null
      }>
      {/* One element, read first (11 §8). */}
      <View
        accessible
        accessibilityLabel={copy['contacts.groupNotice']}
        style={[styles.notice, { backgroundColor: colors.surfaceRaised, borderLeftColor: colors.brand.primary }, elevate('e1', scheme)]}>
        <Icon name="group" color={colors.text} size={24} />
        <Text maxFontSizeMultiplier={1.3} style={[styles.noticeText, { color: colors.text }]}>
          {copy['contacts.groupNotice']}
        </Text>
        <Icon name="lock" color={colors.textMuted} size={16} />
      </View>

      <View style={styles.gap}>
        <AppText variant="heading">{copy['contacts.heading']}</AppText>
        <AppText variant="caption" muted>
          {copy['contacts.sub']}
        </AppText>
      </View>

      {!loaded ? (
        <ActivityIndicator color={colors.text} />
      ) : loadFailed ? (
        <View style={styles.gap}>
          <ErrorText>{copy['contacts.errLoad']}</ErrorText>
          <BigButton label={copy['common.tryAgain']} variant="secondary" onPress={() => void load()} />
        </View>
      ) : count === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyTile, { backgroundColor: colors.brandTint }]}>
            <Icon name="shield" color={colors.text} size={28} />
          </View>
          <AppText variant="heading" style={styles.center}>
            {copy['contacts.emptyTitle']}
          </AppText>
          <AppText muted style={styles.center}>
            {copy['contacts.emptyBody']}
          </AppText>
          {!ambulanceSaved ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy['contacts.quickAmbulance']}
              onPress={() => void quickAddAmbulance()}
              style={({ pressed }) => [styles.quick, { backgroundColor: pressed ? colors.surfacePressed : colors.surface }]}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.quickText, { color: colors.text }]}>
                {copy['contacts.quickAmbulance']}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.gap}>
          <AppText variant="label" muted>
            {fill(copy['contacts.listLabel'], { n: count })}
          </AppText>
          <View style={[styles.list, { backgroundColor: colors.surfaceRaised }, elevate('e1', scheme)]}>
            {contacts.map((c, i) => (
              <View
                key={c.id}
                style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined}>
                <ContactRow
                  contact={c}
                  index={i + 1}
                  isFirst={i === 0}
                  isLast={i === count - 1}
                  onEdit={() =>
                    setEditor({
                      mode: 'edit',
                      id: c.id,
                      initial: { name: c.name, phone: formatPhone(c.phone), relation: c.relation ?? '' },
                    })
                  }
                  onMenu={() => setMenu(c)}
                  onMove={(dir) => void move(c, dir)}
                  onRemove={() => setRemoving(c)}
                />
              </View>
            ))}
          </View>
          <AppText variant="caption" muted>
            {copy['contacts.firstHint']}
          </AppText>
        </View>
      )}

      <View style={styles.gap}>
        <AppText variant="label" muted>
          {copy['contacts.alwaysLabel']}
        </AppText>
        <View
          accessible
          accessibilityLabel={`${copy['contacts.builtIn112']}, ${copy['contacts.builtInTag']}`}
          style={[styles.builtIn, { backgroundColor: colors.surfaceRaised }, elevate('e1', scheme)]}>
          <Icon name="call" color={colors.text} size={24} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.builtInText, { color: colors.text }]}>
            {copy['contacts.builtIn112']}
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.tag, { color: colors.textSubtle }]}>
            {copy['contacts.builtInTag']}
          </Text>
        </View>
      </View>

      <View style={styles.privacy}>
        <Icon name="lock" color={colors.textMuted} size={16} />
        <AppText variant="caption" muted style={styles.flex}>
          {copy['contacts.privacy']}
        </AppText>
      </View>

      {editor ? (
        <ContactEditSheet
          key={editor.id ?? 'new'}
          title={editor.mode === 'edit' ? copy['contacts.editTitle'] : copy['contacts.addTitle']}
          initial={editor.initial}
          others={contacts.filter((c) => c.id !== editor.id)}
          onSave={saveDraft}
          onCancel={() => setEditor(null)}
        />
      ) : null}

      <Sheet visible={!!menu} onClose={() => setMenu(null)}>
        <AppText variant="heading">
          {menu?.name}
        </AppText>
        <BigButton
          label={copy['contacts.edit']}
          variant="secondary"
          onPress={() => {
            const c = menu;
            setMenu(null);
            if (c) {
              setEditor({
                mode: 'edit',
                id: c.id,
                initial: { name: c.name, phone: formatPhone(c.phone), relation: c.relation ?? '' },
              });
            }
          }}
        />
        {menu && contacts[0]?.id !== menu.id ? (
          <BigButton
            label={copy['contacts.moveUp']}
            variant="secondary"
            onPress={() => {
              const c = menu;
              setMenu(null);
              void move(c, -1);
            }}
          />
        ) : null}
        {menu && contacts[contacts.length - 1]?.id !== menu.id ? (
          <BigButton
            label={copy['contacts.moveDown']}
            variant="secondary"
            onPress={() => {
              const c = menu;
              setMenu(null);
              void move(c, 1);
            }}
          />
        ) : null}
        <BigButton
          label={copy['contacts.remove']}
          variant="danger"
          onPress={() => {
            const c = menu;
            setMenu(null);
            setRemoving(c);
          }}
        />
      </Sheet>

      <ConfirmSheet
        visible={!!removing}
        title={fill(copy['contacts.removeTitle'], { name: removing?.name ?? '' })}
        body={copy['contacts.removeBody']}
        confirmLabel={copy['contacts.removeConfirm']}
        loading={removeBusy}
        onCancel={() => !removeBusy && setRemoving(null)}
        onConfirm={() => void confirmRemove()}
      />

      <ConfirmSheet
        visible={explainPerm}
        title={copy['contacts.permTitle']}
        body={copy['contacts.permBody']}
        confirmLabel={copy['contacts.permCta']}
        tone="primary"
        onCancel={() => setExplainPerm(false)}
        onConfirm={() => void allowContacts()}
      />

      <Sheet visible={!!numbers} onClose={() => setNumbers(null)}>
        <AppText variant="heading">
          {copy['contacts.pickNumber']}
        </AppText>
        {numbers?.numbers.map((n) => (
          <BigButton
            key={n}
            label={formatPhone(normalisePhone(n) ?? n)}
            variant="secondary"
            onPress={() => startFromPick(numbers.name, n)}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.sm },
  center: { textAlign: 'center' },
  notice: {
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    padding: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  noticeText: { flex: 1, fontSize: font.md, fontFamily: family.semibold },
  list: { borderRadius: radius.lg, overflow: 'hidden' },
  emptyTile: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  quick: {
    minHeight: touchTarget,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: { fontSize: font.md, fontFamily: family.semibold },
  builtIn: {
    minHeight: touchTarget,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  builtInText: { flex: 1, fontSize: font.md, fontFamily: family.semibold },
  tag: { fontSize: font.sm, fontFamily: family.regular },
  privacy: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});
