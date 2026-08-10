import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ANONYMOUS, type Principal } from './principal';

/** Inject the resolved Principal for the current request. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<{ principal?: Principal }>();
    return request.principal ?? ANONYMOUS;
  },
);
