import { Module } from '@nestjs/common';
import { RoomController } from './room.controller';
import { ShuffleSyncController } from './shuffle-sync.controller';
import { RoomService } from './room.service';
import { MemberService } from './member.service';
import { ShuffleSyncService } from './shuffle-sync.service';

@Module({
  controllers: [RoomController, ShuffleSyncController],
  providers: [RoomService, MemberService, ShuffleSyncService],
  exports: [RoomService, MemberService, ShuffleSyncService],
})
export class RoomModule {}