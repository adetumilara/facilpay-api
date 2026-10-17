import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

export class WebAuthnRegistrationVerifyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  challengeToken: string;

  @ApiProperty({
    description: 'Registration response returned by the browser authenticator.',
  })
  @IsObject()
  response: RegistrationResponseJSON;

  @ApiPropertyOptional({ maxLength: 100, default: 'Passkey' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class WebAuthnAuthenticationOptionsDto {
  @ApiProperty({
    description: 'Short-lived ticket returned after password verification.',
  })
  @IsString()
  @IsNotEmpty()
  twoFactorToken: string;
}

export class WebAuthnAuthenticationVerifyDto extends WebAuthnAuthenticationOptionsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  challengeToken: string;

  @ApiProperty({
    description:
      'Authentication assertion returned by the browser authenticator.',
  })
  @IsObject()
  response: AuthenticationResponseJSON;
}

export class RenameWebAuthnCredentialDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
