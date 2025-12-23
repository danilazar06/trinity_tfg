import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RoomService } from './room.service';
import { MemberService } from './member.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomMemberGuard } from './guards/room-member.guard';
import { RoomCreatorGuard } from './guards/room-creator.guard';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { UpdateFiltersDto } from './dto/update-filters.dto';

@ApiTags('rooms')
@Controller('rooms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RoomController {
  constructor(
    private roomService: RoomService,
    private memberService: MemberService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear una nueva sala' })
  @ApiResponse({ status: 201, description: 'Sala creada exitosamente' })
  async createRoom(@Request() req, @Body() createRoomDto: CreateRoomDto) {
    return this.roomService.createRoom(req.user.id, createRoomDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener salas del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de salas del usuario' })
  async getUserRooms(@Request() req) {
    return this.roomService.getUserRooms(req.user.id);
  }

  @Get(':id')
  @UseGuards(RoomMemberGuard)
  @ApiOperation({ summary: 'Obtener detalles completos de una sala' })
  @ApiResponse({ status: 200, description: 'Detalles de la sala' })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  @ApiResponse({ status: 403, description: 'No tienes acceso a esta sala' })
  async getRoomDetails(@Request() req, @Param('id') roomId: string) {
    return this.roomService.getRoomDetails(roomId, req.user.id);
  }

  @Get(':id/stats')
  @UseGuards(RoomMemberGuard)
  @ApiOperation({ summary: 'Obtener estadísticas de la sala' })
  @ApiResponse({ status: 200, description: 'Estadísticas de la sala' })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  @ApiResponse({ status: 403, description: 'No tienes acceso a esta sala' })
  async getRoomStats(@Request() req, @Param('id') roomId: string) {
    return this.roomService.getRoomStats(roomId);
  }

  @Get(':id/my-progress')
  @UseGuards(RoomMemberGuard)
  @ApiOperation({ summary: 'Obtener mi progreso en la sala' })
  @ApiResponse({ status: 200, description: 'Progreso del usuario en la sala' })
  async getMyProgress(@Request() req, @Param('id') roomId: string) {
    return this.memberService.getMemberProgress(roomId, req.user.id);
  }

  @Get(':id/next-media')
  @UseGuards(RoomMemberGuard)
  @ApiOperation({ summary: 'Obtener siguiente elemento multimedia para votar' })
  @ApiResponse({ status: 200, description: 'Siguiente elemento multimedia' })
  @ApiResponse({ status: 204, description: 'No hay más elementos' })
  async getNextMedia(@Request() req, @Param('id') roomId: string) {
    const nextMediaId = await this.memberService.getNextMediaForMember(roomId, req.user.id);
    
    if (!nextMediaId) {
      return { message: 'No hay más elementos para votar', completed: true };
    }
    
    return { mediaId: nextMediaId, completed: false };
  }

  @Post('join')
  @ApiOperation({ summary: 'Unirse a una sala usando código de invitación' })
  @ApiResponse({ status: 200, description: 'Unido a la sala exitosamente' })
  @ApiResponse({ status: 404, description: 'Código de invitación inválido' })
  @ApiResponse({ status: 403, description: 'No se puede unir a la sala' })
  async joinRoom(@Request() req, @Body() joinRoomDto: JoinRoomDto) {
    return this.roomService.joinRoom(req.user.id, joinRoomDto.inviteCode);
  }

  @Delete(':id/leave')
  @ApiOperation({ summary: 'Abandonar una sala' })
  @ApiResponse({ status: 200, description: 'Sala abandonada exitosamente' })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  async leaveRoom(@Request() req, @Param('id') roomId: string) {
    await this.roomService.leaveRoom(req.user.id, roomId);
    return { message: 'Sala abandonada exitosamente' };
  }

  @Put(':id/filters')
  @UseGuards(RoomCreatorGuard)
  @ApiOperation({ summary: 'Actualizar filtros de la sala (solo creador)' })
  @ApiResponse({ status: 200, description: 'Filtros actualizados exitosamente' })
  @ApiResponse({ status: 403, description: 'Solo el creador puede actualizar filtros' })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  async updateRoomFilters(
    @Request() req,
    @Param('id') roomId: string,
    @Body() updateFiltersDto: UpdateFiltersDto,
  ) {
    return this.roomService.updateRoomFilters(req.user.id, roomId, updateFiltersDto.filters);
  }

  @Post(':id/regenerate-invite')
  @UseGuards(RoomCreatorGuard)
  @ApiOperation({ summary: 'Regenerar código de invitación (solo creador)' })
  @ApiResponse({ status: 200, description: 'Código regenerado exitosamente' })
  @ApiResponse({ status: 403, description: 'Solo el creador puede regenerar el código' })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  async regenerateInviteCode(@Request() req, @Param('id') roomId: string) {
    const newCode = await this.roomService.regenerateInviteCode(req.user.id, roomId);
    return { inviteCode: newCode, message: 'Código de invitación regenerado' };
  }
}