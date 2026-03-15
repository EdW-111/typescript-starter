import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let mockUsersRepository: any;

  beforeEach(async () => {
    mockUsersRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUsersRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByIds', () => {
    it('should return users by ids', async () => {
      const mockUsers = [
        { id: '1', name: 'User 1' },
        { id: '2', name: 'User 2' },
      ];
      mockUsersRepository.find.mockResolvedValue(mockUsers);

      const result = await service.findByIds(['1', '2']);

      expect(result).toEqual(mockUsers);
      expect(mockUsersRepository.find).toHaveBeenCalledWith({
        where: { id: expect.anything() },
      });
    });

    it('should return empty array for empty ids', async () => {
      const result = await service.findByIds([]);
      expect(result).toEqual([]);
    });
  });

  describe('findOneOrFail', () => {
    it('should return a user', async () => {
      const mockUser = { id: '1', name: 'User 1' };
      mockUsersRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOneOrFail('1');

      expect(result).toEqual(mockUser);
    });

    it('should throw error when user not found', async () => {
      mockUsersRepository.findOne.mockResolvedValue(null);

      await expect(service.findOneOrFail('nonexistent')).rejects.toThrow(
        'User with id nonexistent not found',
      );
    });
  });
});
