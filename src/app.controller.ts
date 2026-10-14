import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { BypassTransform } from './common/decorators/bypass-transform.decorator';

@ApiTags('Root')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiTags('Health')
  @ApiOperation({ summary: 'Health check and database connection status' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy and database is connected',
    schema: {
      example: {
        status: 'ok',
        database: 'connected',
        timestamp: '2026-10-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Service or database is unavailable',
    schema: {
      example: {
        status: 'error',
        database: 'disconnected',
        timestamp: '2026-10-01T12:00:00.000Z',
      },
    },
  })
  @BypassTransform()
  @Get('health')
  async getHealth(@Res({ passthrough: true }) res: Response) {
    const result = await this.appService.getHealth();
    if (result.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @ApiOperation({ summary: 'API root information' })
  @ApiResponse({
    status: 200,
    description: 'API root metadata',
    schema: {
      example: {
        success: true,
        data: {
          name: 'PG Management Backend API',
          version: '1.0.0',
          status: 'active',
          timestamp: '2026-10-01T12:00:00.000Z',
        },
        timestamp: '2026-10-01T12:00:00.000Z',
      },
    },
  })
  @Get()
  getRoot() {
    return this.appService.getRoot();
  }
}
