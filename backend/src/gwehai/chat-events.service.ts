import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface ChatStreamEvent {
  userId: string;
  jobId: string;
  event: { type: string; data: Record<string, any> };
}

/**
 * Event bus for streaming GwehAI chat events (status, tool logs, deltas) to WebSocket gateways.
 * GwehAIService publishes events; JobsGateway (and any other listener) subscribes and forwards
 * them to connected clients.
 */
@Injectable()
export class ChatEventsService {
  private readonly events$ = new Subject<ChatStreamEvent>();

  emit(userId: string, jobId: string, event: { type: string; data: Record<string, any> }): void {
    this.events$.next({ userId, jobId, event });
  }

  onEvents() {
    return this.events$.asObservable();
  }
}

