import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DomainError, IllegalTransition, InvariantViolation } from '@singha/domain';
import { type Response } from 'express';

/** Maps domain-rule violations to HTTP problem responses (docs/16). */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.BAD_REQUEST;
    if (exception instanceof IllegalTransition) status = HttpStatus.CONFLICT;
    else if (exception instanceof InvariantViolation) status = HttpStatus.UNPROCESSABLE_ENTITY;

    this.logger.warn(`${exception.code}: ${exception.message}`);
    response.status(status).json({
      type: exception.code,
      title: exception.message,
      status,
    });
  }
}
