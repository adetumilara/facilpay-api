import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { Product } from './product.entity';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth('bearer')
@Controller('v1/products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a product',
    description: 'Creates a reusable catalog product for invoices and checkout sessions.',
  })
  @ApiCreatedResponse({ description: 'Product created successfully', type: Product })
  create(@Body() dto: CreateProductDto, @Req() req: any) {
    return this.productsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List products',
    description: 'Lists all catalog products for the authenticated merchant.',
  })
  @ApiOkResponse({ description: 'List of products', type: [Product] })
  findAll(@Req() req: any) {
    return this.productsService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a product',
    description: 'Retrieves a single catalog product by its ID.',
  })
  @ApiOkResponse({ description: 'Product found', type: Product })
  @ApiNotFoundResponse({ description: 'Product not found' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.productsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a product',
    description: 'Updates product details such as name, description, unit amount, or active status.',
  })
  @ApiOkResponse({ description: 'Product updated successfully', type: Product })
  @ApiNotFoundResponse({ description: 'Product not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Req() req: any,
  ) {
    return this.productsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Archive a product',
    description: 'Archives a catalog product instead of hard deleting it (sets active to false).',
  })
  @ApiOkResponse({ description: 'Product archived successfully', type: Product })
  @ApiNotFoundResponse({ description: 'Product not found' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.productsService.remove(req.user.id, id);
  }
}
