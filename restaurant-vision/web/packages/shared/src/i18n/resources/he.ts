// Hebrew strings of the shared `common` namespace (default language). Hebrew has a `two`
// plural category, hence the extra `_two` keys (the parity test allows them).
import type { Messages } from './types';

export const commonHe = {
  app: {
    name: 'Restaurant Vision',
    tagline: 'תובנות בזמן אמת, אנונימיות, מהמצלמות הקיימות שלכם',
  },
  actions: {
    save: 'שמירה',
    saving: 'שומר…',
    saved: 'נשמר',
    cancel: 'ביטול',
    close: 'סגירה',
    retry: 'נסו שוב',
    signIn: 'כניסה',
    signOut: 'יציאה',
    back: 'חזרה',
    edit: 'עריכה',
    delete: 'מחיקה',
    add: 'הוספה',
    confirm: 'אישור',
    copy: 'העתקה',
    copied: 'הועתק',
    refresh: 'רענון',
  },
  lang: {
    label: 'שפה',
    he: 'עברית',
    en: 'English',
  },
  theme: {
    label: 'ערכת צבעים',
    light: 'בהירה',
    dark: 'כהה',
    system: 'לפי המערכת',
    toggle: 'החלפת ערכת צבעים (כעת: {{mode}})',
  },
  nav: {
    skipToContent: 'דילוג לתוכן הראשי',
    mainNav: 'ניווט ראשי',
    openMenu: 'פתיחת תפריט',
    closeMenu: 'סגירת תפריט',
    account: 'חשבון',
  },
  tableState: {
    empty: 'פנוי',
    seated: 'הושבו',
    attended: 'קיבלו שירות',
    needs_bussing: 'לפינוי',
  },
  tableStateHint: {
    empty: 'מוכן לאורחים',
    seated: 'האורחים הושבו וממתינים לביקור ראשון',
    attended: 'מלצר כבר ביקר בשולחן',
    needs_bussing: 'האורחים עזבו, יש לפנות את השולחן',
  },
  alertKind: {
    waiter_needed: 'דרוש מלצר',
    checkin_needed: 'נדרש ביקור חוזר',
    bussing_needed: 'נדרש פינוי',
    long_queue: 'תור ארוך בכניסה',
  },
  severity: {
    info: 'מידע',
    warn: 'אזהרה',
    urgent: 'דחוף',
  },
  alertStatus: {
    open: 'פתוחה',
    acknowledged: 'מישהו כבר בטיפול',
    resolved: 'טופלה',
  },
  ackVia: {
    cloud: 'דרך האפליקציה',
    local: 'דרך ה־Wi-Fi של המסעדה',
  },
  connection: {
    idle: 'לא מחובר',
    connecting: 'מתחבר…',
    open: 'חי',
    reconnecting: 'מתחבר מחדש…',
    closed: 'מנותק',
    label: 'חיבור חי: {{status}}',
  },
  camera: {
    ok: 'תקינה',
    degraded: 'חלקית',
    offline: 'לא מחוברת',
  },
  device: {
    online: 'מחובר',
    offline: 'לא מחובר',
  },
  estimate: {
    badge: 'הערכה',
    title: 'נתון זה הוא הערכה',
    howCalculated: 'איך זה מחושב?',
  },
  units: {
    s: '{{n}} שנ׳',
    min: '{{n}} דק׳',
    h: '{{n}} שע׳',
    hmin: '{{h}} שע׳ {{m}} דק׳',
  },
  time: {
    now: 'עכשיו',
  },
  status: {
    loading: 'טוען…',
    notEnoughData: 'אין מספיק נתונים',
    none: '—',
  },
  table: {
    name: 'שולחן {{label}}',
    guests_one: 'אורח אחד',
    guests_two: 'שני אורחים',
    guests_other: '{{count}} אורחים',
    seats_one: 'מקום אחד',
    seats_two: 'שני מקומות',
    seats_other: '{{count}} מקומות',
    since: 'כבר {{duration}}',
  },
  errors: {
    generic: 'משהו השתבש. נסו שוב.',
    network: 'אין חיבור לשרת. בדקו את החיבור.',
    unauthorized: 'פג תוקף ההתחברות. היכנסו מחדש.',
    forbidden: 'אין לכם הרשאה לדף הזה.',
    notFound: 'לא נמצא.',
    boundaryTitle: 'חלק זה של הדף לא נטען',
    boundaryBody: 'שאר האפליקציה ממשיכה לעבוד. נסו שוב או טענו את הדף מחדש.',
    reload: 'טעינת הדף מחדש',
  },
  empty: {
    title: 'אין כאן עדיין כלום',
  },
  privacy: {
    short: 'אנונימי מעצם התכנון: בלי זיהוי פנים, שום וידאו לא יוצא מהמסעדה, ואין נתונים לפי עובד.',
  },
} satisfies Messages;
