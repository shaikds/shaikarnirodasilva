import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'LocalHarvest — Fresh From Your Local Farmers',
  description: 'Connect directly with local farmers, join group buys for discounts, and get the freshest produce delivered to your community.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="min-h-screen">
          {children}
        </main>
        <footer className="bg-harvest-900 text-harvest-100 py-12 mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <div className="text-2xl font-bold text-white mb-2">🌱 LocalHarvest</div>
                <p className="text-harvest-300 text-sm">Connecting communities with local farmers for fresher food and stronger local economies.</p>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-3">Platform</h4>
                <ul className="space-y-2 text-sm text-harvest-300">
                  <li><a href="/shop" className="hover:text-white transition-colors">Browse Products</a></li>
                  <li><a href="/groups" className="hover:text-white transition-colors">Group Buying</a></li>
                  <li><a href="/supplier" className="hover:text-white transition-colors">For Suppliers</a></li>
                  <li><a href="/chat" className="hover:text-white transition-colors">AI Assistant</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-3">How It Works</h4>
                <ul className="space-y-2 text-sm text-harvest-300">
                  <li>Local farmers list their produce</li>
                  <li>Community joins group buys</li>
                  <li>AI agent handles everything</li>
                  <li>Everyone saves & earns more</li>
                </ul>
              </div>
            </div>
            <div className="border-t border-harvest-800 mt-8 pt-8 text-center text-sm text-harvest-400">
              © 2024 LocalHarvest. Built with love for local communities.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
