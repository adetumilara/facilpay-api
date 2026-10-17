import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class LoginAlertPreferenceDto {
  @ApiProperty({
    description: 'Enable email alerts for sign-ins from new devices.',
  })
  @IsBoolean()
  enabled: boolean;
}
