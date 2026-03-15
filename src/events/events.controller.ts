import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { Event } from './entities/event.entity';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  async create(@Body() createEventDto: CreateEventDto): Promise<Event> {
    return this.eventsService.create(createEventDto);
  }

  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Event> {
    return this.eventsService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.eventsService.remove(id);
  }

  @Post('merge-all/:userId')
  async mergeAll(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<Event[]> {
    return this.eventsService.mergeAllForUser(userId);
  }
}
