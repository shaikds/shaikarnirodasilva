'use client';
import { useEffect, useState, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import type { BuyingTeam } from '@/types';

interface TeamPageData extends BuyingTeam {
  members_count: number;
  cutoff_day_name: string;
  next_cutoff_date: string;
  group_buy_status?: string;
}

export default function TeamInvitePage({ params }: { params: Promise<{ invite_code: string }> }) {
  const { invite_code } = use(params);
  const [team, setTeam] = useState<TeamPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Join form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [qty, setQty] = useState(1);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/teams?invite_code=${invite_code}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setNotFound(true); } else { setTeam(data); }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [invite_code]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    setJoinError('');
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', invite_code, customer_name: name, customer_email: email, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join');
      setJoinSuccess(data.message);
      // Re-fetch updated team state
      const updated = await fetch(`/api/teams?invite_code=${invite_code}`).then(r => r.json());
      if (!updated.error) setTeam(updated);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Error joining team');
    } finally {
      setJoining(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center text-gray-400">
        Loading team...
      </div>
    );
  }

  if (notFound || !team) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500 text-lg mb-4">Team not found.</p>
        <Link href="/groups" className="btn-primary">Browse Group Buys</Link>
      </div>
    );
  }

  const teamMinQty = team.team_min_qty ?? 10;
  const progressPct = Math.min(100, Math.round((team.current_qty / teamMinQty) * 100));
  const remaining = Math.max(0, teamMinQty - team.current_qty);
  const savePct = team.regular_price && team.group_price
    ? Math.round((1 - team.group_price / team.regular_price) * 100)
    : 0;

  const isCompleted = team.status === 'completed';
  const isExpired = team.status === 'expired';

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      {/* Product card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="relative h-48">
          <Image
            src={team.image_url || 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=600'}
            alt={team.product_name || 'Product'}
            fill
            className="object-cover"
          />
          {savePct > 0 && (
            <div className="absolute top-3 start-3">
              <Badge variant="orange">Save {savePct}%</Badge>
            </div>
          )}
          {isCompleted && (
            <div className="absolute inset-0 bg-green-900/60 flex items-center justify-center">
              <span className="text-white text-xl font-bold">Team Complete!</span>
            </div>
          )}
        </div>

        <div className="p-5">
          <h1 className="text-xl font-bold text-gray-900">{team.product_name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{team.supplier_name}{team.city ? ` · ${team.city}` : ''}</p>

          <div className="flex items-baseline gap-3 mt-3">
            <span className="text-2xl font-bold text-harvest-600">
              ₪{team.group_price}/{team.unit}
            </span>
            {team.regular_price && (
              <span className="text-sm text-gray-400 line-through">₪{team.regular_price}</span>
            )}
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Team progress</span>
              <span>{team.current_qty}/{teamMinQty} {team.unit}</span>
            </div>
            <ProgressBar
              value={progressPct}
              label={`${team.members_count} member${team.members_count !== 1 ? 's' : ''} joined`}
              labelRight={`${progressPct}%`}
            />
            {!isCompleted && remaining > 0 && (
              <p className="text-xs text-amber-600 mt-1 font-medium">
                {remaining} {team.unit} more needed to unlock the group price
              </p>
            )}
          </div>

          <div className="mt-4 p-3 bg-harvest-50 rounded-xl text-sm">
            <span className="font-semibold text-harvest-700">Confirmed by: </span>
            <span className="text-harvest-800">{team.cutoff_day_name}s</span>
            {team.next_cutoff_date && (
              <span className="text-harvest-600 text-xs ms-1">(next: {team.next_cutoff_date})</span>
            )}
            <p className="text-xs text-harvest-600 mt-1">
              If the team reaches the minimum by this day each week, all orders are confirmed at the group price.
            </p>
          </div>
        </div>
      </div>

      {/* Status banners */}
      {isCompleted && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-800 text-sm font-medium mb-6">
          This team has completed its purchase. All members are confirmed at the group price.
        </div>
      )}
      {isExpired && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-6">
          This team has expired. <Link href="/groups" className="underline font-medium">Browse other group buys</Link>
        </div>
      )}
      {joinSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-800 text-sm font-medium mb-6">
          {joinSuccess}
        </div>
      )}

      {/* Join form */}
      {!isCompleted && !isExpired && !joinSuccess && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Join this Team</h2>
          <form onSubmit={handleJoin} className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Your full name
              <input required className="input mt-1" value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Email address
              <input type="email" required className="input mt-1" value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Quantity ({team.unit})
              <input type="number" required min={0.5} step={0.5} className="input mt-1" value={qty} onChange={e => setQty(Number(e.target.value))} />
            </label>

            <div className="flex justify-between text-sm bg-gray-50 rounded-xl p-3">
              <span className="text-gray-500">Total at group price</span>
              <span className="font-bold text-harvest-700">₪{(qty * (team.group_price ?? 0)).toFixed(2)}</span>
            </div>

            {joinError && <p className="text-red-600 text-sm">{joinError}</p>}

            <button type="submit" disabled={joining} className="btn-primary w-full disabled:opacity-40">
              {joining ? 'Joining...' : 'Join Team'}
            </button>
          </form>
        </div>
      )}

      {/* Share section */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Invite more people</h3>
        <p className="text-sm text-gray-500 mb-3">Share this link with friends and neighbors in your city.</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={typeof window !== 'undefined' ? window.location.href : ''}
            className="input flex-1 text-xs bg-gray-50"
            onFocus={e => e.target.select()}
          />
          <button onClick={copyLink} className="btn-secondary text-sm px-4">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link href="/groups" className="text-sm text-harvest-600 hover:text-harvest-700">
          Browse all group buys
        </Link>
      </div>
    </div>
  );
}
