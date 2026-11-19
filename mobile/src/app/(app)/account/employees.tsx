import React, { useState } from 'react';
import { FlatList, Modal, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { employees as api } from '@/api/endpoints';
import type { Employee, EmployeeInput } from '@/api/models';
import { useFormat } from '@/hooks/useFormat';
import { useLoad } from '@/hooks/useLoad';
import { usePagedList } from '@/hooks/usePagedList';
import { colors, radius, space } from '@/theme';
import { isEmail } from '@/utils/forms';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Screen, screenStyles } from '@/ui/Screen';
import { SearchBar } from '@/ui/SearchBar';
import { Select } from '@/ui/Select';
import { Txt } from '@/ui/Txt';
import { useConfirm } from '@/ui/dialogs';
import { Alert, Badge, Card, EmptyState, ListFooter, Loading, SectionHeading } from '@/ui/primitives';

type FormMode = 'create' | 'edit' | 'password';
const EMPTY: EmployeeInput = { name: '', email: '', phone: '', role: '', status: 'active' };
const SORT_OPTIONS = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'name:desc', label: 'Name Z–A' },
  { value: 'role:asc', label: 'Role A–Z' }
];

/** Owner-side employee management: create, edit, reset password, remove. */
export default function EmployeesScreen() {
  const { t } = useFormat();
  const confirm = useConfirm();
  const list = usePagedList<Employee>(query => api.list(query), { sort: 'updatedAt:desc', fallback: 'Unable to load employees. Please try again.' }, []);
  /** Job titles from the server; the Role field is a dropdown, never free text. */
  const roles = useLoad(() => api.roles(), []);
  const [mode, setMode] = useState<FormMode | null>(null);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [draft, setDraft] = useState<EmployeeInput>(EMPTY);
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');

  const open = (next: FormMode, employee: Employee | null) => {
    setError(''); setSuccess(''); setFormError('');
    setMode(next);
    setEditing(employee);
    setPassword('');
    setTouched(false);
    setDraft(employee && next === 'edit' ? { name: employee.name, email: employee.email, phone: employee.phone, role: employee.role, status: employee.status } : EMPTY);
  };
  const close = () => { setMode(null); setEditing(null); setPassword(''); };
  const set = (key: keyof EmployeeInput) => (value: string) => setDraft(d => ({ ...d, [key]: value }));

  const errors = {
    name: touched && mode !== 'password' && !draft.name.trim() ? 'Enter the employee’s name.' : '',
    email: touched && mode !== 'password' && !isEmail(draft.email) ? 'Enter a valid email address.' : '',
    role: touched && mode !== 'password' && !draft.role.trim() ? 'Enter a role.' : '',
    password: touched && mode !== 'edit' && password.length < 8 ? 'Temporary password must be at least 8 characters.' : ''
  };

  const save = async () => {
    if (!mode || saving) return;
    setTouched(true);
    setFormError('');
    const detailsValid = mode === 'password' || (draft.name.trim() && isEmail(draft.email) && draft.role.trim());
    const passwordValid = mode === 'edit' || password.length >= 8;
    if (!detailsValid || !passwordValid) { setFormError('Check the highlighted fields.'); return; }
    const id = editing?._id ?? '';
    const values: EmployeeInput = { ...draft, name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim(), role: draft.role.trim() };
    setSaving(true);
    try {
      const { employee } = mode === 'create' ? await api.create({ ...values, password })
        : mode === 'edit' ? await api.update(id, values)
        : await api.resetPassword(id, password);
      close();
      if (mode === 'create') setSuccess(t('{name} was added with employee ID {id}. Share the employee login link above, their ID, and the temporary password with them.', { name: employee.name, id: employee.employeeId }));
      else if (mode === 'edit') setSuccess('Employee updated.');
      else setSuccess(t('Temporary password set for {id}. They’ve been signed out.', { id: employee.employeeId }));
      void list.reload();
    } catch (e) {
      setFormError(errorMessage(e, 'Unable to save employee. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (employee: Employee) => {
    const answer = await confirm({ title: 'Remove employee?', message: 'Remove {name} ({id}) from your team? They will no longer be able to sign in.', messageParams: { name: employee.name, id: employee.employeeId }, confirmLabel: 'Remove', danger: true });
    if (!answer.confirmed) return;
    setError(''); setSuccess('');
    try {
      await api.remove(employee._id);
      setSuccess('Employee removed from your team.');
      void list.reload();
    } catch (e) {
      setError(errorMessage(e, 'Unable to remove employee. Please try again.'));
    }
  };

  const header = (
    <View>
      <Alert text={list.error} />
      <Alert text={error} />
      <Alert kind="success" text={success} />
      <SearchBar value={list.searchInput} onChange={list.setSearchInput} placeholder="Search name, ID, email, role" />
      <Select compact value={list.sort} options={SORT_OPTIONS} onChange={list.setSort} style={styles.sort} />
      <Txt variant="small" style={styles.count}>{list.searchTerm
        ? (list.total === 1 ? t('1 employee matching “{search}”', { search: list.searchTerm }) : t('{count} employees matching “{search}”', { count: list.total, search: list.searchTerm }))
        : (list.total === 1 ? t('1 employee') : t('{count} employees', { count: list.total }))}</Txt>
      {list.loading && !list.loaded ? <Loading text="Loading employees..." /> : null}
    </View>
  );

  return (
    <Screen scroll={false} back eyebrow="EMPLOYEES" title="Your team" subtitle="Create employee accounts and manage who can sign in to your shop."
      right={<Button title={t('＋ Add')} small onPress={() => open('create', null)} />}>
      <FlatList
        data={list.items}
        keyExtractor={e => e._id}
        contentContainerStyle={screenStyles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.gold} />}
        onEndReachedThreshold={0.4}
        onEndReached={list.loadMore}
        renderItem={({ item: e }) => (
          <Card style={styles.card}>
            <View style={styles.top}>
              <View style={styles.avatar}><Txt bold color={colors.goldText}>{e.name.charAt(0).toUpperCase()}</Txt></View>
              <View style={styles.body}>
                <Txt bold>{e.name}</Txt>
                <Txt variant="small"><Txt variant="small" ltr>{e.employeeId}</Txt> · {e.role}</Txt>
                <Txt variant="small" ltr>{e.email}{e.phone ? ` · ${e.phone}` : ''}</Txt>
              </View>
              <View style={styles.badges}>
                <Badge label={e.status === 'active' ? 'Active' : 'Inactive'} tone={e.status === 'active' ? 'green' : 'grey'} />
                {e.mustChangePassword && e.status === 'active' ? <Badge label="Temp password" tone="gold" /> : null}
              </View>
            </View>
            <View style={styles.actions}>
              <Button title={t('Edit')} variant="outline" small onPress={() => open('edit', e)} />
              <Button title={t('Reset password')} variant="outline" small onPress={() => open('password', e)} />
              <Button title={t('Remove')} variant="danger" small onPress={() => void remove(e)} />
            </View>
          </Card>
        )}
        ListEmptyComponent={list.loaded && !list.loading ? (
          <EmptyState icon="people-outline" title={list.searchTerm ? 'No matching employees' : 'No employees yet'} text={list.searchTerm ? 'Try a different name, ID, email, or role.' : 'Add an employee to give them their own sign-in for your shop.'}
            action={!list.searchTerm ? <Button title={t('Add an employee')} small onPress={() => open('create', null)} /> : undefined} />
        ) : undefined}
        ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} loadingMore={list.loadingMore} hasMore={list.page < list.totalPages} onLoadMore={list.loadMore} />}
      />

      <Modal visible={Boolean(mode)} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <SectionHeading
            title={mode === 'create' ? 'Add employee' : mode === 'edit' ? 'Edit employee' : 'Reset password'}
            text={mode === 'create' ? 'The employee signs in with their employee ID and this temporary password, then chooses their own.'
              : mode === 'edit' ? t('Update {id}’s contact and role information.', { id: editing?.employeeId })
              : t('Set a new temporary password for {name} ({id}). They’ll be signed out and must choose a new password at their next login.', { name: editing?.name, id: editing?.employeeId })}
            right={<Button title={t('Close')} variant="ghost" small onPress={close} />}
          />
          <Alert text={formError} />
          {mode !== 'password' ? (
            <>
              <Field label="Full name" value={draft.name} onChangeText={set('name')} error={errors.name} maxLength={120} textContentType="name" />
              <Field label="Email address" value={draft.email} onChangeText={set('email')} error={errors.email} ltr autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={254} />
              <Field label="Phone number" optional value={draft.phone} onChangeText={set('phone')} ltr keyboardType="phone-pad" maxLength={40} />
              <Select label="Role" value={draft.role} onChange={set('role')} error={errors.role} placeholder={roles.data ? 'Choose a role' : 'Loading roles...'}
                options={[...(draft.role && !(roles.data ?? []).includes(draft.role) ? [draft.role] : []), ...(roles.data ?? [])].map(r => ({ value: r, label: r }))} />
              <Select label="Status" value={draft.status} onChange={v => setDraft(d => ({ ...d, status: v }))} options={[{ value: 'active', label: 'Active — can sign in' }, { value: 'inactive', label: 'Inactive — cannot sign in' }]} />
            </>
          ) : undefined}
          {mode !== 'edit' ? <Field label="Temporary password" value={password} onChangeText={setPassword} error={errors.password} ltr autoCapitalize="none" autoCorrect={false} placeholder={t('At least 8 characters')} maxLength={128} /> : null}
          <View style={styles.formActions}>
            <Button title={t('Cancel')} variant="outline" onPress={close} />
            <Button title={t(saving ? 'Saving...' : mode === 'create' ? 'Create employee' : mode === 'edit' ? 'Save changes' : 'Set temporary password')} loading={saving} onPress={() => void save()} />
          </View>
        </ScrollView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sort: { marginBottom: space.sm },
  count: { marginBottom: space.sm },
  card: { marginBottom: space.md, padding: 14 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  badges: { alignItems: 'flex-end', gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sheet: { flex: 1, backgroundColor: colors.cream },
  sheetContent: { padding: space.xl, paddingBottom: space.xxl * 2 },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: space.sm }
});
