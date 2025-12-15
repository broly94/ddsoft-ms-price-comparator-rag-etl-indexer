import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EtlModule } from './etl/etl.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Hace que las variables de entorno estén disponibles en toda la app
    }),
    EtlModule,
  ],
  controllers: [], // El controlador de app.controller.ts ya no es necesario
  providers: [],   // El servicio de app.service.ts ya no es necesario
})
export class AppModule {}