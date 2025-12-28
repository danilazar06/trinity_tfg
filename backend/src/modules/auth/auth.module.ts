import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { GoogleAuthController } from './google-auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { CognitoJwtStrategy } from './strategies/cognito-jwt.strategy';
import { CognitoService } from '../../infrastructure/cognito/cognito.service';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [PassportModule, forwardRef(() => AnalyticsModule)],
  controllers: [AuthController, GoogleAuthController],
  providers: [AuthService, GoogleAuthService, CognitoService, CognitoJwtStrategy],
  exports: [AuthService, GoogleAuthService, CognitoService],
})
export class AuthModule {}
