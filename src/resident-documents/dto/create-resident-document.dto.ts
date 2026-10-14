import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType, VerificationStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateResidentDocumentDto {
  @ApiProperty({ enum: DocumentType, default: DocumentType.AADHAAR_CARD })
  @IsEnum(DocumentType, { message: 'documentType must be a valid DocumentType enum' })
  @IsNotEmpty()
  documentType: DocumentType;

  @ApiPropertyOptional({ example: '1234-5678-9012', description: 'Document ID number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentNumber?: string;

  @ApiProperty({ example: 'aadhaar_card_front.pdf', description: 'Original file name' })
  @IsString()
  @IsNotEmpty({ message: 'fileName is required' })
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: 'https://storage.pgmanagement.com/docs/aadhaar_123.pdf', description: 'Document URL' })
  @IsString()
  @IsNotEmpty({ message: 'fileUrl is required' })
  @IsUrl({}, { message: 'fileUrl must be a valid URL' })
  fileUrl: string;

  @ApiPropertyOptional({ enum: VerificationStatus, default: VerificationStatus.PENDING })
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus = VerificationStatus.PENDING;

  @ApiPropertyOptional({ example: 'Original Aadhaar verified during move-in' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
