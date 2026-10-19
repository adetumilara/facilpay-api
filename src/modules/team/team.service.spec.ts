import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TeamService } from './team.service';
import { MerchantMember, TeamRole } from './entities/merchant-member.entity';
import { MerchantInvitation } from './entities/merchant-invitation.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AppLogger } from '../logger/logger.service';
import { NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';

const mockLogger = { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() }) };
const mockAuditLogs = { record: jest.fn().mockResolvedValue({}) };

function makeMembersRepo() {
  return { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), find: jest.fn(), remove: jest.fn() };
}
function makeInvitationsRepo() {
  return { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), remove: jest.fn() };
}

describe('TeamService', () => {
  let service: TeamService;
  let membersRepo: ReturnType<typeof makeMembersRepo>;
  let invitationsRepo: ReturnType<typeof makeInvitationsRepo>;

  beforeEach(async () => {
    membersRepo = makeMembersRepo();
    invitationsRepo = makeInvitationsRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamService,
        { provide: getRepositoryToken(MerchantMember), useValue: membersRepo },
        { provide: getRepositoryToken(MerchantInvitation), useValue: invitationsRepo },
        { provide: AuditLogsService, useValue: mockAuditLogs },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();
    service = module.get(TeamService);
  });

  describe('inviteMember', () => {
    it('creates an invitation and returns a raw token', async () => {
      (membersRepo.findOne as jest.Mock).mockResolvedValue(null);
      (invitationsRepo.findOne as jest.Mock).mockResolvedValue(null);
      const saved = { id: 'inv-1', email: 'dev@example.com', role: TeamRole.DEVELOPER, expiresAt: new Date() };
      (invitationsRepo.create as jest.Mock).mockReturnValue(saved);
      (invitationsRepo.save as jest.Mock).mockResolvedValue(saved);

      const result = await service.inviteMember(
        'merchant-1',
        { email: 'dev@example.com', role: TeamRole.DEVELOPER },
        'merchant-1',
      );

      expect(result.token).toBeTruthy();
      expect(result.invitation.id).toBe('inv-1');
    });

    it('throws ConflictException when an active invitation already exists', async () => {
      (membersRepo.findOne as jest.Mock).mockResolvedValue(null);
      (invitationsRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'inv-old',
        expiresAt: new Date(Date.now() + 100_000),
      });

      await expect(
        service.inviteMember('m1', { email: 'x@x.com', role: TeamRole.VIEWER }, 'm1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('acceptInvitation', () => {
    it('creates a member and marks invitation accepted', async () => {
      const raw = 'some-raw-token';
      const hash = createHash('sha256').update(raw).digest('hex');
      const inv = {
        id: 'inv-1',
        merchantId: 'm1',
        email: 'dev@example.com',
        role: TeamRole.DEVELOPER,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 100_000),
        acceptedAt: null,
      };
      (invitationsRepo.findOne as jest.Mock).mockResolvedValue(inv);
      (membersRepo.findOne as jest.Mock).mockResolvedValue(null);
      const member = { id: 'mem-1', merchantId: 'm1', userId: 'u1', role: TeamRole.DEVELOPER };
      (membersRepo.create as jest.Mock).mockReturnValue(member);
      (membersRepo.save as jest.Mock).mockResolvedValue(member);
      (invitationsRepo.save as jest.Mock).mockResolvedValue(inv);

      const result = await service.acceptInvitation(raw, 'u1', 'dev@example.com');
      expect(result.id).toBe('mem-1');
      expect(inv.acceptedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException for unknown token', async () => {
      (invitationsRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.acceptInvitation('bad', 'u1', 'x@x.com')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when email does not match', async () => {
      (invitationsRepo.findOne as jest.Mock).mockResolvedValue({
        email: 'other@example.com',
        expiresAt: new Date(Date.now() + 100_000),
        acceptedAt: null,
      });
      await expect(service.acceptInvitation('tok', 'u1', 'wrong@example.com')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException for expired invitation', async () => {
      (invitationsRepo.findOne as jest.Mock).mockResolvedValue({
        email: 'x@x.com',
        expiresAt: new Date(Date.now() - 1000),
        acceptedAt: null,
      });
      await expect(service.acceptInvitation('tok', 'u1', 'x@x.com')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('removeMember', () => {
    it('throws BadRequestException when removing the owner', async () => {
      const member = { id: 'mem-1', merchantId: 'm1', userId: 'm1', role: TeamRole.ADMIN };
      (membersRepo.findOne as jest.Mock).mockResolvedValue(member);
      await expect(service.removeMember('m1', 'mem-1', 'm1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('removes a non-owner member', async () => {
      const member = { id: 'mem-1', merchantId: 'm1', userId: 'u2', role: TeamRole.VIEWER };
      (membersRepo.findOne as jest.Mock).mockResolvedValue(member);
      (membersRepo.remove as jest.Mock).mockResolvedValue(undefined);

      await service.removeMember('m1', 'mem-1', 'm1');
      expect(membersRepo.remove).toHaveBeenCalledWith(member);
    });
  });
});
