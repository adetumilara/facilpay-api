import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RequestDataExportDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description:
      'Current account password for step-up authentication. Required to prevent unauthorised exports.',
    example: 'Curr3nt@Pss!',
  })
  password: string;
}
