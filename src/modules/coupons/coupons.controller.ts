import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';
import { CouponsService } from './coupons.service';

@ApiTags('coupons')
@ApiBearerAuth('bearer')
@Controller('v1/coupons')
@UseGuards(JwtAuthGuard)
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post()
  create(@Body() dto: CreateCouponDto, @Req() req: any) {
    return this.couponsService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.couponsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.couponsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCouponDto, @Req() req: any) {
    return this.couponsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.couponsService.remove(req.user.id, id);
  }
}