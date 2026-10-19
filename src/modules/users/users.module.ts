import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserSecurityService } from './user-security.service';
import { User } from './user.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Session } from '../auth/entities/session.entity';
import { LoginEvent } from '../auth/entities/login-event.entity';
import { PasswordHistory } from '../auth/entities/password-history.entity';
import { MailService } from '../auth/mail/mail.service';
import { PasswordStrengthService } from '../auth/password-strength.service';
import { PasswordHistoryService } from '../auth/password-history.service';
import { LoginHistoryService } from '../auth/login-history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, Session, LoginEvent, PasswordHistory]),
    AuditLogsModule,
    HttpModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserSecurityService,
    MailService,
    PasswordStrengthService,
    PasswordHistoryService,
    LoginHistoryService,
  ],
  exports: [UsersService, LoginHistoryService],
})
export class UsersModule {}
