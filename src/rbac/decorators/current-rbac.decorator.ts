import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RbacContext } from '../types/rbac.types';

export const CurrentRbac = createParamDecorator(
  (data: keyof RbacContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const rbacContext = request.rbacContext as RbacContext;
    return data ? rbacContext?.[data] : rbacContext;
  },
);
