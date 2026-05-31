import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import { appConfig } from "../utils/config.js";
import { log } from "../utils/logger.js";
import type { CowatchService } from "../service/cowatchService.js";
import { handleCowatchInteraction } from "./interactions.js";
import { buildCowatchComponents, buildCowatchEmbed, type PromptMedia } from "./prompts.js";

export class DiscordBot {
  private client?: Client;

  constructor(private readonly cowatchService: CowatchService) {}

  async start(): Promise<void> {
    if (!appConfig.DISCORD_ENABLED) {
      log("info", { action: "discord_start", message: "Discord disabled by configuration" });
      return;
    }

    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
    this.client.on("interactionCreate", (interaction) => {
      void handleCowatchInteraction(interaction, this.cowatchService);
    });
    await this.client.login(appConfig.DISCORD_BOT_TOKEN);
    log("info", { action: "discord_start", message: "Discord bot connected" });
  }

  async sendTestPrompt(media: PromptMedia, typicalUsers: Array<{ id: number; display_name: string }>): Promise<void> {
    if (!this.client) throw new Error("Discord client is not started");
    const channel = await this.client.channels.fetch(appConfig.DISCORD_CHANNEL_ID);
    if (!(channel instanceof TextChannel)) throw new Error("Configured Discord channel is not a text channel");
    await channel.send({
      embeds: [buildCowatchEmbed(media)],
      components: buildCowatchComponents(media.watchEventId, typicalUsers)
    });
  }
}
