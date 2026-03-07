'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n';
import type { Product } from '@/types';

interface OrderModalProps {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormState {
  name: string;
  email: string;
  qty: number;
  notes: string;
}

export function OrderModal({ product, onClose, onSuccess }: OrderModalProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>({ name: '', email: '', qty: 1, notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!product) return null;

  const total = (form.qty * product.price).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          customer_name: form.name,
          customer_email: form.email,
          quantity: form.qty,
          unit_price: product.price,
          notes: form.notes,
        }),
      });
      if (!res.ok) throw new Error('Order failed');
      onSuccess();
      onClose();
      setForm({ name: '', email: '', qty: 1, notes: '' });
    } catch {
      setError(t.common.error);
    } finally {
      setLoading(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}
      {node}
    </label>
  );

  const input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      {...props}
      className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-harvest-500"
    />
  );

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title={`${t.shop.modalTitle}: ${product.name}`}
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>{t.shop.modalCancel}</Button>
          <Button form="order-form" type="submit" disabled={loading}>
            {loading ? t.common.loading : t.shop.modalSubmit}
          </Button>
        </div>
      }
    >
      <form id="order-form" onSubmit={handleSubmit} className="space-y-4">
        {field(t.shop.modalName, input({ required: true, value: form.name, onChange: e => setForm(f => ({ ...f, name: e.target.value })) }))}
        {field(t.shop.modalEmail, input({ type: 'email', required: true, value: form.email, onChange: e => setForm(f => ({ ...f, email: e.target.value })) }))}
        {field(
          `${t.shop.modalQty} (${product.unit})`,
          input({ type: 'number', min: 0.5, max: product.stock_qty, step: 0.5, required: true, value: form.qty, onChange: e => setForm(f => ({ ...f, qty: Number(e.target.value) })) })
        )}
        {field(t.shop.modalNotes, input({ value: form.notes, onChange: e => setForm(f => ({ ...f, notes: e.target.value })) }))}

        <div className="bg-harvest-50 rounded-xl p-3 flex justify-between font-semibold text-sm">
          <span>{t.shop.modalTotal}</span>
          <span className="text-harvest-700">{t.common.currency}{total}</span>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>
    </Modal>
  );
}
