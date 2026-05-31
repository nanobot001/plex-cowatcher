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

export interface PromptResolutionResult {
  status: string;
  results: Array<{ targetUserId: number; status: string; plexSyncStatus?: string; error?: string }>;
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

export function buildCowatchComponents(
  watchEventId: number,
  typicalUsers: Array<{ id: number; display_name: string }>,
  adminUrl?: string
) {
  const rows = [];

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`cowatch:everyone:${watchEventId}`).setLabel("Everyone").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cowatch:none:${watchEventId}`).setLabel("No one").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cowatch:dismiss:${watchEventId}`).setLabel("Dismiss").setStyle(ButtonStyle.Secondary)
  );

  if (adminUrl) {
    buttons.addComponents(new ButtonBuilder().setLabel("Open admin").setStyle(ButtonStyle.Link).setURL(adminUrl));
  }

  if (typicalUsers.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`cowatch:select:${watchEventId}`)
      .setPlaceholder("Select co-watchers")
      .setMinValues(1)
      .setMaxValues(typicalUsers.length)
      .addOptions(typicalUsers.map((user) => ({ label: user.display_name, value: String(user.id) })));
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  rows.push(buttons);
  return rows;
}

export function buildResolvedCowatchContent(
  result: PromptResolutionResult,
  typicalUsers: Array<{ id: number; display_name: string }>
): string {
  if (result.status === "dismissed") return "Dismissed. No Plex sync was attempted.";
  if (result.status === "none") return "Resolved: no one else watched. No Plex sync was attempted.";

  const namesById = new Map(typicalUsers.map((user) => [user.id, user.display_name]));
  const lines = result.results.map((item) => {
    const name = namesById.get(item.targetUserId) ?? `User ${item.targetUserId}`;
    const syncStatus = item.plexSyncStatus ? `; Plex sync: ${item.plexSyncStatus}` : "";
    const error = item.error ? `; ${item.error}` : "";
    return `- ${name}: ${item.status}${syncStatus}${error}`;
  });

  return ["Resolved co-watch prompt.", ...lines].join("\n");
}
