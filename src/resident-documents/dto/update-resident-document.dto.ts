import { PartialType } from '@nestjs/swagger';
import { CreateResidentDocumentDto } from './create-resident-document.dto';

export class UpdateResidentDocumentDto extends PartialType(CreateResidentDocumentDto) {}
