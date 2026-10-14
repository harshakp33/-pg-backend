import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { BedsController } from './beds.controller';
import { BedsService } from './beds.service';

@Module({
  imports: [RbacModule],
  controllers: [BedsController],
  providers: [BedsService],
  exports: [BedsService],
})
export class BedsModule {}
