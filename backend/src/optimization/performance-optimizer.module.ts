import { Module } from '@nestjs/common';
import { PerformanceOptimizerController } from './performance-optimizer.controller';
import { DatabaseOptimizerService } from './database-optimizer.service';
import { APIOptimizerService } from './api-optimizer.service';
import { RealtimeOptimizerService } from './realtime-optimizer.service';
import { DatabaseModule } from '../infrastructure/database/database.module';

@Module({
  imports: [
    DatabaseModule,
  ],
  controllers: [PerformanceOptimizerController],
  providers: [
    DatabaseOptimizerService,
    APIOptimizerService,
    RealtimeOptimizerService,
  ],
  exports: [
    DatabaseOptimizerService,
    APIOptimizerService,
    RealtimeOptimizerService,
  ],
})
export class PerformanceOptimizerModule {}