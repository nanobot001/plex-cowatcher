import type { Interaction } from "discord.js";
import type { CowatchService } from "../service/cowatchService.js";
import { buildResolvedCowatchContent, type PromptResolutionResult } from "./prompts.js";
import type { CowatchAdjudicationService, CowatchDecision } from "../service/cowatchAdjudicationService.js";

export async function handleCowatchInteraction(interaction: Interaction, service: CowatchService, reviews?: CowatchAdjudicationService): Promise<boolean> {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "help-cowatch") {
      const typical = service.listTypicalCowatchers()
        .map((u: any) => `• **${u.display_name}**`)
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
  if (scope === "cowatch-review") {
    if (!reviews || !interaction.isButton()) {
      await interaction.reply({ content: "Co-watch review is unavailable.", ephemeral: true });
      return true;
    }
    const reviewPromptId = Number(watchEventIdRaw);
    if (!Number.isFinite(reviewPromptId) || !["yes", "no", "not_sure"].includes(action)) {
      await interaction.reply({ content: "This co-watch review prompt is invalid.", ephemeral: true });
      return true;
    }
    const result = await reviews.resolveReviewPrompt(reviewPromptId, action as Exclude<CowatchDecision, "clear">, interaction.id);
    if (!result.ok) {
      await interaction.reply({ content: result.message || "Review could not be recorded.", ephemeral: true });
      return true;
    }
    const label = action === "yes" ? "Together" : action === "no" ? "Not together" : "Still likely together";
    await interaction.update({ content: `Review recorded: ${label}. Plex watched state was not changed.`, components: [] });
    return true;
  }
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
