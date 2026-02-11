import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../entities/user.entity';
import { PointsService } from '../points/points.service';
import { PointLedgerReason } from '../entities/point-ledger.entity';
import * as bcrypt from 'bcrypt';

/** Default points granted on registration (signup). */
const SIGNUP_BONUS_POINTS = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
    private pointsService: PointsService,
  ) {}

  async validateGoogleUser(profile: any): Promise<User> {
    const { id, emails, name, photos } = profile;

    let user = await this.userRepo.findOne({
      where: { googleId: id },
    });

    if (user) {
      // Update user info
      user.email = emails[0]?.value || user.email;
      user.name = name?.displayName || name?.givenName || user.name;
      user.avatarUrl = photos[0]?.value || user.avatarUrl;
      await this.userRepo.save(user);
      return user;
    }

    // Check if user exists by email
    if (emails?.[0]?.value) {
      user = await this.userRepo.findOne({
        where: { email: emails[0].value },
      });

      if (user) {
        // Link Google account
        user.googleId = id;
        user.avatarUrl = photos[0]?.value || user.avatarUrl;
        await this.userRepo.save(user);
        return user;
      }
    }

    // Create new user
    user = this.userRepo.create({
      googleId: id,
      email: emails[0]?.value,
      name: name?.displayName || name?.givenName || 'User',
      avatarUrl: photos[0]?.value,
    });

    await this.userRepo.save(user);
    
    // Grant default signup bonus points only
    try {
      await this.pointsService.grantPoints(
        user.id,
        SIGNUP_BONUS_POINTS,
        PointLedgerReason.PROMOTION,
        'users',
        user.id,
        { source: 'signup_bonus', method: 'google_oauth' },
      );
    } catch (error) {
      // Log error but don't fail registration if points grant fails
      console.error('Failed to grant signup bonus points:', error);
    }
    
    return user;
  }

  async login(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    return await this.userRepo.findOne({
      where: { id: userId, isActive: true },
    });
  }

  async getUserById(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateUserSettings(
    userId: string,
    settings: {
      email?: string;
      password?: string;
      defaultLanguage?: string;
      defaultModelId?: string;
    },
  ): Promise<User> {
    const user = await this.getUserById(userId);

    if (settings.email && settings.email !== user.email) {
      // Check if email is already taken
      const existing = await this.userRepo.findOne({
        where: { email: settings.email },
      });
      if (existing && existing.id !== userId) {
        throw new BadRequestException('Email already in use');
      }
      user.email = settings.email;
    }

    if (settings.password) {
      if (settings.password.length < 8) {
        throw new BadRequestException('Password must be at least 8 characters');
      }
      user.password_hash = await bcrypt.hash(settings.password, 10);
    }

    if (settings.defaultLanguage) {
      user.defaultLanguage = settings.defaultLanguage;
    }

    if (settings.defaultModelId) {
      user.defaultModelId = settings.defaultModelId;
    }

    return await this.userRepo.save(user);
  }

  async validateUserByEmail(email: string, password: string): Promise<User | null> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user || !user.password_hash) {
      return null;
    }
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return null;
    }
    return user;
  }

  async createUser(email: string, name: string, password: string): Promise<User> {
    // Validate email format
    if (!email || !email.includes('@')) {
      throw new BadRequestException('Invalid email format');
    }

    // Check if user exists
    const existing = await this.userRepo.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      throw new BadRequestException('Email already exists. Please use a different email or sign in.');
    }

    // Validate password
    if (!password || password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    // Create new user with hashed password
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.userRepo.create({
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password_hash: hashedPassword,
      defaultLanguage: 'en',
    });
    await this.userRepo.save(user);
    
    // Grant default signup bonus points only
    try {
      await this.pointsService.grantPoints(
        user.id,
        SIGNUP_BONUS_POINTS,
        PointLedgerReason.PROMOTION,
        'users',
        user.id,
        { source: 'signup_bonus', method: 'email_password' },
      );
    } catch (error) {
      // Log error but don't fail registration if points grant fails
      console.error('Failed to grant signup bonus points:', error);
    }
    
    return user;
  }
}
