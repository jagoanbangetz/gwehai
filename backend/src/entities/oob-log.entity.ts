import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type OobPayloadType = 'dns' | 'http';
export type OobCallbackStatus = 'pending' | 'received' | 'timeout' | 'cancelled';

@Entity('oob_logs')
@Index(['testId'], { unique: true })
@Index(['status'])
@Index(['createdAt'])
export class OobLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Unique test ID used as subdomain prefix: TESTID.callback.gweh.sh */
  @Column({ type: 'varchar', length: 64 })
  @Index()
  testId: string;

  /** dns or http */
  @Column({ type: 'varchar', length: 16, default: 'dns' })
  payloadType: OobPayloadType;

  /** Target URL the payload was injected into */
  @Column({ type: 'text', nullable: true })
  targetUrl: string | null;

  /** Vulnerability type being tested (sqli, xxe, ssrf, cmdi) */
  @Column({ type: 'varchar', length: 32, nullable: true })
  vulnType: string | null;

  /** Full callback subdomain: TESTID.callback.gweh.sh */
  @Column({ type: 'varchar', length: 255 })
  callbackDomain: string;

  /** Payload template used */
  @Column({ type: 'text', nullable: true })
  payloadTemplate: string | null;

  /** Status: pending → received/timeout/cancelled */
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: OobCallbackStatus;

  /** Callback data received (DNS query details, HTTP request details) */
  @Column({ type: 'jsonb', nullable: true })
  callbacks: Array<{
    type: 'dns' | 'http';
    timestamp: string;
    sourceIp?: string;
    queryType?: string;
    queriedName?: string;
    method?: string;
    path?: string;
    headers?: Record<string, string>;
    body?: string;
    userAgent?: string;
  }> | null;

  /** Auto-calculated confidence: DNS=85, HTTP=90, multi=95+ */
  @Column({ type: 'int', nullable: true })
  confidence: number | null;

  /** When the test was created */
  @CreateDateColumn()
  createdAt: Date;

  /** When the test was last updated */
  @UpdateDateColumn()
  updatedAt: Date;

  /** When callback was first received */
  @Column({ type: 'timestamp', nullable: true })
  callbackReceivedAt: Date | null;

  /** Timeout in ms (default 30000) */
  @Column({ type: 'int', default: 30000 })
  timeoutMs: number;
}
