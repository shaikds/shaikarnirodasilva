'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';

interface GroupBuy {
  id: number;
  product_id: number;
  product_name: string;
  supplier_name: string;
  supplier_location: string;
  regular_price: number;
  group_price: number;
  target_qty: number;
  current_qty: number;
  progress_pct: number;
  unit: string;
  category: string;
  image_url: string;
  deadline: string;
  status: string;
  product_description: string;
}

export default function GroupsPage() {
  const [groupBuys, setGroupBuys] = useState<GroupBuy[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<number | null>(null);
  const [joinModal, setJoinModal] = useState<GroupBuy | null>(null);
  const [joinForm, setJoinForm] = useState({ name: '', email: '', quantity: 1 });
  const [joinResult, setJoinResult] = useState<{ success: boolean; message: string; threshold?: boolean } | null>(null);

  const fetchGroups = () => {
    fetch('/api/groups')
      .then(r => r.json())
      .then(data => {
        setGroupBuys(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchGroups(); }, []);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinModal) return;
    setJoining(joinModal.id);

    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'join',
        group_buy_id: joinModal.id,
        customer_name: joinForm.name,
        customer_email: joinForm.email,
        quantity: joinForm.quantity,
      }),
    });
    const data = await res.json();
    setJoining(null);

    if (data.success) {
      setJoinResult({ success: true, message: data.message, threshold: data.threshold_reached });
      fetchGroups(); // refresh progress
    } else {
      setJoinResult({ success: false, message: data.error || 'Failed to join' });
    }
  }

  function daysLeft(deadline: string) {
    const diff = new Date(deadline).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900">Group Buying Deals</h1>
        <p className="text-gray-500 mt-1">Join your community to unlock wholesale prices from local farmers</p>
      </div>

      {/* How it works */}
      <div className="grid md:grid-cols-4 gap-4 mb-12 p-6 bg-harvest-50 rounded-2xl border border-harvest-100">
        {[
          { step: '1', icon: '👀', text: 'Find a group buy you want to join' },
          { step: '2', icon: '🤝', text: 'Pledge your quantity at the group price' },
          { step: '3', icon: '📊', text: 'Community pledges build up toward the target' },
          { step: '4', icon: '🎉', text: 'Target reached → all orders auto-confirmed!' },
        ].map(s => (
          <div key={s.step} className="flex items-start gap-3">
            <div className="bg-harvest-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
              {s.step}
            </div>
            <div>
              <span className="text-lg">{s.icon}</span>
              <p className="text-sm text-gray-600 mt-1">{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-48 bg-gray-200" />
              <div className="p-5 space-y-3">
                <div className="h-5 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-10 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : groupBuys.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <div className="text-5xl mb-4">🤝</div>
          <p className="text-lg font-medium">No active group buys right now</p>
          <p className="text-sm mt-1">Check back soon for new community deals</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groupBuys.map((gb) => {
            const pct = Math.min(100, gb.progress_pct || 0);
            const days = daysLeft(gb.deadline);
            const discount = Math.round((1 - gb.group_price / gb.regular_price) * 100);

            return (
              <div key={gb.id} id={`gb-${gb.id}`} className="card flex flex-col">
                <div className="h-48 relative">
                  <Image
                    src={gb.image_url || 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400'}
                    alt={gb.product_name}
                    fill
                    className="object-cover"
                  />
                  <div className="absolute top-3 right-3">
                    <span className="badge bg-harvest-600 text-white text-sm font-bold">
                      {discount}% OFF
                    </span>
                  </div>
                  <div className="absolute top-3 left-3">
                    <span className={`badge text-xs ${days <= 2 ? 'bg-red-100 text-red-700' : 'bg-white/90 text-gray-700'}`}>
                      ⏰ {days > 0 ? `${days}d left` : 'Ending soon'}
                    </span>
                  </div>
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{gb.product_name}</h3>
                  <p className="text-sm text-gray-500 mb-3">👨‍🌾 {gb.supplier_name} · {gb.supplier_location}</p>

                  {gb.product_description && (
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{gb.product_description}</p>
                  )}

                  <div className="flex items-baseline gap-3 mb-4">
                    <span className="text-2xl font-bold text-harvest-600">₪{gb.group_price}/{gb.unit}</span>
                    <span className="text-base text-gray-400 line-through">₪{gb.regular_price}</span>
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-gray-700">{gb.current_qty} / {gb.target_qty} {gb.unit}</span>
                      <span className="font-semibold text-harvest-600">{pct}% pledged</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3">
                      <div
                        className={`rounded-full h-3 transition-all ${pct >= 75 ? 'bg-harvest-500' : pct >= 50 ? 'bg-harvest-400' : 'bg-harvest-300'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {gb.target_qty - gb.current_qty > 0
                        ? `${gb.target_qty - gb.current_qty} ${gb.unit} more needed to unlock`
                        : '🎉 Target reached!'}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setJoinModal(gb);
                      setJoinForm({ name: '', email: '', quantity: 1 });
                      setJoinResult(null);
                    }}
                    className="btn-primary w-full mt-auto"
                  >
                    Join This Group Buy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Join Modal */}
      {joinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-xl font-bold">Join Group Buy</h3>
                  <p className="text-sm text-gray-500">{joinModal.product_name}</p>
                </div>
                <button onClick={() => { setJoinModal(null); setJoinResult(null); }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>

              {joinResult ? (
                <div className={`rounded-xl p-5 text-center ${joinResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  <div className="text-3xl mb-2">{joinResult.threshold ? '🎉' : joinResult.success ? '✅' : '❌'}</div>
                  <p className="font-medium">{joinResult.message}</p>
                  {joinResult.success && (
                    <button onClick={() => setJoinModal(null)} className="btn-primary mt-4 text-sm">
                      Done
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleJoin} className="space-y-4">
                  <div className="bg-harvest-50 rounded-xl p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Group Price</span>
                      <span className="font-bold text-harvest-700">₪{joinModal.group_price}/{joinModal.unit}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>Regular price</span>
                      <span className="line-through">₪{joinModal.regular_price}/{joinModal.unit}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                    <input required className="input" placeholder="Full name" value={joinForm.name}
                      onChange={e => setJoinForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input required type="email" className="input" placeholder="your@email.com" value={joinForm.email}
                      onChange={e => setJoinForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity ({joinModal.unit})</label>
                    <input required type="number" min="1" step="0.5" className="input"
                      value={joinForm.quantity}
                      onChange={e => setJoinForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4 flex justify-between items-center">
                    <span className="text-sm text-gray-600">Your total (if confirmed)</span>
                    <span className="text-xl font-bold text-harvest-700">
                      ₪{(joinModal.group_price * joinForm.quantity).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setJoinModal(null)} className="btn-secondary flex-1">Cancel</button>
                    <button type="submit" disabled={joining === joinModal.id} className="btn-primary flex-1">
                      {joining === joinModal.id ? 'Joining...' : 'Join Group Buy'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
