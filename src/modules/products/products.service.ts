import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Product } from './product.entity';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(merchantId: string, dto: CreateProductDto): Promise<Product> {
    const product = this.productRepository.create({
      merchantId,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? null,
      unitAmount: dto.unitAmount.toFixed(2),
      currency: dto.currency.toUpperCase(),
      isActive: dto.active ?? true,
    });
    return this.productRepository.save(product);
  }

  async findAll(merchantId: string): Promise<Product[]> {
    return this.productRepository.find({
      where: { merchantId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(merchantId: string, id: string): Promise<Product> {
    const product = await this.productRepository.findOneBy({
      id,
      deletedAt: IsNull(),
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    if (product.merchantId !== merchantId) {
      throw new ForbiddenException('Access denied to product');
    }
    return product;
  }

  async update(
    merchantId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findOne(merchantId, id);

    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.description !== undefined) {
      product.description = dto.description?.trim() ?? null;
    }
    if (dto.unitAmount !== undefined) {
      product.unitAmount = dto.unitAmount.toFixed(2);
    }
    if (dto.currency !== undefined) {
      product.currency = dto.currency.toUpperCase();
    }
    if (dto.active !== undefined) {
      product.isActive = dto.active;
    }

    return this.productRepository.save(product);
  }

  async remove(merchantId: string, id: string): Promise<Product> {
    const product = await this.findOne(merchantId, id);
    // Archiving instead of hard delete
    product.isActive = false;
    return this.productRepository.save(product);
  }

  async validateAndGetProduct(
    merchantId: string,
    productId: string,
    currency: string,
  ): Promise<Product> {
    const product = await this.productRepository.findOneBy({
      id: productId,
      deletedAt: IsNull(),
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }
    if (product.merchantId !== merchantId) {
      throw new ForbiddenException('Access denied to product');
    }
    if (!product.isActive) {
      throw new BadRequestException(`Product ${productId} is archived or inactive`);
    }
    if (product.currency !== currency.toUpperCase()) {
      throw new BadRequestException(
        `Product currency (${product.currency}) does not match currency (${currency.toUpperCase()})`,
      );
    }
    return product;
  }
}
