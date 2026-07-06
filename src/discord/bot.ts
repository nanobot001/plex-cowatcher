import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import { appConfig } from "../utils/config.js";
import { log } from "../utils/logger.js";
import type { CowatchService } from "../service/cowatchService.js";
import { handleCowatchInteraction } from "./interactions.js";
import { buildCowatchComponents, buildCowatchEmbed, buildCowatchReviewComponents, buildCowatchReviewEmbed, type PromptMedia, type ReviewPromptMedia } from "./prompts.js";
import type { CowatchAdjudicationService } from "../service/cowatchAdjudicationService.js";

export class DiscordBot {
  private client?: Client;

  constructor(private readonly cowatchService: CowatchService, private readonly reviewService?: CowatchAdjudicationService) {}

  async start(): Promise<void> {
    if (!appConfig.DISCORD_ENABLED) {
      log("info", { action: "discord_start", message: "Discord disabled by configuration" });
      return;
    }

    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
    this.client.on("interactionCreate", (interaction) => {
      void handleCowatchInteraction(interaction, this.cowatchService, this.reviewService);
    });
    await this.client.login(appConfig.DISCORD_BOT_TOKEN);
    await this.waitUntilReady();

    try {
      await this.client.application?.commands.create({
        name: "help-cowatch",
        description: "Show Plex Co-Watch Sync help and active user list."
      });
      log("info", { action: "discord_command_register", message: "Registered /help-cowatch slash command" });
    } catch (error) {
      log("warn", { action: "discord_command_register_error", message: error instanceof Error ? error.message : String(error) });
    }

    log("info", { action: "discord_start", message: "Discord bot connected" });
  }

  async stop(): Promise<void> {
    this.client?.destroy();
    this.client = undefined;
  }

  async sendTestPrompt(media: PromptMedia, typicalUsers: Array<{ id: number; display_name: string }>): Promise<string> {
    const message = await this.sendPrompt(media, typicalUsers);
    return message.id;
  }

  async sendPendingPrompts(limit = 10): Promise<{ sent: number; failed: number }> {
    const candidates = this.cowatchService.listPendingPromptCandidates(limit);
    let sent = 0;
    let failed = 0;

    for (const candidate of candidates) {
      try {
        const message = await this.sendPrompt(candidate, this.cowatchService.listTypicalCowatchers());
        const result = this.cowatchService.recordPromptSent(candidate.watchEventId, message.channel.id, message.id);
        if (result.sent) sent += 1;
      } catch (error) {
        failed += 1;
        this.cowatchService.recordPromptFailure(candidate.watchEventId, error instanceof Error ? error.message : String(error));
      }
    }

    if (this.reviewService) {
      for (const candidate of this.reviewService.listPendingReviewPrompts(limit)) {
        try {
          const message = await this.sendReviewPrompt(candidate);
          const result = this.reviewService.recordReviewPromptSent(candidate.reviewPromptId, message.channel.id, message.id);
          if (result.sent) sent += 1;
        } catch (error) {
          failed += 1;
          this.reviewService.recordReviewPromptFailure(candidate.reviewPromptId, error instanceof Error ? error.message : String(error));
        }
      }
    }

    return { sent, failed };
  }

  async sendPromptCandidate(media: PromptMedia): Promise<{ sent: boolean; messageId?: string }> {
    const message = await this.sendPrompt(media, this.cowatchService.listTypicalCowatchers());
    const result = this.cowatchService.recordPromptSent(media.watchEventId, message.channel.id, message.id);
    return { sent: result.sent, messageId: message.id };
  }

  private async sendPrompt(media: PromptMedia, typicalUsers: Array<{ id: number; display_name: string }>) {
    if (!this.client) throw new Error("Discord client is not started");
    const channel = await this.client.channels.fetch(appConfig.DISCORD_CHANNEL_ID);
    if (!(channel instanceof TextChannel)) throw new Error("Configured Discord channel is not a text channel");
    return channel.send({
      embeds: [buildCowatchEmbed(media)],
      components: buildCowatchComponents(media.watchEventId, typicalUsers, appConfig.APP_BASE_URL)
    });
  }

  private async sendReviewPrompt(media: ReviewPromptMedia) {
    if (!this.client) throw new Error("Discord client is not started");
    const channel = await this.client.channels.fetch(appConfig.DISCORD_CHANNEL_ID);
    if (!(channel instanceof TextChannel)) throw new Error("Configured Discord channel is not a text channel");
    return channel.send({ embeds: [buildCowatchReviewEmbed(media)], components: buildCowatchReviewComponents(media.reviewPromptId) });
  }

  private async waitUntilReady(): Promise<void> {
    if (!this.client) return;
    if (this.client.isReady()) return;
    await new Promise<void>((resolve) => {
      this.client?.once("ready", () => resolve());
    });
  }
}
