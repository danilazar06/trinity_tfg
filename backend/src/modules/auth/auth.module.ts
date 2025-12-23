import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CognitoJwtStrategy } from './strategies/cognito-jwt.strategy';
import { CognitoService } from '../../infrastructure/cognito/cognito.service';

@Module({
  imports: [PassportModule],
  controllers: [AuthController],
  providers: [AuthService, CognitoService, CognitoJwtStrategy],
  exports: [AuthService, CognitoService],
})
export class AuthModule {}