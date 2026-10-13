import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
}: ScreenProps) {
  const { colors } = useTheme();
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
      edges={edgeToEdge ? [] : undefined}
      style={[styles.flex, { backgroundColor: backgroundColor ?? colors.bg }]}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: space.lg, gap: space.lg },
  bodyBare: { flexGrow: 1 },
  footer: { padding: space.lg, gap: space.md },
});
