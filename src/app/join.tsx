import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Banner } from '@/components/banner';
import { BigButton } from '@/components/big-button';
import { CodeInput } from '@/components/code-input';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ErrorText } from '@/components/error-text';
import { Screen } from '@/components/screen';
import { TopBar } from '@/components/top-bar';
import { useNetOffline } from '@/hooks/use-connection';
import { copy, errorText, groupCode, t } from '@/lib/copy';
import { hrefAfterEnter } from '@/lib/enter-ride';
import { haptic } from '@/lib/haptics';
import { CODE_LENGTH, parseCode } from '@/lib/join-code';
import { stopRideTracking } from '@/lib/location/tracking';
import { href } from '@/lib/nav';
import {
  getMyOpenRide,
  getMyProfile,
  joinRide,
  leaveRide,
  toRideError,
  type OpenRide,
  type RideErrorCode,
} from '@/lib/ride-api';
import { joinLinkDecision, rideHref } from '@/lib/routing';
import { supabase } from '@/lib/supabase';
import { setPendingJoinCode } from '@/store/prefs-store';
import { space } from '@/theme/tokens';

type Status = 'idle' | 'submitting' | 'success' | 'error';

/** How long the green check shows before the ride opens (13 §5). */
const SUCCESS_MS = 300;
interface PendingSwitch {
  kind: 'switch' | 'leaderBusy';
  open: OpenRide;
  code: string;
}

export default function Join() {
  // `code`: throttletribe://join?code=123456 (the web page's intent link). `c`: the https invite link
  // format (10 §9), accepted so a future App Links switch needs no app change.
  const { code, c } = useLocalSearchParams<{ code?: string; c?: string }>();
  const codeParam = code ?? c;
  const offline = useNetOffline();
  const [digits, setDigits] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorCode, setErrorCode] = useState<RideErrorCode | null>(null);
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const busy = useRef(false);

  const fail = (e: unknown) => {
    const code = toRideError(e).code;
    // The ErrorText that appears carries the Error haptic (13 §0.3).
    setErrorCode(code);
    setStatus('error');
  };

  const submit = async (code: string, skipSwitchCheck = false) => {
    if (busy.current) return;
    busy.current = true;
    setStatus('submitting');
    setErrorCode(null);
    try {
      if (!skipSwitchCheck) {
        const open = await getMyOpenRide();
        const decision = joinLinkDecision(open ? { code: open.ride.code, role: open.member.role } : null, code);
        if (open && decision === 'open-same') {
          // Already in this very ride: just go there.
          router.replace(href(await hrefAfterEnter(open.ride)));
          return;
        }
        if (open && (decision === 'confirm-switch' || decision === 'leader-busy')) {
          setPending({ kind: decision === 'leader-busy' ? 'leaderBusy' : 'switch', open, code });
          setStatus('idle');
          return;
        }
      }
      const ride = await joinRide(code);
      haptic('success');
      setStatus('success');
      // Resolve the destination while the check is showing.
      const [target] = await Promise.all([
        hrefAfterEnter(ride),
        new Promise<void>((resolve) => setTimeout(resolve, SUCCESS_MS)),
      ]);
      router.replace(href(target));
    } catch (e) {
      if (toRideError(e).code === 'profile_required') {
        setPendingJoinCode(code);
        router.replace(href('/name'));
        return;
      }
      fail(e);
    } finally {
      busy.current = false;
    }
  };

  // Deep link throttletribe://join?code=123456 (also works cold, before onboarding).
  useEffect(() => {
    const parsed = parseCode(codeParam);
    if (!parsed) return;
    let cancelled = false;
    (async () => {
      let hasProfile = false;
      try {
        const { data } = await supabase.auth.getSession();
        // getMyProfile would sign in anonymously; only ask when a session already exists.
        hasProfile = !!data.session && !!(await getMyProfile());
      } catch {
        // Offline: assume a returning rider; submit() will surface a network error.
        hasProfile = true;
      }
      if (cancelled) return;
      if (!hasProfile) {
        setPendingJoinCode(parsed);
        router.replace(href('/welcome'));
        return;
      }
      // A link is an explicit intent: prefill and join without another tap.
      setDigits(parsed);
      void submit(parsed);
    })();
    return () => {
      cancelled = true;
    };
    // submit only touches refs and setters; re-running on its identity would re-submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeParam]);

  useEffect(() => {
    if (errorCode && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(errorText(errorCode));
    }
  }, [errorCode]);

  const confirmSwitch = async () => {
    if (!pending) return;
    const { open, code } = pending;
    setPending(null);
    setStatus('submitting');
    try {
      await leaveRide(open.ride.id);
      await stopRideTracking();
    } catch (e) {
      if (toRideError(e).code !== 'not_a_member') return fail(e);
    }
    void submit(code, true);
  };

  const submitting = status === 'submitting' || status === 'success';
  const wrongCode = status === 'error' && errorCode === 'ride_not_found';

  return (
    <Screen
      scroll
      keyboardAvoiding
      top={
        <>
          <TopBar title={copy['join.title']} onBack={() => (router.canGoBack() ? router.back() : router.replace(href('/')))} />
          {offline ? <Banner tone="offline" icon="offline" text={copy['banner.offline']} /> : null}
        </>
      }
      footer={
        <BigButton
          label={status === 'error' && errorCode === 'network' ? copy['common.tryAgain'] : copy['join.cta']}
          disabled={digits.length < CODE_LENGTH}
          loading={submitting}
          onPress={() => void submit(digits)}
        />
      }>
      <View style={styles.head}>
        <AppText variant="title" accessibilityRole="header">
          {copy['join.heading']}
        </AppText>
        <AppText muted>{copy['join.subtitle']}</AppText>
      </View>

      <View style={{ opacity: submitting ? 0.6 : 1 }}>
        <CodeInput
          value={digits}
          error={wrongCode}
          success={status === 'success'}
          editable={!submitting}
          onChange={(next) => {
            setDigits(next);
            if (status === 'error') {
              setStatus('idle');
              setErrorCode(null);
            }
            if (next.length === CODE_LENGTH) void submit(next);
          }}
        />
      </View>

      {status === 'error' && errorCode ? (
        <ErrorText assertive emphasis>
          {errorText(errorCode)}
        </ErrorText>
      ) : (
        <AppText variant="caption" muted style={styles.hint}>
          {copy['join.pasteHint']}
        </AppText>
      )}

      <ConfirmSheet
        visible={pending?.kind === 'switch'}
        title={t('join.switchTitle', { ride: pending?.open.ride.name ?? '' })}
        body={t('join.switchBody', { code: groupCode(pending?.code ?? '') })}
        confirmLabel={copy['join.switchConfirm']}
        onCancel={() => {
          setPending(null);
          // Opened by a link on top of my ride: cancel keeps me in that ride.
          if (codeParam && router.canGoBack()) router.back();
        }}
        onConfirm={() => void confirmSwitch()}
      />
      <ConfirmSheet
        visible={pending?.kind === 'leaderBusy'}
        title={t('home.leaderBusyTitle', { ride: pending?.open.ride.name ?? '' })}
        body={copy['home.leaderBusyBody']}
        confirmLabel={t('home.leaderBusyAction', { ride: pending?.open.ride.name ?? '' })}
        tone="primary"
        hideCancel
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const open = pending?.open;
          setPending(null);
          if (open) router.replace(href(rideHref(open.ride.id, open.ride.status)));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.sm },
  hint: { textAlign: 'center' },
});
