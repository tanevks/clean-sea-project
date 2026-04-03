export type UserRole = "citizen" | "moderator" | "admin";

export type AuthUser = {
  id: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
};
