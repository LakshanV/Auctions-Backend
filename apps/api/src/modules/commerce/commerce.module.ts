import { Module } from '@nestjs/common';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { MemberModule } from '../member/member.module';

@Module({
  imports: [MemberModule],
  controllers: [CommerceController],
  providers: [CommerceService],
})
export class CommerceModule {}
