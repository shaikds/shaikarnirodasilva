import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { IUserRepository } from "../repositories/interfaces/user.repository.interface";
import { UnauthorizedError, ConflictError } from "../middleware/errorHandler.middleware";
import type { JwtPayload } from "../middleware/auth.middleware";

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
}

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  private readonly SALT_ROUNDS = 12;

  constructor(private readonly userRepository: IUserRepository) {}

  async register(input: RegisterInput): Promise<{ user: { id: string; email: string; name: string; role: string }; tokens: AuthTokens }> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError("A user with this email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, this.SALT_ROUNDS);
    const user = await this.userRepository.create({
      email: input.email,
      name: input.name,
      passwordHash,
    });

    const tokens = this.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tokens,
    };
  }

  async login(input: LoginInput): Promise<{ user: { id: string; email: string; name: string; role: string }; tokens: AuthTokens }> {
    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const tokens = this.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tokens,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    await this.userRepository.update(userId, { passwordHash });
  }

  private generateTokens(payload: JwtPayload): AuthTokens {
    const tokenPayload = { userId: payload.userId, email: payload.email, role: payload.role };
    const expiresInSeconds = this.parseExpiresIn(env.JWT_EXPIRES_IN);
    const accessToken = jwt.sign(tokenPayload, env.JWT_SECRET, {
      expiresIn: expiresInSeconds,
    });

    return {
      accessToken,
      expiresIn: env.JWT_EXPIRES_IN,
    };
  }

  private parseExpiresIn(value: string): number {
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) return 604800;
    const num = parseInt(match[1], 10);
    switch (match[2]) {
      case "s": return num;
      case "m": return num * 60;
      case "h": return num * 3600;
      case "d": return num * 86400;
      default: return 604800;
    }
  }
}
