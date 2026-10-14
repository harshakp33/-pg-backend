import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'require_permissions';

/**
 * Decorator to require one or more permissions on an endpoint.
 * Default behavior: ALL required permissions must be present (AND logic).
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
