export type UserRole = "citizen" | "moderator" | "admin";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export type AuthUser = {
  id: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  approvalStatus: ApprovalStatus;
};
