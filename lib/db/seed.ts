import { getDb } from './client';
import { createSupplier } from './suppliers';
import { createProduct } from './products';
import { createGroupBuy } from './groups';

export function seedDatabase(): { message: string } {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as c FROM suppliers').get() as { c: number }).c;
  if (count > 0) return { message: 'Already seeded' };

  const s1 = createSupplier({ name: "Yossi's Organic Farm", description: 'Family-run organic vegetable farm since 1985. Certified organic, no pesticides.', location: 'Kibbutz Ein Hamifratz', phone: '052-1234567', email: 'yossi@farm.il', image_url: 'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=400' });
  const s2 = createSupplier({ name: "Miriam's Citrus Grove", description: 'Third-generation citrus grower. Oranges, lemons, grapefruits and seasonal varieties.', location: 'Moshav Beit Herut', phone: '054-9876543', email: 'miriam@citrus.il', image_url: 'https://images.unsplash.com/photo-1549488344-cbb6c34cf08b?w=400' });
  const s3 = createSupplier({ name: "Avigail's Greenhouse", description: 'High-tech greenhouse tomatoes, peppers, and cucumbers. Hydroponic & soil-grown.', location: 'Arava Valley', phone: '050-5554444', email: 'avigail@greenhouse.il', image_url: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400' });
  const s4 = createSupplier({ name: "Ben's Herb Garden", description: 'Fresh herbs and specialty greens, harvested to order. Delivery twice a week.', location: 'Moshav Nahalal', phone: '053-7778889', email: 'ben@herbs.il', image_url: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=400' });

  const p1 = createProduct({ supplier_id: Number(s1), name: 'Heirloom Tomatoes', category: 'Vegetables', price: 18, unit: 'kg', stock_qty: 120, description: 'Mixed heirloom tomatoes — sweet, tangy, and full of flavor', image_url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400' });
  const p2 = createProduct({ supplier_id: Number(s1), name: 'Sweet Corn', category: 'Vegetables', price: 12, unit: 'kg', stock_qty: 200, description: 'Fresh summer sweet corn, picked at peak sweetness', image_url: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=400' });
  createProduct({ supplier_id: Number(s1), name: 'Broccoli', category: 'Vegetables', price: 14, unit: 'kg', stock_qty: 80, description: 'Organic broccoli crowns, freshly harvested', image_url: 'https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?w=400' });

  const p4 = createProduct({ supplier_id: Number(s2), name: 'Navel Oranges', category: 'Fruits', price: 9, unit: 'kg', stock_qty: 500, description: 'Juicy seedless navel oranges, perfect for eating or juicing', image_url: 'https://images.unsplash.com/photo-1547514701-42782101795e?w=400' });
  createProduct({ supplier_id: Number(s2), name: 'Lemons', category: 'Fruits', price: 11, unit: 'kg', stock_qty: 300, description: 'Bright, fragrant lemons with thin skin and lots of juice', image_url: 'https://images.unsplash.com/photo-1582476879984-e97882b3b59a?w=400' });
  createProduct({ supplier_id: Number(s2), name: 'Pink Grapefruit', category: 'Fruits', price: 8, unit: 'kg', stock_qty: 250, description: 'Sweet-tart pink grapefruits, excellent for breakfast', image_url: 'https://images.unsplash.com/photo-1577234286642-fc512a5f8f11?w=400' });

  createProduct({ supplier_id: Number(s3), name: 'Cherry Tomatoes', category: 'Vegetables', price: 22, unit: 'kg', stock_qty: 150, description: 'Sweet cherry tomatoes, grown hydroponically for consistent flavor', image_url: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=400' });
  createProduct({ supplier_id: Number(s3), name: 'Bell Peppers (Mixed)', category: 'Vegetables', price: 20, unit: 'kg', stock_qty: 180, description: 'Red, yellow, and orange bell peppers — great for salads and cooking', image_url: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400' });
  const p9 = createProduct({ supplier_id: Number(s3), name: 'English Cucumbers', category: 'Vegetables', price: 10, unit: 'kg', stock_qty: 220, description: 'Long, seedless cucumbers with crisp texture', image_url: 'https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=400' });

  createProduct({ supplier_id: Number(s4), name: 'Fresh Basil Bunch', category: 'Herbs', price: 15, unit: 'bunch', stock_qty: 60, description: 'Large fragrant basil bunches, Genovese variety', image_url: 'https://images.unsplash.com/photo-1531944029726-de41e8a35e08?w=400' });
  createProduct({ supplier_id: Number(s4), name: 'Mixed Herb Box', category: 'Herbs', price: 35, unit: 'box', stock_qty: 40, description: 'Seasonal herb selection: parsley, cilantro, dill, mint, and more', image_url: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400' });

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);
  const deadlineStr = deadline.toISOString();

  createGroupBuy({ product_id: Number(p4), target_qty: 100, regular_price: 9, group_price: 6.5, deadline: deadlineStr });
  createGroupBuy({ product_id: Number(p2), target_qty: 80, regular_price: 12, group_price: 8, deadline: deadlineStr });
  createGroupBuy({ product_id: Number(p9), target_qty: 50, regular_price: 10, group_price: 7, deadline: deadlineStr });

  const gb1 = db.prepare(`SELECT id FROM group_buys WHERE product_id = ? LIMIT 1`).get(Number(p4)) as { id: number };
  db.prepare('UPDATE group_buys SET current_qty = 42 WHERE id = ?').run(gb1.id);

  const gb2 = db.prepare(`SELECT id FROM group_buys WHERE product_id = ? LIMIT 1`).get(Number(p2)) as { id: number };
  db.prepare('UPDATE group_buys SET current_qty = 61 WHERE id = ?').run(gb2.id);

  // suppress unused var warning
  void p1;

  return { message: 'Database seeded successfully' };
}
