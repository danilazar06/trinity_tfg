import { Injectable, Logger } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import { CognitoService } from '../../infrastructure/cognito/cognito.service';
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
    private dynamoDBService: DynamoDBService,
    private cognitoService: CognitoService,
  ) {}

  /**
   * Registrar un nuevo usuario
   */
  async register(createUserDto: CreateUserDto): Promise<{ user: UserProfile; requiresConfirmation: boolean }> {
    const { email, username, password, phoneNumber } = createUserDto;

    // Registrar en Cognito
    const { userSub } = await this.cognitoService.signUp(email, username, password, phoneNumber);

    // Crear perfil de usuario en DynamoDB
    const user: User = {
      id: userSub,
      email,
      username,
      emailVerified: false, // Se verificará con Cognito
      createdAt: new Date(),
      updatedAt: new Date(),
      phoneNumber,
    };

    // Guardar en DynamoDB
    await this.dynamoDBService.putItem({
      PK: DynamoDBKeys.userPK(userSub),
      SK: DynamoDBKeys.userSK(),
      GSI1PK: DynamoDBKeys.userGSI1PK(email),
      GSI1SK: DynamoDBKeys.userSK(),
      ...user,
    });

    const userProfile = this.toUserProfile(user);

    this.logger.log(`Usuario registrado: ${email}`);
    return { 
      user: userProfile, 
      requiresConfirmation: true // Cognito requiere confirmación por email
    };
  }

  /**
   * Confirmar registro de usuario
   */
  async confirmSignUp(confirmSignUpDto: ConfirmSignUpDto): Promise<{ message: string }> {
    const { email, confirmationCode } = confirmSignUpDto;

    await this.cognitoService.confirmSignUp(email, confirmationCode);

    // Actualizar estado en DynamoDB
    const user = await this.findUserByEmail(email);
    if (user) {
      await this.dynamoDBService.conditionalUpdate(
        DynamoDBKeys.userPK(user.id),
        DynamoDBKeys.userSK(),
        'SET emailVerified = :emailVerified, updatedAt = :updatedAt',
        'attribute_exists(PK)',
        undefined,
        {
          ':emailVerified': true,
          ':updatedAt': new Date().toISOString(),
        },
      );
    }

    this.logger.log(`Usuario confirmado: ${email}`);
    return { message: 'Usuario confirmado exitosamente' };
  }

  /**
   * Reenviar código de confirmación
   */
  async resendConfirmation(resendDto: ResendConfirmationDto): Promise<{ message: string }> {
    await this.cognitoService.resendConfirmationCode(resendDto.email);
    
    this.logger.log(`Código reenviado: ${resendDto.email}`);
    return { message: 'Código de confirmación reenviado' };
  }

  /**
   * Iniciar sesión
   */
  async login(loginUserDto: LoginUserDto): Promise<{ user: UserProfile; tokens: CognitoTokens }> {
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

      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.userPK(user.id),
        SK: DynamoDBKeys.userSK(),
        GSI1PK: DynamoDBKeys.userGSI1PK(email),
        GSI1SK: DynamoDBKeys.userSK(),
        ...user,
      });
    } else {
      // Actualizar información desde Cognito
      await this.dynamoDBService.conditionalUpdate(
        DynamoDBKeys.userPK(user.id),
        DynamoDBKeys.userSK(),
        'SET emailVerified = :emailVerified, updatedAt = :updatedAt',
        'attribute_exists(PK)',
        undefined,
        {
          ':emailVerified': authResult.user.email_verified,
          ':updatedAt': new Date().toISOString(),
        },
      );
      user.emailVerified = authResult.user.email_verified;
    }

    const userProfile = this.toUserProfile(user);
    const tokens: CognitoTokens = {
      accessToken: authResult.accessToken,
      idToken: authResult.idToken,
      refreshToken: authResult.refreshToken,
    };

    this.logger.log(`Usuario autenticado: ${email}`);
    return { user: userProfile, tokens };
  }

  /**
   * Validar usuario por token de Cognito (usado por JWT strategy)
   */
  async validateUserByToken(accessToken: string): Promise<UserProfile | null> {
    try {
      const cognitoUser = await this.cognitoService.validateAccessToken(accessToken);
      
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

        await this.dynamoDBService.putItem({
          PK: DynamoDBKeys.userPK(newUser.id),
          SK: DynamoDBKeys.userSK(),
          GSI1PK: DynamoDBKeys.userGSI1PK(newUser.email),
          GSI1SK: DynamoDBKeys.userSK(),
          ...newUser,
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
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.cognitoService.forgotPassword(forgotPasswordDto.email);
    
    this.logger.log(`Recuperación iniciada: ${forgotPasswordDto.email}`);
    return { message: 'Código de recuperación enviado al email' };
  }

  /**
   * Confirmar nueva contraseña
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    const { email, confirmationCode, newPassword } = resetPasswordDto;
    
    await this.cognitoService.confirmForgotPassword(email, confirmationCode, newPassword);
    
    this.logger.log(`Contraseña restablecida: ${email}`);
    return { message: 'Contraseña restablecida exitosamente' };
  }

  /**
   * Obtener usuario por ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const item = await this.dynamoDBService.getItem(
        DynamoDBKeys.userPK(userId),
        DynamoDBKeys.userSK(),
      );

      return item ? (item as User) : null;
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
      const items = await this.dynamoDBService.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk AND GSI1SK = :gsi1sk',
        ExpressionAttributeValues: {
          ':gsi1pk': DynamoDBKeys.userGSI1PK(email),
          ':gsi1sk': DynamoDBKeys.userSK(),
        },
      });

      return items.length > 0 ? (items[0] as User) : null;
    } catch (error) {
      this.logger.error(`Error finding user by email ${email}: ${error.message}`);
      return null;
    }
  }

  /**
   * Convertir User a UserProfile (sin datos sensibles)
   */
  private toUserProfile(user: User): UserProfile {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      phoneNumber: user.phoneNumber,
    };
  }
}