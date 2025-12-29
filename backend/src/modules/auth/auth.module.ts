import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { GoogleAuthController } from './google-auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { FederatedUserManagementService } from './federated-user-management.service';
import { FederatedSessionManagementService } from './federated-session-management.service';
import { GoogleAuthAnalyticsService } from './google-auth-analytics.service';
import { CognitoJwtStrategy } from './strategies/cognito-jwt.strategy';
import { CognitoService } from '../../infrastructure/cognito/cognito.service';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    PassportModule, 
    forwardRef(() => AnalyticsModule),
  ],
  controllers: [AuthController, GoogleAuthController],
  providers: [
    AuthService, 
    GoogleAuthService, 
    CognitoService, 
    CognitoJwtStrategy,
    FederatedUserManagementService,
    FederatedSessionManagementService,
    GoogleAuthAnalyticsService,
  ],
  exports: [
    AuthService, 
    GoogleAuthService, 
    CognitoService,
    FederatedUserManagementService,
    FederatedSessionManagementService,
    GoogleAuthAnalyticsService,
  ],
})
export class AuthModule {}
