import { getDb } from './client';
import type { Supplier, CreateSupplierInput } from '@/types';

export function getAllSuppliers(): Supplier[] {
  return getDb().prepare(`
    SELECT s.*, COUNT(p.id) as product_count
    FROM suppliers s
    LEFT JOIN products p ON p.supplier_id = s.id AND p.is_available = 1
    GROUP BY s.id
    ORDER BY s.rating DESC
  `).all() as Supplier[];
}

export function getSupplierById(id: number): Supplier | undefined {
  return getDb().prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as Supplier | undefined;
}

export function createSupplier(data: CreateSupplierInput): number | bigint {
  const result = getDb().prepare(`
    INSERT INTO suppliers (name, description, location, phone, email, image_url)
    VALUES (@name, @description, @location, @phone, @email, @image_url)
  `).run(data);
  return result.lastInsertRowid;
}
