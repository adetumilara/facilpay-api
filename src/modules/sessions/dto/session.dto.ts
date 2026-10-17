import { ApiProperty } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty({ description: 'Session ID' })
  id: string;

  @ApiProperty({ description: 'Client-reported device information', nullable: true })
  deviceInfo: string | null;

  @ApiProperty({ description: 'IP address the session was last active from', nullable: true })
  ipAddress: string | null;

  @ApiProperty({ description: 'User-Agent header the session was last active with', nullable: true })
  userAgent: string | null;

  @ApiProperty({ description: 'When this session was last active' })
  lastActiveAt: Date;

  @ApiProperty({ description: 'When this session expires' })
  expiresAt: Date;

  @ApiProperty({ description: 'When this session was created' })
  createdAt: Date;
}
