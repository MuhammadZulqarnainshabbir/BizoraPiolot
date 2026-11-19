import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { customers } from '@/api/endpoints';
import { DOCUMENT_KINDS, type CustomerRecord, type DocumentKind } from '@/api/models';
import { useAuth } from '@/auth/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useLoad } from '@/hooks/useLoad';
import { colors, radius, space } from '@/theme';
import { pickIdPicture } from '@/utils/images';
import { AGREEMENT_STATUS_LABEL, AGREEMENT_STATUS_TONE, SALE_STATUS_LABEL, SALE_STATUS_TONE, SALE_TYPE_LABEL, actorLabel } from '@/utils/labels';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { Select } from '@/ui/Select';
import { Txt } from '@/ui/Txt';
import { ActionSheet, useConfirm } from '@/ui/dialogs';
import { Alert, Badge, Card, Fact, FactGrid, Loading, Metric, MetricGrid, SectionHeading } from '@/ui/primitives';

const KIND_LABEL: Record<DocumentKind, string> = { CNIC_FRONT: 'CNIC front', CNIC_BACK: 'CNIC back', OTHER: 'Other ID' };

/** One customer: details, ID pictures (take / choose / view / remove), installment balances and purchase history. */
export default function CustomerDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, money, date } = useFormat();
  const { can } = useAuth();
  const confirm = useConfirm();
  const load = useLoad(() => customers.get(id), [id], 'Unable to load this customer.');
  const [pictures, setPictures] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<DocumentKind>('CNIC_FRONT');
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const c = load.data?.customer;
  const stats = load.data?.stats;
  const sales = load.data?.sales ?? [];
  const agreements = load.data?.agreements ?? [];

  // Load the pictures themselves (data URLs) once the record is here.
  useEffect(() => {
    if (!c) return;
    for (const d of c.documents) {
      if (pictures[d._id]) continue;
      customers.document(c._id, d._id).then(res => setPictures(p => ({ ...p, [d._id]: res.document.dataUrl }))).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.documents.map(d => d._id).join(',')]);

  const setCustomer = (updater: (current: CustomerRecord) => CustomerRecord) =>
    load.setData(current => current ? { ...current, customer: updater(current.customer) } : current);

  const addPicture = async (source: 'camera' | 'library') => {
    if (!c) return;
    setError('');
    setSuccess('');
    try {
      const image = await pickIdPicture(source);
      if (!image) return;
      setUploading(true);
      const { document } = await customers.addDocument(c._id, kind, image);
      setPictures(p => ({ ...p, [document._id]: image }));
      setCustomer(current => ({ ...current, documents: [...current.documents, document] }));
      setSuccess('Picture added.');
      setKind(kind === 'CNIC_FRONT' ? 'CNIC_BACK' : 'OTHER');
    } catch (e) {
      setError(e instanceof Error && !('status' in e) ? e.message : errorMessage(e, 'Unable to upload the picture. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  const removePicture = async (docId: string) => {
    if (!c) return;
    const answer = await confirm({ title: 'Remove this picture?', message: 'The picture will be deleted from the customer’s record.', confirmLabel: 'Remove', danger: true });
    if (!answer.confirmed) return;
    try {
      await customers.removeDocument(c._id, docId);
      setCustomer(current => ({ ...current, documents: current.documents.filter(d => d._id !== docId) }));
      setSuccess('Picture removed.');
    } catch (e) {
      setError(errorMessage(e, 'Unable to remove the picture. Please try again.'));
    }
  };

  const remove = async () => {
    if (!c) return;
    const answer = await confirm({
      title: 'Delete this customer?',
      message: '{name} ({code}) will be removed. Customers with sales can’t be deleted. This is recorded in the audit log.',
      messageParams: { name: c.name, code: c.customerCode },
      confirmLabel: 'Delete', danger: true, reasonLabel: 'Reason (required)'
    });
    if (!answer.confirmed) return;
    try {
      await customers.remove(c._id, answer.reason);
      router.back();
    } catch (e) {
      setError(errorMessage(e, 'Unable to delete this customer. Please try again.'));
    }
  };

  return (
    <Screen back eyebrow="CUSTOMER" title={c?.name || 'Customer'} rawTitle={Boolean(c)} subtitle={c ? `${c.customerCode} · ${c.phone}` : undefined} rawSubtitle refreshing={load.refreshing} onRefresh={load.refresh}
      right={c && can('customers.manage') ? <Button title={t('Edit')} variant="outline" small onPress={() => router.push(`/customers/${c._id}/edit`)} /> : undefined}>
      <Alert text={load.error} />
      <Alert text={error} />
      <Alert kind="success" text={success} />
      {load.loading && !c ? <Loading /> : null}
      {c && stats ? (
        <>
          <MetricGrid>
            <Metric label="Purchases" value={String(stats.salesCount)} sub={t('Total {amount}', { amount: money(stats.totalCents) })} tone="blue" icon="pricetag-outline" />
            <Metric label="Installment outstanding" value={money(stats.outstandingCents)} sub={stats.activeAgreements === 1 ? t('1 active agreement') : t('{count} active agreements', { count: stats.activeAgreements })} tone="violet" icon="hourglass-outline" />
            <Metric label="Overdue" value={money(stats.overdueCents)} sub={stats.overdueAgreements === 1 ? t('1 agreement') : t('{count} agreements', { count: stats.overdueAgreements })} tone="red" icon="alert-circle-outline" alert={stats.overdueAgreements > 0} />
          </MetricGrid>

          <Card>
            <FactGrid>
              <Fact label="PHONE" value={c.phone} ltr />
              <Fact label="CNIC" value={c.cnicFormatted || '—'} ltr />
              <Fact label="ADDRESS" value={c.address || '—'} flex />
              <Fact label="ADDED BY" value={t(...actorLabel(c.createdBy))} sub={date(c.createdAt, 'medium')} />
            </FactGrid>
            {c.notes ? <Txt variant="muted" style={styles.notes}>{c.notes}</Txt> : null}
            {can('customers.delete') ? <Button title={t('Delete customer')} variant="danger" small onPress={() => void remove()} style={styles.selfStart} /> : null}
          </Card>

          <Card>
            <SectionHeading title="ID pictures" text="Front and back of the CNIC, or another ID. Up to 4 pictures, each under 3 MB." />
            {c.documents.length ? (
              <View style={styles.pictures}>
                {c.documents.map(d => (
                  <View key={d._id} style={styles.picture}>
                    <Pressable onPress={() => pictures[d._id] && setViewing(pictures[d._id])} accessibilityLabel={t(KIND_LABEL[d.kind])}>
                      {pictures[d._id] ? <Image source={{ uri: pictures[d._id] }} style={styles.image} /> : <View style={[styles.image, styles.imageLoading]}><Loading /></View>}
                    </Pressable>
                    <Txt variant="small" bold>{t(KIND_LABEL[d.kind])}</Txt>
                    <Txt variant="small">{date(d.createdAt)} · {t(...actorLabel(d.uploadedBy))}</Txt>
                    {can('customers.manage') ? <Pressable onPress={() => void removePicture(d._id)} hitSlop={6}><Txt variant="small" color={colors.danger} bold>{t('Remove')}</Txt></Pressable> : null}
                  </View>
                ))}
              </View>
            ) : <Txt variant="small" style={styles.notes}>{t('No ID pictures yet.')}</Txt>}
            {can('customers.manage') && c.documents.length < 4 ? (
              <View style={styles.addRow}>
                <Select compact value={kind} onChange={setKind} options={DOCUMENT_KINDS.map(k => ({ value: k, label: KIND_LABEL[k] }))} style={styles.kind} />
                <Button title={t(uploading ? 'Uploading...' : 'Add picture')} small loading={uploading} onPress={() => setAdding(true)} />
              </View>
            ) : null}
          </Card>

          <Card>
            <SectionHeading title="Installment agreements" text={can('sales.viewAll') ? undefined : 'Only the sales you made are shown.'} />
            {agreements.length ? agreements.map((a, i) => (
              <Pressable key={a._id} onPress={() => router.push(`/sales/installments/${a._id}`)} style={[styles.row, i === agreements.length - 1 && styles.last]}>
                <View style={styles.rowBody}>
                  <Txt bold ltr>{a.agreementNumber}</Txt>
                  <Txt variant="small">{a.item.productName} · {date(a.createdAt)}</Txt>
                  <Txt variant="small">{t('{collected} collected · {balance} remaining', { collected: money(a.collectedCents), balance: money(a.balanceCents) })}{a.nextDueDate ? ` · ${t('Next due {date}: {amount}', { date: date(a.nextDueDate), amount: money(a.nextDueCents ?? 0) })}` : ''}</Txt>
                </View>
                <Badge label={AGREEMENT_STATUS_LABEL[a.displayStatus]} tone={AGREEMENT_STATUS_TONE[a.displayStatus]} />
                <Ionicons name="chevron-forward" size={18} color={colors.onInkMuted} />
              </Pressable>
            )) : <Txt variant="small">{t('No installment agreements.')}</Txt>}
          </Card>

          <Card>
            <SectionHeading title="Purchase history" />
            {sales.length ? sales.map((s, i) => (
              <Pressable key={s._id} onPress={() => router.push(`/sales/${s._id}`)} style={[styles.row, i === sales.length - 1 && styles.last]}>
                <View style={styles.rowBody}>
                  <Txt bold numberOfLines={1}>{s.item.productName}</Txt>
                  <Txt variant="small"><Txt variant="small" ltr>{s.saleNumber}</Txt> · {t(SALE_TYPE_LABEL[s.type])} · {money(s.salePriceCents)} · {date(s.soldAt, 'medium')}</Txt>
                  <Txt variant="small">{t('SOLD BY')}: {t(...actorLabel(s.soldBy))}</Txt>
                </View>
                <Badge label={SALE_STATUS_LABEL[s.status]} tone={SALE_STATUS_TONE[s.status]} />
                <Ionicons name="chevron-forward" size={18} color={colors.onInkMuted} />
              </Pressable>
            )) : <Txt variant="small">{t('No purchases yet.')}</Txt>}
          </Card>
        </>
      ) : null}

      <ActionSheet visible={adding} title="Add picture" onClose={() => setAdding(false)} actions={[
        { label: 'Take a photo', onPress: () => void addPicture('camera') },
        { label: 'Choose from library', onPress: () => void addPicture('library') }
      ]} />

      <Modal visible={Boolean(viewing)} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)}>
          {viewing ? <Image source={{ uri: viewing }} style={styles.viewerImage} resizeMode="contain" /> : null}
          <Txt variant="small" color="#fff" center style={styles.viewerHint}>{t('Close')}</Txt>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notes: { marginBottom: space.md },
  selfStart: { alignSelf: 'flex-start', marginTop: space.sm },
  pictures: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: space.md },
  picture: { width: '47%', gap: 2 },
  image: { width: '100%', aspectRatio: 1.5, borderRadius: radius.md, backgroundColor: colors.goldTint, marginBottom: 4 },
  imageLoading: { alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kind: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowBody: { flex: 1, gap: 2 },
  last: { borderBottomWidth: 0 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  viewerImage: { width: '100%', height: '80%' },
  viewerHint: { marginTop: space.md }
});
