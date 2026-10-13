import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { copy, t } from '@/lib/copy';
import { groupTypedDigits, PHONE_PREFIXES } from '@/lib/phone';
import { family, font, fontNumeric, radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface PhoneInputProps {
  /** Text as typed. */
  value: string;
  onChangeText: (text: string) => void;
  /** '+91', another code, or '' for "Other": the rider types the number with a leading +. */
  prefix: string;
  onPrefixChange: (prefix: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
  accessibilityLabel?: string;
  onSubmitEditing?: () => void;
}

/**
 * Prefix box + phone-pad field (docs/design/10 §7). Normalise on submit with `normalisePhone(value,
 * prefix)` from `@/lib/phone`.
 */
export function PhoneInput({
  value,
  onChangeText,
  prefix,
  onPrefixChange,
  invalid,
  autoFocus,
  accessibilityLabel,
  onSubmitEditing,
}: PhoneInputProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const borderColor = invalid
    ? colors.sosOnBg
    : focused
      ? colors.brand.primary
      : colors.borderStrong;
  const shown = prefix || '+';

  return (
    <View style={[styles.box, { borderColor, backgroundColor: colors.surfaceRaised }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('phone.a11yPrefix', { code: prefix || 'other' })}
        onPress={() => setPickerOpen(true)}
        style={[styles.prefix, { borderRightColor: colors.border }]}>
        <Text style={[styles.prefixText, { color: colors.text }]} maxFontSizeMultiplier={1.3}>
          {shown}
        </Text>
      </Pressable>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChangeText(prefix === '+91' ? groupTypedDigits(text) : text)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        autoFocus={autoFocus}
        maxLength={24}
        placeholder={prefix ? copy['phone.placeholder'] : '+'}
        placeholderTextColor={colors.textSubtle}
        selectionColor={colors.brand.primary}
        accessibilityLabel={accessibilityLabel}
        style={[styles.field, fontNumeric, { color: colors.text }]}
      />

      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)}>
        <AppText variant="heading" style={styles.title}>
          {copy['phone.prefixTitle']}
        </AppText>
        {[...PHONE_PREFIXES, ''].map((code) => {
          const selected = code === prefix;
          return (
            <Pressable
              key={code || 'other'}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              onPress={() => {
                onPrefixChange(code);
                setPickerOpen(false);
                // Focus after the sheet is gone so the keypad does not fight the Modal.
                setTimeout(() => inputRef.current?.focus(), 450);
              }}
              style={[styles.option, { borderColor: colors.border }]}>
              <AppText variant="heading" style={[styles.optionText, fontNumeric]}>
                {code || copy['phone.prefixOther']}
              </AppText>
              {selected ? <Icon name="ready" color={colors.text} size={20} /> : null}
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  prefix: {
    width: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
  },
  prefixText: { fontSize: font.md, fontFamily: family.bold },
  field: { flex: 1, minHeight: touchTarget, paddingHorizontal: space.lg, fontSize: font.md, fontFamily: family.regular },
  title: { fontFamily: family.semibold },
  option: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
  },
  optionText: { fontFamily: family.semibold },
});
