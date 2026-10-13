import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icon';
import { copy, spokenCode } from '@/lib/copy';
import { CODE_LENGTH, nextCodeValue } from '@/lib/join-code';
import { family, font, fontNumeric, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface CodeInputProps {
  /** Digits only, up to 6. */
  value: string;
  onChange: (digits: string) => void;
  /** All borders turn red; the next typed digit starts over. */
  error?: boolean;
  /** Accepted: all borders turn "moving" green and a check shows below (13 §5). Static, no animation. */
  success?: boolean;
  /** False while submitting. */
  editable?: boolean;
  autoFocus?: boolean;
  /** Defaults to the ride-code label; the OTP screen passes its own. */
  accessibilityLabel?: string;
}

/** Six digit boxes (grouped 3 + 3) over one hidden TextInput that owns focus, paste and the keypad. */
export function CodeInput({
  value,
  onChange,
  error,
  success,
  editable = true,
  autoFocus = true,
  accessibilityLabel = copy['join.a11yInput'],
}: CodeInputProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const narrow = width < 368;
  const gap = narrow ? 4 : 8;
  const groupGap = narrow ? 12 : 16;
  const active = Math.min(value.length, CODE_LENGTH - 1);

  // The keypad should be up as soon as the screen is; autoFocus alone can miss on Android.
  useEffect(() => {
    if (!autoFocus) return;
    const id = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, [autoFocus]);

  const boxes = Array.from({ length: CODE_LENGTH }, (_, i) => {
    const filled = i < value.length;
    const isActive = focused && editable && i === active && value.length < CODE_LENGTH;
    const borderColor = error
      ? colors.sosOnBg
      : success
        ? colors.status.moving
        : isActive
          ? colors.brand.primary
          : colors.borderStrong;
    return (
      <View
        key={i}
        style={[
          styles.box,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor,
            borderWidth: error || success || isActive ? 3 : 2,
            marginRight: i === CODE_LENGTH - 1 ? 0 : i === 2 ? groupGap : gap,
          },
        ]}>
        <Text allowFontScaling={false} style={[styles.digit, fontNumeric, { color: colors.text }]}>
          {filled ? value[i] : isActive ? '▌' : ''}
        </Text>
      </View>
    );
  });

  return (
    <View style={styles.wrap}>
      <View
        style={styles.row}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden>
        {boxes}
      </View>
      {success ? (
        <View style={[styles.check, { backgroundColor: colors.status.moving }]} accessible={false}>
          <Icon name="ready" color={colors.onStatus.moving} size={20} />
        </View>
      ) : null}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(raw) => onChange(nextCodeValue(raw, value, error))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={editable}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        caretHidden
        contextMenuHidden={false}
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{
          text: `${spokenCode(value)}, ${value.length} of ${CODE_LENGTH} digits`,
        }}
        // Not 0: Android ignores touches on a fully transparent input.
        style={styles.hidden}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
  row: { flexDirection: 'row' },
  check: {
    alignSelf: 'center',
    marginTop: space.md,
    width: space.xxl,
    height: space.xxl,
    borderRadius: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: size.codeBox.w,
    height: size.codeBox.h,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontSize: font.xxl, fontFamily: family.bold },
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01, fontSize: font.xxl },
});
