import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsPaymentMetadata(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    const target = object.constructor as new () => object;
    registerDecorator({
      name: 'isPaymentMetadata',
      target,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'object' || Array.isArray(value)) return false;
          const entries = Object.entries(value as Record<string, unknown>);
          if (entries.length > 20) return false;
          return entries.every(
            ([, entryValue]) =>
              typeof entryValue === 'string' && entryValue.length <= 500,
          );
        },
        defaultMessage() {
          return 'metadata must have at most 20 keys, each value a string of max 500 characters';
        },
      },
    });
  };
}
