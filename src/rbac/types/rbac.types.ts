import { MemberStatus, RoleType } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface RbacContext {
  userId: string;
  email: string;
  organizationId: string;
  membershipId: string;
  roleId: string;
  role: RoleType;
  isPrimaryOwner: boolean;
  status: MemberStatus;
  permissions: string[];
}
