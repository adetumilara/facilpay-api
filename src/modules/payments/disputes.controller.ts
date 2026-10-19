import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
  Res,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery, ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiBadRequestResponse, ApiNotFoundResponse, ApiConflictResponse, ApiForbiddenResponse, ApiInternalServerErrorResponse, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import { DisputeEvidenceService } from './dispute-evidence.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { UpdateDisputeDto } from './dto/update-dispute.dto';
import { Dispute, DisputeStatus } from './dispute.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/constants/roles';

@ApiTags('disputes')
@Controller('v1')
export class DisputesController {
  constructor(
    private readonly disputesService: DisputesService,
    private readonly disputeEvidenceService: DisputeEvidenceService,
  ) {}

  @Post('payments/:id/dispute')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Open a dispute for a payment',
    description: 'Opens a new dispute for a completed or partially refunded payment. Only one active dispute can exist per payment.',
  })
  @ApiParam({
    name: 'id',
    description: 'Payment UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiBody({ type: CreateDisputeDto })
  @ApiCreatedResponse({
    description: 'Dispute opened successfully.',
    type: Dispute,
    schema: {
      example: {
        id: '789e4567-e89b-12d3-a456-426614174000',
        paymentId: '123e4567-e89b-12d3-a456-426614174000',
        status: 'open',
        reason: 'fraud',
        description: 'Unauthorized transaction on my card',
        disputedAmount: '100.00',
        openedBy: 'customer@example.com',
        createdAt: '2026-01-26T12:00:00.000Z',
        updatedAt: '2026-01-26T12:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation failed.',
    schema: {
      example: {
        statusCode: 400,
        message: ['Reason is required', 'Description must be at least 10 characters'],
        error: 'Bad Request',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Payment not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Payment with ID 123e4567-e89b-12d3-a456-426614174000 not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description: 'Payment cannot be disputed (invalid status or active dispute exists).',
    schema: {
      example: {
        statusCode: 409,
        message: 'Cannot open dispute for payment with status PENDING. Only completed or partially refunded payments can be disputed.',
        error: 'Conflict',
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error.',
    schema: {
      example: { statusCode: 500, message: 'Internal server error' },
    },
  })
  async openDispute(@Param('id') paymentId: string, @Body() createDisputeDto: CreateDisputeDto) {
    return this.disputesService.create(paymentId, createDisputeDto);
  }

  @Get('disputes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'List all disputes',
    description: 'Returns disputes with optional filtering by status and payment ID.',
  })
  @ApiQuery({ name: 'status', required: false, enum: DisputeStatus, description: 'Filter by dispute status' })
  @ApiQuery({ name: 'paymentId', required: false, description: 'Filter by payment UUID' })
  @ApiOkResponse({
    description: 'List of disputes.',
    type: [Dispute],
    schema: {
      example: [
        {
          id: '789e4567-e89b-12d3-a456-426614174000',
          paymentId: '123e4567-e89b-12d3-a456-426614174000',
          status: 'open',
          reason: 'fraud',
          description: 'Unauthorized transaction on my card',
          disputedAmount: '100.00',
          openedBy: 'customer@example.com',
          createdAt: '2026-01-26T12:00:00.000Z',
          updatedAt: '2026-01-26T12:00:00.000Z',
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid filter parameters.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid dispute status',
        error: 'Bad Request',
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error.',
    schema: {
      example: { statusCode: 500, message: 'Internal server error' },
    },
  })
  async findAll(@Query() query: { status?: DisputeStatus; paymentId?: string }) {
    return this.disputesService.findAll(query.status, query.paymentId);
  }

  @Get('disputes/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get a dispute by ID',
    description: 'Returns a single dispute by its UUID.',
  })
  @ApiParam({
    name: 'id',
    description: 'Dispute UUID',
    example: '789e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: 'Dispute found.',
    type: Dispute,
  })
  @ApiNotFoundResponse({
    description: 'Dispute not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Dispute with ID 789e4567-e89b-12d3-a456-426614174000 not found',
        error: 'Not Found',
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error.',
    schema: {
      example: { statusCode: 500, message: 'Internal server error' },
    },
  })
  async findOne(@Param('id') id: string) {
    return this.disputesService.findOne(id);
  }

  @Patch('disputes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('bearer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update dispute status (Admin only)',
    description: 'Updates the status of a dispute. Only administrators can update dispute status. Valid transitions: open -> under_review -> resolved -> closed.',
  })
  @ApiParam({
    name: 'id',
    description: 'Dispute UUID',
    example: '789e4567-e89b-12d3-a456-426614174000',
  })
  @ApiBody({ type: UpdateDisputeDto })
  @ApiOkResponse({
    description: 'Dispute updated successfully.',
    type: Dispute,
    schema: {
      example: {
        id: '789e4567-e89b-12d3-a456-426614174000',
        paymentId: '123e4567-e89b-12d3-a456-426614174000',
        status: 'under_review',
        reason: 'fraud',
        description: 'Unauthorized transaction on my card',
        disputedAmount: '100.00',
        openedBy: 'customer@example.com',
        resolutionNotes: 'Reviewing transaction evidence',
        resolvedBy: null,
        createdAt: '2026-01-26T12:00:00.000Z',
        updatedAt: '2026-01-26T13:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation failed or invalid status transition.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid status transition from open to resolved',
        error: 'Bad Request',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Dispute not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Dispute with ID 789e4567-e89b-12d3-a456-426614174000 not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description: 'Invalid status transition.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Invalid status transition from open to resolved',
        error: 'Conflict',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden resource',
        error: 'Forbidden',
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error.',
    schema: {
      example: { statusCode: 500, message: 'Internal server error' },
    },
  })
  async update(@Param('id') id: string, @Body() updateDisputeDto: UpdateDisputeDto) {
    return this.disputesService.update(id, updateDisputeDto);
  }

  // ── Evidence endpoints ────────────────────────────────────────────────────

  @Post('disputes/:id/evidence')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload evidence file to a dispute',
    description:
      'Attach a PDF, PNG or JPEG file (≤ 10 MB) as evidence. MIME type is validated by magic bytes. Max 10 files per dispute. Evidence cannot be added once a dispute is resolved or closed.',
  })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ description: 'Evidence uploaded successfully.' })
  @ApiBadRequestResponse({ description: 'Invalid file type or file too large.' })
  @ApiConflictResponse({ description: 'Dispute is resolved/closed or max files reached.' })
  @ApiNotFoundResponse({ description: 'Dispute not found.' })
  async uploadEvidence(
    @Param('id') disputeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('A file must be attached under the "file" field');
    }
    return this.disputeEvidenceService.upload(disputeId, file, req.user?.id);
  }

  @Get('disputes/:id/evidence')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'List evidence files for a dispute',
    description: 'Returns metadata for all evidence files attached to the dispute.',
  })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiOkResponse({ description: 'List of evidence records.' })
  @ApiNotFoundResponse({ description: 'Dispute not found.' })
  async listEvidence(@Param('id') disputeId: string) {
    return this.disputeEvidenceService.list(disputeId);
  }

  @Get('disputes/:id/evidence/:evidenceId/download')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Download an evidence file',
    description: 'Streams the evidence file back to the caller.',
  })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiParam({ name: 'evidenceId', description: 'Evidence UUID' })
  @ApiOkResponse({ description: 'File binary stream.' })
  @ApiNotFoundResponse({ description: 'Dispute or evidence not found.' })
  async downloadEvidence(
    @Param('id') disputeId: string,
    @Param('evidenceId') evidenceId: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, fileName } = await this.disputeEvidenceService.download(
      disputeId,
      evidenceId,
    );
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': buffer.length.toString(),
    });
    res.end(buffer);
  }
}