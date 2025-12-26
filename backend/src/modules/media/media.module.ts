import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { TMDBService } from '../../infrastructure/tmdb/tmdb.service';
import { CircuitBreakerService } from '../../infrastructure/circuit-breaker/circuit-breaker.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, TMDBService, CircuitBreakerService],
  exports: [MediaService, TMDBService],
})
export class MediaModule {}
