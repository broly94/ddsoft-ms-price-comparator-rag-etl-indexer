import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { EtlService } from './etl.service';

@Controller()
export class EtlController {
  constructor(private readonly etlService: EtlService) {}

  @MessagePattern({ cmd: 'trigger_product_indexing' })
  handleProductIndexing(@Payload() data: any) {
    console.log('ETL Controller: Petición recibida para iniciar la indexación de productos.', data);
    return this.etlService.runProductEtl();
  }
}
