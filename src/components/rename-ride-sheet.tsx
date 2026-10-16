import { useEffect, useState } from 'react';
import { Keyboard, Modal, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { BigButton } from '@/components/big-button';
import { ErrorText } from '@/components/error-text';
import { Screen } from '@/components/screen';
import { useTypingLock } from '@/hooks/use-typing-lock';
import { copy, t } from '@/lib/copy';
import { canSaveRename, RIDE_NAME_MAX, rideNameLength, showNameCount } from '@/lib/rename-ride';
import { family, space } from '@/theme/tokens';

interface RenameRideSheetProps {
  current: string;
  /** The rider's own latest fix, for the typing lock (21 section 2.2.2). */
  speedMps: number | null;
  fixAtMs: number | null;
  /** Throw to show the message under the field and stay open; resolve to close. */
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Leader: rename the ride (22 section 3.6). Full-screen sheet like the profile name editor, so the keyboard never
 * covers Save. Mount it only while open.
 */
export function RenameRideSheet({ current, speedMps, fixAtMs, onSave, onCancel }: RenameRideSheetProps) {
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useTypingLock(speedMps, fixAtMs);

  // The keyboard goes away the moment the lock engages.
  useEffect(() => {
    if (locked) Keyboard.dismiss();
  }, [locked]);

  const canSave = canSaveRename({ draft, current, locked, saving });
  const count = rideNameLength(draft);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : copy['errors.unknown']);
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <Screen
        scroll
        keyboardAvoiding
        footer={
          <>
            {error ? <ErrorText assertive>{error}</ErrorText> : null}
            <BigButton label={copy['rename.save']} disabled={!canSave} loading={saving} onPress={() => void save()} />
            <BigButton label={copy['common.cancel']} variant="secondary" disabled={saving} onPress={onCancel} />
          </>
        }>
        <AppText accessibilityRole="header" variant="heading" style={styles.title}>
          {copy['rename.title']}
        </AppText>
        <AppTextInput
          value={draft}
          onChangeText={setDraft}
          editable={!locked && !saving}
          invalid={count > RIDE_NAME_MAX}
          autoFocus={!locked}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          accessibilityLabel={copy['rename.a11yInput']}
          accessibilityState={{ disabled: locked }}
        />
        <View style={styles.meta}>
          {locked ? (
            <AppText variant="caption" muted accessibilityLiveRegion="polite" style={styles.flex}>
              {copy['rename.locked']}
            </AppText>
          ) : (
            <View style={styles.flex} />
          )}
          {showNameCount(draft) ? (
            <AppText
              variant="caption"
              muted
              numeric
              accessibilityLabel={t('rename.a11yCount', { n: String(count) })}>
              {t('rename.count', { n: String(count) })}
            </AppText>
          ) : null}
        </View>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: family.semibold, marginBottom: space.sm },
  meta: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginTop: space.sm },
  flex: { flex: 1 },
});
