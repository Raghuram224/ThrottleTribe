import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AccountSection } from '@/components/account-card'; // account
import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ErrorText } from '@/components/error-text';
import { Icon } from '@/components/icon';
import { NameEditSheet } from '@/components/name-edit-sheet';
import { RiderAvatar } from '@/components/rider-avatar';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { SegmentedControl } from '@/components/segmented-control';
import { StyleSection } from '@/components/style-picker';
import { SettingsRow } from '@/components/settings-row';
import { Sheet } from '@/components/sheet';
import { TopBar } from '@/components/top-bar';
import { useContactCount } from '@/hooks/use-contact-count';
import { copy, errorText, fill, minuteCount, t } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { stopRideTracking } from '@/lib/location/tracking';
import { href } from '@/lib/nav';
import { deleteMyAccount, saveProfile, signOutLocal, toRideError } from '@/lib/ride-api';
import { setTelemetryRideId } from '@/lib/telemetry';
import { setPendingJoinCode, usePrefsStore, type ThemePref } from '@/store/prefs-store';
import { useRideStore } from '@/store/ride-store';
import { useSessionStore } from '@/store/session-store';
import { showToast } from '@/store/toast-store';
import { family, font, size, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'auto', label: copy['profile.themeAuto'] },
  { value: 'light', label: copy['profile.themeLight'] },
  { value: 'dark', label: copy['profile.themeDark'] },
];

// The stop alert time every new ride is created with (it moved here from the old "New ride" form, 22 D5).
const THRESHOLDS = [
  { value: 60, label: copy['profile.threshold1'], a11yLabel: minuteCount(1), hint: copy['profile.threshold1Hint'] },
  { value: 180, label: copy['profile.threshold3'], a11yLabel: minuteCount(3), hint: copy['profile.threshold3Hint'] },
  { value: 300, label: copy['profile.threshold5'], a11yLabel: minuteCount(5), hint: copy['profile.threshold5Hint'] },
];

/** Profile as settings (13 §10): identity, then Account / Safety / Appearance / Privacy, delete last. */
export default function Profile() {
  const { colors } = useTheme();
  const profile = useSessionStore((s) => s.profile);
  const themePref = usePrefsStore((s) => s.themePref);
  const setThemePref = usePrefsStore((s) => s.setThemePref);
  const hapticsOn = usePrefsStore((s) => s.haptics);
  const setHaptics = usePrefsStore((s) => s.setHaptics);
  const thresholdS = usePrefsStore((s) => s.stopThresholdS);
  const setThresholdS = usePrefsStore((s) => s.setStopThresholdS);
  const contacts = useContactCount();
  const [editing, setEditing] = useState(false);
  const [howSharing, setHowSharing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = profile?.display_name ?? '';

  const saveName = async (next: string) => {
    try {
      useSessionStore.getState().setProfile(await saveProfile(next));
    } catch (e) {
      throw new Error(errorText(toRideError(e).code));
    }
    haptic('success');
    showToast(copy['profile.saved']);
    setEditing(false);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      // Upload leftover samples and stop the background task while the session still works.
      await stopRideTracking().catch(() => {});
      await deleteMyAccount();
      await signOutLocal();
      setTelemetryRideId(null);
      useRideStore.getState().reset();
      setPendingJoinCode(null);
      useSessionStore.getState().clearProfile();
      router.replace(href('/welcome'));
    } catch (e) {
      setError(errorText(toRideError(e).code));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const contactsValue =
    typeof contacts === 'number'
      ? contacts === 0
        ? copy['profile.contactsNotSet']
        : t('profile.contactsValue', { n: contacts })
      : undefined;

  return (
    <Screen scroll top={<TopBar title={copy['profile.title']} onBack={() => router.back()} />}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('profile.a11yEditName', { name })}
        onPress={() => {
          haptic('select');
          setEditing(true);
        }}
        style={styles.identity}>
        <RiderAvatar name={name || '?'} colorIndex={0} size={size.avatarSos} me />
        <AppText variant="heading" numberOfLines={1} style={styles.identityName} maxFontSizeMultiplier={1.3}>
          {name}
        </AppText>
        <Text maxFontSizeMultiplier={1.3} style={[styles.editText, { color: colors.brandOnBg }]}>
          {copy['profile.editLabel']}
        </Text>
      </Pressable>

      <View>
        <SectionLabel>{copy['profile.sectionAccount']}</SectionLabel>
        {/* --- account --- guest card or saved row (12 §4) */}
        <AccountSection />
        {/* --- end account --- */}

        <SectionLabel>{copy['profile.sectionSafety']}</SectionLabel>
        <Card padding={0} gap={0}>
          <SettingsRow
            icon="shield"
            title={copy['profile.contactsRow']}
            value={contactsValue}
            attention={contacts === 0}
            last
            onPress={() => router.push(href('/emergency-contacts'))}
          />
        </Card>
        <Card gap={space.sm} style={styles.spaced}>
          <AppText style={styles.label}>{copy['profile.thresholdLabel']}</AppText>
          <SegmentedControl
            options={THRESHOLDS}
            value={thresholdS}
            onChange={setThresholdS}
            accessibilityLabel={copy['profile.thresholdLabel']}
          />
          <AppText variant="caption" muted>
            {t('profile.thresholdPreview', { n: Math.round(thresholdS / 60) })}
          </AppText>
          {/* The time is read when a ride is created: a ride already running keeps the one it started with. */}
          <AppText variant="caption" muted>
            {copy['profile.thresholdNote']}
          </AppText>
        </Card>

        <SectionLabel>{copy['profile.sectionAppearance']}</SectionLabel>
        <Card gap={space.sm}>
          <StyleSection />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <AppText style={styles.label}>{copy['profile.themeLabel']}</AppText>
          <SegmentedControl
            options={THEME_OPTIONS}
            value={themePref}
            onChange={setThemePref}
            accessibilityLabel={copy['profile.themeLabel']}
          />
          <AppText variant="caption" muted>
            {copy['profile.themeHint']}
          </AppText>
        </Card>
        <Card padding={0} gap={0} style={styles.spaced}>
          <View style={styles.switchRow}>
            <Icon name="vibrate" color={colors.text} size={24} />
            <View style={styles.switchTexts}>
              <AppText style={styles.label}>{copy['profile.haptics']}</AppText>
              <AppText variant="caption" muted>
                {copy['profile.hapticsHint']}
              </AppText>
            </View>
            <Switch
              value={hapticsOn}
              onValueChange={setHaptics}
              accessibilityLabel={copy['profile.haptics']}
              trackColor={{ true: colors.brand.primary, false: colors.borderStrong }}
              thumbColor={colors.surfaceRaised}
            />
          </View>
        </Card>

        <SectionLabel>{copy['profile.sectionPrivacy']}</SectionLabel>
        <Card padding={0} gap={0}>
          <SettingsRow icon="lock" title={copy['profile.howSharing']} last onPress={() => setHowSharing(true)} />
        </Card>
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy['profile.delete']}
        onPress={() => setConfirmDelete(true)}
        style={styles.delete}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.deleteText, { color: colors.sosOnBg }]}>
          {copy['profile.delete']}
        </Text>
      </Pressable>
      <AppText variant="caption" style={[styles.version, { color: colors.textSubtle }]}>
        {fill(copy['profile.version'], { version: Constants.expoConfig?.version ?? '' })}
      </AppText>

      {editing ? (
        <NameEditSheet initial={name} onSave={saveName} onCancel={() => setEditing(false)} />
      ) : null}

      <Sheet visible={howSharing} onClose={() => setHowSharing(false)}>
        <AppText variant="heading" style={styles.label}>
          {copy['perm.loc.title']}
        </AppText>
        <AppText>{copy['perm.loc.why1']}</AppText>
        <AppText>{copy['perm.loc.why2']}</AppText>
        <AppText>{copy['perm.loc.why3']}</AppText>
      </Sheet>

      <ConfirmSheet
        visible={confirmDelete}
        title={copy['profile.deleteTitle']}
        body={copy['profile.deleteBody']}
        confirmLabel={copy['profile.deleteConfirm']}
        loading={deleting}
        onCancel={() => !deleting && setConfirmDelete(false)}
        onConfirm={() => void deleteAccount()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { minHeight: size.contactRow, flexDirection: 'row', alignItems: 'center', gap: space.lg },
  identityName: { flex: 1 },
  label: { fontFamily: family.semibold },
  editText: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.sm },
  spaced: { marginTop: space.sm },
  switchRow: {
    minHeight: size.settingsRow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  switchTexts: { flex: 1 },
  delete: { height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: font.md, fontFamily: family.semibold },
  version: { textAlign: 'center' },
});
