import type { Interaction } from "discord.js";
import type { CowatchService } from "../service/cowatchService.js";

export async function handleCowatchInteraction(interaction: Interaction, service: CowatchService): Promise<boolean> {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return false;
  const [scope, action, watchEventIdRaw] = interaction.customId.split(":");
  if (scope !== "cowatch") return false;
  const watchEventId = Number(watchEventIdRaw);

  const selectedTargetUserIds =
    interaction.isStringSelectMenu()
      ? interaction.values.map(Number)
      : action === "none" || action === "dismiss"
        ? []
        : [];

  const result = await service.resolvePrompt({
    watchEventId,
    selectedTargetUserIds,
    actor: interaction.user.id,
    method: "discord_prompt"
  });

  await interaction.reply({ content: JSON.stringify(result.data ?? result, null, 2), ephemeral: true });
  return true;
}
