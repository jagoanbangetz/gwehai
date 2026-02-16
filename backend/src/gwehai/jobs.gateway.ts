import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'ws';
import { JobsEventsService } from './jobs-events.service';
import { GwehAIService } from './gwehai.service';

/** Map userId -> Set of WebSocket clients subscribed to job list updates. */
const userSockets = new Map<string, Set<WebSocket>>();

function getTokenFromUrl(url: string): string | null {
  try {
    const idx = url.indexOf('?');
    if (idx === -1) return null;
    const params = new URLSearchParams(url.slice(idx));
    return params.get('token');
  } catch {
    return null;
  }
}

@WebSocketGateway({ path: '/gwehai-jobs' })
export class JobsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(JobsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly jobsEvents: JobsEventsService,
    private readonly gwehaiService: GwehAIService,
  ) {}

  afterInit() {
    this.jobsEvents.onJobListUpdate().subscribe((userId) => {
      this.broadcastJobListToUser(userId);
    });
  }

  handleConnection(client: WebSocket & { url?: string }) {
    const url = (client as any).url ?? '';
    const token = getTokenFromUrl(url);
    if (!token) {
      this.logger.warn('Jobs WS: no token in query');
      client.close(4001, 'Unauthorized');
      return;
    }
    let payload: { sub?: string; id?: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      this.logger.warn('Jobs WS: invalid token');
      client.close(4001, 'Unauthorized');
      return;
    }
    const userId = payload.sub ?? payload.id;
    if (!userId) {
      client.close(4001, 'Unauthorized');
      return;
    }
    let set = userSockets.get(userId);
    if (!set) {
      set = new Set();
      userSockets.set(userId, set);
    }
    set.add(client);
    this.logger.log(`Jobs WS: user ${userId} connected (${set.size} clients)`);
    this.broadcastJobListToUser(userId);
  }

  handleDisconnect(client: WebSocket) {
    for (const [userId, set] of userSockets.entries()) {
      if (set.has(client)) {
        set.delete(client);
        if (set.size === 0) userSockets.delete(userId);
        break;
      }
    }
  }

  private broadcastJobListToUser(userId: string) {
    const set = userSockets.get(userId);
    if (!set || set.size === 0) return;
    let list: any[];
    try {
      list = this.gwehaiService.listJobsForUser(userId);
    } catch {
      list = [];
    }
    const payload = JSON.stringify({ type: 'jobs', jobs: list });
    for (const ws of set) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }
}
