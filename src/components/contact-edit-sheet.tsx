import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { BigButton } from '@/components/big-button';
import { ErrorText } from '@/components/error-text';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { copy } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import {
  checkDraft,
  contactErrorText,
  draftErrorText,
  NAME_MAX,
  RELATION_MAX,
  type ContactDraft,
  type EmergencyContact,
} from '@/lib/emergency-contacts';
import { family, font, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const RELATIONS = [
  copy['contacts.relMom'],
  copy['contacts.relDad'],
  copy['contacts.relPartner'],
  copy['contacts.relFriend'],
  copy['contacts.relDoctor'],
] as const;

export interface ContactFormInitial {
  name: string;
  /** Shown as typed (already formatted by the caller). */
  phone: string;
  relation: string;
}

interface Props {
  title: string;
  initial: ContactFormInitial;
  /** The other saved contacts (not the one being edited), for the duplicate check. */
  others: readonly EmergencyContact[];
  /** Saves; throws on failure (the sheet turns it into text and stays open). */
  onSave: (value: ContactDraft) => Promise<void>;
  onCancel: () => void;
}

/**
 * Add / edit sheet (11 §2): name, phone, relation chips. Mounted only while open (the parent keys
 * it), so every open starts from `initial`.
 */
export function ContactEditSheet({ title, initial, others, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [relation, setRelation] = useState(initial.relation);
  // "Other…" chip: a custom relation typed in a field.
  const [other, setOther] = useState(initial.relation !== '' && !RELATIONS.some((r) => r === initial.relation));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pick = (label: string) => {
    haptic('select');
    setOther(false);
    setRelation((cur) => (cur === label ? '' : label));
  };

  const save = async () => {
    if (saving) return;
    const checked = checkDraft({ name, phone, relation }, others);
    if (!checked.ok) {
      setError(draftErrorText(checked.error));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(checked.value);
    } catch (e) {
      setError(contactErrorText(e));
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
            <BigButton label={copy['contacts.save']} loading={saving} onPress={() => void save()} />
            <BigButton label={copy['common.cancel']} variant="secondary" disabled={saving} onPress={onCancel} />
          </>
        }>
        <AppText accessibilityRole="header" variant="heading" style={styles.title}>
          {title}
        </AppText>

        <View style={styles.field}>
          <AppText style={styles.label}>{copy['contacts.nameLabel']}</AppText>
          <AppTextInput
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            accessibilityLabel={copy['contacts.nameLabel']}
          />
        </View>

        <View style={styles.field}>
          <AppText style={styles.label}>{copy['contacts.phoneLabel']}</AppText>
          <AppTextInput
            value={phone}
            onChangeText={setPhone}
            placeholder={copy['contacts.phonePlaceholder']}
            keyboardType="phone-pad"
            maxLength={20}
            autoCorrect={false}
            accessibilityLabel={copy['contacts.phoneLabel']}
          />
        </View>

        <View style={styles.field}>
          <AppText style={styles.label}>{copy['contacts.relationLabel']}</AppText>
          <View style={styles.chips}>
            {RELATIONS.map((label) => {
              const selected = !other && relation === label;
              return <Chip key={label} label={label} selected={selected} onPress={() => pick(label)} />;
            })}
            <Chip
              label={copy['contacts.relOther']}
              selected={other}
              onPress={() => {
                haptic('select');
                setOther(true);
                setRelation((cur) => (RELATIONS.some((r) => r === cur) ? '' : cur));
              }}
            />
          </View>
          {other ? (
            <AppTextInput
              value={relation}
              onChangeText={setRelation}
              maxLength={RELATION_MAX}
              placeholder={copy['contacts.relOtherPlaceholder']}
              autoCapitalize="words"
              accessibilityLabel={copy['contacts.relationLabel']}
            />
          ) : null}
        </View>
      </Screen>
    </Modal>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary }
          : { backgroundColor: colors.surface, borderColor: colors.border },
      ]}>
      {selected ? <Icon name="ready" color={colors.brand.onPrimary} size={18} /> : null}
      <Text
        maxFontSizeMultiplier={1.3}
        style={[styles.chipText, { color: selected ? colors.brand.onPrimary : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: family.semibold },
  field: { gap: space.sm },
  label: { fontFamily: family.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  chipText: { fontSize: font.md, fontFamily: family.semibold },
});
