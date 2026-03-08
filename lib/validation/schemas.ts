import { z } from 'zod';

// ─── Reusable primitives ──────────────────────────────────────────────────────

const emailField = z
  .string({ required_error: 'Email is required' })
  .email('Invalid email address')
  .max(254, 'Email too long');

const nameField = z
  .string({ required_error: 'Name is required' })
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name too long')
  .regex(/^[\p{L}\p{N}\s'.,-]+$/u, 'Name contains invalid characters');

const positiveQty = z
  .number({ required_error: 'Quantity is required', invalid_type_error: 'Quantity must be a number' })
  .positive('Quantity must be positive')
  .max(10_000, 'Quantity too large');

const positivePrice = z
  .number({ required_error: 'Price is required', invalid_type_error: 'Price must be a number' })
  .positive('Price must be positive')
  .max(100_000, 'Price too large');

const urlField = z.string().url('Invalid URL').max(500, 'URL too long').optional();

const notesField = z.string().max(500, 'Notes too long').optional();

// ─── Domain Schemas (Single Responsibility: one schema per entity action) ─────

export const CreateOrderSchema = z.object({
  customer_name: nameField,
  customer_email: emailField,
  product_id: z.number({ required_error: 'product_id is required' }).int().positive(),
  quantity: positiveQty,
  unit_price: positivePrice,
  notes: notesField,
});

export const JoinGroupBuySchema = z.object({
  group_buy_id: z.number({ required_error: 'group_buy_id is required' }).int().positive(),
  customer_name: nameField,
  customer_email: emailField,
  quantity: positiveQty,
});

export const CreateGroupBuySchema = z.object({
  product_id: z.number().int().positive(),
  target_qty: z.number().int().positive().max(100_000),
  regular_price: positivePrice,
  group_price: positivePrice,
  deadline: z.string().datetime({ message: 'Invalid deadline format (ISO 8601 required)' }),
}).refine(d => d.group_price < d.regular_price, {
  message: 'group_price must be less than regular_price',
  path: ['group_price'],
});

export const CreateSupplierSchema = z.object({
  name: nameField,
  description: z.string().max(1000, 'Description too long').optional(),
  location: z.string({ required_error: 'Location is required' }).min(2).max(200),
  phone: z.string().max(20).regex(/^[\d\s+\-().]*$/, 'Invalid phone format').optional(),
  email: emailField.optional(),
  image_url: urlField,
});

export const CreateProductSchema = z.object({
  supplier_id: z.number().int().positive(),
  name: z.string().min(2).max(150),
  category: z.enum(['Vegetables', 'Fruits', 'Herbs'], {
    errorMap: () => ({ message: 'Category must be Vegetables, Fruits, or Herbs' }),
  }),
  price: positivePrice,
  unit: z.string().min(1).max(20),
  stock_qty: z.number().int().min(0).max(100_000),
  image_url: urlField,
  description: z.string().max(1000).optional(),
});

export const CreateSubscriptionSchema = z.object({
  customer_name: nameField,
  customer_email: emailField,
  product_id: z.number().int().positive(),
  quantity: positiveQty,
  prefer_group_buy: z.boolean().optional().default(true),
  notes: notesField,
});

export const ChatMessageSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000, 'Message too long'),
      })
    )
    .min(1, 'At least one message required')
    .max(50, 'Too many messages in context'),
});

export const GetByEmailSchema = z.object({
  email: emailField,
});

export const GetByIdSchema = z.object({
  id: z.coerce.number().int().positive('ID must be a positive integer'),
});

// ─── Exported Types ──────────────────────────────────────────────────────────

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type JoinGroupBuyInput = z.infer<typeof JoinGroupBuySchema>;
export type CreateGroupBuyInput = z.infer<typeof CreateGroupBuySchema>;
export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionSchema>;
export type ChatInput = z.infer<typeof ChatMessageSchema>;
