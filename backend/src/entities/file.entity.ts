import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { MessageFile } from './message-file.entity';

@Entity('files')
@Index(['userId', 'createdAt'])
export class File {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  filename: string;

  @Column()
  originalName: string;

  @Column()
  mimeType: string;

  @Column({ type: 'bigint' })
  size: number; // Size in bytes

  @Column()
  storagePath: string; // Path in storage (S3, local, etc.)

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Additional file metadata

  @CreateDateColumn()
  createdAt: Date;

  // Relations
  @OneToMany(() => MessageFile, (messageFile) => messageFile.file)
  messageFiles: MessageFile[];
}
