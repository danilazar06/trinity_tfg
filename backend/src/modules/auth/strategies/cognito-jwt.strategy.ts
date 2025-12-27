import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { AuthService } from '../auth.service';

@Injectable()
export class CognitoJwtStrategy extends PassportStrategy(Strategy, 'cognito-jwt') {
  private readonly logger = new Logger(CognitoJwtStrategy.name);

  constructor(private authService: AuthService) {
    super();
    this.logger.log('CognitoJwtStrategy inicializada');
  }

  async validate(req: any): Promise<any> {
    // Extraer token del header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('No authorization header');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization format');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Token vacío');
    }

    try {
      // Validar token con Cognito
      const user = await this.authService.validateUserByToken(token);
      
      if (!user) {
        throw new UnauthorizedException('Token inválido');
      }

      return user;
    } catch (error) {
      this.logger.warn(`Error validando token: ${error.message}`);
      throw new UnauthorizedException('Token inválido');
    }
  }
}
