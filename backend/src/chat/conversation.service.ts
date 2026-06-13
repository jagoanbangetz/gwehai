/**
 * Conversation Service
 * 
 * Handles conversation and message persistence — CRUD, message saving,
 * run status management. Extracted from ChatService for single-responsibility.
 */

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, EntityManager } from 'typeorm';
import { Conversation } from '../entities/conversation.entity';
import { ConversationMemory } from '../entities/conversation-memory.entity';
import { Message, MessageRole } from '../entities/message.entity';
import { MessagePart, MessagePartType } from '../entities/message-part.entity';
import { Model } from '../entities/model.entity';
import { UsageEvent } from '../entities/usage-event.entity';

/** Conversation id is a UUID; reject timestamps or other non-UUID values. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireUuid(id: unknown, paramName: string): void {
  const s = typeof id === 'string' ? id.trim() : String(id ?? '');
  if (!s || !UUID_REGEX.test(s)) {
    throw new BadRequestException(`${paramName} must be a valid UUID`);
  }
}

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMemory)
    private memoryRepo: Repository<ConversationMemory>,
    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
    @InjectRepository(MessagePart)
    private messagePartRepo: Repository<MessagePart>,
    @InjectRepository(Model)
    private modelRepo: Repository<Model>,
    @InjectRepository(UsageEvent)
    private usageEventRepo: Repository<UsageEvent>,
  ) {}

  /**
   * Resolve a model for usage recording when conversation has no DB model.
   */
  async getDefaultModelForUsage(manager: EntityManager): Promise<Model | null> {
    const repo = manager.getRepository(Model);
    let m = await repo.findOne({ where: { isDefault: true, isActive: true } });
    if (!m) m = await repo.findOne({ where: { name: 'deepseek/deepseek-chat', isActive: true } });
    if (!m) m = await repo.findOne({ where: { isActive: true } });
    return m;
  }

  /**
   * Get or create conversation.
   * When skipDefaultModel is true, new conversations are created with modelId = null.
   */
  async getOrCreateConversation(
    userId: string,
    conversationId?: string,
    modelId?: string,
    skipDefaultModel?: boolean,
  ): Promise<Conversation> {
    if (conversationId) {
      const conversation = await this.conversationRepo.findOne({
        where: { id: conversationId, userId },
        relations: ['messages', 'messages.parts'],
      });
      if (conversation) {
        return conversation;
      }
      throw new NotFoundException('Conversation not found');
    }

    // When using model picker (Auto), don't attach a DB model
    if (!skipDefaultModel && !modelId) {
      let defaultModel = await this.modelRepo.findOne({
        where: { isDefault: true, isActive: true },
      });
      if (!defaultModel) {
        defaultModel = await this.modelRepo.findOne({
          where: { name: 'deepseek/deepseek-chat', isActive: true },
        });
      }
      if (defaultModel) {
        modelId = defaultModel.id;
      }
    }

    const conversation = this.conversationRepo.create({
      userId,
      modelId: skipDefaultModel ? undefined : modelId,
      title: 'New Conversation',
    });
    return await this.conversationRepo.save(conversation);
  }

  /**
   * Create a conversation with an initial seed message (e.g. pentest job context).
   */
  async createConversationWithSeed(
    userId: string,
    title: string,
    seedMessage: string,
    modelId?: string,
    pentestJobId?: string,
  ): Promise<Conversation> {
    const conversation = await this.getOrCreateConversation(userId, undefined, modelId);
    conversation.title = title;
    if (pentestJobId) conversation.pentestJobId = pentestJobId;
    await this.conversationRepo.save(conversation);

    const userMessage = this.messageRepo.create({
      conversationId: conversation.id,
      role: MessageRole.USER,
      content: seedMessage,
    });
    await this.messageRepo.save(userMessage);

    const part = this.messagePartRepo.create({
      messageId: userMessage.id,
      type: MessagePartType.TEXT,
      content: seedMessage,
      order: 0,
    });
    await this.messagePartRepo.save(part);

    return conversation;
  }

  /**
   * Save user message + empty assistant message placeholder in a transaction.
   * Returns the conversation, resolved model, and assistant message.
   */
  async saveUserAndAssistantPlaceholder(
    userId: string,
    message: string,
    conversationId: string | undefined,
    useModelPicker: boolean,
  ): Promise<{ conversationId: string; messageId: string; model: Model | null }> {
    const conversation = await this.getOrCreateConversation(userId, conversationId, undefined, useModelPicker);
    let model = conversation.modelId
      ? await this.modelRepo.findOne({ where: { id: conversation.modelId } })
      : null;
    if (!model || !model.isActive) {
      if (useModelPicker) {
        // Will be resolved by caller
        model = null;
      } else {
        throw new NotFoundException(
          'Model not found or inactive. Use Auto (DeepSeek) in the model picker and ensure DEEPSEEK_API_KEY is set.',
        );
      }
    }

    const userMessage = this.messageRepo.create({
      conversationId: conversation.id,
      role: MessageRole.USER,
      content: message,
    });
    await this.messageRepo.save(userMessage);

    const userMessagePart = this.messagePartRepo.create({
      messageId: userMessage.id,
      type: 'text' as any,
      content: message,
      order: 0,
    });
    await this.messagePartRepo.save(userMessagePart);

    const assistantMessage = this.messageRepo.create({
      conversationId: conversation.id,
      role: MessageRole.ASSISTANT,
      content: '',
    });
    await this.messageRepo.save(assistantMessage);

    const assistantMessagePart = this.messagePartRepo.create({
      messageId: assistantMessage.id,
      type: 'text' as any,
      content: '',
      order: 0,
    });
    await this.messagePartRepo.save(assistantMessagePart);

    if (!conversation.title || conversation.title === 'New Conversation') {
      conversation.title = message.substring(0, 50);
      await this.conversationRepo.save(conversation);
    }

    return {
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      model,
    };
  }

  /**
   * Update conversation run status.
   */
  async setConversationRunStatus(
    conversationId: string | undefined,
    status: 'running' | 'finished' | 'error' | 'stopped',
  ): Promise<void> {
    const cid = String(conversationId || '').trim();
    if (!cid) return;
    await this.conversationRepo.update({ id: cid }, { runStatus: status } as any);
  }

  /**
   * Update message and message part content.
   */
  async updateMessageContent(messageId: string, content: string): Promise<void> {
    await this.messageRepo.update(messageId, { content });
    await this.messagePartRepo.update({ messageId }, { content });
  }

  /**
   * Save message metadata — details, thinking, followUps — as MessageParts.
   * These survive page refresh and chat switching, so resume displays agent details.
   */
  async saveMessageMeta(
    messageId: string,
    meta: { details?: string; thinking?: string; followUps?: string[] },
  ): Promise<void> {
    let order = 1; // part 0 is the main text content

    if (meta.thinking != null && meta.thinking.trim()) {
      await this.messagePartRepo.save(
        this.messagePartRepo.create({
          messageId,
          type: 'thinking' as any,
          content: meta.thinking,
          order: order++,
        }),
      );
    }

    if (meta.details != null && meta.details.trim()) {
      await this.messagePartRepo.save(
        this.messagePartRepo.create({
          messageId,
          type: 'details' as any,
          content: meta.details,
          order: order++,
        }),
      );
    }

    if (meta.followUps != null && meta.followUps.length > 0) {
      await this.messagePartRepo.save(
        this.messagePartRepo.create({
          messageId,
          type: 'text' as any,
          content: JSON.stringify(meta.followUps),
          order: order++,
          metadata: { followUps: true },
        }),
      );
    }
  }

  /**
   * Load prior messages for a conversation (excluding the last N).
   */
  async getPriorMessages(conversationId: string, excludeLast: number = 2): Promise<Message[]> {
    const allMessages = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
    return allMessages.slice(0, -excludeLast);
  }

  /**
   * Save a user message to a conversation (for sub-agent forwarding).
   */
  async saveUserMessage(conversationId: string, content: string): Promise<void> {
    const userMsg = this.messageRepo.create({
      conversationId,
      role: MessageRole.USER,
      content,
    });
    await this.messageRepo.save(userMsg);
    await this.messagePartRepo.save(
      this.messagePartRepo.create({
        messageId: userMsg.id,
        type: 'text' as any,
        content,
        order: 0,
      }),
    );
    // Update conversation title if needed
    const conv = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (conv) {
      conv.title = conv.title && conv.title !== 'New Conversation' ? conv.title : content.slice(0, 50);
      await this.conversationRepo.save(conv);
    }
  }

  /**
   * List sessions (conversations) for the user.
   */
  async listSessions(
    userId: string,
    filters?: { parent_id?: string; role?: string; last?: number },
  ): Promise<Array<{ id: string; title: string | null; agentRole: string | null; parentConversationId: string | null; updatedAt: Date }>> {
    const qb = this.conversationRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.title', 'c.agentRole', 'c.parentConversationId', 'c.updatedAt'])
      .where('c.userId = :userId', { userId })
      .orderBy('c.updatedAt', 'DESC');
    if (filters?.parent_id) {
      qb.andWhere('c.parentConversationId = :parentId', { parentId: filters.parent_id });
    }
    if (filters?.role) {
      qb.andWhere('c.agentRole = :role', { role: filters.role });
    }
    const take = Math.min(Math.max(1, filters?.last ?? 20), 100);
    const list = await qb.take(take).getMany();
    return list.map((c) => ({
      id: c.id,
      title: c.title ?? null,
      agentRole: c.agentRole ?? null,
      parentConversationId: c.parentConversationId ?? null,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * Get message history for a session.
   */
  async getSessionHistory(
    userId: string,
    conversationId: string,
    last: number = 50,
  ): Promise<Array<{ role: string; content: string; createdAt: Date }>> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, userId },
      relations: ['messages', 'messages.parts'],
    });
    if (!conversation) {
      throw new NotFoundException('Session not found');
    }
    return (conversation.messages ?? [])
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-Math.min(last, 100))
      .map((m) => ({
        role: m.role,
        content: m.content ?? '',
        createdAt: m.createdAt,
      }));
  }

  /**
   * Spawn a new sub-agent session.
   */
  async spawnSession(
    userId: string,
    parentConversationId: string,
    role?: string,
    title?: string,
    allowedRoles?: readonly string[],
  ): Promise<{ session_id: string; title: string; role: string | null }> {
    const parent = await this.conversationRepo.findOne({
      where: { id: parentConversationId, userId },
    });
    if (!parent) {
      throw new NotFoundException('Parent session not found');
    }
    const allowedRole = role && allowedRoles?.includes(role as any) ? role : null;
    const defaultModel = await this.modelRepo.findOne({
      where: { isDefault: true, isActive: true },
    });
    const modelId = defaultModel?.id ?? parent.modelId ?? null;
    const conversation = this.conversationRepo.create({
      userId,
      modelId,
      parentConversationId,
      agentRole: allowedRole,
      title: title?.trim()?.slice(0, 200) ?? (allowedRole ? `Sub-agent: ${allowedRole}` : 'New sub-agent'),
    });
    const saved = await this.conversationRepo.save(conversation);
    return {
      session_id: saved.id,
      title: saved.title ?? 'New sub-agent',
      role: saved.agentRole ?? null,
    };
  }

  /**
   * Get status for a session.
   */
  async getSessionStatus(userId: string, conversationId: string): Promise<{
    session_id: string;
    title: string | null;
    agentRole: string | null;
    messageCount: number;
    updatedAt: Date;
    modelId: string | null;
  }> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, userId },
      relations: ['messages'],
    });
    if (!conversation) {
      throw new NotFoundException('Session not found');
    }
    return {
      session_id: conversation.id,
      title: conversation.title ?? null,
      agentRole: conversation.agentRole ?? null,
      messageCount: conversation.messages?.length ?? 0,
      updatedAt: conversation.updatedAt,
      modelId: conversation.modelId ?? null,
    };
  }

  /**
   * Get user conversations (root only, exclude sub-agent sessions).
   */
  async getUserConversations(userId: string): Promise<Conversation[]> {
    return await this.conversationRepo.find({
      where: { userId, parentConversationId: IsNull() },
      order: { updatedAt: 'DESC' },
      relations: ['messages'],
    });
  }

  /**
   * Get conversation detail with memory.
   */
  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation & { memory?: Array<{ path: string; content: string }> }> {
    requireUuid(conversationId, 'conversationId');
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, userId },
      relations: ['messages', 'messages.parts'],
      order: { messages: { createdAt: 'ASC' } },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const memoryRow = await this.memoryRepo.findOne({
      where: { conversationId },
    });
    const data = (memoryRow?.data ?? {}) as Record<string, string>;
    const memory = Object.entries(data).map(([path, content]) => ({ path, content }));

    return { ...conversation, memory };
  }

  /**
   * Delete a conversation (cascade).
   */
  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    requireUuid(conversationId, 'conversationId');
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    await this.conversationRepo.remove(conversation);
  }

  /**
   * Get available chat-capable models.
   */
  async getModels(): Promise<Model[]> {
    const { isChatCapableModelKey } = await import('../config/model-options.config');
    const all = await this.modelRepo.find({
      where: { isActive: true },
      order: { isDefault: 'DESC', displayName: 'ASC' },
    });
    return all.filter((m) => {
      const key = (m.metadata as Record<string, string> | null)?.key;
      return key && isChatCapableModelKey(key);
    });
  }

  /** Expose repos for legacy methods in ChatService that still need direct access */
  get repos() {
    return {
      conversation: this.conversationRepo,
      memory: this.memoryRepo,
      message: this.messageRepo,
      messagePart: this.messagePartRepo,
      model: this.modelRepo,
      usageEvent: this.usageEventRepo,
    };
  }
}
