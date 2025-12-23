import { Injectable, Logger, UnauthorizedException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

export interface CognitoUser {
  sub: string;
  email: string;
  username: string;
  email_verified: boolean;
  phone_number?: string;
  phone_number_verified?: boolean;
}

export interface AuthResult {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  user: CognitoUser;
}

@Injectable()
export class CognitoService {
  private readonly logger = new Logger(CognitoService.name);
  private readonly cognitoIdentityServiceProvider: AWS.CognitoIdentityServiceProvider;
  private readonly userPoolId: string;
  private readonly clientId: string;
  private readonly jwtVerifier: CognitoJwtVerifier;

  constructor(private configService: ConfigService) {
    const region = this.configService.get('COGNITO_REGION', 'us-east-1');
    this.userPoolId = this.configService.get('COGNITO_USER_POOL_ID');
    this.clientId = this.configService.get('COGNITO_CLIENT_ID');

    if (!this.userPoolId || !this.clientId) {
      throw new Error('Cognito configuration missing: USER_POOL_ID and CLIENT_ID are required');
    }

    // Configurar AWS SDK v2 para Cognito
    AWS.config.update({
      region,
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
    });

    this.cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

    // Configurar verificador JWT para tokens de Cognito
    this.jwtVerifier = CognitoJwtVerifier.create({
      userPoolId: this.userPoolId,
      tokenUse: 'access',
      clientId: this.clientId,
    });
  }

  /**
   * Registrar un nuevo usuario en Cognito
   */
  async signUp(email: string, username: string, password: string, phoneNumber?: string): Promise<{ userSub: string }> {
    try {
      const userAttributes = [
        { Name: 'email', Value: email },
        { Name: 'preferred_username', Value: username },
      ];

      if (phoneNumber) {
        userAttributes.push({ Name: 'phone_number', Value: phoneNumber });
      }

      const params: AWS.CognitoIdentityServiceProvider.AdminCreateUserRequest = {
        UserPoolId: this.userPoolId,
        Username: email, // Usar email como username principal
        UserAttributes: userAttributes,
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS', // No enviar email automático
        DeliveryMediums: ['EMAIL'],
      };

      const result = await this.cognitoIdentityServiceProvider.adminCreateUser(params).promise();

      // Establecer contraseña permanente
      const setPasswordParams: AWS.CognitoIdentityServiceProvider.AdminSetUserPasswordRequest = {
        UserPoolId: this.userPoolId,
        Username: email,
        Password: password,
        Permanent: true,
      };

      await this.cognitoIdentityServiceProvider.adminSetUserPassword(setPasswordParams).promise();

      this.logger.log(`Usuario registrado en Cognito: ${email}`);
      return { userSub: result.User?.Username || email };
    } catch (error) {
      this.logger.error(`Error registrando usuario en Cognito: ${error.message}`);
      
      if (error.code === 'UsernameExistsException') {
        throw new ConflictException('El email ya está registrado');
      }
      
      throw error;
    }
  }

  /**
   * Iniciar sesión con Cognito
   */
  async signIn(email: string, password: string): Promise<AuthResult> {
    try {
      const params: AWS.CognitoIdentityServiceProvider.AdminInitiateAuthRequest = {
        UserPoolId: this.userPoolId,
        ClientId: this.clientId,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      };

      const result = await this.cognitoIdentityServiceProvider.adminInitiateAuth(params).promise();

      if (!result.AuthenticationResult) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      const { AccessToken, IdToken, RefreshToken } = result.AuthenticationResult;

      if (!AccessToken || !IdToken) {
        throw new UnauthorizedException('Error obteniendo tokens');
      }

      // Obtener información del usuario
      const user = await this.getUserFromToken(AccessToken);

      this.logger.log(`Usuario autenticado: ${email}`);
      return {
        accessToken: AccessToken,
        idToken: IdToken,
        refreshToken: RefreshToken || '',
        user,
      };
    } catch (error) {
      this.logger.error(`Error en login: ${error.message}`);
      
      if (error.code === 'NotAuthorizedException') {
        throw new UnauthorizedException('Credenciales inválidas');
      }
      
      throw error;
    }
  }

  /**
   * Verificar y obtener usuario desde token de acceso
   */
  async getUserFromToken(accessToken: string): Promise<CognitoUser> {
    try {
      // Verificar token
      const payload = await this.jwtVerifier.verify(accessToken);

      // Obtener detalles completos del usuario
      const params: AWS.CognitoIdentityServiceProvider.AdminGetUserRequest = {
        UserPoolId: this.userPoolId,
        Username: payload.username,
      };

      const result = await this.cognitoIdentityServiceProvider.adminGetUser(params).promise();

      if (!result.UserAttributes) {
        throw new Error('No se pudieron obtener los atributos del usuario');
      }

      // Convertir atributos a objeto
      const attributes = result.UserAttributes.reduce((acc, attr) => {
        if (attr.Name && attr.Value) {
          acc[attr.Name] = attr.Value;
        }
        return acc;
      }, {} as Record<string, string>);

      return {
        sub: payload.sub,
        email: attributes.email,
        username: attributes.preferred_username || attributes.email,
        email_verified: attributes.email_verified === 'true',
        phone_number: attributes.phone_number,
        phone_number_verified: attributes.phone_number_verified === 'true',
      };
    } catch (error) {
      this.logger.error(`Error obteniendo usuario desde token: ${error.message}`);
      throw new UnauthorizedException('Token inválido');
    }
  }

  /**
   * Confirmar registro de usuario
   */
  async confirmSignUp(email: string, confirmationCode: string): Promise<void> {
    try {
      const params: AWS.CognitoIdentityServiceProvider.ConfirmSignUpRequest = {
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: confirmationCode,
      };

      await this.cognitoIdentityServiceProvider.confirmSignUp(params).promise();
      this.logger.log(`Usuario confirmado: ${email}`);
    } catch (error) {
      this.logger.error(`Error confirmando usuario: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reenviar código de confirmación
   */
  async resendConfirmationCode(email: string): Promise<void> {
    try {
      const params: AWS.CognitoIdentityServiceProvider.ResendConfirmationCodeRequest = {
        ClientId: this.clientId,
        Username: email,
      };

      await this.cognitoIdentityServiceProvider.resendConfirmationCode(params).promise();
      this.logger.log(`Código de confirmación reenviado: ${email}`);
    } catch (error) {
      this.logger.error(`Error reenviando código: ${error.message}`);
      throw error;
    }
  }

  /**
   * Iniciar proceso de recuperación de contraseña
   */
  async forgotPassword(email: string): Promise<void> {
    try {
      const params: AWS.CognitoIdentityServiceProvider.ForgotPasswordRequest = {
        ClientId: this.clientId,
        Username: email,
      };

      await this.cognitoIdentityServiceProvider.forgotPassword(params).promise();
      this.logger.log(`Proceso de recuperación iniciado: ${email}`);
    } catch (error) {
      this.logger.error(`Error en forgot password: ${error.message}`);
      throw error;
    }
  }

  /**
   * Confirmar nueva contraseña
   */
  async confirmForgotPassword(email: string, confirmationCode: string, newPassword: string): Promise<void> {
    try {
      const params: AWS.CognitoIdentityServiceProvider.ConfirmForgotPasswordRequest = {
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: confirmationCode,
        Password: newPassword,
      };

      await this.cognitoIdentityServiceProvider.confirmForgotPassword(params).promise();
      this.logger.log(`Contraseña restablecida: ${email}`);
    } catch (error) {
      this.logger.error(`Error restableciendo contraseña: ${error.message}`);
      throw error;
    }
  }

  /**
   * Eliminar usuario (admin)
   */
  async deleteUser(email: string): Promise<void> {
    try {
      const params: AWS.CognitoIdentityServiceProvider.AdminDeleteUserRequest = {
        UserPoolId: this.userPoolId,
        Username: email,
      };

      await this.cognitoIdentityServiceProvider.adminDeleteUser(params).promise();
      this.logger.log(`Usuario eliminado: ${email}`);
    } catch (error) {
      this.logger.error(`Error eliminando usuario: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validar token de acceso
   */
  async validateAccessToken(accessToken: string): Promise<CognitoUser | null> {
    try {
      return await this.getUserFromToken(accessToken);
    } catch (error) {
      this.logger.warn(`Token inválido: ${error.message}`);
      return null;
    }
  }
}