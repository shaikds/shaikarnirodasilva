'use client';
import { useState, useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import { useProducts } from '@/hooks/useProducts';
import { ProductCard } from '@/components/products/ProductCard';
import { OrderModal } from '@/components/products/OrderModal';
import Link from 'next/link';
import type { Product } from '@/types';

type Category = 'all' | 'Vegetables' | 'Fruits' | 'Herbs';

export default function ShopPage() {
  const { t } = useI18n();
  const s = t.shop;
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [orderProduct, setOrderProduct] = useState<Product | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const { products, loading, refetch } = useProducts();

  const filtered = useMemo(() => {
    let list = products;
    if (category !== 'all') list = list.filter(p => p.category === category);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.supplier_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, category, search]);

  const CATS: { key: Category; label: string }[] = [
    { key: 'all', label: s.categories.all },
    { key: 'Vegetables', label: s.categories.vegetables },
    { key: 'Fruits', label: s.categories.fruits },
    { key: 'Herbs', label: s.categories.herbs },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{s.title}</h1>
        <p className="text-gray-500 mt-1">{s.subtitle}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <input
          type="search"
          placeholder={s.searchPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input flex-1"
        />
        <div className="flex gap-2 flex-wrap">
          {CATS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                category === key
                  ? 'bg-harvest-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-harvest-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm font-medium">
          {successMsg}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
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
          <p className="text-lg font-medium">{s.noProducts}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filtered.map(p => (
            <ProductCard
              key={p.id}
              product={p}
              onOrder={setOrderProduct}
            />
          ))}
        </div>
      )}

      {/* Group Buy CTA */}
      <div className="mt-16 p-8 bg-gradient-to-r from-harvest-50 to-emerald-50 rounded-2xl border border-harvest-100 text-center">
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          {t.lang === 'he' ? 'רוצה מחירים טובים יותר?' : 'Want Better Prices?'}
        </h3>
        <p className="text-gray-600 mb-4">
          {t.lang === 'he'
            ? 'הצטרף לרכישה קבוצתית וחסוך עד 35% כשהקהילה שלך מזמינה יחד'
            : 'Join a group buy and save up to 35% when your community orders together'}
        </p>
        <Link href="/groups" className="btn-primary">{t.nav.groups} →</Link>
      </div>

      {/* Order Modal */}
      <OrderModal
        product={orderProduct}
        onClose={() => setOrderProduct(null)}
        onSuccess={() => {
          setSuccessMsg(s.orderSuccess);
          refetch();
          setTimeout(() => setSuccessMsg(''), 5000);
        }}
      />
    </div>
  );
}
