import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import { CognitoService } from '../../infrastructure/cognito/cognito.service';

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
}

export interface GoogleTokenInfo {
  idToken: string;
  accessToken?: string;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly googleClient: OAuth2Client | null;
  private readonly googleClientId: string | undefined;

  constructor(
    private configService: ConfigService,
    private multiTableService: MultiTableService,
    private cognitoService: CognitoService,
  ) {
    this.googleClientId = this.configService.get('GOOGLE_CLIENT_ID');
    
    if (!this.googleClientId || this.googleClientId === 'your_google_web_client_id_here') {
      this.logger.warn('⚠️ Google Client ID no configurado - Google Auth deshabilitado');
      this.googleClient = null;
    } else {
      this.googleClient = new OAuth2Client(this.googleClientId);
      this.logger.log('✅ Google OAuth Client inicializado');
    }
  }

  /**
   * Verificar token de Google y obtener información del usuario
   */
  async verifyGoogleToken(idToken: string): Promise<GoogleUserInfo> {
    if (!this.googleClient) {
      throw new UnauthorizedException('Google Auth no está configurado');
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleClientId!,
      });

      const payload = ticket.getPayload();
      
      if (!payload) {
        throw new UnauthorizedException('Token de Google inválido');
      }

      // Validar que el token sea para nuestra aplicación
      if (payload.aud !== this.googleClientId!) {
        throw new UnauthorizedException('Token de Google no es para esta aplicación');
      }

      // Validar que el token no haya expirado
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new UnauthorizedException('Token de Google ha expirado');
      }

      this.logger.log(`Token de Google verificado para: ${payload.email}`);

      return {
        id: payload.sub!,
        email: payload.email!,
        name: payload.name || payload.email!.split('@')[0],
        picture: payload.picture,
        email_verified: payload.email_verified || false,
      };
    } catch (error) {
      this.logger.error(`Error verificando token de Google: ${error.message}`);
      
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      throw new UnauthorizedException('Token de Google inválido');
    }
  }

  /**
   * Crear o actualizar usuario desde información de Google
   */
  async createOrUpdateUserFromGoogle(googleUser: GoogleUserInfo): Promise<any> {
    try {
      // Buscar usuario existente por email
      const existingUsers = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': googleUser.email,
        },
      });

      let user;
      
      if (existingUsers.length > 0) {
        // Usuario existe - actualizar información de Google
        user = existingUsers[0];
        
        this.logger.log(`Actualizando usuario existente: ${googleUser.email}`);
        
        await this.multiTableService.update('trinity-users-dev', { userId: user.userId }, {
          UpdateExpression: 'SET googleId = :googleId, isGoogleLinked = :isGoogleLinked, displayName = :displayName, avatarUrl = :avatarUrl, lastGoogleSync = :lastGoogleSync',
          ExpressionAttributeValues: {
            ':googleId': googleUser.id,
            ':isGoogleLinked': true,
            ':displayName': googleUser.name,
            ':avatarUrl': googleUser.picture || user.avatarUrl,
            ':lastGoogleSync': new Date().toISOString(),
          },
        });
        
        // Actualizar authProviders si no incluye 'google'
        const authProviders = user.authProviders || ['email'];
        if (!authProviders.includes('google')) {
          authProviders.push('google');
          
          await this.multiTableService.update('trinity-users-dev', { userId: user.userId }, {
            UpdateExpression: 'SET authProviders = :authProviders',
            ExpressionAttributeValues: {
              ':authProviders': authProviders,
            },
          });
        }
        
      } else {
        // Usuario nuevo - crear desde Google
        const userId = `google_${googleUser.id}`;
        
        this.logger.log(`Creando nuevo usuario desde Google: ${googleUser.email}`);
        
        await this.multiTableService.createUser({
          userId,
          email: googleUser.email,
          username: googleUser.email.split('@')[0],
          displayName: googleUser.name,
          avatarUrl: googleUser.picture,
          emailVerified: googleUser.email_verified,
          googleId: googleUser.id,
          isGoogleLinked: true,
          authProviders: ['google'],
          lastGoogleSync: new Date().toISOString(),
        });
        
        user = {
          userId,
          email: googleUser.email,
          username: googleUser.email.split('@')[0],
          displayName: googleUser.name,
          avatarUrl: googleUser.picture,
          emailVerified: googleUser.email_verified,
          googleId: googleUser.id,
          isGoogleLinked: true,
          authProviders: ['google'],
          lastGoogleSync: new Date().toISOString(),
        };
      }

      return {
        id: user.userId,
        sub: user.userId,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        phoneNumber: user.phoneNumber,
        googleId: user.googleId,
        isGoogleLinked: user.isGoogleLinked,
        authProviders: user.authProviders,
      };
      
    } catch (error) {
      this.logger.error(`Error creando/actualizando usuario desde Google: ${error.message}`);
      throw error;
    }
  }

  /**
   * Vincular cuenta de Google a usuario existente
   */
  async linkGoogleToExistingUser(userId: string, googleUser: GoogleUserInfo): Promise<void> {
    try {
      // Verificar que el usuario existe
      const user = await this.multiTableService.getUser(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar que no hay otro usuario con este Google ID
      const existingGoogleUsers = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'googleId = :googleId',
        ExpressionAttributeValues: {
          ':googleId': googleUser.id,
        },
      });

      if (existingGoogleUsers.length > 0 && existingGoogleUsers[0].userId !== userId) {
        throw new Error('Esta cuenta de Google ya está vinculada a otro usuario');
      }

      // Vincular Google al usuario
      const authProviders = user.authProviders || ['email'];
      if (!authProviders.includes('google')) {
        authProviders.push('google');
      }

      await this.multiTableService.update('trinity-users-dev', { userId }, {
        UpdateExpression: 'SET googleId = :googleId, isGoogleLinked = :isGoogleLinked, authProviders = :authProviders, lastGoogleSync = :lastGoogleSync',
        ExpressionAttributeValues: {
          ':googleId': googleUser.id,
          ':isGoogleLinked': true,
          ':authProviders': authProviders,
          ':lastGoogleSync': new Date().toISOString(),
        },
      });

      this.logger.log(`Cuenta de Google vinculada al usuario: ${userId}`);
      
    } catch (error) {
      this.logger.error(`Error vinculando Google al usuario ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Desvincular cuenta de Google de usuario
   */
  async unlinkGoogleFromUser(userId: string): Promise<void> {
    try {
      // Verificar que el usuario existe
      const user = await this.multiTableService.getUser(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar que el usuario tiene otros métodos de autenticación
      const authProviders = user.authProviders || [];
      const nonGoogleProviders = authProviders.filter(provider => provider !== 'google');
      
      if (nonGoogleProviders.length === 0) {
        throw new Error('No se puede desvincular Google: es el único método de autenticación');
      }

      // Desvincular Google
      await this.multiTableService.update('trinity-users-dev', { userId }, {
        UpdateExpression: 'REMOVE googleId, lastGoogleSync SET isGoogleLinked = :isGoogleLinked, authProviders = :authProviders',
        ExpressionAttributeValues: {
          ':isGoogleLinked': false,
          ':authProviders': nonGoogleProviders,
        },
      });

      this.logger.log(`Cuenta de Google desvinculada del usuario: ${userId}`);
      
    } catch (error) {
      this.logger.error(`Error desvinculando Google del usuario ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sincronizar información de perfil desde Google
   */
  async syncProfileFromGoogle(userId: string, googleUser: GoogleUserInfo): Promise<void> {
    try {
      await this.multiTableService.update('trinity-users-dev', { userId }, {
        UpdateExpression: 'SET displayName = :displayName, avatarUrl = :avatarUrl, lastGoogleSync = :lastGoogleSync',
        ExpressionAttributeValues: {
          ':displayName': googleUser.name,
          ':avatarUrl': googleUser.picture,
          ':lastGoogleSync': new Date().toISOString(),
        },
      });

      this.logger.log(`Perfil sincronizado desde Google para usuario: ${userId}`);
      
    } catch (error) {
      this.logger.error(`Error sincronizando perfil desde Google: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verificar si Google Auth está disponible
   */
  isGoogleAuthAvailable(): boolean {
    return !!this.googleClient;
  }
}