import { AppController } from '../../src/app.controller';
import { AppService } from '../../src/app.service';

describe('AppController', () => {
  it('returns hello message', () => {
    const appService = { getHello: jest.fn().mockReturnValue('hello') } as unknown as AppService;
    const controller = new AppController(appService);

    expect(controller.getHello()).toBe('hello');
    expect(appService.getHello).toHaveBeenCalled();
  });

  it('returns health payload', () => {
    const controller = new AppController({} as AppService);
    const health = controller.getHealth();

    expect(health.status).toBe('ok');
    expect(health.service).toBe('GwehAI Backend');
    expect(typeof health.timestamp).toBe('string');
  });
});
