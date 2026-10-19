import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { DisputeEvidence } from './dispute-evidence.entity';
import { Dispute, DisputeStatus } from './dispute.entity';
import { AppLogger } from '../logger/logger.service';
import { Logger } from 'pino';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX_FILES_PER_DISPUTE = 10;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const UPLOADS_BASE = path.join(process.cwd(), 'uploads', 'disputes');

function detectMimeByMagicBytes(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  // PDF: %PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return 'application/pdf';
  }
  // PNG: \x89PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  // JPEG: \xFF\xD8\xFF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

@Injectable()
export class DisputeEvidenceService {
  private readonly logger: Logger;

  constructor(
    @InjectRepository(DisputeEvidence)
    private readonly evidenceRepository: Repository<DisputeEvidence>,
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
    appLogger: AppLogger,
  ) {
    this.logger = appLogger.child({ module: DisputeEvidenceService.name });
  }

  async upload(
    disputeId: string,
    file: Express.Multer.File,
    uploadedBy?: string,
  ): Promise<DisputeEvidence> {
    const dispute = await this.disputeRepository.findOneBy({ id: disputeId });
    if (!dispute) {
      throw new NotFoundException(`Dispute with ID ${disputeId} not found`);
    }

    const terminalStatuses: DisputeStatus[] = [DisputeStatus.RESOLVED, DisputeStatus.CLOSED];
    if (terminalStatuses.includes(dispute.status)) {
      throw new ConflictException(
        `Cannot add evidence to a dispute with status '${dispute.status}'`,
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File size ${file.size} bytes exceeds the 10 MB limit`,
      );
    }

    const detectedMime = detectMimeByMagicBytes(file.buffer);
    if (!detectedMime || !ALLOWED_MIME_TYPES.includes(detectedMime)) {
      throw new BadRequestException(
        'Unsupported file type. Only PDF, PNG and JPEG files are allowed',
      );
    }

    const existingCount = await this.evidenceRepository.count({
      where: { disputeId },
    });
    if (existingCount >= MAX_FILES_PER_DISPUTE) {
      throw new ConflictException(
        `Dispute has reached the maximum of ${MAX_FILES_PER_DISPUTE} evidence files`,
      );
    }

    const disputeDir = path.join(UPLOADS_BASE, disputeId);
    fs.mkdirSync(disputeDir, { recursive: true });
    const safeFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = path.join(disputeId, `${Date.now()}-${safeFileName}`);
    fs.writeFileSync(path.join(UPLOADS_BASE, storageKey), file.buffer);

    const evidence = this.evidenceRepository.create({
      disputeId,
      uploadedBy: uploadedBy ?? null,
      fileName: file.originalname,
      mimeType: detectedMime,
      sizeBytes: file.size,
      storageKey,
    });
    const saved = await this.evidenceRepository.save(evidence);
    this.logger.info(`Evidence uploaded: ${saved.id} for dispute ${disputeId}`);
    return saved;
  }

  async list(disputeId: string): Promise<DisputeEvidence[]> {
    const dispute = await this.disputeRepository.findOneBy({ id: disputeId });
    if (!dispute) {
      throw new NotFoundException(`Dispute with ID ${disputeId} not found`);
    }
    return this.evidenceRepository.find({
      where: { disputeId },
      order: { createdAt: 'ASC' },
    });
  }

  async download(
    disputeId: string,
    evidenceId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const evidence = await this.evidenceRepository.findOneBy({
      id: evidenceId,
      disputeId,
    });
    if (!evidence) {
      throw new NotFoundException(`Evidence with ID ${evidenceId} not found for dispute ${disputeId}`);
    }

    const fullPath = path.join(UPLOADS_BASE, evidence.storageKey);
    if (!fs.existsSync(fullPath)) {
      this.logger.error(
        `Evidence file missing from disk: ${fullPath} (evidenceId: ${evidenceId})`,
      );
      throw new NotFoundException('Evidence file is no longer available');
    }

    return {
      buffer: fs.readFileSync(fullPath),
      mimeType: evidence.mimeType,
      fileName: evidence.fileName,
    };
  }
}
