import { CsrfGuard } from './auth/guards/csrf.guard';
import { PortalModule } from './portal/portal.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { StaffAttendanceModule } from './staff-attendance/staff-attendance.module';
import { StaffModule } from './staff/staff.module';
import { LeavesModule } from './leaves/leaves.module';
﻿import { VisitorsModule } from './visitors/visitors.module';
import { NoticesModule } from './notices/notices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationPreferencesModule } from './notification-preferences/notification-preferences.module';
import { FoodModule } from './food/food.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { StaffTasksModule } from './staff-tasks/staff-tasks.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { DepositsModule } from './deposits/deposits.module';
import { ExpensesModule } from './expenses/expenses.module';
import { RentPlansModule } from './rent-plans/rent-plans.module';
import { ApplicationsModule } from './applications/applications.module';
import { BookingsModule } from './bookings/bookings.module';
import { MoveInsModule } from './move-ins/move-ins.module';
import { ResidentsModule } from './residents/residents.module';
import { ResidentStaysModule } from './resident-stays/resident-stays.module';
import { ResidentDocumentsModule } from './resident-documents/resident-documents.module';
import { FloorsModule } from './floors/floors.module';
import { RoomsModule } from './rooms/rooms.module';
import { BedsModule } from './beds/beds.module';
import { PropertiesModule } from './properties/properties.module';
import { RbacModule } from './rbac/rbac.module';
import { resolve } from 'path';
import { AuthModule } from './auth/auth.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingMiddleware } from './common/middleware/logging.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), '.env'), resolve(__dirname, '..', '.env'), '.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: (config.get<number>('THROTTLE_TTL') ? Number(config.get('THROTTLE_TTL')) : 60) * 1000,
          limit: config.get<number>('THROTTLE_LIMIT') ? Number(config.get('THROTTLE_LIMIT')) : 100,
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    RbacModule,
    PropertiesModule,
    FloorsModule,
    RoomsModule,
    BedsModule,
    ResidentsModule,
    ResidentStaysModule,
    ResidentDocumentsModule,
    ApplicationsModule,
    BookingsModule,
    MoveInsModule,
    InvoicesModule,
    PaymentsModule,
    DepositsModule,
    ExpensesModule,
    RentPlansModule,
    ComplaintsModule,
    MaintenanceModule,
    StaffTasksModule,
    FoodModule,
    NoticesModule,
    NotificationsModule,
    NotificationPreferencesModule,
    VisitorsModule,
    LeavesModule,
    StaffModule,
    StaffAttendanceModule,
    ReportsModule,
    SettingsModule,
    PortalModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('{/*path}');
  }
}
