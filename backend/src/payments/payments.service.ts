import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreditOrder, CreditOrderStatus, PaymentProvider } from '../entities/credit-order.entity';
import { CreditPack } from '../entities/credit-pack.entity';
import { User } from '../entities/user.entity';
import { PointsService } from '../points/points.service';
import { PointLedgerReason } from '../entities/point-ledger.entity';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(CreditOrder)
    private orderRepo: Repository<CreditOrder>,
    @InjectRepository(CreditPack)
    private packRepo: Repository<CreditPack>,
    private pointsService: PointsService,
    private dataSource: DataSource,
  ) {}

  /**
   * Create a credit order (idempotent)
   */
  async createCreditOrder(
    userId: string,
    creditPackId: string,
    idempotencyKey?: string,
  ): Promise<CreditOrder> {
    const pack = await this.packRepo.findOne({
      where: { id: creditPackId, active: true },
    });

    if (!pack) {
      throw new NotFoundException('Credit pack not found');
    }

    // Generate idempotency key if not provided
    const key = idempotencyKey || crypto.randomUUID();

    // Check if order already exists
    const existing = await this.orderRepo.findOne({
      where: { idempotencyKey: key },
    });

    if (existing) {
      return existing; // Idempotent: return existing order
    }

    // Create new order
    const order = this.orderRepo.create({
      userId,
      creditPackId: pack.id,
      provider: PaymentProvider.STRIPE, // Default, can be changed
      idempotencyKey: key,
      amountCents: pack.priceCents,
      pointsGranted: pack.points,
      status: CreditOrderStatus.PENDING,
    });

    return await this.orderRepo.save(order);
  }

  /**
   * Confirm payment (idempotent, handles webhooks)
   */
  async confirmPayment(
    orderId: string,
    providerPaymentIntentId: string,
    providerChargeId?: string,
  ): Promise<CreditOrder> {
    return await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(CreditOrder, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      // Idempotent: if already processed, return
      if (order.status === CreditOrderStatus.COMPLETED) {
        return order;
      }

      // Check for duplicate payment intent
      const duplicate = await manager.findOne(CreditOrder, {
        where: {
          providerPaymentIntentId,
          status: CreditOrderStatus.COMPLETED,
        },
      });

      if (duplicate && duplicate.id !== orderId) {
        throw new BadRequestException('Payment intent already processed');
      }

      // Update order
      order.status = CreditOrderStatus.COMPLETED;
      order.providerPaymentIntentId = providerPaymentIntentId;
      if (providerChargeId) {
        order.providerChargeId = providerChargeId;
      }
      await manager.save(order);

      // Grant points
      await this.pointsService.grantPoints(
        order.userId,
        order.pointsGranted,
        PointLedgerReason.CREDIT_PURCHASE,
        'credit_orders',
        order.id,
        { packId: order.creditPackId },
      );

      return order;
    });
  }

  /**
   * Process refund (reverses points)
   */
  async processRefund(orderId: string, reason?: string): Promise<void> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== CreditOrderStatus.COMPLETED) {
      throw new BadRequestException('Can only refund completed orders');
    }

    // Create negative ledger entry
    await this.pointsService.grantPoints(
      order.userId,
      -order.pointsGranted,
      PointLedgerReason.REFUND,
      'credit_orders',
      order.id,
      { reason, originalOrderId: orderId },
    );

    order.status = CreditOrderStatus.REFUNDED;
    await this.orderRepo.save(order);
  }

  /**
   * Get available credit packs
   */
  async getCreditPacks(): Promise<CreditPack[]> {
    return await this.packRepo.find({
      where: { active: true },
      order: { priceCents: 'ASC' },
    });
  }

  /**
   * Get user's order history
   */
  async getUserOrders(userId: string): Promise<CreditOrder[]> {
    return await this.orderRepo.find({
      where: { userId },
      relations: ['creditPack'],
      order: { createdAt: 'DESC' },
    });
  }
}
