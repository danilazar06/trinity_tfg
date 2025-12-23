import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RoomController } from './room.controller';
import { ShuffleSyncController } from './shuffle-sync.controller';
import { InactiveMemberController, InactivityConfigController } from './inactive-member.controller';
import { RoomService } from './room.service';
import { MemberService } from './member.service';
import { ShuffleSyncService } from './shuffle-sync.service';
import { InactiveMemberService } from './inactive-member.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [
    RoomController, 
    ShuffleSyncController, 
    InactiveMemberController,
    InactivityConfigController
  ],
  providers: [
    RoomService, 
    MemberService, 
    ShuffleSyncService,
    InactiveMemberService
  ],
  exports: [
    RoomService, 
    MemberService, 
    ShuffleSyncService,
    InactiveMemberService
  ],
})
export class RoomModule {}