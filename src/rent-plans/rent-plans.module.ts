import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { RentPlansController } from './rent-plans.controller';
import { RentPlansService } from './rent-plans.service';

@Module({
  imports: [RbacModule],
  controllers: [RentPlansController],
  providers: [RentPlansService],
  exports: [RentPlansService],
})
export class RentPlansModule {}
