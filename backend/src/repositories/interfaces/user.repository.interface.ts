import type { User, UserRole } from "@prisma/client";

export interface UserCreateData {
  email: string;
  name: string;
  passwordHash: string;
  role?: UserRole;
}

export interface UserUpdateData {
  name?: string;
  email?: string;
  role?: UserRole;
  passwordHash?: string;
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: UserCreateData): Promise<User>;
  update(id: string, data: UserUpdateData): Promise<User>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
}
