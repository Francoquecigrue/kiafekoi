# Serveur multimédia – état d'avancement (pause du 25/11/2026)

## Environnement de test
- PC Windows 11, Ubuntu sous WSL2, Docker Desktop (intégration WSL Ubuntu activée).
- Stack dans `/opt/stack` (compose : voir `docker-compose.yml` de ce dossier), médias dans `/data`.
- Commandes docker : **dans la fenêtre Ubuntu**, après `cd /opt/stack`.
- Ne pas utiliser `wsl --shutdown` quand Docker Desktop tourne (a provoqué `Wsl/Service/E_UNEXPECTED`). Préférer quitter Docker Desktop puis redémarrer le PC.

## Fait
- [x] WSL2 + Ubuntu, Docker Desktop, groupe docker
- [x] Dossiers `/data/{torrents,media}/{movies,tv}` (propriétaire abulif)
- [x] Jellyfin (`localhost:8096`, serveur « Flixnet », v12.4) – bibliothèques Films/Séries, film de test visible
- [x] Prowlarr (`:9696`) – FlareSolverr (`http://flaresolverr:8191/`, tag flaresolverr), indexeurs ajoutés, Internet Archive
- [x] Radarr (`:7878`) – auth Enabled, root `/data/media/movies`, custom formats MULTI/VOSTFR, profil HD-1080p, relié à Prowlarr
- [x] Sonarr (`:8989`) – même chose avec `/data/media/tv`
- [x] Jellyseerr remplacé par **Seerr** (`:5055`, Jellyseerr est abandonné) – connexion Jellyfin OK

## En cours / blocage actuel
- Lancement d'un qBittorrent **temporaire sans VPN** (`qbittorrent-test`, port 8081, contenu légal uniquement) :
  échec `read-only file system` → le disque interne de Docker Desktop est en lecture seule.
- **À faire en reprenant :**
  1. Vérifier l'espace libre sur C: (libérer si < 10 Go).
  2. Quitter Docker Desktop → redémarrer le PC → relancer Docker Desktop (« Engine running »).
  3. Ubuntu : `cd /opt/stack && docker compose ps && docker run --rm hello-world`
  4. Si OK : `docker rm -f qbittorrent-test` puis relancer la commande `docker run ... qbittorrent-test`.
  5. Si toujours lecture seule : Docker Desktop → Troubleshoot → Clean / Purge data (WSL 2), puis
     `docker compose up -d prowlarr flaresolverr radarr sonarr bazarr jellyfin seerr` (les configs dans /opt/stack sont conservées).

## Reste à faire
- [ ] Finir l'assistant Seerr : bibliothèques, Radarr (`radarr:7878`, HD-1080p, `/data/media/movies`), Sonarr (`sonarr:8989`, `/data/media/tv`), langue FR / région Belgique
- [ ] Bazarr (`:6767`) : auth, profil langues FR+EN, OpenSubtitles.com, liaison Sonarr/Radarr
- [ ] qBittorrent test (8081) : catégories movies/tv, client dans Radarr/Sonarr (`qbittorrent-test:8081`), Prowlarr : uniquement Internet Archive activé, test avec un film du domaine public
- [ ] VPN : abonnement ProtonVPN Plus → clé WireGuard (NAT-PMP, serveur P2P) dans `/opt/stack/.env` (ne jamais la partager)
- [ ] Puis : supprimer qbittorrent-test, démarrer gluetun + qbittorrent, vérifier l'IP, client = `gluetun:8080`, réactiver les indexeurs
- [ ] Plus tard : réglages lecture Jellyfin (VO + sous-titres FR « Intelligent »), accès distant via Tailscale, migration vers machine dédiée (copier `/opt/stack`, ajouter `/dev/dri`)
