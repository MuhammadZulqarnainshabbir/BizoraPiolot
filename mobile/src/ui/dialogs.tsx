import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { useI18n, type Params } from '@/i18n/I18nContext';
import { colors, radius, space } from '@/theme';
import { Button } from './Button';
import { URDU_INPUT_STYLE } from './fonts';
import { Txt } from './Txt';

// ---- Confirm dialog (replaces the web app's ConfirmService)

export interface ConfirmOptions {
  title: string;
  message: string;
  messageParams?: Params;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Ask for a reason (required). */
  reasonLabel?: string;
}

export interface ConfirmAnswer { confirmed: boolean; reason: string; }

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<ConfirmAnswer>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t, isRtl } = useI18n();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const resolver = useRef<((answer: ConfirmAnswer) => void) | null>(null);

  const ask = useCallback((next: ConfirmOptions) => new Promise<ConfirmAnswer>(resolve => {
    resolver.current = resolve;
    setReason('');
    setTouched(false);
    setOptions(next);
  }), []);

  const finish = (confirmed: boolean) => {
    if (confirmed && options?.reasonLabel && !reason.trim()) { setTouched(true); return; }
    const answer = { confirmed, reason: reason.trim() };
    setOptions(null);
    resolver.current?.(answer);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Modal visible={Boolean(options)} transparent animationType="fade" onRequestClose={() => finish(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            {options ? (
              <>
                <Txt variant="h2" style={styles.title}>{t(options.title)}</Txt>
                <Txt variant="muted">{t(options.message, options.messageParams)}</Txt>
                {options.reasonLabel ? (
                  <View style={styles.reason}>
                    <Txt variant="label" style={styles.reasonLabel}>{t(options.reasonLabel)}</Txt>
                    <TextInput value={reason} onChangeText={setReason} style={[styles.input, isRtl && URDU_INPUT_STYLE, touched && !reason.trim() && styles.inputError]} maxLength={500} multiline autoFocus />
                    {touched && !reason.trim() ? <Txt variant="small" color={colors.danger}>{t('Enter a reason.')}</Txt> : null}
                  </View>
                ) : null}
                <View style={styles.actions}>
                  <Button title={t(options.cancelLabel ?? 'Keep')} variant="outline" small onPress={() => finish(false)} />
                  <Button title={t(options.confirmLabel ?? 'Confirm')} variant={options.danger ? 'danger' : 'primary'} small onPress={() => finish(true)} />
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ask;
}

// ---- Session warning ("Are you still there?" / "Your session is ending")

function countdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SessionWarningDialog() {
  const { t } = useI18n();
  const { warning, stayActive, dismissEndingWarning, logout } = useAuth();
  const text = useMemo(() => warning ? countdown(warning.secondsLeft) : '', [warning]);
  if (!warning) return null;
  const idle = warning.kind === 'idle';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => (idle ? stayActive() : dismissEndingWarning())}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Txt variant="h2" style={styles.title}>{t(idle ? 'Are you still there?' : 'Your session is ending')}</Txt>
          <Txt variant="muted">{t(idle ? 'You’ll be signed out for inactivity in {time}.' : 'For security, your session ends in {time}. Save your work and sign in again to continue.', { time: text })}</Txt>
          <View style={styles.actions}>
            <Button title={t('Log out')} variant="outline" small onPress={() => void logout()} />
            {idle
              ? <Button title={t('Stay signed in')} small onPress={stayActive} />
              : <Button title={t('OK')} small onPress={dismissEndingWarning} />}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---- Simple bottom sheet with actions (e.g. "Mark as sold")

export interface SheetAction { label: string; onPress: () => void; danger?: boolean; }

export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title?: string; actions: SheetAction[]; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          {title ? <Txt variant="h3" style={styles.sheetTitle}>{t(title)}</Txt> : null}
          {actions.map(a => (
            <Pressable key={a.label} onPress={() => { onClose(); a.onPress(); }} style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}>
              <Txt bold color={a.danger ? colors.danger : colors.ink}>{t(a.label)}</Txt>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={({ pressed }) => [styles.sheetAction, styles.sheetCancel, pressed && styles.pressed]}>
            <Txt bold color={colors.muted}>{t('Cancel')}</Txt>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  dialog: { backgroundColor: '#fff', borderRadius: radius.lg, padding: space.xl, width: '100%', maxWidth: 420 },
  title: { marginBottom: 8 },
  reason: { marginTop: space.lg },
  reasonLabel: { marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 12, minHeight: 70, textAlignVertical: 'top', fontSize: 15, color: colors.ink },
  inputError: { borderColor: colors.red },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: space.xl },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, paddingBottom: space.xxl },
  sheetTitle: { marginBottom: 6, paddingHorizontal: 4 },
  sheetAction: { paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSoft },
  sheetCancel: { borderBottomWidth: 0, marginTop: 4 },
  pressed: { opacity: 0.7 }
});
