'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useI18n } from '@/lib/i18n';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { Product, Subscription } from '@/types';

interface RunResult {
  run_at: string;
  total_due: number;
  processed: number;
  failed: number;
  total_savings: number;
  results: Array<{
    product: string; customer: string; quantity: number;
    order_type: string; price_paid: number; total: number;
    savings: number; message: string;
  }>;
  errors: Array<{ product: string; error: string }>;
}

export default function SubscriptionsPage() {
  const { t } = useI18n();
  const s = t.subscriptions;

  const [products, setProducts] = useState<Product[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [email, setEmail] = useState('');
  const [checkedEmail, setCheckedEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addResult, setAddResult] = useState('');
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
    setSubscriptions(Array.isArray(await res.json()) ? await res.json() : []);
    // Re-fetch to avoid consuming body twice
    const res2 = await fetch(`/api/subscriptions?email=${encodeURIComponent(email)}`);
    const data = await res2.json();
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
      setAddResult('✅ ' + (t.lang === 'he' ? 'מנוי שבועי נוצר! ההזמנה הראשונה תרוץ יום שני הבא.' : 'Weekly subscription created! First order runs next Monday.'));
      setShowAdd(false);
      if (checkedEmail === form.customer_email) {
        const r2 = await fetch(`/api/subscriptions?email=${encodeURIComponent(checkedEmail)}`);
        setSubscriptions(await r2.json());
      }
    } else {
      setAddResult('❌ ' + (data.error || t.common.error));
    }
  }

  async function cancelSub(id: number) {
    await fetch(`/api/subscriptions?id=${id}`, { method: 'DELETE' });
    setSubscriptions(prev => prev.filter(sub => sub.id !== id));
  }

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    const res = await fetch('/api/subscriptions/run', { method: 'POST' });
    setRunResult(await res.json());
    setRunning(false);
    if (checkedEmail) {
      const r2 = await fetch(`/api/subscriptions?email=${encodeURIComponent(checkedEmail)}`);
      setSubscriptions(await r2.json());
    }
  }

  const selectedProduct = products.find(p => p.id === form.product_id);

  const HOW_STEPS = t.lang === 'he'
    ? [
        { n: '1', icon: '📋', title: 'בודק את הסל שלך', desc: 'מוצא את כל המנויים לשבוע זה' },
        { n: '2', icon: '🔍', title: 'סורק רכישות קבוצתיות', desc: 'בודק אם יש עסקה קהילתית למוצר שלך' },
        { n: '3', icon: '🧠', title: 'AI מחליט', desc: 'Claude בוחר קבוצתי (זול יותר) או הזמנה רגילה' },
        { n: '4', icon: '✅', title: 'אישור אוטומטי', desc: 'הזמנה בוצעה, מלאי שמור' },
      ]
    : [
        { n: '1', icon: '📋', title: 'Checks your basket', desc: 'Finds all subscriptions due this week' },
        { n: '2', icon: '🔍', title: 'Scans for group buys', desc: 'Checks if your product has an active community deal' },
        { n: '3', icon: '🧠', title: 'AI decides', desc: "Claude picks group buy (cheaper) or individual order" },
        { n: '4', icon: '✅', title: 'Auto-confirms', desc: "Order placed, stock reserved" },
      ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{s.title}</h1>
          <p className="text-gray-500 mt-1">{s.subtitle}</p>
        </div>
        <Button onClick={() => { setShowAdd(true); setAddResult(''); }}>
          + {s.addBtn}
        </Button>
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-r from-harvest-50 to-emerald-50 rounded-2xl border border-harvest-100 p-5 mb-10">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          {t.lang === 'he' ? 'איך סוכן ה-AI עובד כל שני' : 'How the AI Agent Works Every Monday'}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {HOW_STEPS.map(step => (
            <div key={step.n} className="flex flex-col items-center text-center">
              <div className="bg-harvest-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mb-2">{step.n}</div>
              <div className="text-2xl mb-1">{step.icon}</div>
              <p className="font-semibold text-sm text-gray-800">{step.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {addResult && (
        <div className={`mb-6 p-4 rounded-xl text-sm ${addResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {addResult}
        </div>
      )}

      {/* Admin: run now */}
      <div className="card p-5 mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-gray-900">{s.adminTitle}</h3>
          <p className="text-sm text-gray-500">{s.adminDesc}</p>
        </div>
        <Button onClick={runNow} disabled={running}>
          {running ? t.common.loading : `▶ ${s.runBtn}`}
        </Button>
      </div>

      {/* Run result */}
      {runResult && (
        <div className="card p-6 mb-8">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>📊</span> {s.runLog} — {new Date(runResult.run_at).toLocaleString()}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            {[
              { label: t.lang === 'he' ? 'בתור' : 'Due', value: runResult.total_due, color: 'text-gray-700' },
              { label: t.lang === 'he' ? 'עובדו' : 'Processed', value: runResult.processed, color: 'text-green-600' },
              { label: t.lang === 'he' ? 'נכשלו' : 'Failed', value: runResult.failed, color: 'text-red-500' },
              { label: t.lang === 'he' ? 'חיסכון כולל' : 'Total Savings', value: `₪${runResult.total_savings.toFixed(2)}`, color: 'text-harvest-600' },
            ].map(stat => (
              <div key={stat.label} className="text-center bg-gray-50 rounded-xl p-3">
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
          {runResult.results.map((r, i) => (
            <div key={i} className="bg-green-50 rounded-xl p-4 flex items-center justify-between gap-3 mb-2">
              <div>
                <p className="font-medium text-gray-900 text-sm">{r.product} × {r.quantity}</p>
                <p className="text-xs text-gray-500">{r.customer}</p>
                <p className="text-xs text-gray-600 mt-1 italic">{r.message}</p>
              </div>
              <div className="text-end shrink-0">
                <div className="font-bold text-harvest-700">₪{r.total.toFixed(2)}</div>
                <div className={`text-xs font-medium ${r.order_type === 'group' ? 'text-harvest-600' : 'text-gray-500'}`}>
                  {r.order_type === 'group' ? '🤝' : '🛒'} {r.order_type}
                </div>
                {r.savings > 0 && <div className="text-xs text-green-600">₪{r.savings.toFixed(2)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Email lookup */}
      <div className="card p-6 mb-8">
        <h3 className="font-bold text-gray-900 mb-4">{s.emailLabel}</h3>
        <form onSubmit={lookupSubscriptions} className="flex gap-3 flex-wrap">
          <input
            type="email" required className="input flex-1 min-w-48"
            placeholder="your@email.com"
            value={email} onChange={e => setEmail(e.target.value)}
          />
          <Button type="submit" disabled={loading}>{loading ? t.common.loading : s.emailBtn}</Button>
        </form>

        {checkedEmail && (
          <div className="mt-5">
            {subscriptions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-3xl mb-2">📭</div>
                <p>{s.noSubs}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {subscriptions.map(sub => (
                  <div key={sub.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl flex-wrap sm:flex-nowrap">
                    <div className="w-14 h-14 rounded-xl overflow-hidden relative shrink-0">
                      <Image src={sub.image_url || 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=100'} alt={sub.product_name} fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{sub.product_name}</p>
                      <p className="text-sm text-gray-500">{sub.quantity} {sub.unit} / {t.lang === 'he' ? 'שבוע' : 'week'} · {sub.supplier_name}</p>
                      <div className="flex gap-3 text-xs mt-1">
                        <span className="text-harvest-600">{t.common.currency}{sub.current_price}/{sub.unit}</span>
                        {sub.prefer_group_buy ? (
                          <span className="text-blue-600">🤝 {s.preferGroup}</span>
                        ) : (
                          <span className="text-gray-400">🛒</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s.nextRun}: {new Date(sub.next_run).toLocaleDateString(t.lang === 'he' ? 'he-IL' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                    </div>
                    <button onClick={() => cancelSub(sub.id)} className="text-red-400 hover:text-red-600 text-sm font-medium shrink-0">
                      {s.cancel}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Subscription Modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title={s.addTitle}
        maxWidth="max-w-lg"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>{s.cancel}</Button>
            <Button form="sub-form" type="submit" disabled={!form.product_id}>{s.submit}</Button>
          </div>
        }
      >
        <form id="sub-form" onSubmit={handleAdd} className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            {s.nameLabel}
            <input required className="input mt-1" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {s.emailLabel2}
            <input required type="email" className="input mt-1" value={form.customer_email} onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))} />
          </label>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">{s.productLabel}</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {products.map(p => (
                <button key={p.id} type="button"
                  onClick={() => setForm(f => ({ ...f, product_id: p.id }))}
                  className={`flex items-center gap-3 p-3 rounded-xl border w-full text-start transition-all ${form.product_id === p.id ? 'border-harvest-500 bg-harvest-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden relative shrink-0">
                    <Image src={p.image_url || 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=80'} alt={p.name} fill className="object-cover" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500">{t.common.currency}{p.price}/{p.unit} · {p.supplier_name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm font-medium text-gray-700">
            {s.qtyLabel} {selectedProduct ? `(${selectedProduct.unit})` : ''}
            <input required type="number" min="0.5" step="0.5" className="input mt-1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
          </label>

          <div className="flex items-center gap-3 p-4 bg-harvest-50 rounded-xl">
            <input type="checkbox" id="prefer_gb" className="w-4 h-4 accent-harvest-600"
              checked={form.prefer_group_buy} onChange={e => setForm(f => ({ ...f, prefer_group_buy: e.target.checked }))} />
            <label htmlFor="prefer_gb" className="text-sm text-gray-700 cursor-pointer">
              <strong className="text-harvest-700">🤝 {s.preferGroup}</strong>
            </label>
          </div>

          <label className="block text-sm font-medium text-gray-700">
            {s.notesLabel}
            <input className="input mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </label>

          {selectedProduct && (
            <div className="bg-gray-50 rounded-xl p-4 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">{t.lang === 'he' ? 'עלות שבועית משוערת' : 'Est. weekly cost'}</span>
                <span className="font-bold text-harvest-700">{t.common.currency}{(selectedProduct.price * form.quantity).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t.lang === 'he' ? 'עלות חודשית משוערת' : 'Est. monthly cost'}</span>
                <span className="font-medium text-gray-700">{t.common.currency}{(selectedProduct.price * form.quantity * 4).toFixed(2)}</span>
              </div>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
