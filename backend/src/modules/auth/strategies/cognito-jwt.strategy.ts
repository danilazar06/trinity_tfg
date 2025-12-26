import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class CognitoJwtStrategy extends PassportStrategy(
  Strategy,
  'cognito-jwt',
) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Para Cognito, no necesitamos secretOrKey ya que usa verificación remota
      secretOrKeyProvider: (request, rawJwtToken, done) => {
        // Pasamos el token completo para verificación con Cognito
        done(null, rawJwtToken);
      },
      passReqToCallback: true,
    });
  }

  async validate(request: any, payload: any) {
    // Extraer el token del header
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);

    if (!token) {
      throw new UnauthorizedException('Token no encontrado');
    }

    // Validar con Cognito y obtener usuario
    const user = await this.authService.validateUserByToken(token);

    if (!user) {
      throw new UnauthorizedException('Token inválido');
    }

    return user;
  }
}
