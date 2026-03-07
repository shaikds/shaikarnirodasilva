'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  unit: string;
  stock_qty: number;
  image_url: string;
  description: string;
  supplier_name: string;
  supplier_location: string;
  supplier_rating: number;
}

const CATEGORIES = ['All', 'Vegetables', 'Fruits', 'Herbs'];

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState<number | null>(null);
  const [orderModal, setOrderModal] = useState<Product | null>(null);
  const [orderForm, setOrderForm] = useState({ name: '', email: '', quantity: 1, notes: '' });
  const [orderResult, setOrderResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/products')
      .then(r => r.json())
      .then(data => {
        setProducts(Array.isArray(data) ? data : []);
        setFiltered(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    let result = products;
    if (category !== 'All') result = result.filter(p => p.category === category);
    if (search) result = result.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase()) ||
      p.supplier_name?.toLowerCase().includes(search.toLowerCase())
    );
    setFiltered(result);
  }, [products, category, search]);

  async function handleOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!orderModal) return;
    setOrdering(orderModal.id);

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: orderForm.name,
        customer_email: orderForm.email,
        product_id: orderModal.id,
        quantity: orderForm.quantity,
        notes: orderForm.notes,
      }),
    });
    const data = await res.json();
    setOrdering(null);

    if (data.success) {
      setOrderResult({ success: true, message: data.message });
      // Refresh products to update stock
      fetch('/api/products').then(r => r.json()).then(d => setProducts(Array.isArray(d) ? d : []));
    } else {
      setOrderResult({ success: false, message: data.error || 'Order failed' });
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Fresh Local Produce</h1>
        <p className="text-gray-500 mt-1">Sourced directly from local farmers near you</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-8">
        <input
          type="search"
          placeholder="Search products or farmers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input flex-1 min-w-64"
        />
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                category === cat
                  ? 'bg-harvest-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-harvest-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-48 bg-gray-200" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
                <div className="h-8 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <div className="text-5xl mb-4">🌾</div>
          <p className="text-lg font-medium">No products found</p>
          <p className="text-sm mt-1">Try a different search or category</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filtered.map((product) => (
            <div key={product.id} className="card flex flex-col">
              <div className="h-48 relative">
                <Image
                  src={product.image_url || 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400'}
                  alt={product.name}
                  fill
                  className="object-cover"
                />
                <div className="absolute top-3 left-3">
                  <span className="badge bg-white/90 text-gray-700 shadow-sm">{product.category}</span>
                </div>
              </div>
              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-bold text-gray-900 mb-1">{product.name}</h3>
                <p className="text-xs text-gray-500 mb-2">
                  👨‍🌾 {product.supplier_name} · {product.supplier_location}
                </p>
                <p className="text-xs text-gray-600 mb-3 flex-1 line-clamp-2">{product.description}</p>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xl font-bold text-harvest-600">₪{product.price}/{product.unit}</span>
                  <span className={`text-xs font-medium ${product.stock_qty > 20 ? 'text-green-600' : product.stock_qty > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                    {product.stock_qty > 0 ? `${product.stock_qty} ${product.unit} left` : 'Out of stock'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setOrderModal(product);
                    setOrderForm({ name: '', email: '', quantity: 1, notes: '' });
                    setOrderResult(null);
                  }}
                  disabled={product.stock_qty === 0}
                  className="btn-primary w-full text-sm py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {product.stock_qty > 0 ? 'Order Now' : 'Out of Stock'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Group Buy CTA */}
      <div className="mt-16 p-8 bg-gradient-to-r from-harvest-50 to-emerald-50 rounded-2xl border border-harvest-100 text-center">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Want Better Prices?</h3>
        <p className="text-gray-600 mb-4">Join a group buy and save up to 35% when your community orders together</p>
        <Link href="/groups" className="btn-primary">View Group Buys →</Link>
      </div>

      {/* Order Modal */}
      {orderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-bold">Order {orderModal.name}</h3>
                <button onClick={() => { setOrderModal(null); setOrderResult(null); }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>

              {orderResult ? (
                <div className={`rounded-xl p-5 text-center ${orderResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  <div className="text-3xl mb-2">{orderResult.success ? '✅' : '❌'}</div>
                  <p className="font-medium">{orderResult.message}</p>
                  {orderResult.success && (
                    <button onClick={() => setOrderModal(null)} className="btn-primary mt-4 text-sm">
                      Done
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleOrder} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                    <input required className="input" placeholder="Full name" value={orderForm.name}
                      onChange={e => setOrderForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input required type="email" className="input" placeholder="your@email.com" value={orderForm.email}
                      onChange={e => setOrderForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity ({orderModal.unit}) — max {orderModal.stock_qty}
                    </label>
                    <input required type="number" min="1" max={orderModal.stock_qty} step="0.5" className="input"
                      value={orderForm.quantity}
                      onChange={e => setOrderForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                    <textarea className="input" rows={2} placeholder="Any special requests..." value={orderForm.notes}
                      onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <div className="bg-harvest-50 rounded-xl p-4 flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total</span>
                    <span className="text-xl font-bold text-harvest-700">
                      ₪{(orderModal.price * orderForm.quantity).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setOrderModal(null)} className="btn-secondary flex-1">Cancel</button>
                    <button type="submit" disabled={ordering === orderModal.id} className="btn-primary flex-1">
                      {ordering === orderModal.id ? 'Placing...' : 'Confirm Order'}
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
