import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ResidentDocumentsController } from './resident-documents.controller';
import { ResidentDocumentsService } from './resident-documents.service';

@Module({
  imports: [RbacModule],
  controllers: [ResidentDocumentsController],
  providers: [ResidentDocumentsService],
  exports: [ResidentDocumentsService],
})
export class ResidentDocumentsModule {}
