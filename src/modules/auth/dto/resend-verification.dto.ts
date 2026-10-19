import { IsEmail, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  @ApiProperty({
    description: 'Email address to resend the verification link to',
    example: 'user@example.com',
  })
  email: string;
}
