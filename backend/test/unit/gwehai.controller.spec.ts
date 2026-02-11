import { GwehAIController } from '../../src/gwehai/gwehai.controller';

describe('GwehAIController SSE', () => {
  it('streams SSE by polling job.events: connected, then status, message_delta, message_done, done', () => {
    jest.useFakeTimers();

    const job = {
      id: 'job-1',
      messageId: 'msg-1',
      events: [
        { type: 'status', data: { message: 'Planning the plan...' } },
        { type: 'message_delta', data: { message_id: 'msg-1', delta: 'Hello ' } },
        { type: 'message_delta', data: { message_id: 'msg-1', delta: 'world.' } },
        { type: 'message_done', data: { message_id: 'msg-1' } },
        { type: 'done', data: { job_id: 'job-1', conversation_id: 'conv-1' } },
      ],
    };

    const gwehaiService = {
      getJob: jest.fn().mockImplementation(() => job),
    };

    const controller = new GwehAIController(gwehaiService as any);

    const writes: string[] = [];
    const res = {
      writableEnded: false,
      writeHead: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(() => {
        res.writableEnded = true;
      }),
      on: jest.fn(),
    } as any;

    (controller as any).streamJob(res, job);

    jest.advanceTimersByTime(200);

    const output = writes.join('');
    const events = output
      .split('\n\n')
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const lines = block.split('\n');
        const eventLine = lines.find((line) => line.startsWith('event: '));
        const dataLine = lines.find((line) => line.startsWith('data: '));
        const event = eventLine ? eventLine.replace('event: ', '').trim() : '';
        const data = dataLine ? dataLine.replace('data: ', '').trim() : '';
        return { event, data };
      })
      .filter((item) => item.event);

    const eventNames = events.map((item) => item.event);
    const eventIndex = (name: string) => eventNames.indexOf(name);

    expect(events[0].event).toBe('connected');
    expect(eventIndex('status')).toBeGreaterThanOrEqual(0);
    expect(eventIndex('message_delta')).toBeGreaterThan(eventIndex('status'));
    expect(eventIndex('message_done')).toBeGreaterThan(eventIndex('message_delta'));
    expect(eventIndex('done')).toBeGreaterThan(eventIndex('message_done'));

    const hasPlanning = events.some(
      (item) => item.event === 'status' && item.data.includes('Planning the plan'),
    );
    expect(hasPlanning).toBe(true);

    const messageDoneEvents = events.filter((item) => item.event === 'message_done');
    expect(messageDoneEvents.length).toBe(1);

    jest.useRealTimers();
  });
});
