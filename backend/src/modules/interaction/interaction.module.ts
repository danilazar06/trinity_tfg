import { Module } from '@nestjs/common';
import { InteractionController } from './interaction.controller';
import { InteractionService } from './interaction.service';
import { RoomModule } from '../room/room.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [RoomModule, MediaModule],
  controllers: [InteractionController],
  providers: [InteractionService],
  exports: [InteractionService],
})
export class InteractionModule {}