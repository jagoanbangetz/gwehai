import { JobsGateway } from '../../src/gwehai/jobs.gateway';
import { ChatEventsService } from '../../src/gwehai/chat-events.service';
import { JobsEventsService } from '../../src/gwehai/jobs-events.service';

describe('JobsGateway WebSocket streaming', () => {
  it('forwards chat events to connected user sockets', () => {
    const mockJwt = { verify: jest.fn() } as any;
    const jobsEvents = new JobsEventsService();
    const chatEvents = new ChatEventsService();
    const mockGwehai = { listJobsForUser: jest.fn().mockReturnValue([]) } as any;

    const gateway = new JobsGateway(
      mockJwt as any,
      jobsEvents,
      chatEvents,
      mockGwehai,
    );

    // Initialize subscriptions
    gateway.afterInit();

    // Inject a fake socket for user-1
    const wsSend = jest.fn();
    const fakeSocket: any = { readyState: 1, send: wsSend };
    (gateway as any).userSockets.set('user-1', new Set([fakeSocket]));

    // Emit a chat stream event
    chatEvents.emit('user-1', 'job-1', { type: 'status', data: { message: 'Planning the plan...' } });

    expect(wsSend).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(wsSend.mock.calls[0][0]);
    expect(payload.type).toBe('event');
    expect(payload.job_id).toBe('job-1');
    expect(payload.event.type).toBe('status');
    expect(payload.event.data.message).toBe('Planning the plan...');
  });
});

