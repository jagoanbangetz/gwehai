import { ChatEventsService } from '../../src/gwehai/chat-events.service';

describe('ChatEventsService', () => {
  it('emits stream events to subscribers', (done) => {
    const service = new ChatEventsService();
    const payload = {
      userId: 'user-1',
      jobId: 'job-1',
      event: { type: 'status', data: { message: 'Planning the plan...' } },
    };

    const sub = service.onEvents().subscribe((ev) => {
      expect(ev).toEqual(payload);
      sub.unsubscribe();
      done();
    });

    service.emit(payload.userId, payload.jobId, payload.event);
  });
});

