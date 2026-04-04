import { PrismaClient } from '@prisma/client';

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

export class UserPhoneService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Returns the clerkUserId that owns the given phone number, or null if not found.
   * Uses the unique index on phoneNumber for O(1) lookup.
   */
  async findUserByPhone(phoneNumber: string): Promise<string | null> {
    const normalized = normalizePhone(phoneNumber);
    const record = await this.prisma.userPhone.findUnique({
      where: { phoneNumber: normalized },
      select: { clerkUserId: true },
    });
    return record?.clerkUserId ?? null;
  }

  /**
   * Links a phone number to a Clerk user (upsert by clerkUserId).
   * If the new phoneNumber is already owned by a DIFFERENT user, throws ConflictError.
   * The user can change their own number freely (upsert replaces the old one).
   */
  async linkPhone(clerkUserId: string, phoneNumber: string): Promise<void> {
    const normalized = normalizePhone(phoneNumber);

    // Check if this phone is owned by a different user
    const existing = await this.prisma.userPhone.findFirst({
      where: {
        phoneNumber: normalized,
        NOT: { clerkUserId },
      },
      select: { clerkUserId: true },
    });

    if (existing) {
      throw new ConflictError('Número já cadastrado por outro usuário');
    }

    // Upsert by clerkUserId — allows the user to change their number
    await this.prisma.userPhone.upsert({
      where: { clerkUserId },
      update: { phoneNumber: normalized },
      create: { clerkUserId, phoneNumber: normalized },
    });
  }

  /**
   * Unlinks the phone number associated with the given clerkUserId.
   * Idempotent: returns without error if no record exists.
   * Also deletes the WhatsappConversationSession for the phone number.
   */
  async unlinkPhone(clerkUserId: string): Promise<void> {
    const record = await this.prisma.userPhone.findUnique({
      where: { clerkUserId },
      select: { phoneNumber: true },
    });

    if (!record) {
      // Idempotent — nothing to do
      return;
    }

    // Delete the UserPhone row
    await this.prisma.userPhone.delete({
      where: { clerkUserId },
    });

    // Delete the associated WhatsApp conversation session for this phone number
    await this.prisma.whatsappConversationSession.deleteMany({
      where: { phoneNumber: record.phoneNumber },
    });
  }

  /**
   * Returns the phone number linked to the given clerkUserId, or null if not linked.
   */
  async getPhoneForUser(clerkUserId: string): Promise<string | null> {
    const record = await this.prisma.userPhone.findUnique({
      where: { clerkUserId },
      select: { phoneNumber: true },
    });
    return record?.phoneNumber ?? null;
  }
}
