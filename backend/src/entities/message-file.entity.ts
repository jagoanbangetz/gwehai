import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Message } from './message.entity';
import { File } from './file.entity';

@Entity('message_files')
@Index(['message', 'file'])
export class MessageFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  messageId: string;

  @ManyToOne(() => Message, (message) => message.files, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @Column()
  fileId: string;

  @ManyToOne(() => File, (file) => file.messageFiles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'fileId' })
  file: File;
}
