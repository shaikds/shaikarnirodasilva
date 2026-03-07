'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/Button';

export default function Navbar() {
  const pathname = usePathname();
  const { t, toggle } = useI18n();

  const NAV_LINKS = [
    { href: '/shop', label: t.nav.shop, icon: '🛒' },
    { href: '/groups', label: t.nav.groups, icon: '🤝' },
    { href: '/subscriptions', label: t.nav.weekly, icon: '🔄' },
    { href: '/supplier', label: t.nav.suppliers, icon: '👨‍🌾' },
    { href: '/chat', label: t.nav.chat, icon: '🤖' },
  ];

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-harvest-700 hover:text-harvest-800 transition-colors shrink-0">
            <span className="text-2xl">🌱</span>
            <span className="hidden sm:inline">{t.nav.logo}</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-1 flex-1 justify-center">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  pathname === link.href
                    ? 'bg-harvest-50 text-harvest-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            ))}
          </div>

          {/* Right side: CTA + lang toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-harvest-200 text-harvest-700 hover:bg-harvest-50 transition-colors"
              title="Switch language"
            >
              {t.nav.langSwitch}
            </button>

            <Link href="/chat" className="hidden md:flex btn-primary text-sm py-2">
              {t.nav.chatCta}
            </Link>
          </div>

          {/* Mobile icon nav */}
          <div className="flex lg:hidden items-center gap-0.5">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`p-2 rounded-xl text-lg transition-all ${
                  pathname === link.href ? 'bg-harvest-50' : 'hover:bg-gray-50'
                }`}
                title={link.label}
              >
                {link.icon}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
