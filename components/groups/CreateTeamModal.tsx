'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n';
import type { GroupBuy } from '@/types';

interface CreateTeamModalProps {
  groupBuy: GroupBuy | null;
  onClose: () => void;
}

export function CreateTeamModal({ groupBuy: gb, onClose }: CreateTeamModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);

  if (!gb) return null;

  const inputCls = 'mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-harvest-500';

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', group_buy_id: gb!.id, customer_name: name, customer_email: email, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create team');
      setInviteUrl(window.location.origin + data.invite_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  const dayName = gb.cutoff_day != null
    ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][gb.cutoff_day]
    : 'Wednesday';

  return (
    <Modal
      open={!!gb}
      onClose={() => { onClose(); setInviteUrl(''); setName(''); setEmail(''); setQty(1); }}
      title={`${t.teams.createTeamTitle}: ${gb.product_name}`}
      footer={
        inviteUrl ? (
          <Button variant="secondary" onClick={() => { onClose(); setInviteUrl(''); setName(''); setEmail(''); setQty(1); }}>
            Close
          </Button>
        ) : (
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button form="create-team-form" type="submit" disabled={loading}>
              {loading ? t.common.loading : t.teams.startTeam}
            </Button>
          </div>
        )
      }
    >
      {inviteUrl ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
            {t.lang === 'he' ? 'הקבוצה נוצרה! שתף את הקישור עם חברים.' : 'Team created! Share the link with friends.'}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">{t.teams.inviteLinkLabel}</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="input flex-1 text-xs bg-gray-50"
                onFocus={e => e.target.select()}
              />
              <Button onClick={copyLink} variant="secondary">
                {copied ? t.teams.linkCopied : t.teams.copyLink}
              </Button>
            </div>
          </div>

          <div className="bg-harvest-50 border border-harvest-100 rounded-xl p-3 text-sm text-harvest-800">
            <strong>{t.teams.nextCutoff} {dayName}</strong>
            <p className="text-xs mt-1 text-harvest-700">{t.teams.cutoffExplain}</p>
          </div>

          <p className="text-xs text-gray-500">{t.teams.shareHint}</p>
        </div>
      ) : (
        <form id="create-team-form" onSubmit={handleCreate} className="space-y-4">
          <p className="text-sm text-gray-500">{t.teams.createTeamDesc}</p>

          <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-xl p-3">
            <div>
              <span className="text-gray-500">Group price</span>
              <p className="font-bold text-harvest-600">{t.common.currency}{gb.group_price}/{gb.unit}</p>
            </div>
            <div>
              <span className="text-gray-500">Team minimum</span>
              <p className="font-bold text-gray-900">{gb.team_min_qty ?? 10} {gb.unit}</p>
            </div>
          </div>

          <label className="block text-sm font-medium text-gray-700">
            Your full name
            <input required className={inputCls} value={name} onChange={e => setName(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Email address
            <input type="email" required className={inputCls} value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Your quantity ({gb.unit})
            <input type="number" min={0.5} step={0.5} required className={inputCls} value={qty} onChange={e => setQty(Number(e.target.value))} />
          </label>

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </form>
      )}
    </Modal>
  );
}
