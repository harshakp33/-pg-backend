import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { StaffTasksController } from './staff-tasks.controller';
import { StaffTasksService } from './staff-tasks.service';

@Module({
  imports: [RbacModule],
  controllers: [StaffTasksController],
  providers: [StaffTasksService],
  exports: [StaffTasksService],
})
export class StaffTasksModule {}
