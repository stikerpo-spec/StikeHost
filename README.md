# StikeHost

StikeHost is a self-hosted Minecraft control panel. Users can create separate Minecraft servers and manage them from the browser.

## Included

- User registration/login with Prisma + PostgreSQL
- Server creation with Minecraft version, Vanilla/Paper/Spigot/Purpur, RAM and player limit
- Dedicated host port allocation in the 25565-25999 range
- Public Minecraft address shown as `IP:PORT`
- Start / stop / restart
- Hardcore, PvP, whitelist, online mode, difficulty and gamemode
- World seed/name/settings and world reset
- Paper/Spigot/Purpur plugin installation from direct `.jar` URLs
- Live console/logs through RCON
- Simple Bukkit/Paper command aliases
- Persistent server files through Docker volumes

## Run on a VPS

Use a Linux VPS with Docker and Docker Compose. The host needs enough RAM for the Minecraft servers you plan to run.

1. Copy `.env.example` to `.env` and replace all placeholder secrets.
2. Set `PUBLIC_HOST` to your hostname or public IP.
3. Allow TCP 3000 and the Minecraft range TCP 25565-25999 in the VPS firewall/security group.
4. Start with:

```bash
docker compose up -d --build
```

5. Open `http://YOUR-IP:3000` and register an account.

The web app talks to the worker over the private Docker network. The worker controls the Minecraft containers through the Docker socket and stores each server in the persistent `stikehost-servers` volume.

## Important

GitHub or a Vercel-only deployment cannot itself host the Minecraft containers. The Minecraft worker needs a machine where Docker can run continuously. The repository now contains the application and worker needed for that setup.
