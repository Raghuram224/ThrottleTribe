// Web-only ride notices (docs/design/14 §9): browsers share location only while the page is on
// screen. Lobby: a full card (collapses to the slim bar). Live: a persistent slim bar. When the page
// returns after being hidden, a grey "sharing paused" banner. Also holds the Screen Wake Lock.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Icon } from '@/components/icon';
import { isIosUserAgent, pausedText, shouldShowResume } from '@/lib/web/web-utils';
import { elevate, family, font, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const RESUME_BANNER_MS = 8000;

function useWakeLockAndVisibility() {
  const [wakeLocked, setWakeLocked] = useState(false);
  const [resumeText, setResumeText] = useState<string | null>(null);
  const sentinel = useRef<WakeLockSentinel | null>(null);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    const acquire = async () => {
      try {
        if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
        const s = await navigator.wakeLock.request('screen');
        if (!alive) return void s.release().catch(() => {});
        sentinel.current = s;
        setWakeLocked(true);
        s.addEventListener('release', () => alive && setWakeLocked(false));
      } catch {
        setWakeLocked(false);
      }
    };
    void acquire();
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current === null ? null : Date.now() - hiddenAt.current;
      hiddenAt.current = null;
      void acquire(); // the browser drops the lock whenever the page is hidden
      if (shouldShowResume(away) && away !== null) {
        setResumeText(pausedText(away));
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setResumeText(null), RESUME_BANNER_MS);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (hideTimer) clearTimeout(hideTimer);
      void sentinel.current?.release().catch(() => {});
      sentinel.current = null;
    };
  }, []);

  return { wakeLocked, resumeText };
}

export function WebRideNotices({ child }: { child: string | null }) {
  const { colors, scheme } = useTheme();
  const { wakeLocked, resumeText } = useWakeLockAndVisibility();
  const [collapsed, setCollapsed] = useState(false);
  const ios = typeof navigator !== 'undefined' && isIosUserAgent(navigator.userAgent, navigator.maxTouchPoints);
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);
  const showCard = child === 'lobby' && !collapsed;

  return (
    <>
      {resumeText ? <Banner tone="offline" icon="offline" text={resumeText} /> : null}
      {showCard ? (
        <View
          accessibilityRole="alert"
          style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.brand.primary }, elevate('e2', scheme)]}>
          <View style={[styles.tile, { backgroundColor: colors.brand.primary }]}>
            <Icon name="bgOff" color={colors.brand.onPrimary} size={22} />
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.title, { color: colors.text }]}>Keep this page open</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Your location is shared only while this page is on screen.
              {ios && !standalone
                ? ' On iPhone, add to Home Screen (Share, then Add to Home Screen) for the best experience.'
                : ' On iPhone, add to Home Screen for the best experience.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCollapsed(true)}
              style={styles.gotIt}>
              <Text style={[styles.gotItText, { color: colors.brandOnBg }]}>Got it</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View
          style={[styles.bar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
          accessibilityRole="text">
          <Icon name="bgOff" color={colors.brandOnBg} size={16} />
          <Text numberOfLines={2} style={[styles.barText, { color: colors.textMuted }]}>
            <Text style={{ fontFamily: family.semibold, color: colors.text }}>Keep this page open</Text>
            {wakeLocked
              ? ' · screen stays on'
              : ' · location is shared only while it is on screen'}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space.md,
    margin: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  tile: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: space.xs },
  title: { fontFamily: family.semibold, fontSize: font.md },
  body: { fontFamily: family.regular, fontSize: font.sm, lineHeight: 20 },
  gotIt: { alignSelf: 'flex-end', minHeight: 44, paddingHorizontal: space.md, justifyContent: 'center' },
  gotItText: { fontFamily: family.semibold, fontSize: font.md },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barText: { flex: 1, fontFamily: family.regular, fontSize: font.xs },
});
