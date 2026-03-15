import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum EventStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: EventStatus,
    default: EventStatus.TODO,
  })
  status: EventStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz' })
  startTime: Date;

  @Column({ type: 'timestamptz' })
  endTime: Date;

  @ManyToMany(() => User, (user) => user.events, { eager: true })
  @JoinTable({
    name: 'event_invitees',
    joinColumn: { name: 'event_id' },
    inverseJoinColumn: { name: 'user_id' },
  })
  invitees: User[];
}
