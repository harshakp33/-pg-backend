import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  getRoot() {
    return {
      name: 'PG Management Backend API',
      version: '1.0.0',
      status: 'active',
      timestamp: new Date().toISOString(),
    };
  }

  async getHealth() {
    const isDbConnected = await this.prisma.isHealthy();

    if (!isDbConnected) {
      return {
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
