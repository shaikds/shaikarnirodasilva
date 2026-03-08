// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface Supplier {
  id: number;
  name: string;
  description: string;
  location: string;
  phone: string;
  email: string;
  rating: number;
  image_url: string;
  product_count: number;
  created_at: string;
}

export interface Product {
  id: number;
  supplier_id: number;
  name: string;
  category: 'Vegetables' | 'Fruits' | 'Herbs' | string;
  price: number;
  unit: string;
  stock_qty: number;
  image_url: string;
  description: string;
  is_available: number;
  supplier_name: string;
  supplier_location: string;
  supplier_rating: number;
  created_at: string;
}

export interface GroupBuy {
  id: number;
  product_id: number;
  product_name: string;
  image_url: string;
  unit: string;
  category: string;
  supplier_name: string;
  supplier_location: string;
  target_qty: number;
  current_qty: number;
  regular_price: number;
  group_price: number;
  deadline: string;
  status: 'active' | 'completed' | 'cancelled';
  city: string | null;
  progress_pct: number;
  created_at: string;
}

export interface ConsumerRequest {
  id: number;
  customer_name: string;
  customer_email: string;
  city: string;
  neighborhood: string | null;
  product_query: string;
  deadline: string;
  status: 'searching' | 'matched' | 'expired' | 'completed';
  matched_group_buy_id: number | null;
  created_at: string;
}

export interface Order {
  id: number;
  customer_name: string;
  customer_email: string;
  product_id: number;
  product_name: string;
  unit: string;
  supplier_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  order_type: 'individual' | 'group';
  group_buy_id: number | null;
  status: 'pending' | 'confirmed' | 'pending_group' | 'cancelled';
  notes: string | null;
  created_at: string;
}

export interface Subscription {
  id: number;
  customer_name: string;
  customer_email: string;
  product_id: number;
  product_name: string;
  unit: string;
  current_price: number;
  image_url: string;
  category: string;
  supplier_name: string;
  quantity: number;
  prefer_group_buy: number;
  active: number;
  stock_qty?: number;
  next_run: string;
  last_run: string | null;
  last_order_id: number | null;
  notes: string | null;
  created_at: string;
}

// ─── API Request / Response Types ────────────────────────────────────────────

export interface CreateOrderInput {
  customer_name: string;
  customer_email: string;
  product_id: number;
  quantity: number;
  unit_price: number;
  notes?: string;
}

export interface CreateSubscriptionInput {
  customer_name: string;
  customer_email: string;
  product_id: number;
  quantity: number;
  prefer_group_buy?: boolean;
  notes?: string;
}

export interface CreateSupplierInput {
  name: string;
  description?: string;
  location: string;
  phone?: string;
  email?: string;
  image_url?: string;
}

export interface CreateProductInput {
  supplier_id: number;
  name: string;
  category: string;
  price: number;
  unit: string;
  stock_qty: number;
  image_url?: string;
  description?: string;
}

export interface JoinGroupBuyResult {
  orderId: number | bigint;
  threshold_reached: boolean;
  product_name: string | undefined;
}
