import type { Interaction } from "discord.js";
import type { CowatchService } from "../service/cowatchService.js";
import { buildResolvedCowatchContent, type PromptResolutionResult } from "./prompts.js";

export async function handleCowatchInteraction(interaction: Interaction, service: CowatchService): Promise<boolean> {
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
