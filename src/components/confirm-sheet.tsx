import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

import { BigButton } from '@/components/big-button';
import { AppText } from '@/components/app-text';
import { Sheet } from '@/components/sheet';
import { copy } from '@/lib/copy';

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  /** danger = destructive red confirm; primary otherwise. */
  tone?: 'danger' | 'primary';
  /** Hide Cancel for single-action sheets ("Go to <ride>"); the scrim and back still close. */
  hideCancel?: boolean;
  /** Cancel button text; say what happens ("Keep riding"). Default "Cancel". */
  cancelLabel?: string;
  loading?: boolean;
  /** The confirm button's words while `loading` ("Ending ride…"), spoken once when it starts (26 E1). */
  loadingLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Title + body + confirm on top, Cancel at the bottom so a sloppy thumb lands on Cancel. */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  tone = 'danger',
  hideCancel,
  cancelLabel,
  loading,
  loadingLabel,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  useEffect(() => {
    if (loading && loadingLabel) AccessibilityInfo.announceForAccessibility(loadingLabel);
  }, [loading, loadingLabel]);
  return (
    <Sheet visible={visible} onClose={onCancel} hideClose>
      <AppText variant="heading">{title}</AppText>
      {body ? <AppText muted>{body}</AppText> : null}
      <BigButton
        label={confirmLabel}
        variant={tone === 'danger' ? 'danger' : 'primary'}
        loading={loading}
        loadingLabel={loadingLabel}
        fixedShape={tone === 'danger'}
        onPress={onConfirm}
      />
      {hideCancel ? null : (
        <BigButton label={cancelLabel ?? copy['common.cancel']} variant="secondary" fixedShape={tone === 'danger'} onPress={onCancel} disabled={loading} />
      )}
    </Sheet>
  );
}
