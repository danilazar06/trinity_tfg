import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RoomService } from '../room.service';

@Injectable()
export class RoomCreatorGuard implements CanActivate {
  constructor(private roomService: RoomService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const roomId = request.params?.id;

    if (!userId || !roomId) {
      throw new ForbiddenException('Usuario o sala no identificados');
    }

    const room = await this.roomService.getRoomById(roomId);
    
    if (!room) {
      throw new ForbiddenException('Sala no encontrada');
    }

    if (room.creatorId !== userId) {
      throw new ForbiddenException('Solo el creador de la sala puede realizar esta acción');
    }

    return true;
  }
}