import { Module } from '@nestjs/common';
import { ComplaintsModule } from '../complaints/complaints.module';
import { LeavesModule } from '../leaves/leaves.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { NoticesModule } from '../notices/notices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacModule } from '../rbac/rbac.module';
import { VisitorsModule } from '../visitors/visitors.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [
    PrismaModule,
    RbacModule,
    ComplaintsModule,
    MaintenanceModule,
    LeavesModule,
    NoticesModule,
    NotificationsModule,
    VisitorsModule,
  ],
  controllers: [PortalController],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
