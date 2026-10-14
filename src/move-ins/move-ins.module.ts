import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { MoveInsController } from './move-ins.controller';
import { MoveInsService } from './move-ins.service';

@Module({
  imports: [RbacModule],
  controllers: [MoveInsController],
  providers: [MoveInsService],
  exports: [MoveInsService],
})
export class MoveInsModule {}
