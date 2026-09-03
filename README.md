# StikeHost Public

## Was das ist
Eine neue Basis für eine öffentliche Minecraft-Hosting-Plattform mit Benutzerkonten, PostgreSQL, Server-Dashboard und einem separaten Worker, der echte Minecraft-Container starten kann.

## Starten
```bash
docker compose up -d --build
```
Danach `http://SERVER-IP:3000` öffnen.

## Enthalten
- Landingpage
- Registrierung / Login
- PostgreSQL + Prisma
- Server erstellen
- Server-Dashboard
- Welt-Dashboard
- Konsole / Dateien / Spieler / Backups als UI-Bereiche
- Worker mit Docker-Isolation und Minecraft-Container pro Server

## Für echten öffentlichen Betrieb noch nötig
- Domain + HTTPS
- Wildcard-DNS und TCP-Routing für Spieladressen
- dynamische Portvergabe statt Demo-Port
- echte Worker-Jobverwaltung
- Welt-Uploads/Downloads und Backups
- Plugin-/Mod-Installer
- CPU/RAM/Storage-Limits
- Admin-Rollen, Rate-Limits und Audit-Logs
- mehrere Minecraft-Nodes für Skalierung

`docker.sock` wird dem Worker absichtlich gegeben, damit er Servercontainer verwalten kann. Dieser Worker sollte auf einem isolierten Host laufen und nicht direkt aus dem öffentlichen Internet erreichbar sein.
