import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

export interface LivenessResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get('live')
  @ApiOperation({ summary: 'Check whether the API process is alive' })
  @ApiOkResponse({ description: 'The API process is alive.' })
  liveness(): LivenessResponse {
    return {
      status: 'ok',
      service: 'qlsv-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
