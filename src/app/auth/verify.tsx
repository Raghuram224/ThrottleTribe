import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { CodeInput } from '@/components/code-input';
import { ErrorText } from '@/components/error-text';
import { Screen } from '@/components/screen';
import { TopBar } from '@/components/top-bar';
import { useNow } from '@/hooks/use-now';
import {
  afterRateLimit,
  afterResend,
  authErrorMessage,
  firstSend,
  formatCountdown,
  isValidOtp,
  OTP_LENGTH,
  RESEND_COOLDOWN_S,
  resendInfo,
  SPAM_HINT_AFTER_S,
  type AuthErrorKind,
  type AuthMode,
  type AuthVia,
  type ResendState,
} from '@/lib/account';
import { AuthFlowError, requestAuthCode, verifyAuthCode } from '@/lib/account-api';
import { copy, t } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { href } from '@/lib/nav';
import { firstName } from '@/lib/names';
import { formatPhoneDisplay } from '@/lib/phone';
import { getPendingJoinCode, setPendingJoinCode } from '@/store/prefs-store';
import { useRideStore } from '@/store/ride-store';
import { useSessionStore } from '@/store/session-store';
import { showToast } from '@/store/toast-store';
import { space } from '@/theme/tokens';

/** expo-router normally decodes params; decode once more only if a %XX escape is still there. */
function plainParam(value: string | undefined): string {
  if (!value) return '';
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface VerifyError {
  kind: AuthErrorKind;
  text: string;
}

export default function Verify() {
  const params = useLocalSearchParams<{ mode?: string; via?: string; to?: string }>();
  const mode: AuthMode = params.mode === 'signin' ? 'signin' : 'save';
  const via: AuthVia = params.via === 'phone' ? 'phone' : 'email';
  const to = plainParam(params.to);

  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<VerifyError | null>(null);
  const [resend, setResend] = useState<ResendState>(() => firstSend(Date.now()));
  const busy = useRef(false);
  const now = useNow(1000);

  const info = resendInfo(resend, now);
  const showSpamHint = via === 'email' && now - resend.sentAt >= SPAM_HINT_AFTER_S * 1000;

  // Announce once when Resend becomes available (not every second).
  const wasAvailable = useRef(false);
  useEffect(() => {
    if (info.canResend && !wasAvailable.current) {
      AccessibilityInfo.announceForAccessibility(copy['otp.resend']);
    }
    wasAvailable.current = info.canResend;
  }, [info.canResend]);

  if (!to) return <Redirect href={href(`/auth/identify?mode=${mode}`)} />;

  const display = via === 'phone' ? formatPhoneDisplay(to) : to;

  const fail = (e: unknown) => {
    const err = e instanceof AuthFlowError ? e : new AuthFlowError('unknown');
    // The ErrorText that appears carries the Error haptic (13 §0.3).
    setError({ kind: err.kind, text: authErrorMessage(err.kind, via, err.waitMin) });
    if (err.kind === 'expired') {
      // An expired code needs a new one now, not after the countdown.
      setResend((s) => ({ ...s, sentAt: Date.now() - RESEND_COOLDOWN_S * 1000 }));
    } else if (err.kind === 'rateLimited') {
      setResend((s) => afterRateLimit(s, Date.now(), err.waitS ?? (err.waitMin ?? 1) * 60));
    }
  };

  const finish = async () => {
    haptic('success');
    if (mode === 'save') {
      showToast(copy['account.saved']);
      router.dismissTo(href('/profile'));
      return;
    }
    // Signing in swapped the session: drop everything that belonged to the old guest.
    useRideStore.getState().reset();
    useSessionStore.getState().clearProfile();
    try {
      const profile = await useSessionStore.getState().refreshProfile();
      if (!profile) return router.replace(href('/name'));
      showToast(t('account.welcomeBack', { name: firstName(profile.display_name) }));
      const pending = getPendingJoinCode();
      if (pending) {
        setPendingJoinCode(null);
        return router.replace(href(`/join?code=${pending}`));
      }
    } catch {
      // Offline right after verifying: Home loads the profile itself and shows its offline state.
    }
    router.replace(href('/home'));
  };

  const submit = async (code: string) => {
    if (busy.current || !isValidOtp(code)) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      await verifyAuthCode(mode, via, to, code);
      await finish();
    } catch (e) {
      fail(e);
      setLoading(false);
    } finally {
      busy.current = false;
    }
  };

  const doResend = async () => {
    if (!info.canResend || resending) return;
    setResending(true);
    setError(null);
    try {
      await requestAuthCode(mode, via, to);
      setResend((s) => afterResend(s, Date.now()));
      setDigits('');
      showToast(copy['otp.resent']);
    } catch (e) {
      fail(e);
    } finally {
      setResending(false);
    }
  };

  const codeError = error?.kind === 'wrong' || error?.kind === 'expired';
  const retryable = error?.kind === 'network';

  return (
    <Screen
      scroll
      keyboardAvoiding
      top={<TopBar onBack={() => router.back()} />}
      footer={
        <BigButton
          label={retryable ? copy['common.tryAgain'] : copy['otp.verify']}
          disabled={!isValidOtp(digits)}
          loading={loading}
          onPress={() => void submit(digits)}
        />
      }>
      <View style={styles.head}>
        <AppText variant="title" accessibilityRole="header">
          {copy['otp.title']}
        </AppText>
        <AppText muted numeric>
          {t('otp.sentTo', { to: display })}
        </AppText>
        <BigButton label={copy['otp.change']} variant="secondary" onPress={() => router.back()} />
      </View>

      <View style={{ opacity: loading ? 0.6 : 1 }}>
        <CodeInput
          value={digits}
          error={codeError}
          editable={!loading}
          accessibilityLabel={copy['otp.a11yInput']}
          onChange={(next) => {
            setDigits(next);
            if (error) setError(null);
            if (next.length === OTP_LENGTH) void submit(next);
          }}
        />
      </View>

      {error ? (
        <View style={styles.errors}>
          <ErrorText assertive>{error.text}</ErrorText>
          {error.kind === 'noAccount' ? (
            <BigButton label={copy['account.tryOther']} variant="secondary" onPress={() => router.back()} />
          ) : null}
          {error.kind === 'taken' ? (
            <BigButton
              label={copy['account.signInInstead']}
              variant="secondary"
              onPress={() => router.replace(href('/auth/identify?mode=signin'))}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.resend}>
        {info.tooMany ? (
          <AppText muted style={styles.center}>
            {copy['otp.tooMany']}
          </AppText>
        ) : info.canResend ? (
          <BigButton
            label={copy['otp.resend']}
            variant="secondary"
            loading={resending}
            onPress={() => void doResend()}
          />
        ) : (
          <AppText muted numeric style={styles.center}>
            {t('otp.resendIn', { time: formatCountdown(info.secondsLeft) })}
          </AppText>
        )}
        {showSpamHint ? (
          <AppText variant="caption" muted style={styles.center}>
            {copy['otp.checkSpam']}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.sm },
  errors: { gap: space.sm },
  resend: { gap: space.sm },
  center: { textAlign: 'center' },
});
