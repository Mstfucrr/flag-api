import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestLogEntity } from '../../database/entities/request-log.entity';
import { RequestLogController } from './request-log.controller';
import { RequestLogService } from '../../repository/request-log/request-log.service';

@Module({
    imports: [TypeOrmModule.forFeature([RequestLogEntity])],
    controllers: [RequestLogController],
    providers: [RequestLogService],
    exports: [RequestLogService],
})
export class RequestLogModule {}
