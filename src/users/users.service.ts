import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.usersRepository.find({
      where: { id: In(ids) },
    });
  }

  async findOneOrFail(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['events'],
    });
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    return user;
  }
}
