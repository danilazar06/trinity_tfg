import { Injectable, Logger } from '@nestjs/common';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import { CognitoService } from '../../infrastructure/cognito/cognito.service';
import { GoogleAuthService, GoogleUserInfo } from './google-auth.service';
import { EventTracker } from '../analytics/event-tracker.service';
import { EventType } from '../analytics/interfaces/analytics.interfaces';
import {
  User,
  CreateUserDto,
  LoginUserDto,
  UserProfile,
  ConfirmSignUpDto,
  ResendConfirmationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  CognitoTokens,
} from '../../domain/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private multiTableService: MultiTableService,
    private cognitoService: CognitoService,
    private googleAuthService: GoogleAuthService,
    private eventTracker: EventTracker,
  ) {}

  /**
   * Registrar un nuevo usuario
   */
  async register(
    createUserDto: CreateUserDto,
  ): Promise<{ user: UserProfile; requiresConfirmation: boolean }> {
    const { email, username, password, phoneNumber, displayName } = createUserDto;

    // Registrar en Cognito
    const { userSub } = await this.cognitoService.signUp(
      email,
      username,
      password,
      phoneNumber,
    );

    // Crear perfil de usuario en DynamoDB
    const user: User = {
      id: userSub,
      email,
      username,
      emailVerified: false, // Se verificará con Cognito
      createdAt: new Date(),
      updatedAt: new Date(),
      phoneNumber,
      displayName,
    };

    // Guardar en DynamoDB
    await this.multiTableService.createUser({
      userId: userSub,
      email,
      username,
      emailVerified: false,
      phoneNumber,
      displayName,
    });

    const userProfile = this.toUserProfile(user);

    // 📝 Track user registration event
    // await this.eventTracker.trackUserAction(
    //   userSub,
    //   EventType.USER_REGISTER,
    //   {
    //     email,
    //     username,
    //     hasPhoneNumber: !!phoneNumber,
    //     registrationMethod: 'email',
    //   },
    //   {
    //     source: 'auth_service',
    //     userAgent: 'backend',
    //   },
    // );

    this.logger.log(`Usuario registrado: ${email}`);
    return {
      user: userProfile,
      requiresConfirmation: true, // Cognito requiere confirmación por email
    };
  }

  /**
   * Confirmar registro de usuario
   */
  async confirmSignUp(
    confirmSignUpDto: ConfirmSignUpDto,
  ): Promise<{ message: string }> {
    const { email, confirmationCode } = confirmSignUpDto;

    await this.cognitoService.confirmSignUp(email, confirmationCode);

    // Actualizar estado en DynamoDB
    const user = await this.findUserByEmail(email);
    if (user) {
      await this.multiTableService.update('trinity-users-dev', { userId: user.id }, {
        UpdateExpression: 'SET emailVerified = :emailVerified',
        ExpressionAttributeValues: {
          ':emailVerified': true,
        },
      });
    }

    this.logger.log(`Usuario confirmado: ${email}`);
    return { message: 'Usuario confirmado exitosamente' };
  }

  /**
   * Reenviar código de confirmación
   */
  async resendConfirmation(
    resendDto: ResendConfirmationDto,
  ): Promise<{ message: string }> {
    await this.cognitoService.resendConfirmationCode(resendDto.email);

    this.logger.log(`Código reenviado: ${resendDto.email}`);
    return { message: 'Código de confirmación reenviado' };
  }

  /**
   * Iniciar sesión
   */
  async login(
    loginUserDto: LoginUserDto,
  ): Promise<{ user: UserProfile; tokens: CognitoTokens }> {
    const { email, password } = loginUserDto;

    // Autenticar con Cognito
    const authResult = await this.cognitoService.signIn(email, password);

    // Obtener o crear perfil en DynamoDB
    let user = await this.findUserByEmail(email);

    if (!user) {
      // Crear perfil si no existe (usuario creado directamente en Cognito)
      user = {
        id: authResult.user.sub,
        email: authResult.user.email,
        username: authResult.user.username,
        emailVerified: authResult.user.email_verified,
        createdAt: new Date(),
        updatedAt: new Date(),
        phoneNumber: authResult.user.phone_number,
      };

      await this.multiTableService.createUser({
        userId: user.id,
        email: user.email,
        username: user.username,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber,
      });
    } else {
      // Actualizar información desde Cognito
      await this.multiTableService.update('trinity-users-dev', { userId: user.id }, {
        UpdateExpression: 'SET emailVerified = :emailVerified',
        ExpressionAttributeValues: {
          ':emailVerified': authResult.user.email_verified,
        },
      });
      user.emailVerified = authResult.user.email_verified;
    }

    const userProfile = this.toUserProfile(user);
    const tokens: CognitoTokens = {
      accessToken: authResult.accessToken,
      idToken: authResult.idToken,
      refreshToken: authResult.refreshToken,
    };

    // 📝 Track user login event
    // await this.eventTracker.trackUserAction(
    //   user.id,
    //   EventType.USER_LOGIN,
    //   {
    //     email,
    //     loginMethod: 'email_password',
    //     emailVerified: user.emailVerified,
    //   },
    //   {
    //     source: 'auth_service',
    //     userAgent: 'backend',
    //   },
    // );

    this.logger.log(`Usuario autenticado: ${email}`);
    return { user: userProfile, tokens };
  }

  /**
   * Validar usuario por token de Cognito (usado por JWT strategy)
   */
  async validateUserByToken(accessToken: string): Promise<UserProfile | null> {
    try {
      const cognitoUser =
        await this.cognitoService.validateAccessToken(accessToken);

      if (!cognitoUser) {
        return null;
      }

      // Obtener perfil completo desde DynamoDB
      const user = await this.getUserById(cognitoUser.sub);

      if (!user) {
        // Crear perfil si no existe
        const newUser: User = {
          id: cognitoUser.sub,
          email: cognitoUser.email,
          username: cognitoUser.username,
          emailVerified: cognitoUser.email_verified,
          createdAt: new Date(),
          updatedAt: new Date(),
          phoneNumber: cognitoUser.phone_number,
        };

        await this.multiTableService.createUser({
          userId: newUser.id,
          email: newUser.email,
          username: newUser.username,
          emailVerified: newUser.emailVerified,
          phoneNumber: newUser.phoneNumber,
        });

        return this.toUserProfile(newUser);
      }

      return this.toUserProfile(user);
    } catch (error) {
      this.logger.error(`Error validating user by token: ${error.message}`);
      return null;
    }
  }

  /**
   * Iniciar recuperación de contraseña
   */
  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.cognitoService.forgotPassword(forgotPasswordDto.email);

    this.logger.log(`Recuperación iniciada: ${forgotPasswordDto.email}`);
    return { message: 'Código de recuperación enviado al email' };
  }

  /**
   * Confirmar nueva contraseña
   */
  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const { email, confirmationCode, newPassword } = resetPasswordDto;

    await this.cognitoService.confirmForgotPassword(
      email,
      confirmationCode,
      newPassword,
    );

    this.logger.log(`Contraseña restablecida: ${email}`);
    return { message: 'Contraseña restablecida exitosamente' };
  }

  /**
   * Obtener usuario por ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const item = await this.multiTableService.getUser(userId);
      if (!item) return null;
      
      return {
        id: item.userId,
        email: item.email,
        username: item.username,
        emailVerified: item.emailVerified,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
        phoneNumber: item.phoneNumber,
        displayName: item.displayName,
        avatarUrl: item.avatarUrl,
      };
    } catch (error) {
      this.logger.error(`Error getting user ${userId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Buscar usuario por email
   */
  private async findUserByEmail(email: string): Promise<User | null> {
    try {
      // Scan para buscar por email (no óptimo pero funcional para MVP)
      const items = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email,
        },
      });

      if (items.length === 0) return null;
      
      const item = items[0];
      return {
        id: item.userId,
        email: item.email,
        username: item.username,
        emailVerified: item.emailVerified,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
        phoneNumber: item.phoneNumber,
        displayName: item.displayName,
        avatarUrl: item.avatarUrl,
      };
    } catch (error) {
      this.logger.error(
        `Error finding user by email ${email}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Cerrar sesión
   */
  async logout(userId: string): Promise<{ message: string }> {
    try {
      // 📝 Track user logout event
      // await this.eventTracker.trackUserAction(
      //   userId,
      //   EventType.USER_LOGOUT,
      //   {
      //     logoutMethod: 'manual',
      //   },
      //   {
      //     source: 'auth_service',
      //     userAgent: 'backend',
      //   },
      // );

      this.logger.log(`Usuario cerró sesión: ${userId}`);
      return { message: 'Sesión cerrada exitosamente' };
    } catch (error) {
      this.logger.error(
        `Error during logout for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Convertir User a UserProfile (sin datos sensibles)
   */
  private toUserProfile(user: User): UserProfile {
    return {
      id: user.id,
      sub: user.id, // Alias para compatibilidad con JWT/Cognito
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      // Campos de Google Auth
      googleId: (user as any).googleId,
      isGoogleLinked: (user as any).isGoogleLinked || false,
      authProviders: (user as any).authProviders || ['email'],
    };
  }

  /**
   * Actualizar perfil de usuario
   */
  async updateProfile(
    userId: string,
    updateData: { displayName?: string; avatarUrl?: string; phoneNumber?: string },
  ): Promise<UserProfile> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Construir la expresión de actualización sin updatedAt (se agrega automáticamente)
    const updateExpressions: string[] = [];
    const expressionValues: Record<string, any> = {};

    if (updateData.displayName !== undefined) {
      updateExpressions.push('displayName = :displayName');
      expressionValues[':displayName'] = updateData.displayName;
    }

    if (updateData.avatarUrl !== undefined) {
      updateExpressions.push('avatarUrl = :avatarUrl');
      expressionValues[':avatarUrl'] = updateData.avatarUrl;
    }

    if (updateData.phoneNumber !== undefined) {
      updateExpressions.push('phoneNumber = :phoneNumber');
      expressionValues[':phoneNumber'] = updateData.phoneNumber;
    }

    // Si no hay nada que actualizar, solo actualizar updatedAt
    const updateExpression = updateExpressions.length > 0 
      ? `SET ${updateExpressions.join(', ')}`
      : 'SET #dummy = #dummy'; // Expresión dummy para que funcione el auto-updatedAt

    try {
      await this.multiTableService.update('trinity-users-dev', { userId }, {
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionValues,
        ...(updateExpressions.length === 0 && {
          ExpressionAttributeNames: { '#dummy': 'updatedAt' }
        })
      });

      this.logger.log(`Perfil actualizado: ${userId}`);

      // Retornar perfil actualizado
      const updatedUser = await this.getUserById(userId);
      return this.toUserProfile(updatedUser!);
    } catch (error) {
      this.logger.error(`Error actualizando perfil ${userId}: ${error.message}`);
      throw new Error(`No se pudo actualizar el perfil: ${error.message}`);
    }
  }

  // ==================== MÉTODOS DE GOOGLE AUTH ====================

  /**
   * Autenticar con Google usando ID Token
   */
  async loginWithGoogle(idToken: string): Promise<{ user: UserProfile; tokens: CognitoTokens }> {
    try {
      // Verificar token de Google y obtener información del usuario
      const googleUser = await this.googleAuthService.verifyGoogleToken(idToken);
      
      // Crear o actualizar usuario desde información de Google
      const userProfile = await this.googleAuthService.createOrUpdateUserFromGoogle(googleUser);
      
      // Generar tokens de Cognito para el usuario
      // Nota: En un escenario real, esto requeriría configuración adicional de Cognito
      // Por ahora, generamos tokens mock para el desarrollo
      const tokens: CognitoTokens = {
        accessToken: `google_access_${userProfile.id}_${Date.now()}`,
        idToken: `google_id_${userProfile.id}_${Date.now()}`,
        refreshToken: `google_refresh_${userProfile.id}_${Date.now()}`,
      };

      this.logger.log(`Usuario autenticado con Google: ${googleUser.email}`);
      
      return { 
        user: this.toUserProfile(userProfile), 
        tokens 
      };
      
    } catch (error) {
      this.logger.error(`Error en login con Google: ${error.message}`);
      throw error;
    }
  }

  /**
   * Vincular cuenta de Google a usuario existente
   */
  async linkGoogleAccount(userId: string, idToken: string): Promise<UserProfile> {
    try {
      // Verificar token de Google
      const googleUser = await this.googleAuthService.verifyGoogleToken(idToken);
      
      // Vincular Google al usuario existente
      await this.googleAuthService.linkGoogleToExistingUser(userId, googleUser);
      
      // Sincronizar información de perfil desde Google
      await this.googleAuthService.syncProfileFromGoogle(userId, googleUser);
      
      // Retornar perfil actualizado
      const updatedUser = await this.getUserById(userId);
      
      this.logger.log(`Cuenta de Google vinculada al usuario: ${userId}`);
      
      return this.toUserProfile(updatedUser!);
      
    } catch (error) {
      this.logger.error(`Error vinculando cuenta de Google: ${error.message}`);
      throw error;
    }
  }

  /**
   * Desvincular cuenta de Google de usuario
   */
  async unlinkGoogleAccount(userId: string): Promise<UserProfile> {
    try {
      // Desvincular Google del usuario
      await this.googleAuthService.unlinkGoogleFromUser(userId);
      
      // Retornar perfil actualizado
      const updatedUser = await this.getUserById(userId);
      
      this.logger.log(`Cuenta de Google desvinculada del usuario: ${userId}`);
      
      return this.toUserProfile(updatedUser!);
      
    } catch (error) {
      this.logger.error(`Error desvinculando cuenta de Google: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verificar si Google Auth está disponible
   */
  isGoogleAuthAvailable(): boolean {
    return this.googleAuthService.isGoogleAuthAvailable();
  }
}
