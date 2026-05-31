import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type APIEmbed
} from "discord.js";

export interface PromptMedia {
  watchEventId: number;
  sourceUser: string;
  title: string;
  showTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  watchedAt: string;
}

export function buildCowatchEmbed(media: PromptMedia): APIEmbed {
  const episode = media.showTitle ? `${media.showTitle} - S${String(media.seasonNumber ?? 0).padStart(2, "0")}E${String(media.episodeNumber ?? 0).padStart(2, "0")} - ${media.title}` : media.title;
  return {
    title: `${media.sourceUser} watched ${episode}`,
    description: "Did anyone else watch with them?",
    fields: [{ name: "Watched at", value: media.watchedAt }],
    color: 0x2f855a
  };
}

export function buildCowatchComponents(watchEventId: number, typicalUsers: Array<{ id: number; display_name: string }>) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`cowatch:select:${watchEventId}`)
    .setPlaceholder("Select co-watchers")
    .setMinValues(1)
    .setMaxValues(Math.max(1, typicalUsers.length))
    .addOptions(typicalUsers.map((user) => ({ label: user.display_name, value: String(user.id) })));

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`cowatch:everyone:${watchEventId}`).setLabel("Everyone").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cowatch:none:${watchEventId}`).setLabel("No one").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cowatch:dismiss:${watchEventId}`).setLabel("Dismiss").setStyle(ButtonStyle.Secondary)
  );

  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), buttons];
}
