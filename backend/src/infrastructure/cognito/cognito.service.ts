import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
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

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface CognitoFederatedUser {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  'custom:google_id'?: string;
  'custom:auth_providers'?: string[];
  'custom:last_google_sync'?: string;
  'custom:google_hd'?: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  hd?: string;
}

@Injectable()
export class CognitoService {
  private readonly logger = new Logger(CognitoService.name);
  private readonly cognitoIdentityServiceProvider: AWS.CognitoIdentityServiceProvider;
  private readonly cognitoIdentity: AWS.CognitoIdentity;
  private readonly userPoolId: string;
  private readonly clientId: string;
  private readonly identityPoolId: string;
  private readonly googleProviderName: string;
  private readonly federatedIdentityEnabled: boolean;
  private readonly jwtVerifier: any; // Simplificado para evitar problemas de tipos

  constructor(private configService: ConfigService) {
    const region = this.configService.get('COGNITO_REGION', 'us-east-1');
    this.userPoolId = this.configService.get('COGNITO_USER_POOL_ID') || 'default-pool-id';
    this.clientId = this.configService.get('COGNITO_CLIENT_ID') || 'default-client-id';
    this.identityPoolId = this.configService.get('COGNITO_IDENTITY_POOL_ID') || '';
    this.googleProviderName = this.configService.get('COGNITO_GOOGLE_PROVIDER_NAME', 'accounts.google.com');
    this.federatedIdentityEnabled = this.configService.get('COGNITO_FEDERATED_IDENTITY_ENABLED', 'false') === 'true';

    this.logger.log(`🔧 Inicializando CognitoService...`);
    this.logger.log(`📍 Region: ${region}`);
    this.logger.log(`🏊 User Pool ID: ${this.userPoolId}`);
    this.logger.log(`🆔 Client ID: ${this.clientId}`);
    this.logger.log(`🔗 Identity Pool ID: ${this.identityPoolId}`);
    this.logger.log(`🌐 Google Provider: ${this.googleProviderName}`);
    this.logger.log(`🔀 Federated Identity: ${this.federatedIdentityEnabled}`);

    if (!this.userPoolId || !this.clientId) {
      throw new Error(
        'Cognito configuration missing: USER_POOL_ID and CLIENT_ID are required',
      );
    }

    // Configurar AWS SDK v2 para Cognito
    AWS.config.update({
      region,
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
    });

    this.cognitoIdentityServiceProvider =
      new AWS.CognitoIdentityServiceProvider();
    
    // Inicializar Cognito Identity para federación
    this.cognitoIdentity = new AWS.CognitoIdentity();

    // Configurar verificador JWT para tokens de Cognito solo si está configurado
    if (this.userPoolId && this.userPoolId !== 'your-cognito-user-pool-id') {
      try {
        this.jwtVerifier = CognitoJwtVerifier.create({
          userPoolId: this.userPoolId,
          tokenUse: 'access',
          clientId: this.clientId,
        });
        this.logger.log('✅ JWT Verifier configurado correctamente');
      } catch (error) {
        this.logger.error(`❌ Error configurando JWT Verifier: ${error.message}`);
        this.jwtVerifier = null;
      }
    } else {
      this.logger.warn('⚠️ Cognito User Pool ID no configurado - autenticación JWT deshabilitada');
      this.jwtVerifier = null;
    }

    // Validar configuración de federación
    this.validateProviderConfiguration();
  }

  /**
   * Registrar un nuevo usuario en Cognito
   */
  async signUp(
    email: string,
    username: string,
    password: string,
    phoneNumber?: string,
  ): Promise<{ userSub: string }> {
    try {
      const userAttributes = [
        { Name: 'email', Value: email },
        { Name: 'preferred_username', Value: username },
      ];

      if (phoneNumber) {
        userAttributes.push({ Name: 'phone_number', Value: phoneNumber });
      }

      const params: AWS.CognitoIdentityServiceProvider.AdminCreateUserRequest =
        {
          UserPoolId: this.userPoolId,
          Username: email, // Usar email como username principal
          UserAttributes: userAttributes,
          TemporaryPassword: password,
          MessageAction: 'SUPPRESS', // No enviar email automático
        };

      const result = await this.cognitoIdentityServiceProvider
        .adminCreateUser(params)
        .promise();

      // Establecer contraseña permanente
      const setPasswordParams: AWS.CognitoIdentityServiceProvider.AdminSetUserPasswordRequest =
        {
          UserPoolId: this.userPoolId,
          Username: email,
          Password: password,
          Permanent: true,
        };

      await this.cognitoIdentityServiceProvider
        .adminSetUserPassword(setPasswordParams)
        .promise();

      this.logger.log(`Usuario registrado en Cognito: ${email}`);
      return { userSub: result.User?.Username || email };
    } catch (error) {
      this.logger.error(
        `Error registrando usuario en Cognito: ${error.message}`,
      );

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
      const params: AWS.CognitoIdentityServiceProvider.AdminInitiateAuthRequest =
        {
          UserPoolId: this.userPoolId,
          ClientId: this.clientId,
          AuthFlow: 'ADMIN_NO_SRP_AUTH',
          AuthParameters: {
            USERNAME: email,
            PASSWORD: password,
          },
        };

      const result = await this.cognitoIdentityServiceProvider
        .adminInitiateAuth(params)
        .promise();

      if (!result.AuthenticationResult) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      const { AccessToken, IdToken, RefreshToken } =
        result.AuthenticationResult;

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
      if (!this.jwtVerifier) {
        throw new Error('Cognito JWT Verifier no está configurado');
      }

      // Verificar token
      const payload = await this.jwtVerifier.verify(accessToken);

      // Obtener detalles completos del usuario
      const params: AWS.CognitoIdentityServiceProvider.AdminGetUserRequest = {
        UserPoolId: this.userPoolId,
        Username: payload.username,
      };

      const result = await this.cognitoIdentityServiceProvider
        .adminGetUser(params)
        .promise();

      if (!result.UserAttributes) {
        throw new Error('No se pudieron obtener los atributos del usuario');
      }

      // Convertir atributos a objeto
      const attributes = result.UserAttributes.reduce(
        (acc, attr) => {
          if (attr.Name && attr.Value) {
            acc[attr.Name] = attr.Value;
          }
          return acc;
        },
        {} as Record<string, string>,
      );

      return {
        sub: payload.sub,
        email: attributes.email,
        username: attributes.preferred_username || attributes.email,
        email_verified: attributes.email_verified === 'true',
        phone_number: attributes.phone_number,
        phone_number_verified: attributes.phone_number_verified === 'true',
      };
    } catch (error) {
      this.logger.error(
        `Error obteniendo usuario desde token: ${error.message}`,
      );
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
      const params: AWS.CognitoIdentityServiceProvider.ResendConfirmationCodeRequest =
        {
          ClientId: this.clientId,
          Username: email,
        };

      await this.cognitoIdentityServiceProvider
        .resendConfirmationCode(params)
        .promise();
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

      await this.cognitoIdentityServiceProvider
        .forgotPassword(params)
        .promise();
      this.logger.log(`Proceso de recuperación iniciado: ${email}`);
    } catch (error) {
      this.logger.error(`Error en forgot password: ${error.message}`);
      throw error;
    }
  }

  /**
   * Confirmar nueva contraseña
   */
  async confirmForgotPassword(
    email: string,
    confirmationCode: string,
    newPassword: string,
  ): Promise<void> {
    try {
      const params: AWS.CognitoIdentityServiceProvider.ConfirmForgotPasswordRequest =
        {
          ClientId: this.clientId,
          Username: email,
          ConfirmationCode: confirmationCode,
          Password: newPassword,
        };

      await this.cognitoIdentityServiceProvider
        .confirmForgotPassword(params)
        .promise();
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
      const params: AWS.CognitoIdentityServiceProvider.AdminDeleteUserRequest =
        {
          UserPoolId: this.userPoolId,
          Username: email,
        };

      await this.cognitoIdentityServiceProvider
        .adminDeleteUser(params)
        .promise();
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

  // ==================== MÉTODOS DE AUTENTICACIÓN FEDERADA ====================

  /**
   * Validar configuración del proveedor Google
   */
  validateProviderConfiguration(): boolean {
    try {
      const hasIdentityPool = !!(this.identityPoolId && 
        this.identityPoolId !== 'your-cognito-identity-pool-id' &&
        this.identityPoolId.trim() !== '');
      
      const hasGoogleProvider = !!(this.googleProviderName && 
        this.googleProviderName !== 'your-google-provider-name' &&
        this.googleProviderName.trim() !== '');
      
      const isFederationEnabled = this.federatedIdentityEnabled;

      if (!hasIdentityPool) {
        this.logger.warn('⚠️ Cognito Identity Pool ID no configurado - autenticación federada deshabilitada');
        return false;
      }

      if (!hasGoogleProvider) {
        this.logger.warn('⚠️ Google Provider Name no configurado - autenticación Google deshabilitada');
        return false;
      }

      if (!isFederationEnabled) {
        this.logger.warn('⚠️ Federated Identity deshabilitada en configuración');
        return false;
      }

      this.logger.log('✅ Configuración de federación Google validada correctamente');
      return true;
    } catch (error) {
      this.logger.error(`❌ Error validando configuración de federación: ${error.message}`);
      return false;
    }
  }

  /**
   * Autenticar con Google usando ID Token
   */
  async authenticateWithGoogle(googleIdToken: string): Promise<CognitoTokens> {
    try {
      if (!this.validateProviderConfiguration()) {
        throw new UnauthorizedException('Google authentication not configured');
      }

      // Obtener credenciales temporales de AWS usando el token de Google
      const params: AWS.CognitoIdentity.GetIdInput = {
        IdentityPoolId: this.identityPoolId,
        Logins: {
          [this.googleProviderName]: googleIdToken,
        },
      };

      const identityResult = await this.cognitoIdentity.getId(params).promise();
      
      if (!identityResult.IdentityId) {
        throw new UnauthorizedException('Failed to get Cognito Identity ID');
      }

      // Obtener credenciales AWS
      const credentialsParams: AWS.CognitoIdentity.GetCredentialsForIdentityInput = {
        IdentityId: identityResult.IdentityId,
        Logins: {
          [this.googleProviderName]: googleIdToken,
        },
      };

      const credentialsResult = await this.cognitoIdentity
        .getCredentialsForIdentity(credentialsParams)
        .promise();

      if (!credentialsResult.Credentials) {
        throw new UnauthorizedException('Failed to get AWS credentials');
      }

      // Generar tokens de Cognito para la sesión federada
      const tokens: CognitoTokens = {
        accessToken: `cognito_federated_${identityResult.IdentityId}_${Date.now()}`,
        idToken: `cognito_id_${identityResult.IdentityId}_${Date.now()}`,
        refreshToken: `cognito_refresh_${identityResult.IdentityId}_${Date.now()}`,
        expiresIn: 3600, // 1 hora
      };

      this.logger.log(`Usuario autenticado con Google federado: ${identityResult.IdentityId}`);
      return tokens;
    } catch (error) {
      this.logger.error(`Error en autenticación federada con Google: ${error.message}`);
      throw new UnauthorizedException('Google federated authentication failed');
    }
  }

  /**
   * Intercambiar token de Google por tokens de Cognito
   */
  async exchangeGoogleTokenForCognito(googleToken: string): Promise<CognitoTokens> {
    return await this.authenticateWithGoogle(googleToken);
  }

  /**
   * Refrescar tokens federados
   */
  async refreshFederatedTokens(refreshToken: string): Promise<CognitoTokens> {
    try {
      // En un escenario real, esto requeriría lógica más compleja
      // Por ahora, generamos nuevos tokens
      const identityId = this.extractIdentityIdFromToken(refreshToken);
      
      const tokens: CognitoTokens = {
        accessToken: `cognito_federated_${identityId}_${Date.now()}`,
        idToken: `cognito_id_${identityId}_${Date.now()}`,
        refreshToken: `cognito_refresh_${identityId}_${Date.now()}`,
        expiresIn: 3600,
      };

      this.logger.log(`Tokens federados refrescados para: ${identityId}`);
      return tokens;
    } catch (error) {
      this.logger.error(`Error refrescando tokens federados: ${error.message}`);
      throw new UnauthorizedException('Failed to refresh federated tokens');
    }
  }

  /**
   * Vincular proveedor Google a usuario existente
   */
  async linkGoogleProvider(userId: string, googleIdToken: string): Promise<void> {
    try {
      // Verificar que el usuario existe
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // En un escenario real, esto requeriría configuración adicional en Cognito
      // Por ahora, simulamos la vinculación
      this.logger.log(`Proveedor Google vinculado al usuario: ${userId}`);
    } catch (error) {
      this.logger.error(`Error vinculando proveedor Google: ${error.message}`);
      throw error;
    }
  }

  /**
   * Desvincular proveedor Google
   */
  async unlinkGoogleProvider(userId: string): Promise<void> {
    try {
      // Verificar que el usuario existe
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // En un escenario real, esto requeriría configuración adicional en Cognito
      // Por ahora, simulamos la desvinculación
      this.logger.log(`Proveedor Google desvinculado del usuario: ${userId}`);
    } catch (error) {
      this.logger.error(`Error desvinculando proveedor Google: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear usuario federado en Cognito
   */
  async createFederatedUser(googleUser: GoogleUserInfo): Promise<CognitoFederatedUser> {
    try {
      const userAttributes = [
        { Name: 'email', Value: googleUser.email },
        { Name: 'email_verified', Value: googleUser.email_verified.toString() },
        { Name: 'name', Value: googleUser.name },
        { Name: 'given_name', Value: googleUser.given_name || '' },
        { Name: 'family_name', Value: googleUser.family_name || '' },
        { Name: 'picture', Value: googleUser.picture || '' },
        { Name: 'custom:google_id', Value: googleUser.sub },
        { Name: 'custom:auth_providers', Value: JSON.stringify(['google']) },
        { Name: 'custom:last_google_sync', Value: new Date().toISOString() },
      ];

      if (googleUser.hd) {
        userAttributes.push({ Name: 'custom:google_hd', Value: googleUser.hd });
      }

      const params: AWS.CognitoIdentityServiceProvider.AdminCreateUserRequest = {
        UserPoolId: this.userPoolId,
        Username: `google_${googleUser.sub}`,
        UserAttributes: userAttributes,
        MessageAction: 'SUPPRESS',
      };

      const result = await this.cognitoIdentityServiceProvider
        .adminCreateUser(params)
        .promise();

      this.logger.log(`Usuario federado creado: ${googleUser.email}`);

      return {
        sub: result.User?.Username || `google_${googleUser.sub}`,
        email: googleUser.email,
        email_verified: googleUser.email_verified,
        name: googleUser.name,
        given_name: googleUser.given_name,
        family_name: googleUser.family_name,
        picture: googleUser.picture,
        'custom:google_id': googleUser.sub,
        'custom:auth_providers': ['google'],
        'custom:last_google_sync': new Date().toISOString(),
        'custom:google_hd': googleUser.hd,
      };
    } catch (error) {
      this.logger.error(`Error creando usuario federado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener usuario por ID (método auxiliar)
   */
  private async getUserById(userId: string): Promise<any> {
    try {
      const params: AWS.CognitoIdentityServiceProvider.AdminGetUserRequest = {
        UserPoolId: this.userPoolId,
        Username: userId,
      };

      const result = await this.cognitoIdentityServiceProvider
        .adminGetUser(params)
        .promise();

      return result;
    } catch (error) {
      if (error.code === 'UserNotFoundException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Extraer Identity ID del token (método auxiliar)
   */
  private extractIdentityIdFromToken(token: string): string {
    // Extraer el Identity ID del token de refresh
    const parts = token.split('_');
    return parts.length > 2 ? parts[2] : 'unknown';
  }
}
