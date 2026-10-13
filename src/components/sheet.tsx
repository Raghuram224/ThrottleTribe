import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { copy } from '@/lib/copy';
import { elevation, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Hide the bottom Close button (when the sheet has its own Cancel). */
  hideClose?: boolean;
  /** iOS only (RN limitation): fires once the closing animation has finished. See use-after-modal. */
  onDismiss?: () => void;
}

/**
 * Bottom sheet (00 §2.8): transparent Modal + scrim + panel. Closes on scrim tap, Android back or
 * the Close button. Never swipe-to-close (gloves).
 */
export function Sheet({ visible, onClose, children, hideClose, onDismiss }: SheetProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
      statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          accessibilityLabel={copy['common.close']}
          accessibilityRole="button"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlayScrim }]}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.panel,
            { backgroundColor: colors.surfaceRaised, paddingBottom: space.lg + insets.bottom },
            elevation.e3,
            // Dark: shadows are invisible, so the sheet gets a top hairline only (16 D3).
            scheme === 'dark' && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.edge2 },
          ]}>
          <View style={[styles.grab, { backgroundColor: colors.border }]} />
          {children}
          {hideClose ? null : <BigButton label={copy['common.close']} variant="secondary" onPress={onClose} />}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.lg,
    gap: space.md,
  },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: space.xs },
});
