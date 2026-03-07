'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';

interface Supplier {
  id: number;
  name: string;
  description: string;
  location: string;
  phone: string;
  email: string;
  rating: number;
  product_count: number;
  image_url: string;
}

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  unit: string;
  stock_qty: number;
  image_url: string;
}

export default function SupplierPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [addResult, setAddResult] = useState<string | null>(null);

  const [supplierForm, setSupplierForm] = useState({
    name: '', description: '', location: '', phone: '', email: '', image_url: '',
  });
  const [productForm, setProductForm] = useState({
    supplier_id: 0, name: '', category: 'Vegetables', price: '', unit: 'kg', stock_qty: '', description: '', image_url: '',
  });

  useEffect(() => {
    fetch('/api/suppliers')
      .then(r => r.json())
      .then(data => { setSuppliers(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function selectSupplier(s: Supplier) {
    setSelectedSupplier(s);
    fetch(`/api/products?category=`)
      .then(r => r.json())
      .then(data => setProducts(Array.isArray(data) ? data.filter((p: Product & { supplier_id: number }) => p.supplier_id === s.id) : []));
  }

  async function handleAddSupplier(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supplierForm),
    });
    const data = await res.json();
    if (data.id) {
      setAddResult('Supplier registered successfully!');
      setShowAddSupplier(false);
      // Refresh
      fetch('/api/suppliers').then(r => r.json()).then(d => setSuppliers(Array.isArray(d) ? d : []));
    } else {
      setAddResult('Error: ' + (data.error || 'Failed'));
    }
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...productForm, price: Number(productForm.price), stock_qty: Number(productForm.stock_qty) }),
    });
    const data = await res.json();
    if (data.id) {
      setAddResult('Product added successfully!');
      setShowAddProduct(false);
      if (selectedSupplier) selectSupplier(selectedSupplier);
    } else {
      setAddResult('Error: ' + (data.error || 'Failed'));
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Supplier Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage your farm listings and products</p>
        </div>
        <button onClick={() => { setShowAddSupplier(true); setAddResult(null); }} className="btn-primary">
          + Register as Supplier
        </button>
      </div>

      {addResult && (
        <div className={`mb-6 p-4 rounded-xl ${addResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {addResult}
        </div>
      )}

      {/* Benefits banner */}
      <div className="grid md:grid-cols-4 gap-4 mb-10">
        {[
          { icon: '🤖', title: 'AI Handles Sales', desc: 'Our AI agent takes orders for you 24/7' },
          { icon: '👥', title: 'Group Buying', desc: 'Sell in bulk via community group orders' },
          { icon: '📊', title: 'Dashboard', desc: 'Track inventory and orders in real-time' },
          { icon: '💰', title: 'More Revenue', desc: 'Reach customers you never had before' },
        ].map(b => (
          <div key={b.title} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-2xl mb-2">{b.icon}</div>
            <h4 className="font-semibold text-gray-900 text-sm">{b.title}</h4>
            <p className="text-xs text-gray-500 mt-1">{b.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Suppliers list */}
        <div className="lg:col-span-1">
          <h2 className="font-bold text-gray-900 mb-4">Registered Suppliers</h2>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="card p-4 animate-pulse">
                  <div className="flex gap-3">
                    <div className="w-12 h-12 bg-gray-200 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {suppliers.map(s => (
                <button
                  key={s.id}
                  onClick={() => selectSupplier(s)}
                  className={`w-full text-left card p-4 transition-all ${selectedSupplier?.id === s.id ? 'ring-2 ring-harvest-500' : ''}`}
                >
                  <div className="flex gap-3 items-center">
                    <div className="w-12 h-12 rounded-xl overflow-hidden relative flex-shrink-0">
                      <Image src={s.image_url || 'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=100'} alt={s.name} fill className="object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{s.name}</p>
                      <p className="text-xs text-gray-500">📍 {s.location}</p>
                      <p className="text-xs text-harvest-600 mt-0.5">{s.product_count} products</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Supplier detail / products */}
        <div className="lg:col-span-2">
          {selectedSupplier ? (
            <div>
              <div className="card p-6 mb-6">
                <div className="flex items-start gap-5">
                  <div className="w-20 h-20 rounded-xl overflow-hidden relative flex-shrink-0">
                    <Image src={selectedSupplier.image_url || 'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=100'} alt={selectedSupplier.name} fill className="object-cover" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-900">{selectedSupplier.name}</h2>
                    <p className="text-sm text-gray-500 mb-2">📍 {selectedSupplier.location}</p>
                    <p className="text-sm text-gray-600">{selectedSupplier.description}</p>
                    <div className="flex gap-4 mt-3 text-sm">
                      {selectedSupplier.phone && <span className="text-gray-500">📞 {selectedSupplier.phone}</span>}
                      {selectedSupplier.email && <span className="text-gray-500">✉️ {selectedSupplier.email}</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">Products ({products.length})</h3>
                <button
                  onClick={() => {
                    setProductForm(f => ({ ...f, supplier_id: selectedSupplier.id }));
                    setShowAddProduct(true);
                    setAddResult(null);
                  }}
                  className="btn-primary text-sm"
                >
                  + Add Product
                </button>
              </div>

              {products.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl">
                  <div className="text-4xl mb-3">🥕</div>
                  <p>No products yet. Add your first product!</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {products.map(p => (
                    <div key={p.id} className="card p-4 flex gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden relative flex-shrink-0">
                        <Image src={p.image_url || 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=100'} alt={p.name} fill className="object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.category}</p>
                        <p className="text-sm font-bold text-harvest-600 mt-1">₪{p.price}/{p.unit}</p>
                        <p className={`text-xs mt-0.5 ${p.stock_qty > 10 ? 'text-green-600' : 'text-orange-500'}`}>
                          Stock: {p.stock_qty} {p.unit}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
              <div className="text-5xl mb-3">👈</div>
              <p className="font-medium">Select a supplier to view details</p>
              <p className="text-sm mt-1">or register as a new supplier</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Supplier Modal */}
      {showAddSupplier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-bold">Register as Supplier</h3>
                <button onClick={() => setShowAddSupplier(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
              <form onSubmit={handleAddSupplier} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Farm / Business Name *</label>
                  <input required className="input" placeholder="e.g. Yossi's Organic Farm" value={supplierForm.name}
                    onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                  <input required className="input" placeholder="e.g. Kibbutz Ein Hamifratz" value={supplierForm.location}
                    onChange={e => setSupplierForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea className="input" rows={3} placeholder="Tell customers about your farm..." value={supplierForm.description}
                    onChange={e => setSupplierForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input className="input" placeholder="052-..." value={supplierForm.phone}
                      onChange={e => setSupplierForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" className="input" placeholder="farm@email.com" value={supplierForm.email}
                      onChange={e => setSupplierForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowAddSupplier(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" className="btn-primary flex-1">Register</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-bold">Add New Product</h3>
                <button onClick={() => setShowAddProduct(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
              <form onSubmit={handleAddProduct} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                  <input required className="input" placeholder="e.g. Cherry Tomatoes" value={productForm.name}
                    onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                    <select required className="input" value={productForm.category}
                      onChange={e => setProductForm(f => ({ ...f, category: e.target.value }))}>
                      <option>Vegetables</option>
                      <option>Fruits</option>
                      <option>Herbs</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                    <select required className="input" value={productForm.unit}
                      onChange={e => setProductForm(f => ({ ...f, unit: e.target.value }))}>
                      <option>kg</option>
                      <option>bunch</option>
                      <option>box</option>
                      <option>piece</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price (₪) *</label>
                    <input required type="number" step="0.5" min="0" className="input" placeholder="0.00" value={productForm.price}
                      onChange={e => setProductForm(f => ({ ...f, price: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stock Quantity *</label>
                    <input required type="number" min="0" className="input" placeholder="100" value={productForm.stock_qty}
                      onChange={e => setProductForm(f => ({ ...f, stock_qty: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea className="input" rows={2} placeholder="Describe your product..." value={productForm.description}
                    onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowAddProduct(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" className="btn-primary flex-1">Add Product</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
