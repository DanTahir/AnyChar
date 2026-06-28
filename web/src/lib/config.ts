export const config = {
  authSecret: process.env.AUTH_SECRET ?? "",
  authUrl: process.env.AUTH_URL ?? "http://localhost:3000",
  discordClientId:
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? process.env.AUTH_DISCORD_ID ?? "",
  discordClientSecret: process.env.AUTH_DISCORD_SECRET ?? "",
  discordBotToken: process.env.DISCORD_BOT_TOKEN ?? "",
  awsRegion: process.env.AWS_REGION ?? "us-east-1",
  dynamoTable: process.env.DYNAMODB_TABLE ?? "AnyChar",
  s3Bucket: process.env.S3_BUCKET ?? "",
  encryptionSecret: process.env.ENCRYPTION_SECRET ?? "",
  openRouterManagementKey: process.env.OPENROUTER_MANAGEMENT_KEY ?? "",
  budgetUsd: 10,
  inputCostPerM: 1.0,
  openRouterVisionModel:
    process.env.OPENROUTER_VISION_MODEL ?? "meta-llama/llama-4-maverick",
  outputCostPerM: 1.5,
  // View Channels, Send Messages, Send Messages in Threads, Embed Links,
  // Attach Files, Read Message History, Change Nickname, Use Application Commands
  botPermissions: "2416299008",
};

export function botInviteUrl(clientId?: string): string {
  const id = clientId ?? config.discordClientId;
  return `https://discord.com/api/oauth2/authorize?client_id=${id}&permissions=${config.botPermissions}&scope=bot%20applications.commands`;
}

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * config.inputCostPerM +
    (outputTokens / 1_000_000) * config.outputCostPerM
  );
}
