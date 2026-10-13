import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { copy, fill } from '@/lib/copy';
import { formatPhone, isShortCode, spokenPhone, type EmergencyContact } from '@/lib/emergency-contacts';
import { initialsOf } from '@/lib/names';
import { family, font, fontNumeric, radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface Props {
  contact: EmergencyContact;
  /** 1-based, shown at the left. */
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMenu: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}

/** ContactRow (11 §1): position, neutral avatar, name + relation pill, phone, row menu. */
export function ContactRow({ contact, index, isFirst, isLast, onEdit, onMenu, onMove, onRemove }: Props) {
  const { colors } = useTheme();
  const short = isShortCode(contact.phone);
  const phone = formatPhone(contact.phone);
  const label = fill(copy['contacts.a11yRow'], {
    pos: index,
    name: contact.name,
    relation: contact.relation ?? '',
    phone: spokenPhone(contact.phone),
  }).replace(/, ,/g, ',');

  const actions = [
    { name: 'edit', label: copy['contacts.edit'] },
    ...(isFirst ? [] : [{ name: 'up', label: copy['contacts.moveUp'] }]),
    ...(isLast ? [] : [{ name: 'down', label: copy['contacts.moveDown'] }]),
    { name: 'remove', label: copy['contacts.remove'] },
  ];

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityActions={actions}
      onAccessibilityAction={(e) => {
        const a = e.nativeEvent.actionName;
        if (a === 'edit') onEdit();
        else if (a === 'up') onMove(-1);
        else if (a === 'down') onMove(1);
        else if (a === 'remove') onRemove();
      }}
      style={styles.row}>
      <Pressable accessible={false} onPress={onEdit} style={styles.body}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.pos, { color: colors.textMuted }]}>
          {index}
        </Text>
        <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
          {short ? (
            <Icon
              name={contact.phone === '108' || contact.phone === '102' ? 'ambulance' : 'call'}
              color={colors.textMuted}
              size={20}
            />
          ) : (
            <Text style={[styles.initials, { color: colors.textMuted }]}>{initialsOf(contact.name)}</Text>
          )}
        </View>
        <View style={styles.text}>
          <View style={styles.nameRow}>
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={[styles.name, { color: colors.text }]}>
              {contact.name}
            </Text>
            {contact.relation ? (
              <View style={[styles.pill, { backgroundColor: colors.surface }]}>
                <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.pillText, { color: colors.textMuted }]}>
                  {contact.relation}
                </Text>
              </View>
            ) : null}
          </View>
          <Text maxFontSizeMultiplier={1.3} style={[styles.phone, { color: colors.textMuted }, fontNumeric]}>
            {phone}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessible={false}
        onPress={onMenu}
        style={styles.menu}>
        <Icon name="more" color={colors.text} size={24} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: space.lg, minHeight: 72 },
  pos: { width: 16, fontSize: font.sm, fontFamily: family.bold, textAlign: 'center' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: font.sm, fontFamily: family.bold },
  text: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flexShrink: 1, fontSize: font.md, fontFamily: family.semibold },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, flexShrink: 0, maxWidth: 110 },
  pillText: { fontSize: font.xs, fontFamily: family.semibold },
  phone: { fontSize: font.md, fontFamily: family.regular },
  menu: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
