import type { Interaction } from "discord.js";
import type { CowatchService } from "../service/cowatchService.js";
import { buildResolvedCowatchContent, type PromptResolutionResult } from "./prompts.js";

export async function handleCowatchInteraction(interaction: Interaction, service: CowatchService): Promise<boolean> {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "help-cowatch") {
      const typical = service.listTypicalCowatchers()
        .map((u: any) => `• **${u.display_name}**` + (u.display_name === "Alex" ? " *(Mock/test user - not a real person)*" : ""))
        .join("\n");
      const helpText = [
        "**💡 Plex Co-Watch Sync Help**",
        "",
        "**How watch detection works:**",
        "• Playback is polled from Tautulli. Only watches by **Source Users** will trigger co-watch prompts.",
        "• Currently, **Tony** is the only configured Source User.",
        "",
        "**How co-watch prompts work:**",
        "• When Tony finishes watching something, a prompt is posted here to sync that item to co-watchers.",
        "• Active co-watcher targets available for syncing:",
        typical || "• None",
        "",
        "**History Copy UI:**",
        "• To sync entire seasons/shows or date ranges, visit: http://localhost:8787/copy"
      ].join("\n");

      await interaction.reply({ content: helpText, ephemeral: true });
      return true;
    }
    return false;
  }

  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return false;
  const [scope, action, watchEventIdRaw] = interaction.customId.split(":");
  if (scope !== "cowatch") return false;
  const watchEventId = Number(watchEventIdRaw);
  if (!Number.isFinite(watchEventId)) {
    await interaction.reply({ content: "This co-watch prompt is invalid.", ephemeral: true });
    return true;
  }

  const selectedTargetUserIds =
    interaction.isStringSelectMenu()
      ? interaction.values.map(Number)
      : action === "everyone"
        ? service.getTypicalCowatcherIds()
        : action === "none" || action === "dismiss"
        ? []
        : [];

  const result = await service.resolvePrompt({
    watchEventId,
    selectedTargetUserIds,
    actor: interaction.user.id,
    method: "discord_prompt",
    resolution: action === "everyone" ? "everyone" : action === "dismiss" ? "dismiss" : action === "none" ? "none" : "selected"
  });

  if (!result.ok) {
    await interaction.reply({ content: JSON.stringify(result, null, 2), ephemeral: true });
    return true;
  }

  await interaction.update({
    content: buildResolvedCowatchContent(result.data as unknown as PromptResolutionResult, service.listTypicalCowatchers()),
    components: []
  });
  return true;
}
