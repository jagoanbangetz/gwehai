import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../entities/user.entity';
import { Model } from '../entities/model.entity';
import { CreditOrder } from '../entities/credit-order.entity';
import { Report } from '../entities/report.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { Message } from '../entities/message.entity';
import { MessagePart } from '../entities/message-part.entity';
import { MessageFile } from '../entities/message-file.entity';
import { Conversation } from '../entities/conversation.entity';
import { ConversationMemory } from '../entities/conversation-memory.entity';
import { Hacktivity } from '../entities/hacktivity.entity';
import { Request } from 'express';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Model)
    private readonly modelRepo: Repository<Model>,
    @InjectRepository(CreditOrder)
    private readonly orderRepo: Repository<CreditOrder>,
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    @InjectRepository(UsageEvent)
    private readonly usageRepo: Repository<UsageEvent>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(MessagePart)
    private readonly messagePartRepo: Repository<MessagePart>,
    @InjectRepository(MessageFile)
    private readonly messageFileRepo: Repository<MessageFile>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMemory)
    private readonly memoryRepo: Repository<ConversationMemory>,
    @InjectRepository(Hacktivity)
    private readonly hacktivityRepo: Repository<Hacktivity>,
  ) {}

  @Get('dashboard')
  async getDashboardSummary() {
    const [userCount, adminCount, modelCount, orderCount, reportCount] = await Promise.all([
      this.userRepo.count(),
      this.userRepo.count({ where: { role: UserRole.ADMIN } }),
      this.modelRepo.count(),
      this.orderRepo.count(),
      this.reportRepo.count(),
    ]);

    return {
      users: userCount,
      admins: adminCount,
      aiAgents: modelCount,
      payments: orderCount,
      reports: reportCount,
    };
  }

  @Get('users')
  async listUsers() {
    return this.userRepo.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  @Get('ai-agents')
  async listAiAgents() {
    return this.modelRepo.find({
      order: { provider: 'ASC', displayName: 'ASC' },
    });
  }

  @Get('admin-users')
  async listAdminUsers() {
    return this.userRepo.find({
      where: { role: UserRole.ADMIN },
      order: { createdAt: 'DESC' },
    });
  }

  @Get('payments')
  async listPayments() {
    return this.orderRepo.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  @Get('reports')
  async listAllReports() {
    return this.reportRepo.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  @Get('user-activity')
  async listUserActivity() {
    return this.usageRepo.find({
      order: { createdAt: 'DESC' },
      take: 100,
      relations: ['user', 'model'],
    });
  }

  @Get('messages')
  async listMessages() {
    return this.messageRepo.find({
      order: { createdAt: 'DESC' as any },
      take: 100,
      relations: ['user', 'conversation'],
    });
  }

  @Get('ai-behaviour')
  async getAiBehaviour() {
    const qb = this.usageRepo
      .createQueryBuilder('usage')
      .select('usage.modelId', 'modelId')
      .addSelect('SUM(usage.inputTokens)', 'inputTokens')
      .addSelect('SUM(usage.outputTokens)', 'outputTokens')
      .addSelect('COUNT(*)', 'calls')
      .groupBy('usage.modelId')
      .orderBy('calls', 'DESC');

    const rows = await qb.getRawMany();
    return rows;
  }

  @Get('settings')
  async getSettings(@Req() req: Request) {
    // Placeholder for global app settings; right now just returns env-based flags
    return {
      environment: process.env.NODE_ENV || 'development',
      apiBaseUrl: process.env.API_BASE_URL || '/api',
    };
  }

  /**
   * Delete all chat (conversations, messages, parts, files, memory) and all reports (findings) and hacktivity.
   * Order respects foreign keys. Admin only.
   */
  @Post('wipe-chat-and-reports')
  async wipeChatAndReports() {
    const deletedParts = await this.messagePartRepo.delete({});
    const deletedFiles = await this.messageFileRepo.delete({});
    const deletedMessages = await this.messageRepo.delete({});
    const deletedMemory = await this.memoryRepo.delete({});
    const deletedHacktivity = await this.hacktivityRepo.delete({});
    const deletedReports = await this.reportRepo.delete({});
    const deletedConversations = await this.conversationRepo.delete({});

    return {
      message: 'All chat and report data deleted.',
      deleted: {
        messageParts: deletedParts.affected ?? 0,
        messageFiles: deletedFiles.affected ?? 0,
        messages: deletedMessages.affected ?? 0,
        conversationMemory: deletedMemory.affected ?? 0,
        hacktivity: deletedHacktivity.affected ?? 0,
        reports: deletedReports.affected ?? 0,
        conversations: deletedConversations.affected ?? 0,
      },
    };
  }
}

