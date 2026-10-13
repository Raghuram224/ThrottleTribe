import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Icon } from '@/components/icon';
import { accountState } from '@/lib/account';
import { copy } from '@/lib/copy';
import { stopRideTracking } from '@/lib/location/tracking';
import { href } from '@/lib/nav';
import { formatPhoneDisplay } from '@/lib/phone';
import { getMyOpenRide, signOutLocal } from '@/lib/ride-api';
import { setTelemetryRideId } from '@/lib/telemetry';
import { setPendingJoinCode } from '@/store/prefs-store';
import { useRideStore } from '@/store/ride-store';
import { useSessionStore } from '@/store/session-store';
import { showToast } from '@/store/toast-store';
import { family, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Profile -> Account section (12 §4). Guest: a card that leads to Save your account. Saved: the
 * email or phone with a check chip and Sign out (blocked while in an open ride).
 */
export function AccountSection() {
  const { colors } = useTheme();
  const user = useSessionStore((s) => s.session?.user);
  const account = accountState(user);
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const requestSignOut = async () => {
    try {
      if (await getMyOpenRide()) return showToast(copy['account.inRide']);
    } catch {
      // Offline: signing out is local; allow it.
    }
    setConfirmOut(true);
  };

  const signOut = async () => {
    setSigningOut(true);
    await stopRideTracking().catch(() => {});
    await signOutLocal();
    setTelemetryRideId(null);
    useRideStore.getState().reset();
    setPendingJoinCode(null);
    useSessionStore.getState().clearProfile();
    setConfirmOut(false);
    setSigningOut(false);
    router.replace(href('/welcome'));
  };

  return (
    <View>
      {account.saved ? (
        <Card gap={space.md}>
          <View style={styles.head}>
            <Icon name="cloudSaved" color={colors.text} size={24} />
            <View style={styles.texts}>
              <AppText variant="heading" style={styles.title}>
                {copy['account.savedTitle']}
              </AppText>
              <AppText variant="caption" muted numeric numberOfLines={1}>
                {account.email ?? (account.phone ? formatPhoneDisplay(account.phone) : '')}
              </AppText>
            </View>
            <View style={[styles.chip, { backgroundColor: colors.status.moving }]}>
              <Icon name="ready" color={colors.onStatus.moving} size={14} />
            </View>
          </View>
          <BigButton
            label={copy['account.signOut']}
            variant="secondary"
            icon="signOut"
            onPress={() => void requestSignOut()}
          />
        </Card>
      ) : (
        <Card gap={space.md}>
          <View style={styles.head}>
            <Icon name="cloudSave" color={colors.text} size={24} />
            <AppText variant="heading" style={styles.title}>
              {copy['account.guestTitle']}
            </AppText>
          </View>
          <AppText variant="caption" muted>
            {copy['account.guestBody']}
          </AppText>
          <BigButton
            label={copy['account.saveCta']}
            variant="secondary"
            onPress={() => router.push(href('/auth/identify?mode=save'))}
          />
        </Card>
      )}

      <ConfirmSheet
        visible={confirmOut}
        title={copy['account.signOutTitle']}
        body={copy['account.signOutBody']}
        confirmLabel={copy['account.signOutConfirm']}
        loading={signingOut}
        onCancel={() => !signingOut && setConfirmOut(false)}
        onConfirm={() => void signOut()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  texts: { flex: 1 },
  title: { flex: 1, fontFamily: family.semibold },
  chip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
