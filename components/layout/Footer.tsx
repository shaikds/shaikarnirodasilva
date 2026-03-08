'use client';
import { useI18n } from '@/lib/i18n';

export function Footer() {
  const { t } = useI18n();
  const { footer: f } = t;

  return (
    <footer className="bg-harvest-900 text-harvest-100 py-12 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div>
            <div className="text-2xl font-bold text-white mb-2">{t.nav.logo}</div>
            <p className="text-harvest-300 text-sm">{f.tagline}</p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-3">{f.platform}</h4>
            <ul className="space-y-2 text-sm text-harvest-300">
              <li><a href="/shop" className="hover:text-white transition-colors">{f.links.shop}</a></li>
              <li><a href="/groups" className="hover:text-white transition-colors">{f.links.groups}</a></li>
              <li><a href="/subscriptions" className="hover:text-white transition-colors">{f.links.weekly}</a></li>
              <li><a href="/supplier" className="hover:text-white transition-colors">{f.links.suppliers}</a></li>
              <li><a href="/chat" className="hover:text-white transition-colors">{f.links.chat}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-3">{f.howItWorks}</h4>
            <ul className="space-y-2 text-sm text-harvest-300">
              {f.steps.map((step, i) => <li key={i}>{step}</li>)}
            </ul>
          </div>
        </div>

        <div className="border-t border-harvest-800 mt-8 pt-8 text-center text-sm text-harvest-400">
          {f.copyright}
        </div>
      </div>
    </footer>
  );
}
