import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { EventStatus } from '../src/events/entities/event.entity';

describe('Events (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let dataSource: DataSource;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = moduleFixture.get(DataSource);
  });

  afterEach(async () => {
    // Clear test data
    await dataSource.query('DELETE FROM event_invitees');
    await dataSource.query('DELETE FROM events');
    await dataSource.query('DELETE FROM users');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /events', () => {
    it('should create event with valid data', async () => {
      const createEventDto = {
        title: 'Test Event',
        description: 'Test Description',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
      };

      const response = await request(app.getHttpServer())
        .post('/events')
        .send(createEventDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('Test Event');
      expect(response.body.status).toBe(EventStatus.TODO);
      expect(response.body.invitees).toEqual([]);
    });

    it('should return 400 when title is missing', async () => {
      const createEventDto = {
        description: 'Test Description',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
      };

      await request(app.getHttpServer())
        .post('/events')
        .send(createEventDto)
        .expect(400);
    });

    it('should return 400 for invalid status', async () => {
      const createEventDto = {
        title: 'Test Event',
        status: 'INVALID_STATUS',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
      };

      await request(app.getHttpServer())
        .post('/events')
        .send(createEventDto)
        .expect(400);
    });

    it('should return 400 for invalid startTime', async () => {
      const createEventDto = {
        title: 'Test Event',
        startTime: 'invalid-date',
        endTime: '2026-03-15T11:00:00Z',
      };

      await request(app.getHttpServer())
        .post('/events')
        .send(createEventDto)
        .expect(400);
    });

    it('should create event with invitees', async () => {
      // Create users first
      const user1 = await dataSource.query(
        "INSERT INTO users (id, name) VALUES (gen_random_uuid(), 'User 1') RETURNING id",
      );
      const user2 = await dataSource.query(
        "INSERT INTO users (id, name) VALUES (gen_random_uuid(), 'User 2') RETURNING id",
      );

      const createEventDto = {
        title: 'Test Event',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        inviteeIds: [user1[0].id, user2[0].id],
      };

      const response = await request(app.getHttpServer())
        .post('/events')
        .send(createEventDto)
        .expect(201);

      expect(response.body.invitees.length).toBe(2);
    });
  });

  describe('GET /events/:id', () => {
    it('should return event by id', async () => {
      const createEventDto = {
        title: 'Test Event',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/events')
        .send(createEventDto)
        .expect(201);

      const eventId = createResponse.body.id;

      const getResponse = await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(200);

      expect(getResponse.body.id).toBe(eventId);
      expect(getResponse.body.title).toBe('Test Event');
    });

    it('should return 404 for non-existent event', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      await request(app.getHttpServer())
        .get(`/events/${fakeId}`)
        .expect(404);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .get('/events/invalid-uuid')
        .expect(400);
    });
  });

  describe('DELETE /events/:id', () => {
    it('should delete event and return 204', async () => {
      const createEventDto = {
        title: 'Test Event',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/events')
        .send(createEventDto)
        .expect(201);

      const eventId = createResponse.body.id;

      await request(app.getHttpServer())
        .delete(`/events/${eventId}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(404);
    });

    it('should return 404 for non-existent event', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      await request(app.getHttpServer())
        .delete(`/events/${fakeId}`)
        .expect(404);
    });
  });

  describe('POST /events/merge-all/:userId', () => {
    it('should return empty array for user with no events', async () => {
      const userResult = await dataSource.query(
        "INSERT INTO users (id, name) VALUES (gen_random_uuid(), 'User 1') RETURNING id",
      );
      const userId = userResult[0].id;

      const response = await request(app.getHttpServer())
        .post(`/events/merge-all/${userId}`)
        .expect(201);

      expect(response.body).toEqual([]);
    });

    it('should return unchanged events when no overlaps', async () => {
      const userResult = await dataSource.query(
        "INSERT INTO users (id, name) VALUES (gen_random_uuid(), 'User 1') RETURNING id",
      );
      const userId = userResult[0].id;

      // Create two non-overlapping events
      const event1Dto = {
        title: 'Event 1',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        inviteeIds: [userId],
      };
      const event1 = await request(app.getHttpServer())
        .post('/events')
        .send(event1Dto)
        .expect(201);

      const event2Dto = {
        title: 'Event 2',
        startTime: '2026-03-15T12:00:00Z',
        endTime: '2026-03-15T13:00:00Z',
        inviteeIds: [userId],
      };
      const event2 = await request(app.getHttpServer())
        .post('/events')
        .send(event2Dto)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/events/merge-all/${userId}`)
        .expect(201);

      expect(response.body.length).toBe(2);
      expect(response.body.map((e: any) => e.id).sort()).toEqual(
        [event1.body.id, event2.body.id].sort(),
      );
    });

    it('should merge overlapping events', async () => {
      const userResult = await dataSource.query(
        "INSERT INTO users (id, name) VALUES (gen_random_uuid(), 'User 1') RETURNING id",
      );
      const userId = userResult[0].id;

      const event1Dto = {
        title: 'Event 1',
        description: 'Desc 1',
        status: EventStatus.TODO,
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        inviteeIds: [userId],
      };
      const event1 = await request(app.getHttpServer())
        .post('/events')
        .send(event1Dto)
        .expect(201);

      const event2Dto = {
        title: 'Event 2',
        description: 'Desc 2',
        status: EventStatus.IN_PROGRESS,
        startTime: '2026-03-15T10:30:00Z',
        endTime: '2026-03-15T11:30:00Z',
        inviteeIds: [userId],
      };
      const event2 = await request(app.getHttpServer())
        .post('/events')
        .send(event2Dto)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/events/merge-all/${userId}`)
        .expect(201);

      expect(response.body.length).toBe(1);
      const merged = response.body[0];
      expect(merged.title).toBe('Event 1 / Event 2');
      expect(merged.description).toBe('Desc 1 / Desc 2');
      expect(merged.status).toBe(EventStatus.IN_PROGRESS);
      expect(merged.startTime).toBe(new Date('2026-03-15T10:00:00Z').toISOString());
      expect(merged.endTime).toBe(new Date('2026-03-15T11:30:00Z').toISOString());

      // Verify old events are gone
      await request(app.getHttpServer())
        .get(`/events/${event1.body.id}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/events/${event2.body.id}`)
        .expect(404);
    });

    it('should handle status merge priority correctly', async () => {
      const userResult = await dataSource.query(
        "INSERT INTO users (id, name) VALUES (gen_random_uuid(), 'User 1') RETURNING id",
      );
      const userId = userResult[0].id;

      // Create three overlapping events with different statuses
      const event1Dto = {
        title: 'Event 1',
        status: EventStatus.TODO,
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        inviteeIds: [userId],
      };
      await request(app.getHttpServer())
        .post('/events')
        .send(event1Dto)
        .expect(201);

      const event2Dto = {
        title: 'Event 2',
        status: EventStatus.COMPLETED,
        startTime: '2026-03-15T10:30:00Z',
        endTime: '2026-03-15T11:30:00Z',
        inviteeIds: [userId],
      };
      await request(app.getHttpServer())
        .post('/events')
        .send(event2Dto)
        .expect(201);

      const event3Dto = {
        title: 'Event 3',
        status: EventStatus.IN_PROGRESS,
        startTime: '2026-03-15T10:15:00Z',
        endTime: '2026-03-15T11:15:00Z',
        inviteeIds: [userId],
      };
      await request(app.getHttpServer())
        .post('/events')
        .send(event3Dto)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/events/merge-all/${userId}`)
        .expect(201);

      expect(response.body.length).toBe(1);
      expect(response.body[0].status).toBe(EventStatus.IN_PROGRESS);
    });

    it('should deduplicate invitees', async () => {
      const user1Result = await dataSource.query(
        "INSERT INTO users (id, name) VALUES (gen_random_uuid(), 'User 1') RETURNING id",
      );
      const user1Id = user1Result[0].id;

      const user2Result = await dataSource.query(
        "INSERT INTO users (id, name) VALUES (gen_random_uuid(), 'User 2') RETURNING id",
      );
      const user2Id = user2Result[0].id;

      const event1Dto = {
        title: 'Event 1',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        inviteeIds: [user1Id, user2Id],
      };
      await request(app.getHttpServer())
        .post('/events')
        .send(event1Dto)
        .expect(201);

      const event2Dto = {
        title: 'Event 2',
        startTime: '2026-03-15T10:30:00Z',
        endTime: '2026-03-15T11:30:00Z',
        inviteeIds: [user2Id],
      };
      await request(app.getHttpServer())
        .post('/events')
        .send(event2Dto)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/events/merge-all/${user1Id}`)
        .expect(201);

      expect(response.body.length).toBe(1);
      expect(response.body[0].invitees.length).toBe(2);
    });

    it('should be idempotent', async () => {
      const userResult = await dataSource.query(
        "INSERT INTO users (id, name) VALUES (gen_random_uuid(), 'User 1') RETURNING id",
      );
      const userId = userResult[0].id;

      const event1Dto = {
        title: 'Event 1',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        inviteeIds: [userId],
      };
      await request(app.getHttpServer())
        .post('/events')
        .send(event1Dto)
        .expect(201);

      const event2Dto = {
        title: 'Event 2',
        startTime: '2026-03-15T10:30:00Z',
        endTime: '2026-03-15T11:30:00Z',
        inviteeIds: [userId],
      };
      await request(app.getHttpServer())
        .post('/events')
        .send(event2Dto)
        .expect(201);

      // First merge
      const response1 = await request(app.getHttpServer())
        .post(`/events/merge-all/${userId}`)
        .expect(201);

      expect(response1.body.length).toBe(1);
      const mergedId = response1.body[0].id;

      // Second merge (idempotent)
      const response2 = await request(app.getHttpServer())
        .post(`/events/merge-all/${userId}`)
        .expect(201);

      expect(response2.body.length).toBe(1);
      expect(response2.body[0].id).toBe(mergedId);
    });

    it('should return 400 for invalid userId UUID', async () => {
      await request(app.getHttpServer())
        .post('/events/merge-all/invalid-uuid')
        .expect(400);
    });
  });
});
