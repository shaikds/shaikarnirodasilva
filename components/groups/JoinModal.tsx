'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n';
import type { GroupBuy } from '@/types';

interface JoinModalProps {
  groupBuy: GroupBuy | null;
  onClose: () => void;
  onSuccess: (thresholdReached: boolean) => void;
}

export function JoinModal({ groupBuy: gb, onClose, onSuccess }: JoinModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!gb) return null;

  const total = (qty * gb.group_price).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_buy_id: gb.id, customer_name: name, customer_email: email, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Join failed');
      onSuccess(!!data.threshold_reached);
      onClose();
      setName(''); setEmail(''); setQty(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-harvest-500';

  return (
    <Modal
      open={!!gb}
      onClose={onClose}
      title={`${t.groups.modalTitle}: ${gb.product_name}`}
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>{t.groups.modalCancel}</Button>
          <Button form="join-form" type="submit" disabled={loading}>
            {loading ? t.common.loading : t.groups.modalSubmit}
          </Button>
        </div>
      }
    >
      <form id="join-form" onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          {t.groups.modalName}
          <input required className={inputCls} value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t.groups.modalEmail}
          <input type="email" required className={inputCls} value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t.groups.modalQty} ({gb.unit})
          <input type="number" min={0.5} step={0.5} required className={inputCls} value={qty} onChange={e => setQty(Number(e.target.value))} />
        </label>

        <div className="bg-harvest-50 rounded-xl p-3 flex justify-between font-semibold text-sm">
          <span>{t.groups.modalTotal}</span>
          <span className="text-harvest-700">{t.common.currency}{total}</span>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>
    </Modal>
  );
}
