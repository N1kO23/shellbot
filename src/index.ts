import DiscordBot from "./bot";
import { config } from "dotenv";
config();

async function main() {
  const discordBot = new DiscordBot();
  await discordBot.login();
  await discordBot.start();
}

main();
