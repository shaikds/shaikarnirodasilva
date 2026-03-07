'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface Supplier {
  id: number;
  name: string;
  description: string;
  location: string;
  rating: number;
  product_count: number;
  image_url: string;
}

interface GroupBuy {
  id: number;
  product_name: string;
  supplier_name: string;
  regular_price: number;
  group_price: number;
  target_qty: number;
  current_qty: number;
  progress_pct: number;
  unit: string;
  image_url: string;
  deadline: string;
}

export default function HomePage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [groupBuys, setGroupBuys] = useState<GroupBuy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Auto-seed on first load
    fetch('/api/seed').catch(console.error);

    Promise.all([
      fetch('/api/suppliers').then(r => r.json()),
      fetch('/api/groups').then(r => r.json()),
    ]).then(([s, g]) => {
      setSuppliers(Array.isArray(s) ? s.slice(0, 3) : []);
      setGroupBuys(Array.isArray(g) ? g.slice(0, 2) : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-harvest-800 via-harvest-700 to-harvest-600 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 text-9xl">🌿</div>
          <div className="absolute top-20 right-20 text-8xl">🍅</div>
          <div className="absolute bottom-10 left-1/3 text-7xl">🌽</div>
          <div className="absolute bottom-20 right-10 text-8xl">🍊</div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="max-w-2xl">
            <div className="badge bg-harvest-500 text-white mb-6">
              🌱 Fresh. Local. Together.
            </div>
            <h1 className="text-5xl lg:text-6xl font-bold leading-tight mb-6">
              Fresh Produce<br />
              <span className="text-harvest-200">From Your Neighbors</span>
            </h1>
            <p className="text-xl text-harvest-100 mb-8 leading-relaxed">
              Connect directly with local farmers, join group buys for the best prices,
              and let our AI assistant handle everything — from finding produce to placing your order.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/shop" className="btn-primary bg-white text-harvest-700 hover:bg-harvest-50">
                Browse Local Produce
              </Link>
              <Link href="/chat" className="btn-secondary bg-transparent border-white text-white hover:bg-harvest-700">
                Chat with Harvest AI
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-white border-b border-gray-100 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { label: 'Local Farmers', value: '4+', icon: '👨‍🌾' },
              { label: 'Fresh Products', value: '11+', icon: '🥕' },
              { label: 'Active Group Buys', value: '3', icon: '🤝' },
              { label: 'Community Savings', value: '30%', icon: '💰' },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center">
                <span className="text-3xl mb-1">{stat.icon}</span>
                <span className="text-2xl font-bold text-harvest-700">{stat.value}</span>
                <span className="text-sm text-gray-500">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-gray-900">How LocalHarvest Works</h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">Three ways to get fresh local produce — all managed automatically by our platform</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: '🤖',
              title: 'AI-Powered Assistant',
              color: 'from-blue-50 to-indigo-50 border-blue-100',
              iconBg: 'bg-blue-100',
              desc: 'Just chat with Harvest AI. Tell it what you want — it searches products, joins group buys, and places orders for you automatically.',
              cta: 'Chat Now',
              href: '/chat',
            },
            {
              icon: '🤝',
              title: 'Group Buying',
              color: 'from-harvest-50 to-emerald-50 border-harvest-100',
              iconBg: 'bg-harvest-100',
              desc: 'Join group buys to unlock wholesale prices. When enough community members join, everyone gets the discount automatically.',
              cta: 'View Group Buys',
              href: '/groups',
            },
            {
              icon: '🛒',
              title: 'Direct Purchase',
              color: 'from-orange-50 to-amber-50 border-orange-100',
              iconBg: 'bg-orange-100',
              desc: 'Browse and buy directly from local farmers at regular prices. Fresh produce, supporting your local economy.',
              cta: 'Shop Now',
              href: '/shop',
            },
          ].map((item) => (
            <div key={item.title} className={`card bg-gradient-to-br ${item.color} border p-8`}>
              <div className={`${item.iconBg} w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-5`}>
                {item.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">{item.desc}</p>
              <Link href={item.href} className="btn-primary text-sm">
                {item.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Active Group Buys */}
      {!loading && groupBuys.length > 0 && (
        <section className="py-16 bg-harvest-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Active Group Buys</h2>
                <p className="text-gray-500 mt-1">Join now to unlock community pricing</p>
              </div>
              <Link href="/groups" className="btn-secondary">View All →</Link>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {groupBuys.map((gb) => (
                <div key={gb.id} className="card bg-white p-6 flex gap-5">
                  <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 relative">
                    <Image
                      src={gb.image_url || 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200'}
                      alt={gb.product_name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 mb-1">{gb.product_name}</h3>
                    <p className="text-sm text-gray-500 mb-3">{gb.supplier_name}</p>
                    <div className="flex items-baseline gap-3 mb-3">
                      <span className="text-xl font-bold text-harvest-600">₪{gb.group_price}/{gb.unit}</span>
                      <span className="text-sm text-gray-400 line-through">₪{gb.regular_price}</span>
                      <span className="badge bg-harvest-100 text-harvest-700">
                        {Math.round((1 - gb.group_price / gb.regular_price) * 100)}% off
                      </span>
                    </div>
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{gb.current_qty}/{gb.target_qty} {gb.unit} pledged</span>
                        <span>{gb.progress_pct}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-harvest-500 rounded-full h-2 transition-all"
                          style={{ width: `${Math.min(100, gb.progress_pct)}%` }}
                        />
                      </div>
                    </div>
                    <Link href={`/groups#gb-${gb.id}`} className="text-sm font-semibold text-harvest-600 hover:text-harvest-700">
                      Join this group buy →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Local Farmers */}
      {!loading && suppliers.length > 0 && (
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Meet Your Local Farmers</h2>
              <p className="text-gray-500 mt-1">Real people, real farms, real food</p>
            </div>
            <Link href="/shop" className="btn-secondary">See All →</Link>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {suppliers.map((s) => (
              <div key={s.id} className="card">
                <div className="h-40 relative">
                  <Image
                    src={s.image_url || 'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=400'}
                    alt={s.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-gray-900">{s.name}</h3>
                    <div className="flex items-center gap-1 text-sm">
                      <span className="text-yellow-500">★</span>
                      <span className="font-medium">{s.rating.toFixed(1)}</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mb-2">📍 {s.location}</p>
                  <p className="text-sm text-gray-600 line-clamp-2">{s.description}</p>
                  <div className="mt-3 text-xs text-harvest-600 font-medium">
                    {s.product_count} products available
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA Banner */}
      <section className="bg-gradient-to-r from-harvest-700 to-harvest-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="text-4xl mb-4">🤖</div>
          <h2 className="text-3xl font-bold mb-4">Let AI Do The Shopping For You</h2>
          <p className="text-harvest-100 text-lg mb-8">
            Just tell Harvest AI what you need — &quot;I want 5kg of tomatoes&quot; or &quot;find me the best deal on citrus&quot;
            — and it handles everything from search to checkout.
          </p>
          <Link href="/chat" className="btn-primary bg-white text-harvest-700 hover:bg-harvest-50 text-lg px-8 py-4">
            Start Chatting →
          </Link>
        </div>
      </section>
    </div>
  );
}
