import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '../../helpers/db';
import { createSupplier } from '../../../lib/db/suppliers';
import { getAllProducts, searchProducts, getProductById, createProduct } from '../../../lib/db/products';

let supplierId: number;

beforeEach(() => {
  setupTestDb();
  supplierId = Number(createSupplier({ name: 'Test Supplier', location: 'Test City' }));
});

function makeProduct(overrides: Partial<Parameters<typeof createProduct>[0]> = {}) {
  return createProduct({
    supplier_id: supplierId,
    name: 'Tomatoes',
    category: 'Vegetables',
    price: 10,
    unit: 'kg',
    stock_qty: 100,
    ...overrides,
  });
}

describe('createProduct', () => {
  it('returns a positive id', () => {
    expect(Number(makeProduct())).toBeGreaterThan(0);
  });

  it('persists all fields', () => {
    const id = makeProduct({ name: 'Basil', category: 'Herbs', price: 15, unit: 'bunch', stock_qty: 20 });
    const p = getProductById(Number(id));
    expect(p?.name).toBe('Basil');
    expect(p?.category).toBe('Herbs');
    expect(p?.price).toBe(15);
  });
});

describe('getAllProducts', () => {
  it('returns empty array with no products', () => {
    expect(getAllProducts()).toEqual([]);
  });

  it('filters by category', () => {
    makeProduct({ category: 'Vegetables' });
    makeProduct({ name: 'Orange', category: 'Fruits', price: 8 });
    expect(getAllProducts('Vegetables')).toHaveLength(1);
    expect(getAllProducts('Fruits')).toHaveLength(1);
    expect(getAllProducts()).toHaveLength(2);
  });

  it('joins supplier info', () => {
    makeProduct();
    const [p] = getAllProducts();
    expect(p.supplier_name).toBe('Test Supplier');
    expect(p.supplier_location).toBe('Test City');
  });
});

describe('searchProducts', () => {
  beforeEach(() => {
    makeProduct({ name: 'Cherry Tomatoes', category: 'Vegetables' });
    makeProduct({ name: 'Basil', category: 'Herbs', description: 'Fragrant herb' });
  });

  it('finds by name', () => {
    expect(searchProducts('tomato')).toHaveLength(1);
    expect(searchProducts('basil')).toHaveLength(1);
  });

  it('finds by description', () => {
    expect(searchProducts('fragrant')).toHaveLength(1);
  });

  it('returns empty array for no match', () => {
    expect(searchProducts('xxxnonexistent')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(searchProducts('TOMATO')).toHaveLength(1);
  });
});
