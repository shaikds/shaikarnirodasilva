'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  unit: string;
  stock_qty: number;
  image_url: string;
  supplier_name: string;
}

interface Subscription {
  id: number;
  product_name: string;
  product_id: number;
  quantity: number;
  unit: string;
  current_price: number;
  image_url: string;
  category: string;
  supplier_name: string;
  prefer_group_buy: number;
  next_run: string;
  last_run: string | null;
  notes: string | null;
}

interface RunResult {
  run_at: string;
  total_due: number;
  processed: number;
  failed: number;
  total_savings: number;
  results: Array<{
    product: string;
    customer: string;
    quantity: number;
    order_type: string;
    price_paid: number;
    total: number;
    savings: number;
    message: string;
  }>;
  errors: Array<{ product: string; error: string }>;
}

export default function SubscriptionsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [email, setEmail] = useState('');
  const [checkedEmail, setCheckedEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addResult, setAddResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_name: '', customer_email: '', product_id: 0, quantity: 1,
    prefer_group_buy: true, notes: '',
  });

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(d => setProducts(Array.isArray(d) ? d : []));
  }, []);

  async function lookupSubscriptions(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/subscriptions?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    setSubscriptions(Array.isArray(data) ? data : []);
    setCheckedEmail(email);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, quantity: Number(form.quantity) }),
    });
    const data = await res.json();
    if (data.id) {
      setAddResult('✅ Weekly subscription created! First order will run next Monday.');
      setShowAdd(false);
      if (checkedEmail === form.customer_email) {
        const res2 = await fetch(`/api/subscriptions?email=${encodeURIComponent(checkedEmail)}`);
        const d2 = await res2.json();
        setSubscriptions(Array.isArray(d2) ? d2 : []);
      }
    } else {
      setAddResult('❌ ' + (data.error || 'Error creating subscription'));
    }
  }

  async function cancelSub(id: number) {
    await fetch(`/api/subscriptions?id=${id}`, { method: 'DELETE' });
    setSubscriptions(prev => prev.filter(s => s.id !== id));
  }

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    const res = await fetch('/api/subscriptions/run', { method: 'POST' });
    const data = await res.json();
    setRunResult(data);
    setRunning(false);
    // Refresh subscriptions if looking at someone's
    if (checkedEmail) {
      const res2 = await fetch(`/api/subscriptions?email=${encodeURIComponent(checkedEmail)}`);
      const d2 = await res2.json();
      setSubscriptions(Array.isArray(d2) ? d2 : []);
    }
  }

  const selectedProduct = products.find(p => p.id === form.product_id);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Weekly Auto-Order</h1>
          <p className="text-gray-500 mt-1">Set up your basket once — the AI orders for you every week automatically</p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddResult(null); }} className="btn-primary">
          + New Subscription
        </button>
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-r from-harvest-50 to-emerald-50 rounded-2xl border border-harvest-100 p-6 mb-10">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">🤖</span> How the AI Agent Works Every Monday
        </h2>
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { n: '1', icon: '📋', title: 'Checks your basket', desc: 'Finds all subscriptions due this week' },
            { n: '2', icon: '🔍', title: 'Scans for group buys', desc: 'Checks if your product has an active community deal' },
            { n: '3', icon: '🧠', title: 'AI decides', desc: 'Claude picks group buy (cheaper) or individual order' },
            { n: '4', icon: '✅', title: 'Auto-confirms', desc: 'Order placed, stock reserved, you\'re notified' },
          ].map(s => (
            <div key={s.n} className="flex flex-col items-center text-center">
              <div className="bg-harvest-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mb-2">{s.n}</div>
              <div className="text-2xl mb-1">{s.icon}</div>
              <p className="font-semibold text-sm text-gray-800">{s.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {addResult && (
        <div className={`mb-6 p-4 rounded-xl text-sm ${addResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {addResult}
        </div>
      )}

      {/* Admin: Run the weekly agent now */}
      <div className="card p-5 mb-8 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-gray-900">Test Weekly Run (Admin)</h3>
          <p className="text-sm text-gray-500">Trigger the AI agent to process all due subscriptions right now. In production this runs automatically every Monday at 8:00.</p>
        </div>
        <button onClick={runNow} disabled={running} className="btn-primary whitespace-nowrap">
          {running ? '⏳ Running AI...' : '▶ Run Agent Now'}
        </button>
      </div>

      {/* Run result */}
      {runResult && (
        <div className="card p-6 mb-8 border-harvest-200">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>📊</span> Agent Run Report — {new Date(runResult.run_at).toLocaleString()}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            {[
              { label: 'Due', value: runResult.total_due, color: 'text-gray-700' },
              { label: 'Processed', value: runResult.processed, color: 'text-green-600' },
              { label: 'Failed', value: runResult.failed, color: 'text-red-500' },
              { label: 'Total Savings', value: `₪${runResult.total_savings.toFixed(2)}`, color: 'text-harvest-600' },
            ].map(s => (
              <div key={s.label} className="text-center bg-gray-50 rounded-xl p-3">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {runResult.results.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-gray-700">Orders Placed:</h4>
              {runResult.results.map((r, i) => (
                <div key={i} className="bg-green-50 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{r.product} × {r.quantity}</p>
                    <p className="text-xs text-gray-500">{r.customer}</p>
                    <p className="text-xs text-gray-600 mt-1 italic">{r.message}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-harvest-700">₪{r.total.toFixed(2)}</div>
                    <div className={`text-xs font-medium ${r.order_type === 'group' ? 'text-harvest-600' : 'text-gray-500'}`}>
                      {r.order_type === 'group' ? '🤝 Group buy' : '🛒 Individual'}
                    </div>
                    {r.savings > 0 && (
                      <div className="text-xs text-green-600">Saved ₪{r.savings.toFixed(2)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {runResult.errors.length > 0 && (
            <div className="mt-3 space-y-2">
              <h4 className="font-semibold text-sm text-red-600">Errors:</h4>
              {runResult.errors.map((e, i) => (
                <div key={i} className="bg-red-50 rounded-xl p-3 text-sm text-red-700">
                  <strong>{e.product}:</strong> {e.error}
                </div>
              ))}
            </div>
          )}

          {runResult.total_due === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">No subscriptions were due this week.</p>
          )}
        </div>
      )}

      {/* Subscription lookup */}
      <div className="card p-6 mb-8">
        <h3 className="font-bold text-gray-900 mb-4">Look Up My Subscriptions</h3>
        <form onSubmit={lookupSubscriptions} className="flex gap-3">
          <input
            type="email" required
            className="input flex-1"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Loading...' : 'View My Subs'}
          </button>
        </form>

        {checkedEmail && (
          <div className="mt-5">
            {subscriptions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-3xl mb-2">📭</div>
                <p>No active subscriptions for {checkedEmail}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">{subscriptions.length} active subscription{subscriptions.length !== 1 ? 's' : ''}</p>
                {subscriptions.map(sub => (
                  <div key={sub.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                    <div className="w-14 h-14 rounded-xl overflow-hidden relative flex-shrink-0">
                      <Image src={sub.image_url || 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=100'} alt={sub.product_name} fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{sub.product_name}</p>
                      <p className="text-sm text-gray-500">{sub.quantity} {sub.unit} / week · {sub.supplier_name}</p>
                      <div className="flex gap-3 text-xs mt-1">
                        <span className="text-harvest-600">₪{sub.current_price}/{sub.unit}</span>
                        {sub.prefer_group_buy ? (
                          <span className="text-blue-600">🤝 Prefers group buy</span>
                        ) : (
                          <span className="text-gray-400">🛒 Individual only</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Next order: {new Date(sub.next_run).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                    </div>
                    <button
                      onClick={() => cancelSub(sub.id)}
                      className="text-red-400 hover:text-red-600 text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Subscription Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-xl font-bold">Set Up Weekly Auto-Order</h3>
                  <p className="text-sm text-gray-500">The AI will order this for you every Monday</p>
                </div>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>

              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                  <input required className="input" placeholder="Full name"
                    value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input required type="email" className="input" placeholder="your@email.com"
                    value={form.customer_email} onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Choose Product</label>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                    {products.map(p => (
                      <button
                        key={p.id} type="button"
                        onClick={() => setForm(f => ({ ...f, product_id: p.id }))}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                          form.product_id === p.id ? 'border-harvest-500 bg-harvest-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden relative flex-shrink-0">
                          <Image src={p.image_url || 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=80'} alt={p.name} fill className="object-cover" />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-500">₪{p.price}/{p.unit} · {p.supplier_name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Weekly Quantity {selectedProduct ? `(${selectedProduct.unit})` : ''}
                  </label>
                  <input required type="number" min="0.5" step="0.5" className="input"
                    value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
                </div>
                <div className="flex items-center gap-3 p-4 bg-harvest-50 rounded-xl">
                  <input type="checkbox" id="prefer_gb" className="w-4 h-4 accent-harvest-600"
                    checked={form.prefer_group_buy}
                    onChange={e => setForm(f => ({ ...f, prefer_group_buy: e.target.checked }))} />
                  <label htmlFor="prefer_gb" className="text-sm text-gray-700 cursor-pointer">
                    <strong className="text-harvest-700">🤝 Prefer group buy</strong> — AI joins community deals when available for cheaper prices
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <input className="input" placeholder="e.g. No damaged fruit please"
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                {selectedProduct && (
                  <div className="bg-gray-50 rounded-xl p-4 text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-500">Est. weekly cost</span>
                      <span className="font-bold text-harvest-700">₪{(selectedProduct.price * form.quantity).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Est. monthly cost</span>
                      <span className="font-medium text-gray-700">₪{(selectedProduct.price * form.quantity * 4).toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">* Group buy prices may be lower when community threshold is reached</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" disabled={!form.product_id} className="btn-primary flex-1 disabled:opacity-40">
                    Create Weekly Order
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
