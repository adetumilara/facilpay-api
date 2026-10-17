import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { GetPaymentsDto } from './get-payments.dto';

export type ExportPaymentsFormat = 'csv' | 'pdf';

export class ExportPaymentsDto extends GetPaymentsDto {
    @ApiPropertyOptional({
        enum: ['csv', 'pdf'],
        description: 'Export format',
        example: 'csv',
    })
    @IsEnum(['csv', 'pdf'])
    format!: ExportPaymentsFormat;
}

