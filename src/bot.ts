import {
  Client,
  GuildChannel,
  GuildMember,
  Intents,
  TextChannel,
} from "discord.js";
import { ChildProcess, exec, spawn } from "node:child_process";
import { setTimeout } from "node:timers";

export default class DiscordBot {
  private _initialized: boolean = false;
  private _loggedIn: boolean = false;
  private _shell: string = "";
  private _shellProcess: ChildProcess | undefined;
  private _ringBuffer: string = "";
  private _bufferInterval: number = 1000;
  private _bufferTimeStamp: number = new Date().getTime();
  private _outputChannel: string = "995059956187402260";
  private _authorizedUsers: Array<string> = ["251270690160771072"];
  private _discordClient = new Client({
    intents: [
      Intents.FLAGS.GUILDS,
      Intents.FLAGS.GUILD_PRESENCES,
      Intents.FLAGS.GUILD_MEMBERS,
      Intents.FLAGS.GUILD_MESSAGES,
      Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
      Intents.FLAGS.GUILD_VOICE_STATES,
      Intents.FLAGS.DIRECT_MESSAGES,
      Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
      Intents.FLAGS.DIRECT_MESSAGE_TYPING,
    ],
    partials: ["CHANNEL"],
  });

  constructor() {
    this._discordClient.on("ready", () => {
      console.log("Discord client is ready!");
      this._loggedIn = true;
      this._discordClient.user?.setActivity("to shell commands", {
        type: "LISTENING",
      });
    });
  }

  public start(): void {
    if (this._initialized) return;
    switch (process.platform) {
      case "win32":
        this._shell = "powershell";
        break;
      case "linux":
        this._shell = "bash";
      default:
        break;
    }
    this._shellProcess = spawn(this._shell);
    if (this._shellProcess == undefined)
      throw new Error("Failed to spawn shell");
    else {
      console.log("Shell started successfully");

      // STDOUT
      if (this._shellProcess.stdio[1])
        this._shellProcess.stdio[1].on("data", (data: string) => {
          if (!data || !data.toString() || data.toString() == "") return;
          console.log(data.toString());
          this._ringBuffer += data.toString().replace("`", "\\`");
        });

      // STDERR
      if (this._shellProcess.stdio[2])
        this._shellProcess.stdio[2].on("data", (data: string) => {
          if (!data || !data.toString() || data.toString() == "") return;
          console.error(data.toString());
          this._ringBuffer += data.toString();
        });

      // Shell closed
      this._shellProcess.on("close", (code) => {
        (
          this._discordClient.channels.cache.get(
            this._outputChannel
          ) as TextChannel
        ).send({
          content: `**Shell terminated <t:${Math.floor(
            new Date().getTime() / 1000
          )}:R>** with code ${code}`,
        });
        this._shellProcess == undefined;
        this._initialized = false;
      });

      // Failed to start
      this._shellProcess.on("error", (err) => {
        (
          this._discordClient.channels.cache.get(
            this._outputChannel
          ) as TextChannel
        ).send({ content: `Failed to start shell! Error: ${err}` });
        this._shellProcess == undefined;
        this._initialized = false;
      });
      this._initialized = true;
    }

    // The discord message handler
    this._discordClient.on("messageCreate", async (message) => {
      if (
        !message.content ||
        !this._authorizedUsers.includes(message.author.id)
      )
        return;
      if (message.guild && message.channel.id != "995059956187402260") return;

      switch (message.content) {
        case "clear":
        case "cls":
          await this.deleteMessages();
          break;
        default:
          const command = message.content;
          if (this._shellProcess?.stdio[0]?.writable) {
            this._shellProcess.stdio[0].write(command + "\n");
          }
          break;
      }
    });

    // Ringbuffer manager
    setInterval(() => {
      if (this._ringBuffer.length == 0) return;
      const timestamp = new Date().getTime();
      const rows = this._ringBuffer.split("\n");
      if (
        this._bufferTimeStamp + this._bufferInterval < timestamp ||
        this._ringBuffer.length > 1980 ||
        rows.length > 20
      ) {
        let str: string = "";

        while (rows.length > 0) {
          if (str.length + rows[0].length > 1980) break;
          str += rows.shift() + "\n";
        }
        this._ringBuffer = rows.join("\n");

        (
          this._discordClient.channels.cache.get(
            this._outputChannel
          ) as TextChannel
        ).send({ content: "```ansi\n" + str + "\n" + "```" });
      }
    }, this._bufferInterval);
  }

  public async login(): Promise<void> {
    await this._discordClient.login(process.env.DISCORD_TOKEN);
  }

  public stop(): void {}

  private async deleteMessages(): Promise<void> {
    let fetched;
    const channel = this._discordClient.channels.cache.get(
      this._outputChannel
    ) as TextChannel;
    if (channel.guild)
      do {
        fetched = await channel.messages.fetch({ limit: 100 });
        channel.bulkDelete(fetched);
      } while (fetched.size >= 2);
    channel.send({ content: "**Cleared!**" });
  }
}
