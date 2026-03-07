import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import { Footer } from '@/components/layout/Footer';
import { I18nProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'LocalHarvest — טרי מהחקלאים המקומיים שלך',
  description: 'התחברו ישירות לחקלאים מקומיים, הצטרפו לרכישות קבוצתיות לקבלת הנחות, וקבלו את התוצרת הטרייה ביותר.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Default: Hebrew + RTL. Client-side lang switch updates these via useEffect in I18nProvider.
    <html lang="he" dir="rtl">
      <body>
        <I18nProvider>
          <Navbar />
          <main className="min-h-screen">
            {children}
          </main>
          <Footer />
        </I18nProvider>
      </body>
    </html>
  );
}
