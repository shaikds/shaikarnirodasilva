'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n';
import type { BuyingTeam } from '@/types';

interface JoinRequestModalProps {
  team: BuyingTeam | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function JoinRequestModal({ team, onClose, onSuccess }: JoinRequestModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!team) return null;

  const inputCls = 'mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-harvest-500';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/teams/join-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request',
          team_id: team!.id,
          customer_name: name,
          customer_email: email,
          quantity: qty,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onSuccess();
      onClose();
      setName(''); setEmail(''); setQty(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={!!team}
      onClose={onClose}
      title={`${t.teams.requestToJoin}: ${team.product_name}`}
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
          <Button form="join-request-form" type="submit" disabled={loading}>
            {loading ? t.common.loading : t.teams.requestToJoin}
          </Button>
        </div>
      }
    >
      <form id="join-request-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          {t.lang === 'he'
            ? 'זוהי קבוצה סגורה. הבקשה שלך תישלח למנהל הקבוצה לאישור.'
            : 'This is a private group. Your request will be sent to the group admin for approval.'}
        </div>

        <label className="block text-sm font-medium text-gray-700">
          {t.groups.modalName}
          <input required className={inputCls} value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t.groups.modalEmail}
          <input type="email" required className={inputCls} value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t.groups.modalQty} ({team.unit})
          <input type="number" min={0.5} step={0.5} required className={inputCls} value={qty} onChange={e => setQty(Number(e.target.value))} />
        </label>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>
    </Modal>
  );
}
