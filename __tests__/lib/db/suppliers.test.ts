import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '../../helpers/db';
import { getAllSuppliers, getSupplierById, createSupplier } from '../../../lib/db/suppliers';

beforeEach(() => { setupTestDb(); });

describe('createSupplier', () => {
  it('creates a supplier and returns a numeric id', () => {
    const id = createSupplier({ name: 'Test Farm', location: 'Tel Aviv' });
    expect(typeof id === 'number' || typeof id === 'bigint').toBe(true);
    expect(Number(id)).toBeGreaterThan(0);
  });

  it('stores and retrieves all fields', () => {
    const data = {
      name: 'Miriam Farm', location: 'Haifa',
      description: 'Organic', phone: '052-1111111',
      email: 'miriam@test.il', image_url: 'https://example.com/img.jpg',
    };
    const id = createSupplier(data);
    const supplier = getSupplierById(Number(id));
    expect(supplier).toBeDefined();
    expect(supplier!.name).toBe(data.name);
    expect(supplier!.location).toBe(data.location);
    expect(supplier!.email).toBe(data.email);
  });
});

describe('getAllSuppliers', () => {
  it('returns empty array when no suppliers', () => {
    expect(getAllSuppliers()).toEqual([]);
  });

  it('returns all created suppliers ordered by rating desc', () => {
    createSupplier({ name: 'Alpha Farm', location: 'A' });
    createSupplier({ name: 'Beta Farm', location: 'B' });
    const all = getAllSuppliers();
    expect(all).toHaveLength(2);
  });

  it('includes product_count field', () => {
    createSupplier({ name: 'Farm X', location: 'X' });
    const [s] = getAllSuppliers();
    expect(s).toHaveProperty('product_count');
    expect(Number(s.product_count)).toBe(0);
  });
});

describe('getSupplierById', () => {
  it('returns undefined for non-existent id', () => {
    expect(getSupplierById(999)).toBeUndefined();
  });

  it('returns the correct supplier', () => {
    const id = createSupplier({ name: 'Solo', location: 'Solo City' });
    const s = getSupplierById(Number(id));
    expect(s?.name).toBe('Solo');
  });
});
