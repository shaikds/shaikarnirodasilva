import { clsx, type ClassValue } from 'clsx';

/** Joins class names (clsx). */
export function cn(...values: ClassValue[]): string {
  return clsx(values);
}
