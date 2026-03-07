'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useI18n } from '@/lib/i18n';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import type { Supplier, GroupBuy } from '@/types';

export default function HomePage() {
  const { t } = useI18n();
  const h = t.home;
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [groupBuys, setGroupBuys] = useState<GroupBuy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/seed').catch(console.error);
    Promise.all([
      fetch('/api/suppliers').then(r => r.json()),
      fetch('/api/groups').then(r => r.json()),
    ]).then(([s, g]) => {
      setSuppliers(Array.isArray(s) ? s.slice(0, 3) : []);
      setGroupBuys(Array.isArray(g) ? g.slice(0, 2) : []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-harvest-800 via-harvest-700 to-harvest-600 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" aria-hidden>
          <div className="absolute top-10 start-10 text-9xl">🌿</div>
          <div className="absolute top-20 end-20 text-8xl">🍅</div>
          <div className="absolute bottom-10 start-1/3 text-7xl">🌽</div>
          <div className="absolute bottom-20 end-10 text-8xl">🍊</div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="max-w-2xl">
            <div className="badge bg-harvest-500 text-white mb-6">{h.badge}</div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              {h.heroTitle1}<br />
              <span className="text-harvest-200">{h.heroTitle2}</span>
            </h1>
            <p className="text-lg sm:text-xl text-harvest-100 mb-8 leading-relaxed">{h.heroDesc}</p>
            <div className="flex flex-wrap gap-4">
              <Link href="/shop" className="btn-primary bg-white text-harvest-700 hover:bg-harvest-50">
                {h.browseBtn}
              </Link>
              <Link href="/chat" className="btn-secondary bg-transparent border-white text-white hover:bg-harvest-700">
                {h.chatBtn}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white border-b border-gray-100 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { label: h.stats.farmers, value: '4+', icon: '👨‍🌾' },
              { label: h.stats.products, value: '11+', icon: '🥕' },
              { label: h.stats.groupBuys, value: '3', icon: '🤝' },
              { label: h.stats.savings, value: '30%', icon: '💰' },
            ].map(s => (
              <div key={s.label} className="flex flex-col items-center">
                <span className="text-3xl mb-1">{s.icon}</span>
                <span className="text-2xl font-bold text-harvest-700">{s.value}</span>
                <span className="text-sm text-gray-500">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-gray-900">{h.howTitle}</h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">{h.howSubtitle}</p>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-8">
          {h.how.map((item, i) => {
            const colors = [
              'from-blue-50 to-indigo-50 border-blue-100 bg-blue-100',
              'from-harvest-50 to-emerald-50 border-harvest-100 bg-harvest-100',
              'from-orange-50 to-amber-50 border-orange-100 bg-orange-100',
            ];
            const [bg, iconBg] = [colors[i].split(' ').slice(0, 3).join(' '), colors[i].split(' ')[3]];
            return (
              <div key={item.title} className={`card bg-gradient-to-br ${bg} border p-8`}>
                <div className={`${iconBg} w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-5`}>
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600 mb-6 leading-relaxed">{item.desc}</p>
                <Link href={item.href} className="btn-primary text-sm">{item.cta} →</Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Active Group Buys */}
      {!loading && groupBuys.length > 0 && (
        <section className="py-16 bg-harvest-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-10 flex-wrap gap-4">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">{h.activeGroupBuysTitle}</h2>
                <p className="text-gray-500 mt-1">{h.activeGroupBuysSub}</p>
              </div>
              <Link href="/groups" className="btn-secondary">{h.viewAll}</Link>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              {groupBuys.map(gb => (
                <div key={gb.id} className="card bg-white p-5 flex gap-4">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden flex-shrink-0 relative">
                    <Image
                      src={gb.image_url || 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200'}
                      alt={gb.product_name}
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 mb-1 truncate">{gb.product_name}</h3>
                    <p className="text-sm text-gray-500 mb-2">{gb.supplier_name}</p>
                    <div className="flex items-baseline gap-2 mb-3 flex-wrap">
                      <span className="text-lg font-bold text-harvest-600">{t.common.currency}{gb.group_price}/{gb.unit}</span>
                      <span className="text-sm text-gray-400 line-through">{t.common.currency}{gb.regular_price}</span>
                      <Badge variant="green">
                        {Math.round((1 - gb.group_price / gb.regular_price) * 100)}{t.common.off}
                      </Badge>
                    </div>
                    <ProgressBar
                      value={gb.progress_pct}
                      label={`${gb.current_qty}/${gb.target_qty} ${gb.unit} ${h.pledged}`}
                      labelRight={`${gb.progress_pct}%`}
                    />
                    <Link href={`/groups#gb-${gb.id}`} className="text-sm font-semibold text-harvest-600 hover:text-harvest-700 mt-2 inline-block">
                      {h.joinLink}
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
          <div className="flex items-center justify-between mb-10 flex-wrap gap-4">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">{h.farmersTitle}</h2>
              <p className="text-gray-500 mt-1">{h.farmersSub}</p>
            </div>
            <Link href="/shop" className="btn-secondary">{h.seeAll}</Link>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {suppliers.map(s => (
              <div key={s.id} className="card">
                <div className="h-36 sm:h-40 relative">
                  <Image
                    src={s.image_url || 'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=400'}
                    alt={s.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <h3 className="font-bold text-gray-900 leading-snug">{s.name}</h3>
                    <div className="flex items-center gap-1 text-sm shrink-0">
                      <span className="text-yellow-500">★</span>
                      <span className="font-medium">{s.rating.toFixed(1)}</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mb-1">📍 {s.location}</p>
                  <p className="text-sm text-gray-600 line-clamp-2">{s.description}</p>
                  <div className="mt-3 text-xs text-harvest-600 font-medium">
                    {s.product_count} {h.productsAvailable}
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
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">{h.ctaTitle}</h2>
          <p className="text-harvest-100 text-base sm:text-lg mb-8">{h.ctaDesc}</p>
          <Link href="/chat" className="btn-primary bg-white text-harvest-700 hover:bg-harvest-50 text-lg px-8 py-4">
            {h.ctaBtn}
          </Link>
        </div>
      </section>
    </div>
  );
}
