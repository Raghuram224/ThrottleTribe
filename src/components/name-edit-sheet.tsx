import { useState } from 'react';
import { Modal, StyleSheet } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { BigButton } from '@/components/big-button';
import { ErrorText } from '@/components/error-text';
import { Screen } from '@/components/screen';
import { copy } from '@/lib/copy';
import { family, space } from '@/theme/tokens';

export const NAME_MAX_LENGTH = 40;

interface NameEditSheetProps {
  initial: string;
  /** Throw to show the message under the field; resolve to close. */
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Profile -> edit name (13 §10): a full-screen sheet (same pattern as the contact editor, so the
 * keyboard never covers the buttons) with the one primary Save inside it. Mount it only while open.
 */
export function NameEditSheet({ initial, onSave, onCancel }: NameEditSheetProps) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= NAME_MAX_LENGTH;
  const changed = trimmed !== initial;

  const save = async () => {
    if (!valid || !changed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
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
            <BigButton
              label={copy['profile.save']}
              disabled={!valid || !changed}
              loading={saving}
              onPress={() => void save()}
            />
            <BigButton label={copy['common.cancel']} variant="secondary" disabled={saving} onPress={onCancel} />
          </>
        }>
        <AppText accessibilityRole="header" variant="heading" style={styles.title}>
          {copy['profile.editName']}
        </AppText>
        <AppTextInput
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX_LENGTH}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          textContentType="nickname"
          accessibilityLabel={copy['name.a11yInput']}
        />
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: family.semibold, marginBottom: space.sm },
});
