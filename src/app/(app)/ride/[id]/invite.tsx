import * as SMS from '@/lib/sms';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ActionCard } from '@/components/action-card';
import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { Icon } from '@/components/icon';
import { InviteeRow } from '@/components/invitee-row';
import { PhoneInput } from '@/components/phone-input';
import { RideCodeDisplay } from '@/components/ride-code-display';
import { Screen } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { TopBar } from '@/components/top-bar';
import { useAfterModalClose } from '@/hooks/use-after-modal';
import { copy, t } from '@/lib/copy';
import { hrefAfterEnter } from '@/lib/enter-ride';
import { INVITE_BASE_URL } from '@/lib/flags';
import { haptic } from '@/lib/haptics';
import { shareText } from '@/lib/share-text';
import {
  inviteCounts,
  inviteLink,
  inviteShareMessage,
  inviteSmsBody,
  inviteState,
  TRAY_MAX,
} from '@/lib/invite';
import { contactsAccess, pickContact, requestContactsAccess, type PickedContact } from '@/lib/contact-picker';
import { href } from '@/lib/nav';
import { displayRideName, firstName } from '@/lib/names';
import { DEFAULT_PREFIX, formatPhoneDisplay, normalisePhone } from '@/lib/phone';
import { rideHref } from '@/lib/routing';
import { track } from '@/lib/telemetry';
import { NO_INVITEES, useInviteStore } from '@/store/invite-store';
import { useRideStore } from '@/store/ride-store';
import { showToast } from '@/store/toast-store';
import { elevate, family, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type SheetKind = 'none' | 'perm' | 'pickNumber' | 'tray' | 'row';

interface Pick {
  key: string;
  name: string;
  phone: string;
  /** Already on this ride's invited list: shown muted and not texted again from the tray. */
  dup: boolean;
}

/** "5:12 PM" in local time, built by hand so it reads the same on every device. */
function clockTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export default function Invite() {
  // `first=1`: opened right after Invite riders on the route preview (22 D6): Done becomes "Continue to lobby".
  const { id, first } = useLocalSearchParams<{ id: string; first?: string }>();
  const rideId = id ?? '';
  const isFirst = first === '1';
  const { colors, scheme } = useTheme();

  const ride = useRideStore((s) => s.ride);
  const storeRideId = useRideStore((s) => s.rideId);
  const members = useRideStore((s) => s.members);
  const loadedRide = storeRideId === rideId ? ride : null;

  const invitees = useInviteStore((s) => s.byRide[rideId] ?? NO_INVITEES);
  useEffect(() => {
    useInviteStore.getState().load(rideId);
  }, [rideId]);

  const [sheet, setSheet] = useState<SheetKind>('none');
  const [permBlocked, setPermBlocked] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const [pending, setPending] = useState<PickedContact | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const [typedError, setTypedError] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);
  const [highlightShare, setHighlightShare] = useState(false);
  const [continuing, setContinuing] = useState(false);
  // State lags a render: a double tap could otherwise run the hand-off twice.
  const continuingRef = useRef(false);

  const { schedule, onDismiss } = useAfterModalClose();
  // One stable handler for every memoised invitee row.
  const openRow = useCallback((id: string) => {
    setRowId(id);
    setSheet('row');
  }, []);
  /** Android drops a Modal opened while another is closing: close first, open on the next beat. */
  const goSheet = useCallback(
    (next: SheetKind) => {
      setSheet('none');
      if (next !== 'none') schedule(() => setSheet(next));
    },
    [schedule],
  );

  const matchMembers = useMemo(
    () =>
      Object.values(members).map((m) => ({
        userId: m.userId,
        name: m.name,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
      })),
    [members],
  );
  const { invited, joined } = inviteCounts(invitees, matchMembers);

  const code = loadedRide?.code ?? '';
  const rideName = loadedRide ? displayRideName(loadedRide.name) : '';
  const link = inviteLink(code, INVITE_BASE_URL);
  const ready = !!loadedRide;

  // ------------------------------------------------------------ share link

  const shareLink = () => {
    if (!loadedRide) return;
    track('invite.shared', { via: 'share' });
    void shareText(inviteShareMessage(rideName, code, link));
  };

  // ------------------------------------------------------------ text people

  const alreadyInvited = (phone: string) => invitees.some((i) => i.phone === phone);

  const addPick = (name: string, rawPhone: string): boolean => {
    const phone = normalisePhone(rawPhone, DEFAULT_PREFIX);
    if (!phone) {
      showToast(t('invite.noNumber', { name: firstName(name) || name }));
      return false;
    }
    if (picks.some((p) => p.phone === phone)) return true;
    if (picks.length >= TRAY_MAX) {
      showToast(copy['invite.trayFull']);
      return false;
    }
    setPicks((list) => [
      ...list,
      { key: `${phone}-${list.length}`, name: name || formatPhoneDisplay(phone), phone, dup: alreadyInvited(phone) },
    ]);
    return true;
  };

  // After the system picker no Modal is open, so the tray can open at once.
  const openTray = () => setSheet('tray');

  const runPicker = async () => {
    try {
      const contact = await pickContact();
      if (!contact) {
        if (picks.length > 0) openTray();
        return;
      }
      const name = contact.name;
      if (contact.numbers.length === 0) {
        showToast(t('invite.noNumber', { name: firstName(name) || name || '?' }));
        if (picks.length > 0) openTray();
      } else if (contact.numbers.length === 1) {
        addPick(name, contact.numbers[0].number);
        openTray();
      } else {
        setPending(contact);
        setSheet('pickNumber');
      }
    } catch {
      // The picker or the number lookup was refused: fall back to typing a number.
      showToast(copy['invite.permDenied']);
      setTyping(true);
      openTray();
    }
  };

  const onTextPeople = async () => {
    try {
      if (!(await SMS.isAvailableAsync())) {
        showToast(copy['invite.smsUnavailable']);
        setHighlightShare(true);
        return;
      }
    } catch {
      showToast(copy['invite.smsUnavailable']);
      setHighlightShare(true);
      return;
    }
    setHighlightShare(false);
    const access = await contactsAccess();
    if (access === 'granted') return void runPicker();
    setPermBlocked(access === 'blocked');
    setSheet('perm');
  };

  const onPermContinue = () => {
    if (permBlocked) {
      setSheet('none');
      void Linking.openSettings().catch(() => {});
      return;
    }
    setSheet('none');
    schedule(() => {
      void (async () => {
        const access = await requestContactsAccess();
        if (access === 'granted') return void runPicker();
        showToast(copy['invite.permDenied']);
        setTyping(true);
        setSheet('tray');
      })();
    });
  };

  const onPickNumber = (number: string) => {
    if (pending) addPick(pending.name, number);
    setPending(null);
    goSheet('tray');
  };

  const addTyped = () => {
    const phone = normalisePhone(typed, prefix);
    if (!phone) return setTypedError(true);
    if (addPick('', phone)) {
      setTyped('');
      setTypedError(false);
      setTyping(false);
    }
  };

  const queue = picks.filter((p) => !p.dup);

  const openComposer = async (person: { name: string; phone: string }): Promise<boolean> => {
    if (!loadedRide) return false;
    try {
      // Android always answers 'unknown': the text may or may not have been sent, so we only say "opened".
      const res = await SMS.sendSMSAsync([person.phone], inviteSmsBody(rideName, code, link));
      return res.result !== 'cancelled';
    } catch {
      showToast(copy['invite.smsUnavailable']);
      return false;
    }
  };

  const sendNext = async () => {
    const person = queue[sentCount];
    if (!person) return;
    const opened = await openComposer(person);
    if (!opened) return;
    track('invite.shared', { via: 'sms' });
    useInviteStore.getState().add(rideId, { name: person.name, phone: person.phone });
    const done = sentCount + 1;
    if (done >= queue.length) {
      showToast(t('invite.trayDone', { n: done }));
      setPicks([]);
      setSentCount(0);
      setTyping(false);
      setSheet('none');
    } else {
      setSentCount(done);
    }
  };

  const removePick = (key: string) => setPicks((list) => list.filter((p) => p.key !== key));

  const textAgain = (phone: string, name: string) => {
    setSheet('none');
    schedule(() => void openComposer({ name, phone }));
  };

  const trayPrimary =
    sentCount > 0 && queue[sentCount]
      ? t('invite.nextPerson', {
          name: firstName(queue[sentCount].name) || queue[sentCount].name,
          i: sentCount + 1,
          n: queue.length,
        })
      : queue.length > 1
        ? t('invite.openSmsN', { n: queue.length })
        : copy['invite.openSms'];

  // ------------------------------------------------------------ footer

  // The ride layout moves an active ride on to live; this is only for when there is nothing to go back to.
  const rideStatus = loadedRide?.status ?? 'lobby';
  const leaveScreen = () => {
    if (continuingRef.current) return;
    if (router.canGoBack()) router.back();
    else router.replace(href(rideHref(rideId, rideStatus)));
  };

  const onFooter = async () => {
    if (!isFirst) return leaveScreen();
    if (continuingRef.current) return;
    continuingRef.current = true;
    setContinuing(true);
    try {
      // Straight to the lobby (the permissions explainer first when something is still undetermined). The lobby shows who
      // has joined and where the ride goes; the leader taps Start there.
      router.replace(href(await hrefAfterEnter({ id: rideId, status: rideStatus })));
    } finally {
      continuingRef.current = false;
      setContinuing(false);
    }
  };

  // Android back is ignored while the hand-off to the lobby runs (as Start's is while the ride is made).
  useEffect(() => {
    if (!continuing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [continuing]);

  const rowInvitee = invitees.find((i) => i.id === rowId) ?? null;
  const rowState = rowInvitee ? inviteState(rowInvitee, matchMembers) : null;
  const sorted = [...invitees].sort((a, b) => a.invitedAt - b.invitedAt);

  return (
    <Screen
      scroll
      top={
        <TopBar
          title={copy['invite.title']}
          onBack={leaveScreen}
        />
      }
      footer={
        <BigButton
          label={isFirst ? copy['invite.continue'] : copy['invite.done']}
          loading={continuing}
          onPress={() => void onFooter()}
        />
      }>
      {ready ? (
        <AppText variant="heading" numberOfLines={1} style={styles.rideName} maxFontSizeMultiplier={1.3}>
          {rideName}
        </AppText>
      ) : null}

      <View style={[styles.codeCard, { backgroundColor: colors.surfaceRaised }, elevate('e1', scheme)]}>
        {ready ? (
          <>
            <RideCodeDisplay code={code} onLongPress={shareLink} />
            <AppText variant="caption" muted>
              {loadedRide?.status === 'active' ? copy['invite.midRideNote'] : copy['invite.codeNote']}
            </AppText>
          </>
        ) : (
          <View style={[styles.skeleton, { backgroundColor: colors.border }]} />
        )}
      </View>

      <View style={styles.cards}>
        {/* Web has no contacts picker: share the link and copy the code instead. */}
        {Platform.OS === 'web' ? null : (
          <ActionCard
            icon="contacts"
            title={copy['invite.textTitle']}
            sub={copy['invite.textSub']}
            accessibilityLabel={copy['invite.a11yText']}
            disabled={!ready}
            onPress={() => void onTextPeople()}
          />
        )}
        <ActionCard
          icon="share"
          title={copy['invite.shareTitle']}
          sub={copy['invite.shareSub']}
          accessibilityLabel={copy['invite.a11yShare']}
          highlight={highlightShare}
          disabled={!ready}
          onPress={shareLink}
        />
        {Platform.OS === 'web' ? (
          <ActionCard
            icon="link"
            title="Copy ride code"
            sub={code ? `Copy ${code} to paste anywhere` : undefined}
            disabled={!ready}
            onPress={() => {
              void navigator.clipboard
                ?.writeText(code)
                .then(() => showToast('Ride code copied'))
                .catch(() => showToast(copy['errors.unknown']));
            }}
          />
        ) : null}
      </View>

      {sorted.length === 0 ? (
        <AppText variant="caption" muted>
          {copy['invite.emptyHint']}
        </AppText>
      ) : (
        <View style={styles.listBlock}>
          <AppText variant="heading" style={styles.rideName} accessibilityRole="header">
            {t('invite.listTitle', { n: invited, j: joined })}
          </AppText>
          <View style={[styles.list, { backgroundColor: colors.surfaceRaised }, elevate('e1', scheme)]}>
            {sorted.map((i) => {
              const { state, riderName } = inviteState(i, matchMembers);
              const rider = i.matchedUserId ? members[i.matchedUserId] : undefined;
              return (
                <InviteeRow
                  key={i.id}
                  id={i.id}
                  name={i.name}
                  phone={formatPhoneDisplay(i.phone)}
                  time={clockTime(i.invitedAt)}
                  state={state}
                  riderName={rider && riderName ? riderName : null}
                  riderColorIndex={rider?.colorIndex ?? 0}
                  onPress={openRow}
                />
              );
            })}
          </View>
          <AppText variant="caption" muted>
            {copy['invite.honestNote']}
          </AppText>
        </View>
      )}

      {/* Contacts: explain first, then the OS prompt (rule 8). */}
      <Sheet visible={sheet === 'perm'} onClose={() => setSheet('none')} onDismiss={onDismiss}>
        <Icon name="contacts" color={colors.text} size={28} />
        <AppText variant="heading" style={styles.rideName}>
          {copy['invite.permTitle']}
        </AppText>
        <AppText>{permBlocked ? copy['invite.permBlocked'] : copy['invite.permBody']}</AppText>
        <BigButton
          label={permBlocked ? copy['perm.openSettings'] : copy['invite.permCta']}
          onPress={onPermContinue}
        />
        {permBlocked ? (
          <BigButton
            label={copy['invite.typeNumber']}
            variant="secondary"
            onPress={() => {
              setTyping(true);
              goSheet('tray');
            }}
          />
        ) : null}
      </Sheet>

      {/* Several numbers for one contact. */}
      <Sheet
        visible={sheet === 'pickNumber'}
        onClose={() => {
          setPending(null);
          goSheet(picks.length > 0 ? 'tray' : 'none');
        }}
        onDismiss={onDismiss}>
        <AppText variant="heading" style={styles.rideName}>
          {t('invite.pickNumberTitle', { name: firstName(pending?.name ?? '') || pending?.name || '' })}
        </AppText>
        {pending?.numbers.map((n) => (
          <Pressable
            key={n.number}
            accessibilityRole="button"
            accessibilityLabel={`${n.label} ${n.number}`}
            onPress={() => onPickNumber(n.number)}
            style={[styles.numberRow, { backgroundColor: colors.surfaceRaised }, elevate('e1', scheme)]}>
            <AppText style={styles.rideName} numeric>
              {n.number}
            </AppText>
            <AppText variant="caption" muted>
              {n.label}
            </AppText>
          </Pressable>
        ))}
      </Sheet>

      {/* Text tray: one composer per person, in sequence. */}
      <Sheet visible={sheet === 'tray'} onClose={() => setSheet('none')} onDismiss={onDismiss} hideClose>
        <AppText variant="heading" style={styles.rideName} accessibilityRole="header">
          {copy['invite.trayTitle']}
        </AppText>
        <ScrollView style={styles.trayList} keyboardShouldPersistTaps="handled">
          {picks.map((p) => (
            <View key={p.key} style={[styles.trayRow, { borderBottomColor: colors.border }]}>
              <View style={styles.trayTexts}>
                <AppText numberOfLines={1} style={styles.rideName}>
                  {p.name}
                </AppText>
                <AppText variant="caption" muted numeric>
                  {p.dup ? copy['invite.alreadyInvited'] : formatPhoneDisplay(p.phone)}
                </AppText>
              </View>
              {sentCount === 0 || !queue.slice(0, sentCount).some((q) => q.key === p.key) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('invite.a11yRemove', { name: firstName(p.name) || p.name })}
                  onPress={() => removePick(p.key)}
                  style={styles.removeBtn}>
                  <Icon name="close" color={colors.text} size={24} />
                </Pressable>
              ) : (
                <Icon name="ready" color={colors.textMuted} size={20} />
              )}
            </View>
          ))}
        </ScrollView>
        {typing ? (
          <View style={styles.typing}>
            <PhoneInput
              value={typed}
              onChangeText={(v) => {
                setTyped(v);
                setTypedError(false);
              }}
              prefix={prefix}
              onPrefixChange={setPrefix}
              invalid={typedError}
              autoFocus
              accessibilityLabel={copy['invite.typeNumber']}
              onSubmitEditing={addTyped}
            />
            {typedError ? <AppText variant="caption">{copy['phone.invalid']}</AppText> : null}
            <BigButton label={copy['invite.add']} variant="secondary" onPress={addTyped} />
          </View>
        ) : (
          <>
            <BigButton
              label={copy['invite.addAnother']}
              variant="secondary"
              icon="contacts"
              onPress={() => {
                setSheet('none');
                schedule(() => void runPicker());
              }}
            />
            <BigButton
              label={copy['invite.typeNumber']}
              variant="secondary"
              onPress={() => setTyping(true)}
            />
          </>
        )}
        <AppText variant="caption" muted>
          {copy['invite.smsNote']}
        </AppText>
        <BigButton
          label={trayPrimary}
          disabled={queue.length === 0}
          onPress={() => void sendNext()}
        />
        <BigButton
          label={copy['common.close']}
          variant="secondary"
          onPress={() => {
            setSheet('none');
          }}
        />
      </Sheet>

      {/* Row sheet. */}
      <Sheet visible={sheet === 'row'} onClose={() => setSheet('none')} onDismiss={onDismiss}>
        <AppText variant="heading" style={styles.rideName}>
          {rowInvitee?.name ?? ''}
        </AppText>
        {rowState && rowState.state !== 'invited' ? (
          <AppText muted>{t('invite.joinedAs', { rider: rowState.riderName ?? rowInvitee?.name ?? '' })}</AppText>
        ) : null}
        {rowInvitee && rowState?.state === 'invited' ? (
          <>
            <BigButton
              label={copy['invite.textAgain']}
              variant="secondary"
              onPress={() => textAgain(rowInvitee.phone, rowInvitee.name)}
            />
            <BigButton
              label={copy['invite.remove']}
              variant="secondary"
              onPress={() => {
                useInviteStore.getState().remove(rideId, rowInvitee.id);
                setSheet('none');
                haptic('select');
                showToast(copy['invite.removed']);
              }}
            />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rideName: { fontFamily: family.semibold },
  codeCard: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  skeleton: { height: 36, borderRadius: radius.md, opacity: 0.5 },
  cards: { gap: space.md },
  listBlock: { gap: space.md },
  list: { borderRadius: radius.lg, overflow: 'hidden' },
  numberRow: {
    minHeight: 56,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    justifyContent: 'center',
  },
  trayList: { maxHeight: 260 },
  trayRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trayTexts: { flex: 1 },
  removeBtn: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  typing: { gap: space.sm },
});
