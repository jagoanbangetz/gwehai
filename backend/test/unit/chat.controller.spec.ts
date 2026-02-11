import { ChatController } from '../../src/chat/chat.controller';
import { ChatService } from '../../src/chat/chat.service';

describe('ChatController', () => {
  const chatService = {
    processMessage: jest.fn(),
    getUserConversations: jest.fn(),
    getConversation: jest.fn(),
    getModels: jest.fn(),
  } as unknown as ChatService;

  let controller: ChatController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ChatController(chatService);
  });

  it('processes a chat message', async () => {
    chatService.processMessage = jest.fn().mockResolvedValue({ response: 'ok' });
    const result = await controller.chat(
      { user: { id: 'u1' } } as any,
      { message: 'hi' },
    );

    expect(result.response).toBe('ok');
    expect(chatService.processMessage).toHaveBeenCalledWith('u1', 'hi', undefined, undefined);
  });

  it('returns conversations', async () => {
    chatService.getUserConversations = jest.fn().mockResolvedValue([{ id: 'c1' }]);
    const result = await controller.getConversations({ user: { id: 'u1' } } as any);

    expect(result).toHaveLength(1);
  });

  it('returns a conversation by id', async () => {
    chatService.getConversation = jest.fn().mockResolvedValue({ id: 'c1' });
    const result = await controller.getConversation({ user: { id: 'u1' } } as any, 'c1');

    expect(result.id).toBe('c1');
  });

  it('returns models', async () => {
    chatService.getModels = jest.fn().mockResolvedValue([{ id: 'm1' }]);
    const result = await controller.getModels();

    expect(result).toHaveLength(1);
  });
});
