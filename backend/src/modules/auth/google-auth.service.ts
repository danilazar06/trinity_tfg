import { Injectable, Logger, UnauthorizedException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import { CognitoService, CognitoTokens, CognitoFederatedUser, GoogleUserInfo as CognitoGoogleUserInfo } from '../../infrastructure/cognito/cognito.service';

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
  given_name?: string;
  family_name?: string;
  locale?: string;
  hd?: string;
}

export interface GoogleTokenInfo {
  idToken: string;
  accessToken?: string;
}

export interface FederatedAuthResult {
  user: any;
  cognitoTokens: CognitoTokens;
  isNewUser: boolean;
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
   * Verificar token de Google y obtener información del usuario con validaciones de seguridad completas
   */
  async verifyGoogleToken(idToken: string): Promise<GoogleUserInfo> {
    if (!this.googleClient) {
      this.logger.error('🔒 Intento de verificación de token sin Google Client configurado');
      throw new UnauthorizedException('Google Auth no está configurado');
    }

    // Validaciones de seguridad del token
    if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
      this.logger.error('🔒 Token de Google vacío o inválido recibido');
      throw new UnauthorizedException('Token de Google requerido');
    }

    if (idToken === 'null' || idToken === 'undefined') {
      this.logger.error('🔒 Token de Google con valor literal null/undefined');
      throw new UnauthorizedException('Token de Google inválido');
    }

    // Validar formato básico de JWT
    const tokenParts = idToken.split('.');
    if (tokenParts.length !== 3) {
      this.logger.error('🔒 Token de Google no tiene formato JWT válido');
      throw new UnauthorizedException('Formato de token inválido');
    }

    try {
      // Log del intento de verificación (sin exponer el token completo)
      const tokenPrefix = idToken.substring(0, 20) + '...';
      this.logger.log(`🔐 Verificando token de Google: ${tokenPrefix}`);

      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleClientId!,
      });

      const payload = ticket.getPayload();
      
      if (!payload) {
        this.logger.error('🔒 Payload vacío en token de Google');
        throw new UnauthorizedException('Token de Google inválido - payload vacío');
      }

      // Validaciones de seguridad del payload
      await this.validateTokenPayload(payload);

      // Log de verificación exitosa
      this.logger.log(`✅ Token de Google verificado exitosamente para: ${payload.email}`);

      // Log de evento de seguridad
      this.logSecurityEvent('GOOGLE_TOKEN_VERIFIED', {
        email: payload.email,
        sub: payload.sub,
        audience: payload.aud,
        issuer: payload.iss,
        timestamp: new Date().toISOString(),
      });

      return {
        id: payload.sub!,
        email: payload.email!,
        name: payload.name || payload.email!.split('@')[0],
        picture: payload.picture,
        email_verified: payload.email_verified || false,
        given_name: payload.given_name,
        family_name: payload.family_name,
        locale: payload.locale,
        hd: payload.hd,
      };
    } catch (error) {
      // Log detallado del error de seguridad
      this.logger.error(`🔒 Error verificando token de Google: ${error.message}`);
      
      // Log de evento de seguridad fallido
      this.logSecurityEvent('GOOGLE_TOKEN_VERIFICATION_FAILED', {
        error: error.message,
        tokenPrefix: idToken.substring(0, 20) + '...',
        timestamp: new Date().toISOString(),
      });

      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      // Clasificar tipos de errores para mejor logging
      if (error.message.includes('Token used too late') || error.message.includes('expired')) {
        this.logger.error('🔒 Token de Google expirado detectado');
        throw new UnauthorizedException('Token de Google ha expirado');
      }
      
      if (error.message.includes('Wrong recipient') || error.message.includes('audience')) {
        this.logger.error('🔒 Audience inválida en token de Google');
        throw new UnauthorizedException('Token de Google no es para esta aplicación');
      }
      
      throw new UnauthorizedException('Token de Google inválido');
    }
  }

  /**
   * Validar payload del token con verificaciones de seguridad completas
   */
  private async validateTokenPayload(payload: any): Promise<void> {
    // Validar audience (destinatario del token)
    if (payload.aud !== this.googleClientId!) {
      this.logger.error(`🔒 Audience inválida: esperada=${this.googleClientId}, recibida=${payload.aud}`);
      throw new UnauthorizedException('Token de Google no es para esta aplicación');
    }

    // Validar issuer (emisor del token)
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!validIssuers.includes(payload.iss)) {
      this.logger.error(`🔒 Issuer inválido: ${payload.iss}`);
      throw new UnauthorizedException('Token de Google de issuer no válido');
    }

    // Validar expiración con margen de seguridad
    const now = Math.floor(Date.now() / 1000);
    const securityMargin = 60; // 1 minuto de margen
    
    if (payload.exp && payload.exp < (now + securityMargin)) {
      const expirationTime = new Date(payload.exp * 1000).toISOString();
      this.logger.error(`🔒 Token expirado o próximo a expirar: exp=${expirationTime}, now=${new Date().toISOString()}`);
      throw new UnauthorizedException('Token de Google ha expirado');
    }

    // Validar issued at (iat) - no debe ser futuro
    if (payload.iat && payload.iat > (now + securityMargin)) {
      this.logger.error(`🔒 Token emitido en el futuro: iat=${payload.iat}, now=${now}`);
      throw new UnauthorizedException('Token de Google con timestamp inválido');
    }

    // Validar campos requeridos
    if (!payload.sub || !payload.email) {
      this.logger.error('🔒 Token de Google sin campos requeridos (sub, email)');
      throw new UnauthorizedException('Token de Google incompleto');
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.email)) {
      this.logger.error(`🔒 Email inválido en token: ${payload.email}`);
      throw new UnauthorizedException('Email inválido en token de Google');
    }

    // Validar longitud de campos críticos
    if (payload.sub.length < 10 || payload.sub.length > 50) {
      this.logger.error(`🔒 Google ID (sub) con longitud inválida: ${payload.sub.length}`);
      throw new UnauthorizedException('Google ID inválido');
    }

    // Log de validación exitosa
    this.logger.log(`🔐 Payload del token validado exitosamente para: ${payload.email}`);
  }

  /**
   * Registrar eventos de seguridad
   */
  private logSecurityEvent(eventType: string, details: Record<string, any>): void {
    const securityEvent = {
      type: eventType,
      timestamp: new Date().toISOString(),
      service: 'GoogleAuthService',
      details: {
        ...details,
        // No incluir información sensible en logs
        userAgent: 'backend-service',
        source: 'google-auth-verification',
      },
    };

    // Log estructurado para sistemas de monitoreo
    this.logger.log(`🔒 SECURITY_EVENT: ${JSON.stringify(securityEvent)}`);
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

  // ==================== MÉTODOS DE AUTENTICACIÓN FEDERADA CON COGNITO ====================

  /**
   * Autenticar con Google usando Cognito Identity Pool con validaciones de seguridad
   */
  async authenticateWithGoogleFederated(idToken: string): Promise<FederatedAuthResult> {
    try {
      // Log del inicio de autenticación federada
      this.logger.log('🔐 Iniciando autenticación federada con Google...');
      
      // Verificar token de Google con validaciones de seguridad completas
      const googleUser = await this.verifyGoogleToken(idToken);
      
      // Validaciones adicionales de seguridad para federación
      await this.validateFederatedAuthSecurity(googleUser, idToken);
      
      // Convertir a formato compatible con Cognito
      const cognitoGoogleUser: CognitoGoogleUserInfo = {
        sub: googleUser.id,
        email: googleUser.email,
        email_verified: googleUser.email_verified,
        name: googleUser.name,
        given_name: googleUser.given_name,
        family_name: googleUser.family_name,
        picture: googleUser.picture,
        locale: googleUser.locale,
        hd: googleUser.hd,
      };

      // Intercambiar token de Google por tokens de Cognito con validación
      const cognitoTokens = await this.exchangeTokenWithValidation(idToken, googleUser);
      
      // Crear o actualizar usuario federado con validaciones
      const federatedUser = await this.createOrUpdateFederatedUserSecure(cognitoGoogleUser);
      
      // Log de evento de seguridad exitoso
      this.logSecurityEvent('FEDERATED_AUTH_SUCCESS', {
        email: googleUser.email,
        sub: googleUser.id,
        isNewUser: !federatedUser.existingUser,
        provider: 'google',
        cognitoTokensGenerated: true,
      });
      
      this.logger.log(`✅ Autenticación federada exitosa para: ${googleUser.email}`);
      
      return {
        user: federatedUser,
        cognitoTokens,
        isNewUser: !federatedUser.existingUser,
      };
      
    } catch (error) {
      // Log de evento de seguridad fallido
      this.logSecurityEvent('FEDERATED_AUTH_FAILED', {
        error: error.message,
        errorType: error.constructor.name,
        timestamp: new Date().toISOString(),
      });
      
      this.logger.error(`🔒 Error en autenticación federada: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validar seguridad específica para autenticación federada
   */
  private async validateFederatedAuthSecurity(googleUser: GoogleUserInfo, idToken: string): Promise<void> {
    // Validar que el email esté verificado por Google
    if (!googleUser.email_verified) {
      this.logger.error(`🔒 Email no verificado en Google para: ${googleUser.email}`);
      throw new UnauthorizedException('Email no verificado por Google');
    }

    // Validar dominio si está configurado (para organizaciones)
    const allowedDomains = this.configService.get('GOOGLE_ALLOWED_DOMAINS');
    if (allowedDomains) {
      const domains = allowedDomains.split(',').map(d => d.trim());
      const emailDomain = googleUser.email.split('@')[1];
      
      if (!domains.includes(emailDomain)) {
        this.logger.error(`🔒 Dominio no permitido: ${emailDomain}`);
        throw new UnauthorizedException('Dominio de email no permitido');
      }
    }

    // Validar que no sea una cuenta de servicio o bot
    if (googleUser.email.includes('noreply') || googleUser.email.includes('service-account')) {
      this.logger.error(`🔒 Intento de login con cuenta de servicio: ${googleUser.email}`);
      throw new UnauthorizedException('Cuentas de servicio no permitidas');
    }

    // Validar límites de rate limiting por usuario
    await this.validateUserRateLimit(googleUser.email);

    this.logger.log(`🔐 Validaciones de seguridad federada completadas para: ${googleUser.email}`);
  }

  /**
   * Intercambiar token con validaciones adicionales
   */
  private async exchangeTokenWithValidation(googleToken: string, googleUser: GoogleUserInfo): Promise<CognitoTokens> {
    try {
      // Validar que Cognito esté configurado correctamente
      if (!this.cognitoService.validateProviderConfiguration()) {
        throw new Error('Cognito federated authentication not properly configured');
      }

      // Intercambiar token
      const cognitoTokens = await this.cognitoService.exchangeGoogleTokenForCognito(googleToken);
      
      // Validar que los tokens de Cognito sean válidos
      if (!cognitoTokens.accessToken || !cognitoTokens.idToken) {
        throw new Error('Invalid Cognito tokens received');
      }

      // Validar consistencia entre tokens
      const isConsistent = await this.validateTokenConsistency(googleToken, cognitoTokens);
      if (!isConsistent) {
        this.logger.error(`🔒 Inconsistencia detectada entre tokens Google y Cognito para: ${googleUser.email}`);
        throw new UnauthorizedException('Token consistency validation failed');
      }

      this.logger.log(`🔐 Intercambio de tokens validado exitosamente para: ${googleUser.email}`);
      return cognitoTokens;
      
    } catch (error) {
      this.logger.error(`🔒 Error en intercambio de tokens: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear o actualizar usuario federado con validaciones de seguridad
   */
  private async createOrUpdateFederatedUserSecure(googleUser: CognitoGoogleUserInfo): Promise<any> {
    try {
      // Validar datos del usuario antes de procesar
      this.validateUserData(googleUser);
      
      // Buscar usuario existente con validaciones
      const existingUserByEmail = await this.findUserByEmailSecure(googleUser.email);
      const existingUserByGoogleId = await this.findUserByGoogleIdSecure(googleUser.sub);
      
      // Validar conflictos de identidad
      await this.validateIdentityConflicts(existingUserByEmail, existingUserByGoogleId, googleUser);
      
      let user;
      let isExistingUser = false;
      
      if (existingUserByGoogleId) {
        // Usuario existe con este Google ID - actualizar con validaciones
        user = existingUserByGoogleId;
        isExistingUser = true;
        
        this.logger.log(`🔐 Actualizando usuario federado existente: ${googleUser.email}`);
        await this.updateFederatedUserProfileSecure(user.userId, googleUser);
        
      } else if (existingUserByEmail) {
        // Usuario existe con este email pero sin Google ID - vincular con validaciones
        user = existingUserByEmail;
        isExistingUser = true;
        
        this.logger.log(`🔐 Vinculando Google a usuario existente: ${googleUser.email}`);
        await this.linkGoogleToExistingUserFederatedSecure(user.userId, googleUser);
        
      } else {
        // Usuario nuevo - crear con validaciones
        this.logger.log(`🔐 Creando nuevo usuario federado: ${googleUser.email}`);
        user = await this.createNewFederatedUserSecure(googleUser);
        isExistingUser = false;
      }

      // Crear usuario federado en Cognito con manejo de errores
      await this.createCognitoFederatedUserSafe(googleUser);

      return {
        ...user,
        existingUser: isExistingUser,
      };
      
    } catch (error) {
      this.logger.error(`🔒 Error creando/actualizando usuario federado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validar datos del usuario Google
   */
  private validateUserData(googleUser: CognitoGoogleUserInfo): void {
    if (!googleUser.email || !googleUser.sub || !googleUser.name) {
      throw new Error('Datos de usuario Google incompletos');
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(googleUser.email)) {
      throw new Error('Formato de email inválido');
    }

    // Validar longitud de campos
    if (googleUser.name.length > 100 || googleUser.sub.length > 50) {
      throw new Error('Datos de usuario con longitud inválida');
    }
  }

  /**
   * Validar conflictos de identidad
   */
  private async validateIdentityConflicts(
    existingUserByEmail: any,
    existingUserByGoogleId: any,
    googleUser: CognitoGoogleUserInfo
  ): Promise<void> {
    // Si hay usuario con el mismo email pero diferente Google ID
    if (existingUserByEmail && existingUserByGoogleId && 
        existingUserByEmail.userId !== existingUserByGoogleId.userId) {
      this.logger.error(`🔒 Conflicto de identidad detectado para: ${googleUser.email}`);
      throw new ConflictException('Conflicto de identidad: email y Google ID pertenecen a usuarios diferentes');
    }

    // Si hay usuario con el mismo Google ID pero diferente email
    if (existingUserByGoogleId && existingUserByGoogleId.email !== googleUser.email) {
      this.logger.error(`🔒 Google ID vinculado a email diferente: ${existingUserByGoogleId.email} vs ${googleUser.email}`);
      throw new ConflictException('Google ID ya vinculado a email diferente');
    }
  }

  /**
   * Crear usuario federado en Cognito de forma segura
   */
  private async createCognitoFederatedUserSafe(googleUser: CognitoGoogleUserInfo): Promise<void> {
    try {
      await this.cognitoService.createFederatedUser(googleUser);
    } catch (error) {
      // Si ya existe en Cognito, continuar (no es error crítico)
      if (error.message.includes('UsernameExistsException') || 
          error.message.includes('already exists')) {
        this.logger.log(`Usuario federado ya existe en Cognito: ${googleUser.email}`);
      } else {
        this.logger.warn(`🔒 Error creando usuario federado en Cognito: ${error.message}`);
        // No lanzar error aquí para no bloquear el flujo principal
      }
    }
  }

  /**
   * Validar rate limiting por usuario
   */
  private async validateUserRateLimit(email: string): Promise<void> {
    // Implementación básica de rate limiting
    // En producción, esto debería usar Redis o similar
    const rateLimitKey = `google_auth_${email}`;
    const maxAttempts = 10;
    const windowMinutes = 15;
    
    // Por ahora, solo log de la validación
    this.logger.log(`🔐 Validando rate limit para: ${email}`);
    
    // TODO: Implementar rate limiting real con Redis
    // const attempts = await redis.get(rateLimitKey);
    // if (attempts && parseInt(attempts) > maxAttempts) {
    //   throw new UnauthorizedException('Demasiados intentos de autenticación');
    // }
  }

  /**
   * Buscar usuario por email con validaciones de seguridad
   */
  private async findUserByEmailSecure(email: string): Promise<any> {
    try {
      // Validar formato de email antes de buscar
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Formato de email inválido para búsqueda');
      }

      return await this.findUserByEmail(email);
    } catch (error) {
      this.logger.error(`🔒 Error buscando usuario por email: ${error.message}`);
      return null;
    }
  }

  /**
   * Buscar usuario por Google ID con validaciones de seguridad
   */
  private async findUserByGoogleIdSecure(googleId: string): Promise<any> {
    try {
      // Validar formato de Google ID
      if (!googleId || googleId.length < 10 || googleId.length > 50) {
        throw new Error('Google ID inválido para búsqueda');
      }

      return await this.findUserByGoogleId(googleId);
    } catch (error) {
      this.logger.error(`🔒 Error buscando usuario por Google ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Actualizar perfil de usuario federado con validaciones
   */
  private async updateFederatedUserProfileSecure(userId: string, googleUser: CognitoGoogleUserInfo): Promise<void> {
    try {
      // Validar que el usuario existe
      const existingUser = await this.multiTableService.getUser(userId);
      if (!existingUser) {
        throw new Error('Usuario no encontrado para actualización');
      }

      // Validar que los datos no han cambiado de forma sospechosa
      if (existingUser.email !== googleUser.email) {
        this.logger.warn(`🔒 Cambio de email detectado: ${existingUser.email} -> ${googleUser.email}`);
        // En producción, esto podría requerir verificación adicional
      }

      await this.updateFederatedUserProfile(userId, googleUser);
      
      this.logger.log(`🔐 Perfil federado actualizado de forma segura: ${userId}`);
      
    } catch (error) {
      this.logger.error(`🔒 Error actualizando perfil federado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Vincular Google a usuario existente con validaciones de seguridad
   */
  private async linkGoogleToExistingUserFederatedSecure(userId: string, googleUser: CognitoGoogleUserInfo): Promise<void> {
    try {
      // Validaciones adicionales antes de vincular
      const existingUser = await this.multiTableService.getUser(userId);
      if (!existingUser) {
        throw new Error('Usuario no encontrado para vinculación');
      }

      // Verificar que no hay conflictos de email
      if (existingUser.email !== googleUser.email) {
        this.logger.error(`🔒 Conflicto de email en vinculación: ${existingUser.email} vs ${googleUser.email}`);
        throw new ConflictException('Email del usuario no coincide con email de Google');
      }

      await this.linkGoogleToExistingUserFederated(userId, googleUser);
      
      this.logger.log(`🔐 Google vinculado de forma segura al usuario: ${userId}`);
      
    } catch (error) {
      this.logger.error(`🔒 Error vinculando Google de forma segura: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear nuevo usuario federado con validaciones de seguridad
   */
  private async createNewFederatedUserSecure(googleUser: CognitoGoogleUserInfo): Promise<any> {
    try {
      // Validar que no existe usuario con este email o Google ID
      const existingByEmail = await this.findUserByEmailSecure(googleUser.email);
      const existingByGoogleId = await this.findUserByGoogleIdSecure(googleUser.sub);
      
      if (existingByEmail || existingByGoogleId) {
        throw new ConflictException('Usuario ya existe con este email o Google ID');
      }

      const newUser = await this.createNewFederatedUser(googleUser);
      
      this.logger.log(`🔐 Nuevo usuario federado creado de forma segura: ${googleUser.email}`);
      
      return newUser;
      
    } catch (error) {
      this.logger.error(`🔒 Error creando nuevo usuario federado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear o actualizar usuario federado en el sistema
   */
  async createOrUpdateFederatedUser(googleUser: CognitoGoogleUserInfo): Promise<any> {
    try {
      // Buscar usuario existente por email o Google ID
      const existingUserByEmail = await this.findUserByEmail(googleUser.email);
      const existingUserByGoogleId = await this.findUserByGoogleId(googleUser.sub);
      
      let user;
      let isExistingUser = false;
      
      if (existingUserByGoogleId) {
        // Usuario existe con este Google ID - actualizar
        user = existingUserByGoogleId;
        isExistingUser = true;
        
        this.logger.log(`Actualizando usuario federado existente: ${googleUser.email}`);
        
        await this.updateFederatedUserProfile(user.userId, googleUser);
        
      } else if (existingUserByEmail) {
        // Usuario existe con este email pero sin Google ID - vincular
        user = existingUserByEmail;
        isExistingUser = true;
        
        this.logger.log(`Vinculando Google a usuario existente: ${googleUser.email}`);
        
        await this.linkGoogleToExistingUserFederated(user.userId, googleUser);
        
      } else {
        // Usuario nuevo - crear
        this.logger.log(`Creando nuevo usuario federado: ${googleUser.email}`);
        
        user = await this.createNewFederatedUser(googleUser);
        isExistingUser = false;
      }

      // Crear usuario federado en Cognito si no existe
      try {
        await this.cognitoService.createFederatedUser(googleUser);
      } catch (error) {
        // Si ya existe en Cognito, continuar
        if (!error.message.includes('UsernameExistsException')) {
          this.logger.warn(`Error creando usuario federado en Cognito: ${error.message}`);
        }
      }

      return {
        ...user,
        existingUser: isExistingUser,
      };
      
    } catch (error) {
      this.logger.error(`Error creando/actualizando usuario federado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear nuevo usuario federado
   */
  private async createNewFederatedUser(googleUser: CognitoGoogleUserInfo): Promise<any> {
    const userId = `google_${googleUser.sub}`;
    
    const userData = {
      userId,
      email: googleUser.email,
      username: googleUser.email.split('@')[0],
      displayName: googleUser.name,
      avatarUrl: googleUser.picture,
      emailVerified: googleUser.email_verified,
      googleId: googleUser.sub,
      isGoogleLinked: true,
      authProviders: ['google'],
      lastGoogleSync: new Date().toISOString(),
      federatedIdentity: {
        provider: 'google',
        providerId: googleUser.sub,
        attributes: {
          given_name: googleUser.given_name,
          family_name: googleUser.family_name,
          locale: googleUser.locale,
          hd: googleUser.hd,
        },
      },
    };

    await this.multiTableService.createUser(userData);
    
    return userData;
  }

  /**
   * Actualizar perfil de usuario federado
   */
  private async updateFederatedUserProfile(userId: string, googleUser: CognitoGoogleUserInfo): Promise<void> {
    await this.multiTableService.update('trinity-users-dev', { userId }, {
      UpdateExpression: `
        SET displayName = :displayName, 
            avatarUrl = :avatarUrl, 
            lastGoogleSync = :lastGoogleSync,
            emailVerified = :emailVerified,
            federatedIdentity = :federatedIdentity
      `,
      ExpressionAttributeValues: {
        ':displayName': googleUser.name,
        ':avatarUrl': googleUser.picture || null,
        ':lastGoogleSync': new Date().toISOString(),
        ':emailVerified': googleUser.email_verified,
        ':federatedIdentity': {
          provider: 'google',
          providerId: googleUser.sub,
          attributes: {
            given_name: googleUser.given_name,
            family_name: googleUser.family_name,
            locale: googleUser.locale,
            hd: googleUser.hd,
          },
        },
      },
    });
  }

  /**
   * Vincular Google a usuario existente (versión federada)
   */
  private async linkGoogleToExistingUserFederated(userId: string, googleUser: CognitoGoogleUserInfo): Promise<void> {
    // Verificar que no hay otro usuario con este Google ID
    const existingGoogleUser = await this.findUserByGoogleId(googleUser.sub);
    if (existingGoogleUser && existingGoogleUser.userId !== userId) {
      throw new ConflictException('Esta cuenta de Google ya está vinculada a otro usuario');
    }

    // Obtener usuario actual
    const user = await this.multiTableService.getUser(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Actualizar authProviders
    const authProviders = user.authProviders || ['email'];
    if (!authProviders.includes('google')) {
      authProviders.push('google');
    }

    await this.multiTableService.update('trinity-users-dev', { userId }, {
      UpdateExpression: `
        SET googleId = :googleId, 
            isGoogleLinked = :isGoogleLinked, 
            authProviders = :authProviders, 
            lastGoogleSync = :lastGoogleSync,
            federatedIdentity = :federatedIdentity
      `,
      ExpressionAttributeValues: {
        ':googleId': googleUser.sub,
        ':isGoogleLinked': true,
        ':authProviders': authProviders,
        ':lastGoogleSync': new Date().toISOString(),
        ':federatedIdentity': {
          provider: 'google',
          providerId: googleUser.sub,
          attributes: {
            given_name: googleUser.given_name,
            family_name: googleUser.family_name,
            locale: googleUser.locale,
            hd: googleUser.hd,
          },
        },
      },
    });
  }

  /**
   * Mapear atributos de Google a formato del sistema
   */
  mapGoogleAttributesToUser(googleUser: CognitoGoogleUserInfo): Record<string, any> {
    return {
      email: googleUser.email,
      emailVerified: googleUser.email_verified,
      displayName: googleUser.name,
      firstName: googleUser.given_name,
      lastName: googleUser.family_name,
      avatarUrl: googleUser.picture,
      locale: googleUser.locale,
      domain: googleUser.hd, // Google Workspace domain
      googleId: googleUser.sub,
      authProvider: 'google',
      lastSync: new Date().toISOString(),
    };
  }

  /**
   * Buscar usuario por Google ID
   */
  private async findUserByGoogleId(googleId: string): Promise<any> {
    try {
      const users = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'googleId = :googleId',
        ExpressionAttributeValues: {
          ':googleId': googleId,
        },
      });

      return users.length > 0 ? users[0] : null;
    } catch (error) {
      this.logger.error(`Error buscando usuario por Google ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Buscar usuario por email
   */
  private async findUserByEmail(email: string): Promise<any> {
    try {
      const users = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email,
        },
      });

      return users.length > 0 ? users[0] : null;
    } catch (error) {
      this.logger.error(`Error buscando usuario por email: ${error.message}`);
      return null;
    }
  }

  /**
   * Validar consistencia de tokens
   */
  async validateTokenConsistency(googleToken: string, cognitoTokens: CognitoTokens): Promise<boolean> {
    try {
      // Verificar que el token de Google sigue siendo válido
      const googleUser = await this.verifyGoogleToken(googleToken);
      
      // Verificar que los tokens de Cognito contienen información consistente
      const identityId = this.extractIdentityIdFromCognitoToken(cognitoTokens.accessToken);
      
      // La consistencia se valida si el Identity ID contiene el Google sub
      return identityId.includes(googleUser.id);
      
    } catch (error) {
      this.logger.error(`Error validando consistencia de tokens: ${error.message}`);
      return false;
    }
  }

  /**
   * Extraer Identity ID del token de Cognito
   */
  private extractIdentityIdFromCognitoToken(cognitoToken: string): string {
    // Extraer Identity ID del token federado
    const parts = cognitoToken.split('_');
    return parts.length > 2 ? parts.slice(2, -1).join('_') : '';
  }
}