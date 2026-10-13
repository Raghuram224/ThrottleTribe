import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { Banner } from '@/components/banner';
import { BigButton } from '@/components/big-button';
import { ErrorText } from '@/components/error-text';
import { PhoneInput } from '@/components/phone-input';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { Sheet } from '@/components/sheet';
import { TopBar } from '@/components/top-bar';
import { useNetOffline } from '@/hooks/use-connection';
import {
  accountState,
  authErrorMessage,
  identifyTarget,
  type AuthErrorKind,
  type AuthMode,
  type AuthVia,
} from '@/lib/account';
import { AuthFlowError, guestHasHistory, requestAuthCode } from '@/lib/account-api';
import { copy } from '@/lib/copy';
import { PHONE_AUTH_ENABLED } from '@/lib/flags';
import { href } from '@/lib/nav';
import { DEFAULT_PREFIX } from '@/lib/phone';
import { getMyOpenRide } from '@/lib/ride-api';
import { readItem, writeItem } from '@/lib/storage';
import { useSessionStore } from '@/store/session-store';
import { family, space } from '@/theme/tokens';

const VIA_KEY = 'pref.authVia';

const VIA_OPTIONS: { value: AuthVia; label: string }[] = [
  { value: 'email', label: copy['account.viaEmail'] },
  { value: 'phone', label: copy['account.viaPhone'] },
];

interface SendError {
  kind: AuthErrorKind;
  text: string;
}

export default function Identify() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const mode: AuthMode = modeParam === 'signin' ? 'signin' : 'save';
  const session = useSessionStore((s) => s.session);
  const ready = useSessionStore((s) => s.ready);
  const account = accountState(session?.user);
  const offline = useNetOffline();

  // Keep the last method per device; phone only exists behind the flag.
  const [via, setVia] = useState<AuthVia>(() =>
    PHONE_AUTH_ENABLED && readItem(VIA_KEY) === 'phone' ? 'phone' : 'email',
  );
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SendError | null>(null);
  const [inRide, setInRide] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const target = identifyTarget(via, via === 'email' ? email : phone, prefix);
  const invalid = touched && !target;

  // Changing identity mid-ride would drop the rider from the map (12 §2). Only ask when a session
  // exists: getMyOpenRide would otherwise create an anonymous one.
  const hasSession = !!session;
  useEffect(() => {
    if (!hasSession) return;
    let cancelled = false;
    getMyOpenRide()
      .then((open) => {
        if (!cancelled) setInRide(!!open);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  if (!ready) return <Screen>{null}</Screen>;
  if (mode === 'save' && !session) return <Redirect href={href('/welcome')} />;
  if (mode === 'signin' && account.saved) return <Redirect href={href('/home')} />;

  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace(href(mode === 'save' ? '/profile' : '/welcome'));

  // Already saved (deep link to save): show the state and only Back.
  if (mode === 'save' && account.saved) {
    return (
      <Screen top={<TopBar onBack={goBack} />} footer={<BigButton label={copy['common.back']} onPress={goBack} />}>
        <AppText variant="title" accessibilityRole="header">
          {copy['account.savedTitle']}
        </AppText>
        <AppText muted numeric>
          {account.email ?? account.phone ?? ''}
        </AppText>
      </Screen>
    );
  }

  const send = async () => {
    if (!target || loading) return;
    setLoading(true);
    setError(null);
    writeItem(VIA_KEY, via);
    try {
      await requestAuthCode(mode, via, target);
      setLoading(false);
      router.push(href(`/auth/verify?mode=${mode}&via=${via}&to=${encodeURIComponent(target)}`));
    } catch (e) {
      setLoading(false);
      const err = e instanceof AuthFlowError ? e : new AuthFlowError('unknown');
      setError({ kind: err.kind, text: authErrorMessage(err.kind, via, err.waitMin, 'send') });
    }
  };

  const onSend = async () => {
    setTouched(true);
    if (!target || inRide) return;
    // Signing in replaces this guest: warn first if it has rides or contacts (12 §2).
    if (mode === 'signin' && session && (await guestHasHistory())) {
      setConfirmReplace(true);
      return;
    }
    void send();
  };

  const retryable = !!error && (error.kind === 'network' || error.kind === 'unknown');

  return (
    <Screen
      scroll
      keyboardAvoiding
      top={
        <>
          <TopBar onBack={goBack} />
          {offline ? <Banner tone="offline" icon="offline" text={copy['banner.offline']} /> : null}
        </>
      }
      footer={
        <BigButton
          label={retryable ? copy['common.tryAgain'] : copy['account.sendCode']}
          loading={loading}
          disabled={inRide || (touched && !target)}
          onPress={() => void onSend()}
        />
      }>
      <View style={styles.head}>
        <AppText variant="title" accessibilityRole="header">
          {mode === 'save' ? copy['account.saveTitle'] : copy['account.signinTitle']}
        </AppText>
        <AppText muted>{mode === 'save' ? copy['account.saveSub'] : copy['account.signinSub']}</AppText>
      </View>

      {PHONE_AUTH_ENABLED ? (
        <SegmentedControl
          options={VIA_OPTIONS}
          value={via}
          onChange={(next) => {
            setVia(next);
            setError(null);
            setTouched(false);
          }}
          accessibilityLabel={copy['account.sendCode']}
        />
      ) : null}

      <View style={styles.field}>
        <AppText style={styles.label}>
          {via === 'email' ? copy['account.emailLabel'] : copy['account.phoneLabel']}
        </AppText>
        {via === 'email' ? (
          <AppTextInput
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(null);
            }}
            onBlur={() => setTouched(email.length > 0)}
            invalid={invalid}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={() => void onSend()}
            accessibilityLabel={copy['account.emailLabel']}
          />
        ) : (
          <PhoneInput
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              setError(null);
            }}
            prefix={prefix}
            onPrefixChange={setPrefix}
            invalid={invalid}
            accessibilityLabel={copy['account.phoneLabel']}
            onSubmitEditing={() => void onSend()}
          />
        )}
        <AppText variant="caption" muted>
          {copy['account.codeHint']}
        </AppText>
        {invalid ? (
          <ErrorText assertive>{via === 'email' ? copy['account.emailInvalid'] : copy['phone.invalid']}</ErrorText>
        ) : null}
        {inRide ? <ErrorText assertive>{copy['account.inRide']}</ErrorText> : null}
        {error ? <ErrorText assertive>{error.text}</ErrorText> : null}
        {error?.kind === 'taken' ? (
          <BigButton
            label={copy['account.signInInstead']}
            variant="secondary"
            onPress={() => router.replace(href('/auth/identify?mode=signin'))}
          />
        ) : null}
        {error?.kind === 'noAccount' ? (
          <BigButton
            label={copy['account.tryOther']}
            variant="secondary"
            onPress={() => {
              setError(null);
              if (via === 'email') setEmail('');
              else setPhone('');
            }}
          />
        ) : null}
      </View>

      {/* Replace-guest confirm (12 §2): primary on top, the safe alternative, then Close. */}
      <Sheet visible={confirmReplace} onClose={() => setConfirmReplace(false)}>
        <AppText variant="heading" style={styles.label}>
          {copy['account.replaceGuestTitle']}
        </AppText>
        <AppText>{copy['account.replaceGuestBody']}</AppText>
        <BigButton
          label={copy['account.replaceGuestConfirm']}
          onPress={() => {
            setConfirmReplace(false);
            void send();
          }}
        />
        <BigButton
          label={copy['account.saveGuestFirst']}
          variant="secondary"
          onPress={() => {
            setConfirmReplace(false);
            router.replace(href('/auth/identify?mode=save'));
          }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.sm },
  field: { gap: space.sm },
  label: { fontFamily: family.semibold },
});
