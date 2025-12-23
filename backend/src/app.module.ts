import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { RoomModule } from './modules/room/room.module';
import { MediaModule } from './modules/media/media.module';
import { InteractionModule } from './modules/interaction/interaction.module';
import { MatchModule } from './modules/match/match.module';
import { SemanticAnalysisModule } from './modules/semantic/semantic-analysis.module';
import { DatabaseModule } from './infrastructure/database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    RoomModule,
    MediaModule,
    InteractionModule,
    MatchModule,
    SemanticAnalysisModule, // Nuevo módulo para análisis semántico
  ],
})
export class AppModule {}