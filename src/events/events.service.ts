import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Event, EventStatus } from './entities/event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UsersService } from '../users/users.service';

interface EventGroup {
  events: Event[];
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private eventsRepository: Repository<Event>,
    private usersService: UsersService,
  ) {}

  async create(createEventDto: CreateEventDto): Promise<Event> {
    const { inviteeIds = [], ...eventData } = createEventDto;

    let invitees = [];
    if (inviteeIds.length > 0) {
      invitees = await this.usersService.findByIds(inviteeIds);
    }

    const event = this.eventsRepository.create({
      ...eventData,
      startTime: new Date(createEventDto.startTime),
      endTime: new Date(createEventDto.endTime),
      invitees,
    });

    return this.eventsRepository.save(event);
  }

  async findOne(id: string): Promise<Event> {
    const event = await this.eventsRepository.findOne({
      where: { id },
    });
    if (!event) {
      throw new NotFoundException(`Event with id ${id} not found`);
    }
    return event;
  }

  async remove(id: string): Promise<void> {
    const event = await this.findOne(id);
    await this.eventsRepository.remove(event);
  }

  async mergeAllForUser(userId: string): Promise<Event[]> {
    const user = await this.usersService.findOneOrFail(userId);
    const userEventIds = (user.events || []).map((e) => e.id);

    if (userEventIds.length === 0) {
      return [];
    }

    const events = await this.eventsRepository.find({
      where: { id: In(userEventIds) },
    });

    // Group overlapping events
    const groups = this.groupOverlappingEvents(events);

    // Process groups and merge
    const result = await this.eventsRepository.manager.transaction(
      async (manager) => {
        const resultEvents: Event[] = [];

        for (const group of groups) {
          if (group.events.length === 1) {
            // Single event, keep as is
            resultEvents.push(group.events[0]);
          } else {
            // Merge multiple events
            const merged = this.mergeEvents(group.events);
            const savedEvent = await manager.save(Event, merged);
            resultEvents.push(savedEvent);

            // Delete old events
            for (const event of group.events) {
              await manager.remove(Event, event);
            }
          }
        }

        return resultEvents;
      },
    );

    return result;
  }

  private groupOverlappingEvents(events: Event[]): EventGroup[] {
    // Sort by startTime
    const sorted = events.sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    const groups: EventGroup[] = [];
    let currentGroup: Event[] = [];
    let groupMaxEndTime: number | null = null;

    for (const event of sorted) {
      const eventStartTime = event.startTime.getTime();

      if (
        groupMaxEndTime === null ||
        eventStartTime <= groupMaxEndTime
      ) {
        // Same group
        currentGroup.push(event);
        groupMaxEndTime = Math.max(
          groupMaxEndTime || 0,
          event.endTime.getTime(),
        );
      } else {
        // New group
        groups.push({ events: currentGroup });
        currentGroup = [event];
        groupMaxEndTime = event.endTime.getTime();
      }
    }

    if (currentGroup.length > 0) {
      groups.push({ events: currentGroup });
    }

    return groups;
  }

  private mergeEvents(events: Event[]): Event {
    const merged = new Event();

    merged.title = events.map((e) => e.title).join(' / ');

    const descriptions = events
      .map((e) => e.description)
      .filter((d) => d !== null && d !== undefined);
    merged.description = descriptions.length > 0 ? descriptions.join(' / ') : null;

    merged.status = this.mergeStatus(events.map((e) => e.status));

    merged.startTime = new Date(
      Math.min(...events.map((e) => e.startTime.getTime())),
    );

    merged.endTime = new Date(
      Math.max(...events.map((e) => e.endTime.getTime())),
    );

    const inviteesSet = new Map<string, any>();
    for (const event of events) {
      for (const invitee of event.invitees || []) {
        inviteesSet.set(invitee.id, invitee);
      }
    }
    merged.invitees = Array.from(inviteesSet.values());

    return merged;
  }

  private mergeStatus(statuses: EventStatus[]): EventStatus {
    if (statuses.includes(EventStatus.IN_PROGRESS)) {
      return EventStatus.IN_PROGRESS;
    }
    if (statuses.includes(EventStatus.TODO)) {
      return EventStatus.TODO;
    }
    return EventStatus.COMPLETED;
  }
}
