import { describe, it, expect } from 'vitest';
import {
  CreateOrderSchema,
  JoinGroupBuySchema,
  CreateGroupBuySchema,
  CreateSupplierSchema,
  CreateProductSchema,
  CreateSubscriptionSchema,
  ChatMessageSchema,
} from '../../../lib/validation/schemas';

// ─── CreateOrderSchema ────────────────────────────────────────────────────────

describe('CreateOrderSchema', () => {
  const valid = {
    customer_name: 'Avi Cohen',
    customer_email: 'avi@example.com',
    product_id: 1,
    quantity: 2,
    unit_price: 15.5,
  };

  it('accepts valid order', () => {
    expect(CreateOrderSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects negative quantity', () => {
    const r = CreateOrderSchema.safeParse({ ...valid, quantity: -1 });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toContain('positive');
  });

  it('rejects invalid email', () => {
    const r = CreateOrderSchema.safeParse({ ...valid, customer_email: 'not-an-email' });
    expect(r.success).toBe(false);
  });

  it('rejects name that is too short', () => {
    const r = CreateOrderSchema.safeParse({ ...valid, customer_name: 'A' });
    expect(r.success).toBe(false);
  });

  it('rejects notes that exceed 500 chars', () => {
    const r = CreateOrderSchema.safeParse({ ...valid, notes: 'x'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('accepts optional notes', () => {
    const r = CreateOrderSchema.safeParse({ ...valid, notes: 'Extra ripe please' });
    expect(r.success).toBe(true);
  });
});

// ─── JoinGroupBuySchema ───────────────────────────────────────────────────────

describe('JoinGroupBuySchema', () => {
  const valid = {
    group_buy_id: 3,
    customer_name: 'Sara Levi',
    customer_email: 'sara@test.com',
    quantity: 5,
  };

  it('accepts valid join', () => expect(JoinGroupBuySchema.safeParse(valid).success).toBe(true));
  it('rejects zero quantity', () => expect(JoinGroupBuySchema.safeParse({ ...valid, quantity: 0 }).success).toBe(false));
  it('rejects non-integer group_buy_id', () => expect(JoinGroupBuySchema.safeParse({ ...valid, group_buy_id: 0 }).success).toBe(false));
});

// ─── CreateGroupBuySchema ─────────────────────────────────────────────────────

describe('CreateGroupBuySchema', () => {
  const deadline = new Date(Date.now() + 86_400_000).toISOString();
  const valid = { product_id: 1, target_qty: 100, regular_price: 10, group_price: 7, deadline };

  it('accepts valid group buy', () => expect(CreateGroupBuySchema.safeParse(valid).success).toBe(true));

  it('rejects group_price >= regular_price', () => {
    const r = CreateGroupBuySchema.safeParse({ ...valid, group_price: 10 });
    expect(r.success).toBe(false);
    const msg = JSON.stringify(r);
    expect(msg).toContain('group_price');
  });

  it('rejects invalid deadline format', () => {
    expect(CreateGroupBuySchema.safeParse({ ...valid, deadline: '12/31/2099' }).success).toBe(false);
  });
});

// ─── CreateSupplierSchema ─────────────────────────────────────────────────────

describe('CreateSupplierSchema', () => {
  const valid = { name: 'Ben Farm', location: 'Galilee' };

  it('accepts minimal valid supplier', () => expect(CreateSupplierSchema.safeParse(valid).success).toBe(true));
  it('rejects empty name', () => expect(CreateSupplierSchema.safeParse({ ...valid, name: '' }).success).toBe(false));
  it('rejects invalid phone characters', () => {
    expect(CreateSupplierSchema.safeParse({ ...valid, phone: 'abc-HACK' }).success).toBe(false);
  });
  it('accepts valid phone', () => {
    expect(CreateSupplierSchema.safeParse({ ...valid, phone: '+972-52-123-4567' }).success).toBe(true);
  });
  it('rejects invalid image_url', () => {
    expect(CreateSupplierSchema.safeParse({ ...valid, image_url: 'javascript:alert(1)' }).success).toBe(false);
  });
});

// ─── CreateProductSchema ──────────────────────────────────────────────────────

describe('CreateProductSchema', () => {
  const valid = {
    supplier_id: 1, name: 'Tomatoes', category: 'Vegetables',
    price: 12, unit: 'kg', stock_qty: 50,
  };

  it('accepts valid product', () => expect(CreateProductSchema.safeParse(valid).success).toBe(true));

  it('rejects invalid category', () => {
    expect(CreateProductSchema.safeParse({ ...valid, category: 'Candy' }).success).toBe(false);
  });

  it('accepts all valid categories', () => {
    for (const cat of ['Vegetables', 'Fruits', 'Herbs']) {
      expect(CreateProductSchema.safeParse({ ...valid, category: cat }).success).toBe(true);
    }
  });

  it('rejects negative stock_qty', () => {
    expect(CreateProductSchema.safeParse({ ...valid, stock_qty: -1 }).success).toBe(false);
  });
});

// ─── CreateSubscriptionSchema ─────────────────────────────────────────────────

describe('CreateSubscriptionSchema', () => {
  const valid = {
    customer_name: 'Yossi Ben', customer_email: 'yossi@farm.il',
    product_id: 2, quantity: 1,
  };

  it('accepts valid subscription', () => expect(CreateSubscriptionSchema.safeParse(valid).success).toBe(true));
  it('defaults prefer_group_buy to true', () => {
    const r = CreateSubscriptionSchema.safeParse(valid);
    expect(r.success && r.data.prefer_group_buy).toBe(true);
  });
  it('rejects quantity > 10000', () => {
    expect(CreateSubscriptionSchema.safeParse({ ...valid, quantity: 10_001 }).success).toBe(false);
  });
});

// ─── ChatMessageSchema ────────────────────────────────────────────────────────

describe('ChatMessageSchema', () => {
  const validMsg = { messages: [{ role: 'user', content: 'Hello' }] };

  it('accepts valid chat', () => expect(ChatMessageSchema.safeParse(validMsg).success).toBe(true));
  it('rejects empty messages', () => expect(ChatMessageSchema.safeParse({ messages: [] }).success).toBe(false));
  it('rejects unknown role', () => {
    expect(ChatMessageSchema.safeParse({ messages: [{ role: 'system', content: 'hi' }] }).success).toBe(false);
  });
  it('rejects message content > 8000 chars', () => {
    expect(ChatMessageSchema.safeParse({
      messages: [{ role: 'user', content: 'x'.repeat(8001) }]
    }).success).toBe(false);
  });
  it('rejects more than 50 messages', () => {
    const msgs = Array.from({ length: 51 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: 'hi' }));
    expect(ChatMessageSchema.safeParse({ messages: msgs }).success).toBe(false);
  });
});
