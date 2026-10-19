import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { InvoicesService } from './invoices.service';
import { PayInvoiceDto } from './dto/invoice.dto';

@ApiTags('public-invoices')
@Controller('v1/public/invoices')
@Public()
export class PublicInvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get(':token')
  async findPublic(@Param('token') token: string) {
    const invoice = await this.invoicesService.findPublic(token);
    return {
      number: invoice.number,
      customerName: invoice.customerName,
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      taxRate: invoice.taxRate,
      taxAmount: invoice.taxAmount,
      total: invoice.total,
      dueDate: invoice.dueDate,
      status: invoice.status,
      lineItems: invoice.lineItems,
    };
  }

  @Post(':token/pay')
  pay(@Param('token') token: string, @Body() dto: PayInvoiceDto) {
    return this.invoicesService.pay(token, dto.payerEmail);
  }
}