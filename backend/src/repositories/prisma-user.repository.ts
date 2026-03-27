import type { User } from "@prisma/client";
import { db } from "../config/database";
import type {
  IUserRepository,
  UserCreateData,
  UserUpdateData,
} from "./interfaces/user.repository.interface";

export class PrismaUserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return db.user.findUnique({ where: { email } });
  }

  async create(data: UserCreateData): Promise<User> {
    return db.user.create({ data });
  }

  async update(id: string, data: UserUpdateData): Promise<User> {
    return db.user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await db.user.delete({ where: { id } });
  }

  async count(): Promise<number> {
    return db.user.count();
  }
}
