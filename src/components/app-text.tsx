import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { family, fontNumeric, type } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export type TextVariant =
  | 'display'
  | 'title'
  | 'glance'
  | 'heading'
  | 'bodyStrong'
  | 'body'
  | 'caption'
  | 'label';

/** 14 §0.2: size / line height / tracking from the type scale, weight from the family. */
const scale = (v: keyof typeof type, fontFamily: string): TextStyle => ({
  fontFamily,
  fontSize: type[v].size,
  lineHeight: type[v].line,
  letterSpacing: type[v].track,
});

const variants: Record<TextVariant, TextStyle> = {
  display: scale('display', family.bold),
  title: scale('title', family.bold),
  glance: { ...scale('glance', family.bold), ...fontNumeric },
  heading: scale('heading', family.semibold),
  bodyStrong: scale('bodyStrong', family.semibold),
  body: scale('body', family.regular),
  caption: scale('caption', family.regular),
  // Small uppercase section label ("RIDE CODE").
  label: { ...scale('label', family.semibold), textTransform: 'uppercase' },
};

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  muted?: boolean;
  /** Tabular digits for distances, times and codes. */
  numeric?: boolean;
}

export function AppText({ variant = 'body', muted, numeric, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  // A caller that changes the size must not inherit a line height sized for the variant (it would clip).
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const base = variants[variant];
  const resized =
    flat?.fontSize !== undefined && flat.fontSize !== base.fontSize && flat.lineHeight === undefined
      ? { lineHeight: Math.round(flat.fontSize * 1.2) }
      : null;
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      style={[
        base,
        resized,
        { color: muted ? colors.textMuted : colors.text },
        numeric && fontNumeric,
        style,
      ]}
      {...rest}
    />
  );
}
