require('dotenv').config()
const { Client, GatewayIntentBits } = require("discord.js");
const ytdl = require("@distube/ytdl-core");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection,
} = require("@discordjs/voice");
const ytSearch = require("yt-search");

// Criação do cliente do bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const token = process.env.TOKEN_DISCORD; // Substitua pelo token correto
const queue = new Map(); // Fila para armazenar músicas por servidor

client.once("ready", () => {
  console.log("Bot está pronto!");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const serverQueue = queue.get(message.guild.id);

  if (message.content.startsWith("!tocar")) {
    const args = message.content.split(" ");
    const songName = args.slice(1).join(" ");

    if (!songName) {
      return message.reply(
        "Você precisa fornecer o nome de uma música após o comando !play."
      );
    }

    if (message.member.voice.channel) {
      const songInfo = await ytSearch(songName);
      if (!songInfo.videos.length) {
        return message.channel.send(
          "Não consegui encontrar a música no YouTube."
        );
      }

      const song = {
        title: songInfo.videos[0].title,
        url: songInfo.videos[0].url,
      };

      if (!serverQueue) {
        // Criar fila para este servidor
        const queueContruct = {
          textChannel: message.channel,
          voiceChannel: message.member.voice.channel,
          connection: null,
          songs: [],
          player: null,
        };

        queue.set(message.guild.id, queueContruct);
        queueContruct.songs.push(song);

        try {
          const connection = joinVoiceChannel({
            channelId: message.member.voice.channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
          });
          queueContruct.connection = connection;
          playSong(message.guild, queueContruct.songs[0]);
        } catch (error) {
          console.error("Erro ao tentar conectar ao canal de voz:", error);
          queue.delete(message.guild.id);
          return message.channel.send("Erro ao conectar no canal de voz.");
        }
      } else {
        serverQueue.songs.push(song);
        return message.channel.send(`**${song.title}** foi adicionada à fila!`);
      }
    } else {
      return message.reply("Você precisa estar em um canal de voz primeiro!");
    }
  }

  if (message.content.startsWith("!pular")) {
    if (!serverQueue)
      return message.channel.send("Não há músicas na fila para pular!");
    serverQueue.player.stop(); 
    return message.channel.send("Música pulada!");
  }

  if (message.content.startsWith("!parar")) {
    if (!serverQueue)
      return message.channel.send("Não há músicas tocando no momento!");
    serverQueue.songs = [];
    serverQueue.player.stop();
    serverQueue.connection.destroy();
    queue.delete(message.guild.id);
    return message.channel.send("Reprodução encerrada e bot desconectado!");
  }
  if (message.content.startsWith("!fila")) {
    if (!serverQueue || serverQueue.songs.length === 0) {
      return message.channel.send("A fila está vazia no momento.");
    }
    const queueMessage = serverQueue.songs
      .map((song, index) => `${index + 1}. ${song.title}`)
      .join("\n");
    message.channel.send(`🎵 **Fila de músicas:**\n${queueMessage}`);
  }
  if (message.content.startsWith("!pause")) {
    if (!serverQueue || !serverQueue.player)
      return message.channel.send("Nenhuma música está tocando no momento!");
    serverQueue.player.pause();
    return message.channel.send("⏸️ Música pausada!");
  }

  if (message.content.startsWith("!continuar")) {
    if (!serverQueue || !serverQueue.player)
      return message.channel.send("Nenhuma música está tocando no momento!");
    serverQueue.player.unpause();
    return message.channel.send("▶️ Música retomada!");
  }
  if (message.content.startsWith("!volume")) {
    const args = message.content.split(" ");
    const volume = parseInt(args[1]);
  
    if (!serverQueue || !serverQueue.audioResource) {
      return message.channel.send("Nenhuma música está tocando no momento!");
    }
  
    if (isNaN(volume) || volume < 0 || volume > 100) {
      return message.channel.send(
        "Por favor, forneça um valor de volume entre 0 e 100."
      );
    }
  
    // Ajusta o volume no recurso de áudio
    serverQueue.audioResource.volume.setVolume(volume / 100);
    serverQueue.volume = volume; // Salva o volume atual na fila
  
    return message.channel.send(`🔊 Volume ajustado para ${volume}%`);
  }
  if (message.content.startsWith('!embaralhar')) {
    if (!serverQueue || serverQueue.songs.length <= 1) return message.channel.send('Não há músicas suficientes na fila para embaralhar!');
    for (let i = serverQueue.songs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [serverQueue.songs[i], serverQueue.songs[j]] = [serverQueue.songs[j], serverQueue.songs[i]];
    }
    return message.channel.send('🔀 A fila foi embaralhada!');
}

  
});

function playSong(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
      serverQueue.connection.destroy();
      queue.delete(guild.id);
      return;
    }
  
    const stream = ytdl(song.url, {
      filter: "audioonly",
      highWaterMark: 1 << 25,
    });
  
    // Criação do recurso com inlineVolume para controle de volume
    const resource = createAudioResource(stream, { inlineVolume: true });
    const player = createAudioPlayer();
  
    serverQueue.audioResource = resource; // Salva o recurso de áudio na fila
    serverQueue.player = player;
    serverQueue.connection.subscribe(player);
  
    player.play(resource);
  
    player.on(AudioPlayerStatus.Idle, () => {
      serverQueue.songs.shift();
      playSong(guild, serverQueue.songs[0]);
    });
  
    player.on("error", (error) => {
      console.error("Erro no player:", error);
      serverQueue.songs.shift();
      playSong(guild, serverQueue.songs[0]);
    });
  
    serverQueue.textChannel.send(`🎶 Tocando agora: **${song.title}**`);
  }
  
client.login(token);
