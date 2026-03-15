import {
  IsString,
  IsOptional,
  IsEnum,
  IsISO8601,
  IsUUID,
  IsArray,
} from 'class-validator';
import { EventStatus } from '../entities/event.entity';

export class CreateEventDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsISO8601()
  startTime: string;

  @IsISO8601()
  endTime: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  inviteeIds?: string[];
}
