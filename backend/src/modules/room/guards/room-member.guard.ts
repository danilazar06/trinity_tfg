import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RoomService } from '../room.service';

@Injectable()
export class RoomMemberGuard implements CanActivate {
  constructor(private roomService: RoomService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const roomId = request.params?.id;

    if (!userId || !roomId) {
      throw new ForbiddenException('Usuario o sala no identificados');
    }

    const canAccess = await this.roomService.canUserAccessRoom(userId, roomId);
    
    if (!canAccess) {
      throw new ForbiddenException('No tienes acceso a esta sala');
    }

    return true;
  }
}