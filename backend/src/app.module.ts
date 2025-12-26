import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { RoomModule } from './modules/room/room.module';
import { MediaModule } from './modules/media/media.module';
import { InteractionModule } from './modules/interaction/interaction.module';
import { MatchModule } from './modules/match/match.module';
import { SemanticAnalysisModule } from './modules/semantic/semantic-analysis.module';
import { CDNModule } from './modules/cdn/cdn.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { CostOptimizationModule } from './modules/cost-optimization/cost-optimization.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { RoomTemplateModule } from './modules/room-template/room-template.module';
import { RoomSettingsModule } from './modules/room-settings/room-settings.module';
import { RoomModerationModule } from './modules/room-moderation/room-moderation.module';
import { RoomThemeModule } from './modules/room-theme/room-theme.module';
import { RoomScheduleModule } from './modules/room-schedule/room-schedule.module';
import { PermissionModule } from './modules/permission/permission.module';
import { RoomChatModule } from './modules/room-chat/room-chat.module';
import { ContentSuggestionModule } from './modules/content-suggestion/content-suggestion.module';
import { RoomAutomationModule } from './modules/room-automation/room-automation.module';
import { PerformanceOptimizerModule } from './optimization/performance-optimizer.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { PermissionAuditMiddleware } from './common/middleware/permission-audit.middleware';

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
    SemanticAnalysisModule, // Análisis semántico y recomendaciones contextuales
    CDNModule, // Optimización y entrega de imágenes via CDN
    RealtimeModule, // Sincronización en tiempo real con WebSockets
    CostOptimizationModule, // Optimización de costos AWS y auto-escalado
    AnalyticsModule, // Sistema de analytics y métricas
    RoomTemplateModule, // Sistema de plantillas y presets de salas
    RoomSettingsModule, // Sistema de configuraciones avanzadas de salas
    RoomModerationModule, // Sistema de gestión avanzada de miembros y moderación
    RoomThemeModule, // Sistema de temas y personalización de salas
    RoomScheduleModule, // Sistema de programación de salas
    PermissionModule, // Sistema de permisos avanzado con caché y auditoría
    RoomChatModule, // Sistema de chat colaborativo en salas
    ContentSuggestionModule, // Sistema de sugerencias de contenido colaborativo
    RoomAutomationModule, // Sistema de automatización inteligente de salas
    PerformanceOptimizerModule, // Sistema de optimización de rendimiento (Task 12)
    HealthModule, // Sistema de health checks para AWS y servicios externos
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(PermissionAuditMiddleware).forRoutes('*'); // Aplicar auditoría a todas las rutas
  }
}
