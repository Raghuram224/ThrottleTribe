import { StyleSheet, Text } from 'react-native';

import { Banner, type BannerTone } from '@/components/banner';
import type { IconName } from '@/components/icon';
import type { RideAlert } from '@/lib/alerts';
import { bannerParts, liveBannerDistance } from '@/lib/alert-text';
import { copy, spokenDistance } from '@/lib/copy';
import { MESSAGE_KINDS } from '@/lib/message-kinds';
import { family, font } from '@/theme/tokens';
import { statusColors, useTheme } from '@/theme/use-theme';

interface AlertBannerProps {
  alert: RideAlert;
  /** View is offered only when the rider has a position to show. */
  canView: boolean;
  /** Fresh 06 phrase for the rider (same source as the row); the alert's own text is frozen at alert time. */
  livePhrase?: string | null;
  onView: () => void;
}

const TONE: Record<string, BannerTone> = {
  stopped: 'warning',
  offline: 'offline',
  message: 'message',
  sos_cleared: 'success',
};

const ICON: Record<string, IconName> = {
  stopped: 'stopped',
  offline: 'offline',
  sos_cleared: 'ready',
};

/**
 * The one in-app alert banner. "{name} · no signal · 1.2 km behind": the name truncates first, the
 * status and distance never do. No close button: alert banners auto-dismiss; tapping = View.
 */
export function AlertBanner({ alert, canView, livePhrase = null, onView }: AlertBannerProps) {
  const { colors } = useTheme();
  const tone = TONE[alert.kind] ?? 'message';
  const fg =
    alert.kind === 'stopped'
      ? statusColors('stopped').fg
      : alert.kind === 'offline'
        ? statusColors('offline').fg
        : alert.kind === 'sos_cleared'
          ? statusColors('moving').fg
          : colors.text;
  const label = alert.messageKind ? MESSAGE_KINDS[alert.messageKind].label : undefined;
  const { pre, name, rest } = bannerParts({
    kind: alert.kind,
    name: alert.name,
    distance: liveBannerDistance(alert.kind, livePhrase, alert.distance),
    minutes: alert.minutes,
    rideName: null,
    label,
  });
  const spoken = spokenDistance(`${pre}${name}${rest}`);
  const textStyle = [styles.text, { color: fg }];

  return (
    <Banner
      tone={tone}
      icon={ICON[alert.kind] ?? 'message'}
      accessibilityLabel={spoken}
      onPress={canView ? onView : undefined}
      action={canView ? { label: copy['alert.view'], onPress: onView } : undefined}>
      {pre ? (
        <Text numberOfLines={1} style={[textStyle, styles.fixed]}>
          {pre}
        </Text>
      ) : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[textStyle, styles.name]}>
        {name}
      </Text>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[textStyle, styles.fixed]}>
        {rest}
      </Text>
    </Banner>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: font.md, fontFamily: family.bold },
  name: { flexShrink: 1 },
  fixed: { flexShrink: 0 },
});
