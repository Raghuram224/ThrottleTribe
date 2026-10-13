import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { copy } from '@/lib/copy';
import { family, font, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface TopBarProps {
  title?: string;
  onBack: () => void;
  /** 'close' for modals, 'back' (default) for pushed screens. */
  glyph?: 'back' | 'close';
}

/** Non-ride screens (00 §2.2): 56 tall, back/close at the left, title truncated to one line. */
export function TopBar({ title, onBack, glyph = 'back' }: TopBarProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={glyph === 'close' ? copy['common.close'] : copy['common.back']}
        onPress={onBack}
        style={styles.back}>
        <Icon name={glyph} color={colors.text} size={glyph === 'close' ? 24 : 28} />
      </Pressable>
      {title ? (
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: touchTarget, flexDirection: 'row', alignItems: 'center' },
  back: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: font.lg, fontFamily: family.semibold },
});
