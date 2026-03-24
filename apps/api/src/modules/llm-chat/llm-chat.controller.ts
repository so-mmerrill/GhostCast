import { Controller, Post, Body } from '@nestjs/common';
import { LlmChatService } from './llm-chat.service';
import { ChatCompletionDto } from './dto/chat-completion.dto';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@ghostcast/database';

@Controller('llm-chat')
export class LlmChatController {
  constructor(private readonly llmChatService: LlmChatService) {}

  @Post('completion')
  @Audit({ action: 'LLM_CHAT', entity: 'LlmChat' })
  async chatCompletion(
    @CurrentUser() user: User,
    @Body() body: ChatCompletionDto,
  ) {
    const response = await this.llmChatService.chat(
      user.id,
      body.messages,
      body.pageContext,
      body.contextOverride,
      body.mentionedMemberIds,
      body.mentionedRequestIds,
    );
    return { data: { response } };
  }
}
