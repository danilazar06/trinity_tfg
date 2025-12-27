import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Put,
  Request,
  Headers,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { ConfirmSignUpDto } from './dto/confirm-signup.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo usuario con Cognito' })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente' })
  @ApiResponse({ status: 409, description: 'El email ya está registrado' })
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post('confirm-signup')
  @ApiOperation({ summary: 'Confirmar registro de usuario' })
  @ApiResponse({ status: 200, description: 'Usuario confirmado exitosamente' })
  @ApiResponse({ status: 400, description: 'Código de confirmación inválido' })
  async confirmSignUp(@Body() confirmSignUpDto: ConfirmSignUpDto) {
    return this.authService.confirmSignUp(confirmSignUpDto);
  }

  @Post('resend-confirmation')
  @ApiOperation({ summary: 'Reenviar código de confirmación' })
  @ApiResponse({ status: 200, description: 'Código reenviado exitosamente' })
  async resendConfirmation(@Body() resendDto: ResendConfirmationDto) {
    return this.authService.resendConfirmation(resendDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión con Cognito' })
  @ApiResponse({ status: 200, description: 'Login exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Iniciar recuperación de contraseña' })
  @ApiResponse({ status: 200, description: 'Código de recuperación enviado' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Confirmar nueva contraseña' })
  @ApiResponse({
    status: 200,
    description: 'Contraseña restablecida exitosamente',
  })
  @ApiResponse({ status: 400, description: 'Código de confirmación inválido' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getProfile(@Request() req) {
    return req.user;
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async updateProfile(@Request() req, @Body() updateProfileDto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.id, updateProfileDto);
  }

  @Get('test-auth')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Endpoint de prueba para autenticación' })
  @ApiResponse({ status: 200, description: 'Autenticación exitosa' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async testAuth(@Request() req) {
    this.logger.log(`🧪 Test Auth - Usuario: ${req.user?.email || 'undefined'}`);
    this.logger.log(`🧪 Test Auth - Sub: ${req.user?.sub || 'undefined'}`);
    return { 
      message: 'Autenticación exitosa', 
      user: req.user,
      timestamp: new Date().toISOString()
    };
  }

  @Get('verify-token')
  @ApiOperation({ summary: 'Verificar token de autenticación (debug)' })
  @ApiResponse({ status: 200, description: 'Token verificado' })
  async verifyToken(@Headers('authorization') authHeader: string) {
    this.logger.log(`Verificando token: ${authHeader ? 'presente' : 'ausente'}`);
    
    if (!authHeader) {
      return { valid: false, error: 'No authorization header' };
    }
    
    const token = authHeader.replace('Bearer ', '');
    this.logger.log(`Token length: ${token.length}`);
    this.logger.log(`Token preview: ${token.substring(0, 50)}...`);
    
    try {
      const user = await this.authService.validateUserByToken(token);
      if (user) {
        this.logger.log(`Token válido para usuario: ${user.email}`);
        return { valid: true, user };
      } else {
        this.logger.warn('Token inválido - usuario no encontrado');
        return { valid: false, error: 'Token inválido' };
      }
    } catch (error) {
      this.logger.error(`Error verificando token: ${error.message}`);
      return { valid: false, error: error.message };
    }
  }
}
