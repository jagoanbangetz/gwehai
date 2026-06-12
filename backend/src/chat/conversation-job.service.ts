import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationJob } from '../entities/conversation-job.entity';
import { ConversationEvent } from '../entities/conversation-event.entity';

@Injectable()
export class ConversationJobService {
  constructor(
    @InjectRepository(ConversationJob)
    private jobRepo: Repository<ConversationJob>,
    @InjectRepository(ConversationEvent)
    private eventRepo: Repository<ConversationEvent>,
  ) {}

  /**
   * Register a new job for a conversation.
   * Enforces 1 active (running) job per conversation via partial unique index.
   */
  async createJob(conversationId: string, jobId: string): Promise<ConversationJob> {
    const job = this.jobRepo.create({
      conversationId,
      jobId,
      status: 'running',
    });
    return this.jobRepo.save(job);
  }

  /**
   * Update job status.
   */
  async updateJobStatus(jobId: string, status: 'running' | 'finished' | 'error' | 'idle'): Promise<void> {
    await this.jobRepo.update({ jobId }, { status });
  }

  /**
   * Append an event to the job's event log.
   * Auto-increments seq per job.
   */
  async appendEvent(jobId: string, eventType: string, data: Record<string, any>): Promise<void> {
    // Get next seq
    const lastEvent = await this.eventRepo.findOne({
      where: { jobId },
      order: { seq: 'DESC' },
    });
    const nextSeq = (lastEvent?.seq ?? 0) + 1;

    const event = this.eventRepo.create({
      jobId,
      seq: nextSeq,
      eventType,
      data,
    });
    await this.eventRepo.save(event);
  }

  /**
   * Get conversation status — returns the active job or last job for a conversation.
   */
  async getConversationStatus(conversationId: string): Promise<{
    conversation_id: string;
    job_id: string | null;
    status: string;
  }> {
    // Prefer running job, otherwise latest
    let job = await this.jobRepo.findOne({
      where: { conversationId, status: 'running' },
      order: { createdAt: 'DESC' },
    });

    if (!job) {
      job = await this.jobRepo.findOne({
        where: { conversationId },
        order: { createdAt: 'DESC' },
      });
    }

    if (!job) {
      return {
        conversation_id: conversationId,
        job_id: null,
        status: 'idle',
      };
    }

    return {
      conversation_id: conversationId,
      job_id: job.jobId,
      status: job.status,
    };
  }

  /**
   * Get events for a job since a given sequence number.
   */
  async getEventsSince(jobId: string, sinceSeq: number = 0): Promise<Array<{
    seq: number;
    event_type: string;
    data: Record<string, any>;
    ts: Date;
  }>> {
    const events = await this.eventRepo.find({
      where: { jobId },
      order: { seq: 'ASC' },
    });

    return events
      .filter((e) => e.seq > sinceSeq)
      .map((e) => ({
        seq: e.seq,
        event_type: e.eventType,
        data: e.data,
        ts: e.ts,
      }));
  }
}
