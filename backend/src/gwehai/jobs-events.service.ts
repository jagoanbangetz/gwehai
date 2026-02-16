import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

/**
 * Emits userId when that user's job list has changed (new job, status change, stop).
 * JobsGateway subscribes and pushes the updated list over WebSocket.
 */
@Injectable()
export class JobsEventsService {
  private readonly userJobListUpdated = new Subject<string>();

  /** Notify that the job list for this user should be pushed to their WebSocket clients. */
  emitJobListUpdate(userId: string): void {
    this.userJobListUpdated.next(userId);
  }

  /** Subscribe to job list update events (userId). */
  onJobListUpdate() {
    return this.userJobListUpdated.asObservable();
  }
}
