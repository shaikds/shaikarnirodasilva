'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/shop', label: 'Shop', icon: '🛒' },
  { href: '/groups', label: 'Group Buys', icon: '🤝' },
  { href: '/supplier', label: 'For Suppliers', icon: '👨‍🌾' },
  { href: '/chat', label: 'AI Assistant', icon: '🤖' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-harvest-700 hover:text-harvest-800 transition-colors">
            <span className="text-2xl">🌱</span>
            <span>LocalHarvest</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
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

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/chat" className="btn-primary text-sm py-2">
              Chat with Harvest AI
            </Link>
          </div>

          {/* Mobile nav */}
          <div className="flex md:hidden items-center gap-1">
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
