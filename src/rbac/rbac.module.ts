import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { PermissionGuard } from './guards/permission.guard';
import { RbacTestController } from './rbac-test.controller';

const isProd = process.env.NODE_ENV === 'production';

@Module({
  controllers: isProd ? [] : [RbacTestController],
  providers: [RbacService, PermissionGuard],
  exports: [RbacService, PermissionGuard],
})
export class RbacModule {}
