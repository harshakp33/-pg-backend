import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ResidentStaysController } from './resident-stays.controller';
import { ResidentStaysService } from './resident-stays.service';

@Module({
  imports: [RbacModule],
  controllers: [ResidentStaysController],
  providers: [ResidentStaysService],
  exports: [ResidentStaysService],
})
export class ResidentStaysModule {}
