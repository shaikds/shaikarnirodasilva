import { getDb } from './client';
import type { Product, CreateProductInput } from '@/types';

const BASE_QUERY = `
  SELECT p.*, s.name as supplier_name, s.location as supplier_location,
         s.rating as supplier_rating
  FROM products p
  JOIN suppliers s ON s.id = p.supplier_id
  WHERE p.is_available = 1
`;

export function getAllProducts(category?: string): Product[] {
  if (category) {
    return getDb()
      .prepare(`${BASE_QUERY} AND p.category = ? ORDER BY p.created_at DESC`)
      .all(category) as Product[];
  }
  return getDb()
    .prepare(`${BASE_QUERY} ORDER BY p.created_at DESC`)
    .all() as Product[];
}

export function searchProducts(query: string): Product[] {
  return getDb().prepare(`
    ${BASE_QUERY} AND (
      LOWER(p.name) LIKE LOWER('%' || ? || '%') OR
      LOWER(p.category) LIKE LOWER('%' || ? || '%') OR
      LOWER(p.description) LIKE LOWER('%' || ? || '%')
    )
    ORDER BY p.name
  `).all(query, query, query) as Product[];
}

export function getProductById(id: number): Product | undefined {
  return getDb().prepare(`
    SELECT p.*, s.name as supplier_name, s.location as supplier_location,
           s.rating as supplier_rating, s.phone as supplier_phone
    FROM products p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.id = ?
  `).get(id) as Product | undefined;
}

export function getProductsBySupplier(supplierId: number): Product[] {
  return getDb().prepare(
    'SELECT * FROM products WHERE supplier_id = ? AND is_available = 1'
  ).all(supplierId) as Product[];
}

export function createProduct(data: CreateProductInput): number | bigint {
  const result = getDb().prepare(`
    INSERT INTO products (supplier_id, name, category, price, unit, stock_qty, image_url, description)
    VALUES (@supplier_id, @name, @category, @price, @unit, @stock_qty, @image_url, @description)
  `).run(data);
  return result.lastInsertRowid;
}
