import 'dotenv/config';
import { DataSource } from 'typeorm';

const isCompiled = __filename.endsWith('.js');
const sourceRoot = isCompiled ? 'dist' : 'src';
const fileExtension = isCompiled ? 'js' : 'ts';

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USERNAME ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'password',
  database: process.env.DATABASE_NAME ?? 'facilpay',
  entities: [`${sourceRoot}/**/*.entity.${fileExtension}`],
  migrations: [`${sourceRoot}/migrations/*.${fileExtension}`],
  synchronize: false,
});
