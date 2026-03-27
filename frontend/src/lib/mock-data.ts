export interface Trend {
  id: string;
  keyword: string;
  source: "REDDIT" | "GOOGLE_TRENDS";
  volume: number;
  growthRate: number;
  status: "NEW" | "TRACKING" | "MATCHED" | "ARCHIVED";
  detectedAt: string;
  category: string;
  matchedSuppliers: number;
}

export interface Supplier {
  id: string;
  name: string;
  source: "LOCAL" | "ALIBABA";
  reliabilityScore: number;
  country: string;
  category: string;
  contactEmail: string;
  responseRate: number;
  avgLeadTime: string;
  minOrder: number;
  verified: boolean;
}

export interface OutreachItem {
  id: string;
  supplierName: string;
  trendKeyword: string;
  sentAt: string;
  status: "SENT" | "DELIVERED" | "OPENED" | "RESPONDED" | "FAILED";
  channel: "EMAIL" | "WHATSAPP";
}

export interface Activity {
  id: string;
  type: "TREND_DETECTED" | "SUPPLIER_FOUND" | "OUTREACH_SENT" | "OUTREACH_RESPONDED" | "SCRAPE_COMPLETED";
  message: string;
  timestamp: string;
}

export const mockTrends: Trend[] = [
  {
    id: "t1",
    keyword: "Portable Blender Bottles",
    source: "GOOGLE_TRENDS",
    volume: 48200,
    growthRate: 156.3,
    status: "MATCHED",
    detectedAt: "2026-03-25T10:30:00Z",
    category: "Kitchen & Home",
    matchedSuppliers: 5,
  },
  {
    id: "t2",
    keyword: "LED Grow Lights 2026",
    source: "REDDIT",
    volume: 32100,
    growthRate: 89.2,
    status: "TRACKING",
    detectedAt: "2026-03-24T14:15:00Z",
    category: "Garden & Outdoor",
    matchedSuppliers: 3,
  },
  {
    id: "t3",
    keyword: "Ergonomic Desk Accessories",
    source: "GOOGLE_TRENDS",
    volume: 27800,
    growthRate: 67.5,
    status: "MATCHED",
    detectedAt: "2026-03-23T09:45:00Z",
    category: "Office Supplies",
    matchedSuppliers: 7,
  },
  {
    id: "t4",
    keyword: "Sustainable Packaging Solutions",
    source: "REDDIT",
    volume: 19400,
    growthRate: 124.8,
    status: "NEW",
    detectedAt: "2026-03-26T16:20:00Z",
    category: "Packaging",
    matchedSuppliers: 0,
  },
  {
    id: "t5",
    keyword: "Smart Home Sensors",
    source: "GOOGLE_TRENDS",
    volume: 41500,
    growthRate: 45.1,
    status: "TRACKING",
    detectedAt: "2026-03-22T11:00:00Z",
    category: "Electronics",
    matchedSuppliers: 4,
  },
  {
    id: "t6",
    keyword: "Pet GPS Trackers",
    source: "REDDIT",
    volume: 15700,
    growthRate: 203.4,
    status: "NEW",
    detectedAt: "2026-03-26T08:30:00Z",
    category: "Pet Supplies",
    matchedSuppliers: 0,
  },
  {
    id: "t7",
    keyword: "Bamboo Toothbrush Sets",
    source: "GOOGLE_TRENDS",
    volume: 22300,
    growthRate: 34.6,
    status: "ARCHIVED",
    detectedAt: "2026-03-15T13:10:00Z",
    category: "Health & Beauty",
    matchedSuppliers: 6,
  },
  {
    id: "t8",
    keyword: "Wireless Charging Pads",
    source: "REDDIT",
    volume: 56800,
    growthRate: 18.9,
    status: "MATCHED",
    detectedAt: "2026-03-20T17:45:00Z",
    category: "Electronics",
    matchedSuppliers: 8,
  },
];

export const mockSuppliers: Supplier[] = [
  {
    id: "s1",
    name: "GreenPack Industries",
    source: "LOCAL",
    reliabilityScore: 92,
    country: "United States",
    category: "Packaging",
    contactEmail: "sales@greenpack.com",
    responseRate: 95,
    avgLeadTime: "3-5 days",
    minOrder: 100,
    verified: true,
  },
  {
    id: "s2",
    name: "TechParts Direct",
    source: "LOCAL",
    reliabilityScore: 87,
    country: "United States",
    category: "Electronics",
    contactEmail: "info@techpartsdirect.com",
    responseRate: 88,
    avgLeadTime: "2-4 days",
    minOrder: 50,
    verified: true,
  },
  {
    id: "s3",
    name: "EcoHome Supplies",
    source: "LOCAL",
    reliabilityScore: 78,
    country: "Canada",
    category: "Kitchen & Home",
    contactEmail: "orders@ecohome.ca",
    responseRate: 82,
    avgLeadTime: "5-7 days",
    minOrder: 200,
    verified: true,
  },
  {
    id: "s4",
    name: "Pacific Garden Co.",
    source: "LOCAL",
    reliabilityScore: 85,
    country: "United States",
    category: "Garden & Outdoor",
    contactEmail: "hello@pacificgarden.com",
    responseRate: 90,
    avgLeadTime: "4-6 days",
    minOrder: 75,
    verified: true,
  },
  {
    id: "s5",
    name: "PetTech Solutions",
    source: "LOCAL",
    reliabilityScore: 63,
    country: "United Kingdom",
    category: "Pet Supplies",
    contactEmail: "contact@pettech.co.uk",
    responseRate: 70,
    avgLeadTime: "7-10 days",
    minOrder: 150,
    verified: false,
  },
  {
    id: "s6",
    name: "Shenzhen BlendMaster",
    source: "ALIBABA",
    reliabilityScore: 74,
    country: "China",
    category: "Kitchen & Home",
    contactEmail: "sales@blendmaster.cn",
    responseRate: 65,
    avgLeadTime: "15-25 days",
    minOrder: 500,
    verified: true,
  },
  {
    id: "s7",
    name: "Guangzhou LightTech",
    source: "ALIBABA",
    reliabilityScore: 68,
    country: "China",
    category: "Electronics",
    contactEmail: "export@lighttech.cn",
    responseRate: 60,
    avgLeadTime: "20-30 days",
    minOrder: 1000,
    verified: true,
  },
  {
    id: "s8",
    name: "Yiwu SmartHome",
    source: "ALIBABA",
    reliabilityScore: 55,
    country: "China",
    category: "Electronics",
    contactEmail: "trade@yiwusmarthome.com",
    responseRate: 50,
    avgLeadTime: "25-35 days",
    minOrder: 2000,
    verified: false,
  },
  {
    id: "s9",
    name: "Dongguan PetGear",
    source: "ALIBABA",
    reliabilityScore: 42,
    country: "China",
    category: "Pet Supplies",
    contactEmail: "info@dgpetgear.com",
    responseRate: 40,
    avgLeadTime: "30-40 days",
    minOrder: 3000,
    verified: false,
  },
  {
    id: "s10",
    name: "Ningbo EcoPack",
    source: "ALIBABA",
    reliabilityScore: 71,
    country: "China",
    category: "Packaging",
    contactEmail: "sales@nbecopack.cn",
    responseRate: 58,
    avgLeadTime: "18-28 days",
    minOrder: 800,
    verified: true,
  },
  {
    id: "s11",
    name: "Maple Office Supply",
    source: "LOCAL",
    reliabilityScore: 81,
    country: "Canada",
    category: "Office Supplies",
    contactEmail: "info@mapleoffice.ca",
    responseRate: 85,
    avgLeadTime: "3-5 days",
    minOrder: 50,
    verified: true,
  },
  {
    id: "s12",
    name: "Foshan BambooWorks",
    source: "ALIBABA",
    reliabilityScore: 35,
    country: "China",
    category: "Health & Beauty",
    contactEmail: "export@bambooworks.cn",
    responseRate: 35,
    avgLeadTime: "25-35 days",
    minOrder: 5000,
    verified: false,
  },
];

export const mockOutreach: OutreachItem[] = [
  {
    id: "o1",
    supplierName: "GreenPack Industries",
    trendKeyword: "Sustainable Packaging Solutions",
    sentAt: "2026-03-26T10:00:00Z",
    status: "RESPONDED",
    channel: "EMAIL",
  },
  {
    id: "o2",
    supplierName: "TechParts Direct",
    trendKeyword: "Smart Home Sensors",
    sentAt: "2026-03-25T14:30:00Z",
    status: "OPENED",
    channel: "EMAIL",
  },
  {
    id: "o3",
    supplierName: "Shenzhen BlendMaster",
    trendKeyword: "Portable Blender Bottles",
    sentAt: "2026-03-25T09:15:00Z",
    status: "DELIVERED",
    channel: "EMAIL",
  },
  {
    id: "o4",
    supplierName: "EcoHome Supplies",
    trendKeyword: "Portable Blender Bottles",
    sentAt: "2026-03-24T16:45:00Z",
    status: "RESPONDED",
    channel: "WHATSAPP",
  },
  {
    id: "o5",
    supplierName: "Guangzhou LightTech",
    trendKeyword: "LED Grow Lights 2026",
    sentAt: "2026-03-24T11:20:00Z",
    status: "SENT",
    channel: "EMAIL",
  },
  {
    id: "o6",
    supplierName: "Pacific Garden Co.",
    trendKeyword: "LED Grow Lights 2026",
    sentAt: "2026-03-23T15:00:00Z",
    status: "RESPONDED",
    channel: "EMAIL",
  },
  {
    id: "o7",
    supplierName: "Yiwu SmartHome",
    trendKeyword: "Smart Home Sensors",
    sentAt: "2026-03-23T08:30:00Z",
    status: "FAILED",
    channel: "EMAIL",
  },
  {
    id: "o8",
    supplierName: "Maple Office Supply",
    trendKeyword: "Ergonomic Desk Accessories",
    sentAt: "2026-03-22T13:10:00Z",
    status: "RESPONDED",
    channel: "WHATSAPP",
  },
];

export const mockActivities: Activity[] = [
  {
    id: "a1",
    type: "TREND_DETECTED",
    message: 'New trend detected: "Pet GPS Trackers" with 203.4% growth',
    timestamp: "2026-03-26T08:30:00Z",
  },
  {
    id: "a2",
    type: "OUTREACH_RESPONDED",
    message: "GreenPack Industries responded to your outreach about Sustainable Packaging",
    timestamp: "2026-03-26T07:15:00Z",
  },
  {
    id: "a3",
    type: "SCRAPE_COMPLETED",
    message: "Reddit scrape completed: 24 new posts analyzed across 5 subreddits",
    timestamp: "2026-03-26T06:00:00Z",
  },
  {
    id: "a4",
    type: "SUPPLIER_FOUND",
    message: "New supplier match: TechParts Direct for Smart Home Sensors",
    timestamp: "2026-03-25T18:45:00Z",
  },
  {
    id: "a5",
    type: "OUTREACH_SENT",
    message: "Outreach email sent to TechParts Direct about Smart Home Sensors",
    timestamp: "2026-03-25T14:30:00Z",
  },
  {
    id: "a6",
    type: "SCRAPE_COMPLETED",
    message: "Google Trends scrape completed: 12 trending keywords identified",
    timestamp: "2026-03-25T12:00:00Z",
  },
  {
    id: "a7",
    type: "TREND_DETECTED",
    message: 'New trend detected: "Sustainable Packaging Solutions" with 124.8% growth',
    timestamp: "2026-03-25T10:20:00Z",
  },
];

export function generateChartData() {
  const data = [];
  const now = new Date("2026-03-27");
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    data.push({
      date: dateStr,
      reddit: Math.floor(Math.random() * 40 + 20 + (29 - i) * 1.5),
      googleTrends: Math.floor(Math.random() * 50 + 30 + (29 - i) * 2),
    });
  }
  return data;
}

export const dashboardStats = {
  totalTrends: 48,
  activeSuppliers: 12,
  outreachSent: 34,
  responseRate: 64.7,
  trendsChange: 12.5,
  suppliersChange: 8.3,
  outreachChange: 22.1,
  responseRateChange: -2.4,
};
