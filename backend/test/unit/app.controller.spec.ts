import { AppController } from '../../src/app.controller';
import { AppService } from '../../src/app.service';

describe('AppController', () => {
  it('returns hello message', () => {
    const appService = { getHello: jest.fn().mockReturnValue('hello') } as unknown as AppService;
    const controller = new AppController(appService);

    expect(controller.getHello()).toBe('hello');
    expect(appService.getHello).toHaveBeenCalled();
  });
});
