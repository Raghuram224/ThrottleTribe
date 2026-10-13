import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { family, font, radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface AppTextInputProps extends TextInputProps {
  invalid?: boolean;
}

/** 56 tall, 16 regular, 2 px border (reserved, colour-swapped: no layout shift), radius 12. */
export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(function AppTextInput(
  { invalid, style, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = invalid
    ? colors.sosOnBg
    : focused
      ? colors.brand.primary
      : colors.borderStrong;

  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textSubtle}
      selectionColor={colors.brand.primary}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor },
        style,
      ]}
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  input: {
    minHeight: touchTarget,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    fontSize: font.md,
    fontFamily: family.regular,
  },
});
