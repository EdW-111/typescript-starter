import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { Event, EventStatus } from './entities/event.entity';
import { UsersService } from '../users/users.service';

describe('EventsService', () => {
  let service: EventsService;
  let mockEventsRepository: any;
  let mockUsersService: any;

  beforeEach(async () => {
    mockEventsRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
      manager: {
        transaction: jest.fn(),
        save: jest.fn(),
        remove: jest.fn(),
      },
    };

    mockUsersService = {
      findByIds: jest.fn(),
      findOneOrFail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: getRepositoryToken(Event),
          useValue: mockEventsRepository,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('create', () => {
    it('should create event without invitees', async () => {
      const dto = {
        title: 'Test Event',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
      };
      const mockEvent = {
        id: '1',
        ...dto,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        invitees: [],
      };
      mockEventsRepository.create.mockReturnValue(mockEvent);
      mockEventsRepository.save.mockResolvedValue(mockEvent);

      const result = await service.create(dto);

      expect(result).toEqual(mockEvent);
      expect(mockEventsRepository.create).toHaveBeenCalled();
      expect(mockEventsRepository.save).toHaveBeenCalled();
    });

    it('should create event with invitees', async () => {
      const dto = {
        title: 'Test Event',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        inviteeIds: ['user-1', 'user-2'],
      };
      const mockUsers = [
        { id: 'user-1', name: 'User 1' },
        { id: 'user-2', name: 'User 2' },
      ];
      const mockEvent = {
        id: '1',
        ...dto,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        invitees: mockUsers,
      };
      mockUsersService.findByIds.mockResolvedValue(mockUsers);
      mockEventsRepository.create.mockReturnValue(mockEvent);
      mockEventsRepository.save.mockResolvedValue(mockEvent);

      const result = await service.create(dto);

      expect(result.invitees).toEqual(mockUsers);
      expect(mockUsersService.findByIds).toHaveBeenCalledWith(dto.inviteeIds);
    });
  });

  describe('findOne', () => {
    it('should return an event', async () => {
      const mockEvent = { id: '1', title: 'Test Event' };
      mockEventsRepository.findOne.mockResolvedValue(mockEvent);

      const result = await service.findOne('1');

      expect(result).toEqual(mockEvent);
    });

    it('should throw NotFoundException when not found', async () => {
      mockEventsRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete an event', async () => {
      const mockEvent = { id: '1', title: 'Test Event' };
      mockEventsRepository.findOne.mockResolvedValue(mockEvent);
      mockEventsRepository.remove.mockResolvedValue(mockEvent);

      await service.remove('1');

      expect(mockEventsRepository.remove).toHaveBeenCalledWith(mockEvent);
    });

    it('should throw NotFoundException when not found', async () => {
      mockEventsRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('mergeAllForUser', () => {
    it('should return empty array when user has no events', async () => {
      mockUsersService.findOneOrFail.mockResolvedValue({
        id: 'user-1',
        events: [],
      });

      const result = await service.mergeAllForUser('user-1');

      expect(result).toEqual([]);
    });

    it('should return unchanged events when no overlaps', async () => {
      const events = [
        {
          id: '1',
          title: 'Event 1',
          status: EventStatus.TODO,
          description: null,
          startTime: new Date('2026-03-15T10:00:00Z'),
          endTime: new Date('2026-03-15T11:00:00Z'),
          invitees: [],
        },
        {
          id: '2',
          title: 'Event 2',
          status: EventStatus.TODO,
          description: null,
          startTime: new Date('2026-03-15T12:00:00Z'),
          endTime: new Date('2026-03-15T13:00:00Z'),
          invitees: [],
        },
      ];
      mockUsersService.findOneOrFail.mockResolvedValue({
        id: 'user-1',
        events: events,
      });
      mockEventsRepository.find.mockResolvedValue(events);
      mockEventsRepository.manager.transaction.mockImplementation(
        (callback) => callback(mockEventsRepository.manager),
      );

      const result = await service.mergeAllForUser('user-1');

      expect(result).toEqual(events);
    });

    it('should merge two overlapping events', async () => {
      const event1 = {
        id: '1',
        title: 'Event 1',
        status: EventStatus.TODO,
        description: 'Desc 1',
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z'),
        invitees: [{ id: 'user-1', name: 'User 1' }],
      };
      const event2 = {
        id: '2',
        title: 'Event 2',
        status: EventStatus.IN_PROGRESS,
        description: 'Desc 2',
        startTime: new Date('2026-03-15T10:30:00Z'),
        endTime: new Date('2026-03-15T11:30:00Z'),
        invitees: [{ id: 'user-2', name: 'User 2' }],
      };
      mockUsersService.findOneOrFail.mockResolvedValue({
        id: 'user-1',
        events: [event1, event2],
      });
      mockEventsRepository.find.mockResolvedValue([event1, event2]);

      let savedEvent: any;
      mockEventsRepository.manager.transaction.mockImplementation(
        async (callback) => {
          const manager = mockEventsRepository.manager;
          manager.save = jest.fn().mockImplementation((entity, data) => {
            savedEvent = data;
            return { ...data, id: 'merged' };
          });
          manager.remove = jest.fn();
          return callback(manager);
        },
      );

      const result = await service.mergeAllForUser('user-1');

      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Event 1 / Event 2');
      expect(result[0].status).toBe(EventStatus.IN_PROGRESS);
      expect(result[0].description).toBe('Desc 1 / Desc 2');
    });

    it('should handle three overlapping events correctly', async () => {
      const eventA = {
        id: '1',
        title: 'Event A',
        status: EventStatus.TODO,
        description: null,
        startTime: new Date('2026-03-15T01:00:00Z'),
        endTime: new Date('2026-03-15T10:00:00Z'),
        invitees: [],
      };
      const eventB = {
        id: '2',
        title: 'Event B',
        status: EventStatus.TODO,
        description: null,
        startTime: new Date('2026-03-15T02:00:00Z'),
        endTime: new Date('2026-03-15T04:00:00Z'),
        invitees: [],
      };
      const eventC = {
        id: '3',
        title: 'Event C',
        status: EventStatus.TODO,
        description: null,
        startTime: new Date('2026-03-15T06:00:00Z'),
        endTime: new Date('2026-03-15T08:00:00Z'),
        invitees: [],
      };
      mockUsersService.findOneOrFail.mockResolvedValue({
        id: 'user-1',
        events: [eventA, eventB, eventC],
      });
      mockEventsRepository.find.mockResolvedValue([eventA, eventB, eventC]);

      mockEventsRepository.manager.transaction.mockImplementation(
        async (callback) => {
          const manager = mockEventsRepository.manager;
          manager.save = jest.fn().mockImplementation((entity, data) => {
            return { ...data, id: 'merged' };
          });
          manager.remove = jest.fn();
          return callback(manager);
        },
      );

      const result = await service.mergeAllForUser('user-1');

      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Event A / Event B / Event C');
    });

    it('should merge status correctly (IN_PROGRESS > TODO > COMPLETED)', async () => {
      const event1 = {
        id: '1',
        title: 'Event 1',
        status: EventStatus.TODO,
        description: null,
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z'),
        invitees: [],
      };
      const event2 = {
        id: '2',
        title: 'Event 2',
        status: EventStatus.COMPLETED,
        description: null,
        startTime: new Date('2026-03-15T10:30:00Z'),
        endTime: new Date('2026-03-15T11:30:00Z'),
        invitees: [],
      };
      const event3 = {
        id: '3',
        title: 'Event 3',
        status: EventStatus.IN_PROGRESS,
        description: null,
        startTime: new Date('2026-03-15T10:15:00Z'),
        endTime: new Date('2026-03-15T11:15:00Z'),
        invitees: [],
      };
      mockUsersService.findOneOrFail.mockResolvedValue({
        id: 'user-1',
        events: [event1, event2, event3],
      });
      mockEventsRepository.find.mockResolvedValue([event1, event2, event3]);

      mockEventsRepository.manager.transaction.mockImplementation(
        async (callback) => {
          const manager = mockEventsRepository.manager;
          manager.save = jest.fn().mockImplementation((entity, data) => {
            return { ...data, id: 'merged' };
          });
          manager.remove = jest.fn();
          return callback(manager);
        },
      );

      const result = await service.mergeAllForUser('user-1');

      expect(result[0].status).toBe(EventStatus.IN_PROGRESS);
    });

    it('should handle descriptions with null values', async () => {
      const event1 = {
        id: '1',
        title: 'Event 1',
        status: EventStatus.TODO,
        description: 'Desc 1',
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z'),
        invitees: [],
      };
      const event2 = {
        id: '2',
        title: 'Event 2',
        status: EventStatus.TODO,
        description: null,
        startTime: new Date('2026-03-15T10:30:00Z'),
        endTime: new Date('2026-03-15T11:30:00Z'),
        invitees: [],
      };
      const event3 = {
        id: '3',
        title: 'Event 3',
        status: EventStatus.TODO,
        description: 'Desc 3',
        startTime: new Date('2026-03-15T10:15:00Z'),
        endTime: new Date('2026-03-15T11:15:00Z'),
        invitees: [],
      };
      mockUsersService.findOneOrFail.mockResolvedValue({
        id: 'user-1',
        events: [event1, event2, event3],
      });
      mockEventsRepository.find.mockResolvedValue([event1, event2, event3]);

      mockEventsRepository.manager.transaction.mockImplementation(
        async (callback) => {
          const manager = mockEventsRepository.manager;
          manager.save = jest.fn().mockImplementation((entity, data) => {
            return { ...data, id: 'merged' };
          });
          manager.remove = jest.fn();
          return callback(manager);
        },
      );

      const result = await service.mergeAllForUser('user-1');

      expect(result[0].description).toBe('Desc 1 / Desc 3');
    });

    it('should deduplicate invitees by user id', async () => {
      const sharedUser = { id: 'shared-user', name: 'Shared User' };
      const user1 = { id: 'user-1', name: 'User 1' };
      const user2 = { id: 'user-2', name: 'User 2' };

      const event1 = {
        id: '1',
        title: 'Event 1',
        status: EventStatus.TODO,
        description: null,
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z'),
        invitees: [sharedUser, user1],
      };
      const event2 = {
        id: '2',
        title: 'Event 2',
        status: EventStatus.TODO,
        description: null,
        startTime: new Date('2026-03-15T10:30:00Z'),
        endTime: new Date('2026-03-15T11:30:00Z'),
        invitees: [sharedUser, user2],
      };
      mockUsersService.findOneOrFail.mockResolvedValue({
        id: 'user-1',
        events: [event1, event2],
      });
      mockEventsRepository.find.mockResolvedValue([event1, event2]);

      mockEventsRepository.manager.transaction.mockImplementation(
        async (callback) => {
          const manager = mockEventsRepository.manager;
          manager.save = jest.fn().mockImplementation((entity, data) => {
            return { ...data, id: 'merged' };
          });
          manager.remove = jest.fn();
          return callback(manager);
        },
      );

      const result = await service.mergeAllForUser('user-1');

      expect(result[0].invitees.length).toBe(3);
      expect(result[0].invitees.find((u: any) => u.id === 'shared-user')).toBeDefined();
    });
  });
});
