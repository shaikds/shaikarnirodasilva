export enum UserRole {
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
}

export interface IUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type IUserPublic = Omit<IUser, "passwordHash">;
