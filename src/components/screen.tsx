import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface ScreenProps {
  children: ReactNode;
  /** Pinned to the bottom for thumb reach (primary actions go here). */
  footer?: ReactNode;
  /** Above the body: top bar, banners. */
  top?: ReactNode;
  /** Body scrolls (footer stays pinned). Use for forms and long content. */
  scroll?: boolean;
  /** Footer rides above the keyboard. */
  keyboardAvoiding?: boolean;
  /** Body padding and gap (default true). Ride screens pass false and manage their own layout. */
  padded?: boolean;
  /** Override the background, e.g. the gate's splash colour. */
  backgroundColor?: string;
  /** Content runs under the status and navigation bars (live full map). Same tree, so nothing remounts. */
  edgeToEdge?: boolean;
  /** Colour of the status-bar inset, when the bar it touches is not `bg` (the ride header is `surfaceRaised`, 26 L3). */
  insetTopColor?: string;
  /** Colour of the navigation-bar inset, when the bar it touches is not `bg` (the live action bar, the summary footer). */
  insetBottomColor?: string;
}

export function Screen({
  children,
  footer,
  top,
  scroll,
  keyboardAvoiding,
  padded = true,
  backgroundColor,
  edgeToEdge,
  insetTopColor,
  insetBottomColor,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Painting an inset its own colour means drawing it ourselves: the safe-area view then only pads the sides.
  const paintInsets = !edgeToEdge && (insetTopColor !== undefined || insetBottomColor !== undefined);
  const bodyStyle = padded ? styles.body : styles.bodyBare;

  const content = (
    <>
      {top}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={bodyStyle}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, bodyStyle]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );

  return (
    <SafeAreaView
      edges={edgeToEdge ? [] : paintInsets ? ['left', 'right'] : undefined}
      style={[styles.flex, { backgroundColor: backgroundColor ?? colors.bg }]}>
      {paintInsets ? <View style={{ height: insets.top, backgroundColor: insetTopColor ?? backgroundColor ?? colors.bg }} /> : null}
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
      {paintInsets ? <View style={{ height: insets.bottom, backgroundColor: insetBottomColor ?? backgroundColor ?? colors.bg }} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: space.lg, gap: space.lg },
  bodyBare: { flexGrow: 1 },
  footer: { padding: space.lg, gap: space.md },
});
