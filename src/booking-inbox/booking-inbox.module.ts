import { Module } from '@nestjs/common';
import { SupabaseModule } from '../common/supabase/supabase.module';
import { BookingInboxController } from './booking-inbox.controller';
import { BookingInboxService } from './booking-inbox.service';
import { ParserBookingInboxService } from './parser-booking-inbox.service';
import { WhatsappCallmebotService } from './whatsapp-callmebot.service';

@Module({
  imports: [SupabaseModule],
  controllers: [BookingInboxController],
  providers: [BookingInboxService, ParserBookingInboxService, WhatsappCallmebotService],
})
export class BookingInboxModule {}
