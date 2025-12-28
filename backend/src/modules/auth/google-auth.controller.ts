import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Request,
  Logger,
  Get,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleTokenDto, LinkGoogleAccountDto, GoogleAuthResponseDto } from './dto/google-token.dto';

@ApiTags('auth/google')
@Controller('auth/google')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);
  
  constructor(private authService: AuthService) {}

  @Get('available')
  @ApiOperation({ summary: 'Verificar si Google Auth está disponible' })
  @ApiResponse({ status: 200, description: 'Estado de disponibilidad de Google Auth' })
  async checkGoogleAuthAvailability() {
    const isAvailable = this.authService.isGoogleAuthAvailable();
    
    return {
      available: isAvailable,
      message: isAvailable 
        ? 'Google Auth está configurado y disponible'
        : 'Google Auth no está configurado. Verifica GOOGLE_CLIENT_ID en variables de entorno.',
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión con Google usando ID Token' })
  @ApiResponse({ 
    status: 200, 
    description: 'Login exitoso con Google',
    type: GoogleAuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Token de Google inválido' })
  @ApiResponse({ status: 400, description: 'Google Auth no está disponible' })
  async loginWithGoogle(@Body() googleTokenDto: GoogleTokenDto) {
    this.logger.log('🔐 Iniciando login con Google...');
    
    if (!this.authService.isGoogleAuthAvailable()) {
      this.logger.error('❌ Google Auth no está disponible');
      throw new Error('Google Auth no está configurado');
    }

    try {
      const result = await this.authService.loginWithGoogle(googleTokenDto.idToken);
      
      this.logger.log(`✅ Login con Google exitoso: ${result.user.email}`);
      
      return {
        success: true,
        message: 'Login con Google exitoso',
        data: result,
      };
      
    } catch (error) {
      this.logger.error(`❌ Error en login con Google: ${error.message}`);
      throw error;
    }
  }

  @Post('link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vincular cuenta de Google a usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Cuenta de Google vinculada exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado o token de Google inválido' })
  @ApiResponse({ status: 409, description: 'Cuenta de Google ya vinculada a otro usuario' })
  async linkGoogleAccount(@Request() req, @Body() linkGoogleDto: LinkGoogleAccountDto) {
    this.logger.log(`🔗 Vinculando cuenta de Google al usuario: ${req.user.id}`);
    
    if (!this.authService.isGoogleAuthAvailable()) {
      this.logger.error('❌ Google Auth no está disponible');
      throw new Error('Google Auth no está configurado');
    }

    try {
      const updatedUser = await this.authService.linkGoogleAccount(
        req.user.id,
        linkGoogleDto.idToken
      );
      
      this.logger.log(`✅ Cuenta de Google vinculada exitosamente: ${req.user.id}`);
      
      return {
        success: true,
        message: 'Cuenta de Google vinculada exitosamente',
        user: updatedUser,
      };
      
    } catch (error) {
      this.logger.error(`❌ Error vinculando cuenta de Google: ${error.message}`);
      
      if (error.message.includes('ya está vinculada')) {
        throw new Error('Esta cuenta de Google ya está vinculada a otro usuario');
      }
      
      throw error;
    }
  }

  @Delete('unlink')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desvincular cuenta de Google del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Cuenta de Google desvinculada exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 400, description: 'No se puede desvincular: único método de autenticación' })
  async unlinkGoogleAccount(@Request() req) {
    this.logger.log(`🔓 Desvinculando cuenta de Google del usuario: ${req.user.id}`);
    
    try {
      const updatedUser = await this.authService.unlinkGoogleAccount(req.user.id);
      
      this.logger.log(`✅ Cuenta de Google desvinculada exitosamente: ${req.user.id}`);
      
      return {
        success: true,
        message: 'Cuenta de Google desvinculada exitosamente',
        user: updatedUser,
      };
      
    } catch (error) {
      this.logger.error(`❌ Error desvinculando cuenta de Google: ${error.message}`);
      
      if (error.message.includes('único método')) {
        throw new Error('No se puede desvincular Google: es el único método de autenticación. Configura una contraseña primero.');
      }
      
      throw error;
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener estado de vinculación con Google del usuario' })
  @ApiResponse({ status: 200, description: 'Estado de vinculación con Google' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getGoogleLinkStatus(@Request() req) {
    this.logger.log(`📊 Obteniendo estado de Google para usuario: ${req.user.id}`);
    
    const isGoogleLinked = req.user.isGoogleLinked || false;
    const authProviders = req.user.authProviders || ['email'];
    
    return {
      isGoogleLinked,
      authProviders,
      canUnlinkGoogle: authProviders.length > 1,
      googleAuthAvailable: this.authService.isGoogleAuthAvailable(),
    };
  }
}