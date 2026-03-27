import type { User } from "@prisma/client";
import type {
  IUserRepository,
  UserUpdateData,
} from "../repositories/interfaces/user.repository.interface";
import { NotFoundError } from "../middleware/errorHandler.middleware";

export type UserPublic = Omit<User, "passwordHash">;

function toPublicUser(user: User): UserPublic {
  const { passwordHash: _, ...publicUser } = user;
  return publicUser;
}

export class UserService {
  constructor(private readonly userRepository: IUserRepository) {}

  async getUserById(id: string): Promise<UserPublic> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundError("User");
    }
    return toPublicUser(user);
  }

  async updateUser(id: string, data: UserUpdateData): Promise<UserPublic> {
    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("User");
    }
    const updated = await this.userRepository.update(id, data);
    return toPublicUser(updated);
  }

  async deleteUser(id: string): Promise<void> {
    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("User");
    }
    await this.userRepository.delete(id);
  }

  async getUserCount(): Promise<number> {
    return this.userRepository.count();
  }
}
