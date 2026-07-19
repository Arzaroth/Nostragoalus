# Journal des modifications

Toutes les modifications notables apportées à Nostragoalus sont documentées ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ; les versions sont des instantanés datés plutôt que des versions publiées.

## [Unreleased]

### Ajouté

- Épinglez le chat sur une conversation : le marque-page dans l'en-tête du chat le maintient sur la ligue et le fil que vous lisez, si bien que changer le filtre de ligue dans le classement, ou mettre un autre match en avant en multi-vue, n'emporte plus le chat avec lui. L'épingle vous suit d'une compétition à l'autre, nomme la ligue épinglée dans l'en-tête et reste en place jusqu'à ce que vous la retiriez ou quittiez cette ligue.

### Modifié

- Le succès Le Triplé annonce désormais clairement ce qu'il attend : trois des quatre trophées de fin de tournoi (Grand Champion, Maître des poules, Maître du tableau, Madame Irma) dans la même compétition, et les badges de succès ne comptent pas.

### Corrigé

- Une fois la compétition terminée, la liste des matchs se cale à nouveau sur la finale au lieu de rester en haut : sans match en direct ni à venir, le défilement automatique vise désormais le dernier match.

## [4.3.3] - 2026-07-19

### Modifié

- Les matchs s'ouvrent désormais avec les journées terminées repliées : toute journée dont les matchs ont tous été joués démarre repliée, si bien que la liste arrive sur ce qui reste à venir. La finale n'est jamais repliée, et un lien direct vers un match joué ouvre toujours sa journée.

### Corrigé

- L'onglet Stats n'affiche plus un tableau « Meilleurs buteurs » vide alors que « Meilleures passes » est rempli. La FIFA publie les deux classements séparément et l'un peut être en retard sur l'autre après une journée ; l'app ignore désormais un flux de buteurs encore sans buts et se rabat sur ses propres données de buts, si bien que les deux tableaux restent remplis.

## [4.3.2] - 2026-07-19

### Modifié

- L'image Docker de production tourne désormais sur une base glibc Debian slim, sous un utilisateur non-root. Le client TLS des cotes et compositions Sofascore s'exécute sur une glibc native au lieu de l'ancien shim de compatibilité musl d'Alpine, ce qui supprime toute une classe d'échecs à l'exécution, et l'image n'embarque plus que la copie de ce client pour l'architecture processeur utilisée, au lieu de celles de toutes les plateformes.

### Corrigé

- Les compositions sur la page d'un match continuent maintenant de se rafraîchir d'elles-mêmes jusqu'à la fin de la rencontre. Auparavant elles s'arrêtaient dès la publication du onze de départ, si bien qu'une correction de formation ou un remplacement arrivé ensuite depuis le flux n'apparaissait qu'après un rechargement manuel de la page.

## [4.3.1] - 2026-07-16

### Ajouté

- Survoler un match programmé dont les deux équipes sont déjà connues (une finale en attente d'être jouée) trace désormais les parcours des deux équipes en remontant le tableau, chacun dans une couleur propre à son côté, pour voir comment les deux finalistes en sont arrivés là avant même le coup d'envoi.

### Modifié

- Les parcours du tableau partent maintenant du match survolé et se déploient à la fois vers la finale et vers les phases de groupes, et se superposent exactement aux traits de liaison au lieu de courir à côté d'eux. Chaque tronçon se trace à un rythme régulier, si bien que les parcours des deux équipes restent synchronisés quelle que soit la distance qui les sépare.
- La finale et le match pour la troisième place sont désormais empilés, la finale juste au-dessus des demi-finales et le match pour la troisième place juste en dessous, si bien que les parcours qui y mènent ne se croisent plus au milieu du tableau.

## [4.3.0] - 2026-07-16

### Ajouté

- Survolez n'importe quel match joué du tableau final pour voir les parcours des deux équipes se tracer à travers le tableau : celui du vainqueur en vert, celui du perdant en rouge, avec les deux noms du match colorés en conséquence.

## [4.2.5] - 2026-07-16

### Corrigé

- Le tableau ne sacre plus de champion avant que la finale soit jouée. Une fois les deux demi-finales terminées, le trophée affichait le nom de l'équipe qualifiée pour la finale par la seconde demi-finale, dévoilant ainsi une finale qui n'avait pas commencé. Le champion est désormais déterminé par le résultat de la finale elle-même.
- Le match pour la troisième place s'affiche désormais sous la finale, au centre du tableau, au lieu d'occuper sa propre colonne à côté d'elle. La finale est ainsi recentrée et les traits de liaison qui rejoignaient une colonne vide ont disparu. Le match manquait à l'appel parce que le fournisseur le nomme « Bronze final », une graphie que l'application ne reconnaissait pas comme le match pour la troisième place.

## [4.2.4] - 2026-07-16

### Corrigé

- Le trophée « Set and Forget » n'est plus refusé aux joueurs qui n'ont jamais touché à leurs pronostics. L'enregistrement d'un pronostic pouvait l'inscrire deux fois dans le registre d'inviolabilité, ce qui passait pour une modification. Le double enregistrement est corrigé, et le trophée compare désormais les scores réellement engagés plutôt que le nombre d'entrées du registre : un pronostic inscrit deux fois avec le même score redevient intact. Les joueurs concernés reçoivent le trophée dès le prochain match noté de leur compétition.

## [4.2.3] - 2026-07-14

### Corrigé

- Le match pour la troisième place n'affiche plus « La finale compte double » et ne double plus les points : le stage d'un match est désormais figé à sa première synchronisation, si bien qu'un renommage du match par le fournisseur ne peut plus le faire passer pour la finale.

## [4.2.2] - 2026-07-14

### Corrigé

- L'image de production de l'application est désormais taguée avec la version de l'app (`nostragoalus-app:<x.y.z>`) via `mise run deploy`, au lieu de toujours `:local`.
- Correction des photos de joueurs qui s'affichaient plus bas que leurs coéquipiers sur le terrain de la composition quand le nom passait sur deux lignes.

## [4.2.1] - 2026-07-14

### Corrigé

- L'empreinte d'intégrité du code client sur la page À propos s'affiche désormais sur les builds de production au lieu de « Aucune empreinte d'intégrité n'est disponible pour cette build. » Le fichier d'empreinte était généré à la compilation mais jamais servi, donc la vérification retombait toujours sur le repli.

## [4.2.0] - 2026-07-14

### Ajouté

- Appels vocaux : les appels ont désormais du son - un appel entrant joue une sonnerie et un appel sortant une tonalité de retour, jusqu'à ce que l'appel soit décroché, refusé ou annulé.

### Modifié

- Appels vocaux : le rappel « Vous êtes en sourdine » s'affiche désormais en flash juste au-dessus de la barre d'appel au lieu d'un toast dans un coin de l'écran.

### Corrigé

- Appels vocaux : la mise en évidence du participant qui parle ne clignote plus entre les mots - elle tient pendant les pauses naturelles d'une phrase.

## [4.1.1] - 2026-07-13

### Modifié

- Appels vocaux : le vumètre de votre micro est désormais une forme d'onde fluide au lieu de trois barres à seuils.

### Corrigé

- Appels vocaux : le bouton muet ne disparaît plus une fois le micro coupé - il basculait vers une icône absente de notre jeu d'icônes, laissant un bouton invisible et aucun moyen de réactiver le micro. Le mode muet affiche désormais le micro barré.
- Appels vocaux : changer d'onglet puis revenir ne raccroche plus l'appel - l'application forçait une reconnexion de son canal temps réel à chaque retour au premier plan, ce que le serveur interprète comme quitter l'appel. Elle ne se reconnecte désormais que si la connexion est réellement morte.
- Appels vocaux : le nom d'un participant qui parle ne passe plus en gras (ce qui élargissait toute la barre d'appel à chaque prise de parole) - il s'illumine désormais uniquement en couleur.

## [4.1.0] - 2026-07-13

### Ajouté

- Appels vocaux : la barre d'appel affiche désormais qui est dans l'appel, le nom de la personne qui parle s'illumine, et un vumètre à 3 barres montre votre propre micro. L'infobulle « Rejoindre l'audio » d'une ligue nomme aussi qui est déjà en ligne.
- Appels vocaux : une boîte de réglages audio dans la barre d'appel pour choisir son micro et son haut-parleur (mémorisés d'un appel à l'autre) et activer la réduction de bruit. L'annulation d'écho et le gain automatique sont désormais toujours actifs.
- Appels vocaux : parler en étant en sourdine affiche un rappel « Votre micro est coupé ».
- Chat : des lignes d'historique d'appel dans la conversation - « appel démarré / terminé (avec durée) / manqué » apparaissent dans le fil pour les MP et les salons de ligue, en direct.
- Appels vocaux : un indicateur de qualité de connexion dans la barre d'appel - une icône ambre/rouge quand la liaison se dégrade, et un avis « Reconnexion… » pendant qu'une liaison coupée se rétablit.

### Corrigé

- Appels vocaux : raccrocher un appel en MP y met désormais fin aussi pour l'autre personne - elle restait auparavant bloquée « en appel » avec un minuteur qui tournait et un bouton sourdine inopérant jusqu'à un rechargement.
- Appels vocaux : une connexion pair-à-pair coupée (changement d'onglet ou de réseau, liaison instable) se rétablit désormais automatiquement via un redémarrage ICE au lieu de rester muette jusqu'à un rappel.
- Appels vocaux : le minuteur d'appel (et les durées des lignes d'appel du chat) passe désormais en heures - « 1:07:39 » au lieu de « 67:39 ».
- Face à face : la liste « Plus grands écarts » classe désormais vos pronostics communs par écart de points, au lieu de ne montrer que les matchs où vous aviez prédit des résultats différents. Un match où vous aviez tous deux vu le même vainqueur mais où l'un a décroché le score exact avec un joker (un pronostic à 24 points contre un à 1 point) est exactement le genre d'écart que la liste cachait.
- Face à face : les noms et avatars des deux joueurs renvoient désormais vers leur page de profil.

## [4.0.1] - 2026-07-12

### Notes d'exploitation

- Le service `app` désactive désormais les vidages mémoire (`ulimits: core: 0`). Un plantage brutal de Node écrivait auparavant un fichier core de plusieurs gigaoctets dans la couche inscriptible du conteneur, ce qui pouvait remplir le disque de données Docker - allant jusqu'à mettre la base de données hors service lorsque `/var` était saturé. Un plantage se contente maintenant de redémarrer au lieu de laisser un énorme core derrière lui.

## [4.0.0] - 2026-07-12

### Notes d'exploitation

- Le dépôt est désormais un monorepo pnpm. L'application web et toute sa stack compose (`Dockerfile`, `compose*.yaml`, `.env*`) ont été déplacées sous `apps/web-nuxt/`, le contexte de build Docker restant la racine du dépôt. `mise run up`/`dev`/`preview` et `mise run release` pointent déjà vers les nouveaux chemins ; un déploiement qui invoque docker directement doit cibler `apps/web-nuxt/compose.yaml` (ou `-f apps/web-nuxt/Dockerfile` avec le contexte `.`). Aucun changement applicatif ni de base de données - l'application construite est identique.

## [3.0.3] - 2026-07-12

### Modifié

- La documentation de l'API (OpenAPI, servie sur `/_docs`) dérive désormais le schéma de requête et de réponse de chaque point d'accès de la validation du serveur elle-même, afin que le contrat publié corresponde toujours exactement à ce que chaque point d'accès accepte et renvoie.

## [3.0.2] - 2026-07-12

### Notes d'exploitation

- coturn du chat vocal : `NUXT_TURN_EXTERNAL_IP` peut rester vide pour être résolu automatiquement depuis `NUXT_TURN_HOST` au démarrage du conteneur, afin qu'un nom dyndns reste la source unique de l'IP publique du relais. `NUXT_TURN_HOST` doit être un nom que le navigateur résout directement, pas un nom passé par un CDN (Cloudflare ne peut pas transporter le TURN/UDP).

## [3.0.1] - 2026-07-12

### Notes d'exploitation

- coturn du chat vocal : le relais annonce désormais l'IP publique de l'hôte quand `NUXT_TURN_EXTERNAL_IP` est défini (nécessaire si la machine est derrière un NAT, pour que les navigateurs externes obtiennent une adresse de relais joignable), et ses ports sont configurables (`NUXT_TURN_PORT` / `NUXT_TURN_TLS_PORT` / `NUXT_TURN_MIN_PORT` / `NUXT_TURN_MAX_PORT`) pour coexister avec un autre service utilisant déjà 3478 ou la plage de relais par défaut. `mise run up` démarre désormais coturn avec la stack.

## [3.0.0] - 2026-07-12

### Ajouté

- Chat vocal. Appelez quelqu'un en tête-à-tête depuis une conversation privée, ou lancez un salon vocal de groupe dans le chat d'une ligue (éventuellement lié à un match, pour regarder ensemble). Un badge « N en vocal » indique qu'un appel de ligue est en cours, et vous pouvez y inviter des membres précis. Les appels entrants vous sonnent partout dans l'application ; un appel manqué arrive dans vos notifications (et en push, dans la nouvelle catégorie **Appels**). L'audio est pair-à-pair et chiffré de bout en bout - il ne passe jamais par le serveur.

### Notes d'exploitation

- Des appels fiables derrière un NAT strict nécessitent un relais TURN : un service **coturn** auto-hébergé, fourni derrière le profil Compose optionnel `voice` (`docker compose --profile voice up`), configuré via `NUXT_TURN_SECRET` / `NUXT_TURN_HOST` / `NUXT_TURN_REALM` (voir `.env.example`). Sans lui, l'application fonctionne en STUN seul et certains appels échoueront.

## [2.34.0] - 2026-07-12

### Ajouté

- Face à face : comparez vos pronostics à ceux d'un autre joueur. Depuis le profil d'un joueur, cliquez sur Comparer pour voir qui mène sur les matchs que vous avez tous deux vus notés, votre bilan victoires-défaites-nuls, la fréquence de vos accords sur le score et le résultat, l'avance qui bascule au fil des tours, et les matchs où vous avez le plus divergé.

### Modifié

- Les statistiques personnelles tracent désormais votre précision tour par tour sous forme de sparkline, et ajoutent une carte de série indiquant votre série de bons pronostics en cours et votre meilleure du tournoi.

## [2.33.1] - 2026-07-12

### Corrigé

- L'en-tête d'un match en direct ne reste plus bloqué sur un score après qu'un but a été refusé par la VAR. L'en-tête suit désormais le même flux de buts en direct que la liste des buteurs en dessous : un but annulé disparaît des deux à la fois, au lieu de s'attarder sur l'en-tête un tour ou deux.

## [2.33.0] - 2026-07-12

### Ajouté

- Rareté dans la vitrine à trophées : chaque badge affiche désormais la part des joueurs de la compétition qui le possèdent, par palier - de quoi voir à quel point votre collection est rare.

### Modifié

- Le Gourou de groupe est désormais gradué : trouve le résultat de tous les matchs d'un, deux ou trois groupes complets pour le bronze, l'argent, l'or.
- La route du champion a maintenant deux paliers : or pour avoir trouvé le résultat de chaque match du champion, et un nouveau palier Diamant (au-dessus de l'or) pour avoir trouvé le score exact de chacun.
- Le badge « Bête noire » est renommé « Livre ouvert » - une équipe dont vous devinez les scores exacts sans cesse.

### Corrigé

- Ouvrir la vitrine à trophées depuis le menu Succès défile désormais bien jusqu'à elle, au lieu d'être détourné par le défilement « jusqu'à maintenant » de votre profil.

## [2.32.1] - 2026-07-11

### Modifié

- Le temps additionnel ne compte plus un but inscrit dans un match à élimination directe qui tranche un match nul (un but vainqueur tardif ou un but en or). En phase finale, un nul à la 90e envoie le match en prolongation au lieu d'être définitif : ce but ne vous a donc pas vraiment fait gagner ni perdre la confrontation. Un but marqué depuis un score décisif compte toujours, y compris une égalisation tardive qui vous prive d'une avance.

## [2.32.0] - 2026-07-11

### Modifié

- Le temps additionnel mesure désormais vos vrais points - bonus de rareté et joker compris, pas seulement les points de base - et rejoue chaque match but par but : un score décroché dans le temps additionnel puis reperdu sur un but plus tardif affiche à la fois le gain et la perte. La carte détaille maintenant la répartition gagnés / perdus derrière le net et liste chaque match dont les points ont bougé dans le temps additionnel.

## [2.31.0] - 2026-07-11

### Ajouté

- Trois nouveaux succès, à débloquer au sein d'un même tournoi : **Lecteur de forme** (trouvez le résultat des matchs d'une équipe cinq fois, pour trois, cinq ou sept équipes différentes), **La route du champion** (trouvez le résultat de tous les matchs du futur champion) et **Gourou de groupe** (trouvez tous les résultats d'un même groupe). Le « résultat » désigne l'issue (victoire, nul ou défaite), pas le score exact.

## [2.30.0] - 2026-07-11

### Ajouté

- Le temps additionnel dans vos analyses personnelles : une nouvelle carte montrant combien de points les buts du temps additionnel vous ont rapportés ou coûtés, par rapport au score à la fin du temps réglementaire. Elle réévalue chaque prono face au score d'avant le temps additionnel et met en avant votre plus beau cadeau tardif et votre pire coup du sort.

## [2.29.0] - 2026-07-10

### Ajouté

- Régénérer votre code de récupération de chat : depuis un appareil où le chat fonctionne encore, créez un nouveau code depuis la zone sensible du menu de chat. L'ancien code cesse de fonctionner à l'instant même.
- Réinitialiser votre identité de chat : vous avez perdu à la fois la clé de chat de votre appareil et votre code de récupération ? Repartez de zéro avec une clé toute neuve depuis l'invite « Code de récupération perdu ? ». Vos messages privés et vos chats de ligue actuels reviennent une fois que chaque personne à qui vous parlez re-vérifie votre nouveau numéro de sécurité ; l'ancien historique de ligue déjà renouvelé reste perdu.

## [2.28.0] - 2026-07-10

### Ajouté

- Appareils connectés : ta page de compte liste désormais chaque appareil connecté à ton compte (type d'appareil, adresse IP et dernière activité), avec un bouton pour déconnecter un appareil précis et un bouton « déconnecter tous les autres appareils ». Pratique si tu t'es connecté sur un téléphone partagé ou perdu.

### Modifié

- Les votes sur la roadmap se ferment désormais dès qu'une idée est en cours ou livrée : les votes servent à décider quoi construire ensuite, ils s'arrêtent donc une fois la construction commencée. Les idées planifiées et suggérées par la communauté restent ouvertes aux votes comme avant.

### Corrigé

- Les sessions durent désormais bien plus longtemps et se prolongent au fil de ton utilisation, corrigeant les « déconnexions sans raison » - surtout visible quand l'app est installée sur l'écran d'accueil (PWA) d'un iPhone, où une connexion de courte durée pouvait être perdue lorsque l'app était fermée en arrière-plan.

## [2.27.1] - 2026-07-10

### Corrigé

- Sans faute ne se débloque plus sur une journée à moitié jouée. Dans un tour à élimination directe, seul le premier match est terminé alors que les autres restent à venir, et le pronostiquer au score exact suffisait à valider un tour parfait ; Sans faute (et Réglé d'avance) attendent désormais que tous les matchs du tour aient été joués.
- Les badges qui reflètent un classement final - un tour parfait, terminer tout le tournoi, une place sur le podium ou à la dernière place - se retirent désormais tout seuls si ce classement est annulé (par exemple après la réinitialisation d'un tournoi), au lieu de rester coincés à jamais dans votre vitrine. Les badges de série, de cumul et « bien vu » conservent votre record.
- Le badge Glacial affiche désormais son pouce vers le bas dans le classement, comme sur la vitrine des trophées, au lieu d'une coche générique.
## [2.27.0] - 2026-07-09

### Ajouté

- Cinq nouveaux badges. Grande finale (pronostiquer la finale du tournoi au score exact - le pendant de Premier sang). Match nul vierge (annoncer un 0-0 pile). Festival de buts (deviner exactement un match d'au moins cinq buts). Bête noire (réussir le score exact des matchs d'une même équipe trois fois). Réglé d'avance (pronostiquer toute une journée sans jamais modifier un pronostic).
- Les badges de série (Série chaude, En feu) affichent désormais votre série en cours à côté de votre record, tant que le badge continue de grimper, pour voir la série sur laquelle vous êtes en ce moment et pas seulement votre record.

### Modifié

- « Lever de rideau » s'appelle désormais « Premier sang » (réussir le match d'ouverture du tournoi), et l'ancien « Premier sang » (votre premier score exact d'une compétition) devient « La chasse est ouverte ». Chaque badge garde sa propre icône.
- Sans faute (une journée parfaite) ne compte plus la finale ni le match pour la troisième place : ce sont des journées à un seul match, déjà récompensées par leur propre badge, donc Sans faute désigne désormais un sans-faute sur une vraie journée à plusieurs matchs.

### Corrigé

- Les badges de rythme de pronostic (Lève-tôt, Noctambule, Sur le fil) se débloquent désormais dès que vous enregistrez le pronostic concerné, au lieu d'attendre que le match suivant soit noté - pronostiquer dans les cinq dernières minutes avant le coup d'envoi accorde Sur le fil immédiatement.
- « Mes trophées » dans le menu défile de nouveau directement vers votre vitrine, au lieu que le défilement du profil vers le dernier match ne vole le focus d'abord.

## [2.26.0] - 2026-07-05

### Ajouté

- Barres de progression de la vitrine des trophées : chaque badge que vous n'avez pas encore porté au maximum indique désormais votre distance jusqu'au palier suivant - « 3 / 5 » vers l'échelon suivant, affiché aussi sur les badges verrouillés, pour voir ce que vous visez et pas seulement ce que vous détenez déjà.
- Carte de profil partageable : un bouton Partager sur votre propre profil génère un lien vers une carte détaillée de votre classement (rang, points, scores exacts, butin de trophées et de badges) qui s'ouvre sans connexion, avec un aperçu quand vous l'envoyez à des amis. Fonctionne en cours de tournoi, pas seulement à la fin.
- Analyses personnelles partageables : un bouton Partager sur votre page d'analyses génère le même type de lien vers une carte de vos biais de pronostic (précision, taux d'exacts, biais de buts, biais domicile), consultable sans connexion.

## [2.25.1] - 2026-07-05

### Modifié

- Les rappels « Terminez vos pronostics » par ligue ne répètent plus la bannière « N match à pronostiquer ». Le panneau et les pastilles par match ne signalent désormais une ligue que lorsqu'elle demande quelque chose que la bannière ne dit pas - un score exact pour une ligue normale, ou une mise pour une ligue difficile. Un pronostic manquant n'apparaît qu'une fois, dans la bannière, pour que les rappels restent lisibles quand vous êtes dans de nombreuses ligues.

### Corrigé

- Changer de compétition depuis la page d'analyses personnelles (ainsi que les pages du bot de consensus et du Wrapped) vous garde désormais sur cette même page pour la nouvelle compétition, au lieu de vous renvoyer vers ses matchs.
- La carte grise désormais les perdants d'une demi-finale dans un tournoi sans match pour la troisième place, comme l'Euro, où la France et les Pays-Bas restaient non grisés après avoir perdu leurs demi-finales.

## [2.25.0] - 2026-07-05

### Ajouté

- Page d'analyses : un bilan par compétition de vos propres pronostics - comment vos choix sont tombés (score exact / écart / résultat / raté), si vous surestimez ou sous-estimez les buts, votre penchant pour les victoires à domicile et les nuls, les équipes que vous surestimez et sous-estimez, votre précision tour par tour, votre meilleur prono et votre plus gros raté. Accessible depuis le menu une fois connecté, et contrairement au Wrapped, disponible en cours de tournoi.

## [2.24.0] - 2026-07-05

### Modifié

- Le classement par ligue affiche désormais les mêmes lignes détaillées que le classement de la compétition : flèches de mouvement de rang, couronne du champion, soulier d'or et points provisoires en direct, au lieu d'une liste plus sobre.

## [2.23.1] - 2026-07-05

### Corrigé

- **Messages directs** : une conversation active n'inonde plus la cloche de notifications d'une entrée par message - toutes les notifications de messages directs sont désormais regroupées en une seule entrée. Un clic ouvre la conversation lorsqu'il n'y en a qu'une, ou la boîte de réception des messages lorsque plusieurs personnes ont écrit, au lieu de vous renvoyer à la page d'accueil.

## [2.23.0] - 2026-07-05

### Ajouté

- Empreinte d'intégrité du code client sur la page À propos : le SHA-256 du bundle JavaScript réellement servi à votre navigateur, à comparer avec l'empreinte publiée pour une version afin de détecter un remplacement silencieux du code de chiffrement de bout en bout.
- Régénérez le lien de votre flux de calendrier : un bouton dans les Préférences révoque toutes les URL d'abonnement partagées auparavant et en émet une nouvelle, au cas où un lien aurait fuité.
- Transparence des clés pour le chat : la fenêtre de vérification signale un membre dont la clé de chiffrement ne correspond pas au journal public et infalsifiable des clés, détectant une clé substituée.

### Modifié

- Les liens de carte de pronostic et de récap partagés expirent désormais après 180 jours au lieu d'être permanents.

### Sécurité

- Le chat renouvelle automatiquement ses clés quand un membre quitte une ligue, afin que son ancienne clé ne puisse plus déchiffrer les messages envoyés ensuite.
- Les totaux de pronostics de la foule sont masqués pour un match n'ayant qu'un ou deux pronostics, afin qu'une petite ligue ne révèle pas le pronostic non verrouillé d'un individu.
- Les codes à deux facteurs sont désormais à usage unique et ne peuvent pas être rejoués pendant leur fenêtre de validité.
- Renforcement de la vérification à deux facteurs pour la suppression de compte, de la gestion des requêtes multi-origines et des en-têtes de réponse ; l'application refuse de démarrer avec un secret manquant ou faible.

## [2.22.1] - 2026-07-05

### Corrigé
- **Jumeau maléfique** : consulter le Jumeau maléfique d'un joueur n'affiche plus une seconde fois sa propre liste de pronostics sous le tableau du jumeau.
- **Armoire à trophées** : l'entrée de menu « Mes accomplissements » et les notifications d'accomplissement défilent désormais directement jusqu'à votre armoire à trophées.

## [2.22.0] - 2026-07-05

### Ajouté
- **Modes de ligue** : une ligue peut désormais être créée dans l'un des trois nouveaux modes (son mode est verrouillé dès le coup d'envoi de la compétition). **Facile** - désignez seulement le vainqueur ou le nul, et marquez selon les cotes, les outsiders rapportant davantage. **Difficile** - pronostiquez les scores et misez un budget de confiance sur chaque journée ; un pronostic juste rapporte votre mise et le score exact rapporte le double. **Extrême** - le dernier joueur en lice, où un mauvais pronostic coûte une vie (le propriétaire choisit combien) et où l'épuisement de vos vies vous élimine, les survivants gagnant ensemble. Chaque ligue affiche son mode et un classement adapté (un tableau de points, ou une liste de survie pour l'extrême).

## [2.21.1] - 2026-07-05

### Corrigé
- **Les images de description de ligue s'envoient de façon fiable** : les images ajoutées à la description d'une ligue sont désormais réduites dans votre navigateur avant l'envoi, pour que les photos volumineuses n'échouent plus à l'ajout.

## [2.21.0] - 2026-07-05

### Ajouté
- **Messages directs** : envoyez des messages privés, en tête-à-tête, à un autre joueur depuis un nouveau dock de messagerie dans le coin de chaque page. Comme le chat de ligue, ils sont chiffrés de bout en bout - vous seul et votre interlocuteur pouvez les lire, jamais le serveur. Vous pouvez écrire à toute personne avec qui vous partagez une ligue, ainsi qu'à quiconque a choisi d'être trouvable (un réglage que vous pouvez désactiver pour vous-même). Vous recevez une notification dans la cloche et une notification push (si elle est activée) à l'arrivée d'un message, et vous pouvez modifier un message que vous avez envoyé.

## [2.20.0] - 2026-07-05

### Ajouté
- **Visite guidée pour les nouveaux joueurs** : une visite en surbrillance qui assombrit la page et met en avant une chose à la fois - changer de tournoi, pronostiquer un score, choisir le champion et le meilleur buteur, grimper au classement, recevoir les notifications en direct et discuter avec votre ligue. Elle se lance d'elle-même une fois pour un tout nouveau compte (juste après l'invitation à « rejoindre une ligue ») et peut être rejouée à tout moment depuis le menu du compte.

## [2.19.0] - 2026-07-05

### Ajouté
- **Composez votre liste de prix** : les propriétaires et modérateurs de ligue peuvent désormais attacher un prix à l'un des onze critères (les cinq d'origine plus Cuillère de bois, Sage de la finale, Oracle des poules, Oracle des phases finales, Fine gâchette et Gourou des écarts) et ajouter ou retirer des prix librement, un par critère. Chaque prix affiche toujours son leader en direct et son classement complet.
- **Une description pour chaque ligue** : les propriétaires et modérateurs peuvent rédiger un texte « À propos de cette ligue » - présentation, règles, ce que vous voulez - en Markdown, avec titres, listes, liens et images téléversées. Tous ceux qui voient la ligue le voient.

### Modifié
- **L'équipe du Spécialiste d'équipe se choisit désormais par ligue** : au lieu d'une seule équipe choisie à l'échelle du site dans l'admin, chaque propriétaire ou modérateur de ligue choisit l'équipe que suit son prix Spécialiste d'équipe, là où il définit le prix. Tant qu'aucune n'est choisie, ce prix s'affiche comme désactivé.

### Supprimé
- **Section Compétitions de l'admin** : le sélecteur d'équipe à l'honneur par compétition a disparu, remplacé par le réglage par ligue ci-dessus. Le trophée global Spécialiste d'équipe dans la vitrine n'est plus attribué (ceux déjà gagnés restent affichés).

### Notes de mise à jour
- L'équipe à l'honneur est passée de la compétition à chaque ligue ; les ligues qui avaient un prix Spécialiste d'équipe doivent faire choisir à nouveau leur équipe par un propriétaire ou modérateur pour le réactiver.

## [2.18.2] - 2026-07-05

### Corrigé
- **Le Spécialiste d'équipe récompense chaque score exact, pas seulement le « meilleur »** : le prix Spécialiste d'équipe (et son trophée) revient désormais à toute personne qui trouve un score exact sur un match de l'équipe à l'honneur - chaque score exact est une victoire, il y a donc plusieurs gagnants, et cliquer sur le prix affiche le nombre de scores exacts (récompenses gagnées) de chaque joueur plutôt qu'un classement aux points.
- **Le menu déroulant d'équipe à l'honneur (admin) s'aligne avec son en-tête** : le sélecteur « Équipe à l'honneur » de la section Compétitions n'est plus décalé par rapport à son titre.

## [2.18.1] - 2026-07-05

### Corrigé
- **La Lanterne rouge ne compte que si vous avez vraiment joué** : le badge « bon dernier » revient désormais au dernier joueur ayant pronostiqué au moins la moitié du tournoi, si bien que celui qui a abandonné après un ou deux matchs est considéré comme un déserteur plutôt que comme le perdant - et ne vole plus le badge au véritable dernier.

## [2.18.0] - 2026-07-05

### Ajouté
- **Deux nouveaux succès** : **Lever de rideau** - trouvez le score exact du tout premier match du tournoi (un badge rare, de rang or) - et, pour la postérité, deux badges « ratés » pince-sans-rire : **Glacial** (cinq erreurs d'affilée) et **Lanterne rouge** (finir bon dernier). Les badges « ratés » ne comptent jamais pour le secret caché du « collectionneur ».
- **Des critères clairs sur chaque badge et trophée** : survoler une tuile de la vitrine à trophées montre désormais exactement comment l'obtenir - seuils compris - qu'elle soit verrouillée ou déjà à vous, en remplacement du vague « continuez à jouer » d'avant.

### Modifié
- **L'ami des outsiders est enfin atteignable** : il se débloque quand votre pronostic champion, classé hors du top 15 FIFA (ou non classé), finit par l'emporter - au lieu de l'ancien seuil rang 41+ que presque aucune équipe réelle ne pouvait atteindre.

### Corrigé
- **Le Complétiste attend le coup de sifflet final** : le badge « tous les matchs pronostiqués » ne se débloque plus qu'une fois le tournoi réellement terminé, et non en cours de route quand vous aviez seulement suivi tous les matchs joués jusque-là. Le badge du top trois « Sur le podium » et la nouvelle Lanterne rouge se règlent de la même façon, à la fin.

## [2.17.0] - 2026-07-05

### Ajouté
- **Voir le classement complet derrière chaque récompense** : cliquez sur une récompense de ligue pour ouvrir son classement en direct pour ce critère - général, phase de groupes, phase à élimination, Madame Irma ou le Spécialiste d'équipe - qui montre où se situe chaque membre et se fige à la fin de la compétition. Votre vitrine à trophées liste aussi les récompenses que vous visez (grisées) à côté de celles que vous détenez, chacune ouvrant le même classement.
- **Équipe à l'honneur du Spécialiste d'équipe, réglée depuis l'admin** : une nouvelle section Compétitions du panneau d'administration choisit, par compétition, l'équipe suivie par la récompense Spécialiste d'équipe. Tant qu'aucune n'est choisie, cette récompense est désactivée au lieu de n'être jamais attribuée en silence.

## [2.16.3] - 2026-07-05

### Corrigé
- **L'onglet Joueurs d'un match affiche tous les buteurs de ses deux équipes** : les listes de buteurs et de passeurs par équipe étaient tirées du classement général des 20 meilleurs de la compétition, si bien qu'une équipe sans buteur dans ce top 20 semblait n'avoir rien marqué, et les buteurs moins prolifiques d'une grande équipe étaient écartés. L'onglet répertorie désormais chaque but et chaque passe décisive inscrits par ses deux équipes.

## [2.16.2] - 2026-07-04

### Corrigé
- **Attribuer les badges de succès gagnés avant l'arrivée de la fonctionnalité** : un nouveau job de la page Tâches en arrière-plan (admin) attribue tous les badges d'étape que les joueurs avaient déjà gagnés dans les compétitions passées ou terminées. Ces badges ne se débloquaient sinon qu'au moment où un match était nouvellement noté, si bien que les résultats historiques - et toute compétition déjà terminée - ne les recevaient jamais.

## [2.16.1] - 2026-07-04

### Corrigé
- **La saisie semi-automatique des mentions partout** : la liste de suggestions de membres apparaît désormais aussi dans les réponses en fil et lors de la modification d'un message, pas seulement dans le champ principal.
- **Les mentions s'affichent avec le nom dans les aperçus de réponse** : une mention dans un message cité ou auquel on répond affiche maintenant le nom de la personne (par exemple @Sam) au lieu d'un identifiant brut, dans la bannière « en réponse à », l'aperçu du message parent cité et la file de signalements.
- **Restez connecté sur une connexion instable** : une requête perdue en itinérance ou sur des données mobiles capricieuses ne vous renvoie plus vers l'écran de connexion tant que votre session est valide.
- **Les mises à jour en direct se rétablissent sur mobile** : l'application détecte désormais quand un réseau mobile a silencieusement coupé la connexion en direct (fréquent en 4G/5G lors du changement de cellule) et se reconnecte d'elle-même, pour que scores, chat et notifications continuent d'arriver sans rechargement manuel.

## [2.16.0] - 2026-07-04

### Ajouté
- **Le bot Égaliseur** : un nouveau bot qui pronostique un match nul à chaque rencontre. Activez-le (ainsi que le Crowd Bot) depuis un seul bouton « Bots » sur le classement - chacun apparaît comme une ligne fantôme au rang qu'il aurait obtenu, avec sa propre page listant chaque pronostic. Il n'affecte jamais le classement réel de qui que ce soit.
- **Jumeau maléfique sur les profils des joueurs** : le profil de chaque joueur a un bouton « Jumeau maléfique » - ses propres pronostics avec chaque score inversé (un match nul est son propre jumeau) - pour voir ce qu'aurait donné un pari contre lui, et à quel rang ce jumeau se classerait. Suit la même visibilité que ses pronostics.

## [2.15.0] - 2026-07-04

### Ajouté
- **Tournament Wrapped** : une fois la finale jouée, votre rétrospective personnelle du tournoi se débloque - une histoire en plein écran que vous faites défiler d'une touche : points totaux, classement final et top pour cent, détail des scores exacts, votre meilleur pronostic, celui qui vous a échappé, efficacité des jokers, votre remontée au classement, pronostics à contre-courant, verdicts du champion et du Soulier d'or, activité du chat de ligue et votre palmarès. Elle se termine sur une carte récapitulative que vous pouvez télécharger ou partager en image, et une bannière sur le classement vous y emmène.

### Corrigé
- **« Spectateurs en direct » ne compte plus vos onglets en double** : ouvrir le même match dans plusieurs onglets vous compte comme un seul spectateur, pas un par onglet. Deux personnes différentes (ou deux invités) comptent toujours pour deux.

## [2.14.0] - 2026-07-04

### Ajouté
- **Prix de ligue** : un propriétaire ou modérateur de ligue peut désormais attribuer un vrai prix (un intitulé, une photo facultative, une note et un lien) à chacun des cinq lauréats - meilleur au général, meilleur en phase de groupes, meilleur en phase à élimination directe, plus de scores exacts, et meilleur pronostiqueur de l'équipe mise en avant. Chaque membre voit les prix sur la page de la ligue avec qui mène actuellement chacun (cela se met à jour au fil des matchs et se fige à la fin), et votre propre vitrine affiche les prix que vous détenez actuellement dans vos ligues.
- **Mettez vos succès en vitrine dans les classements** : choisissez jusqu'à trois de vos succès et ils apparaissent désormais sous forme de petits badges à côté de votre nom dans les classements.
- **Accès plus rapide** : un raccourci « Mes succès » dans le menu du compte ouvre votre vitrine.

### Modifié
- Le « frigo » soigné devient la « vitrine » : il contient jusqu'à trois de vos succès (ceux affichés à côté de votre nom dans les classements).

## [2.13.1] - 2026-07-04

### Corrigé
- **Le multi-vue ne force plus de barre de défilement** : la grille des matchs réserve désormais la place du pied de page, si bien que la page remplit exactement la fenêtre au lieu de repousser le pied de page juste hors de l'écran.
- **Le fil du multi-vue reste dans sa tuile** : le fil de chaque cellule défile désormais à l'intérieur de la tuile au lieu d'étirer la cellule et toute la page, et il s'affiche dans chaque tuile démarrée, pas seulement celle sélectionnée.
- **Les notifications de succès et de trophées ouvrent votre vitrine** : cliquer sur une notification de succès débloqué ou de trophée vous amène désormais à votre vitrine à trophées, même pour les badges hors compétition, au lieu de vous déposer sur la page d'accueil.
- **Sélecteur de ligue du chat** : le sélecteur de ligue du volet ne liste plus les ligues sans chat, et n'affiche que l'icône de ligue pour que son libellé n'encombre pas le bouton match/ligue dans le volet étroit (les noms complets restent dans le menu déroulant). Activer le chat d'une ligue la fait désormais apparaître dans le sélecteur sans recharger la page.
- **Fraîcheur de la feuille de route** : revenir à la feuille de route (tableau public ou éditeur admin) la recharge désormais, si bien qu'une suggestion ajoutée ailleurs apparaît sans rafraîchissement manuel.

## [2.13.0] - 2026-07-02

### Modifié
- **La feuille de route est désormais un tableau** : la feuille de route se lit en colonnes côte à côte - suggestions de la communauté, planifié, en cours et livré - au lieu d'une liste empilée, pour saisir tout le pipeline d'un coup d'œil (balayez latéralement sur écran étroit).

## [2.12.0] - 2026-07-02

### Ajouté
- **Proposer et voter pour des fonctionnalités de la feuille de route** : la page feuille de route dispose désormais d'une section suggestions communautaires - connecté, proposez une fonctionnalité en quelques mots et elle apparaît aussitôt, marquée « en cours d'examen » jusqu'à ce que nous la retenions, pour que chacun puisse voter. Vous pouvez aussi voter pour n'importe quel élément de la feuille de route, et les suggestions sont classées par votes afin que les idées les plus demandées remontent en tête.

## [2.11.0] - 2026-07-02

### Ajouté
- **Multi-vue** : suivez plusieurs matchs à la fois dans une grille configurable (1, 2x1, 2x2 ou 3x3). Chaque cellule affiche une tuile en direct - score, horloge, buteurs et fil du match - ou bascule vers le flux vidéo du match lorsqu'il y en a un. Les matchs et la disposition que vous choisissez vivent dans l'URL, donc une multi-vue est partageable et survit à un rechargement. La fenêtre de chat suit la cellule que vous mettez au premier plan, et cliquer sur un match dans la boîte de réception du chat saute vers sa cellule au lieu de quitter la grille.

## [2.10.0] - 2026-07-02

### Ajouté
- **Vitrine à trophées et « mon frigo »** : chaque joueur dispose désormais d'une vitrine à trophées sur son profil. Remportez un trophée de fin de compétition - meilleur au classement général, meilleur de la phase de groupes, meilleur des phases finales, le plus de scores exacts (« Madame Irma »), ou meilleur pronostiqueur de l'équipe à la une - et il y apparaît, aux côtés des badges de réussite débloqués en jouant (premier score exact, séries en cours, battre la foule, et bien d'autres, en bronze/argent/or). Épinglez vos préférés sur votre « frigo » pour les exhiber, et recevez une notification dès que vous en gagnez un.

## [2.9.1] - 2026-07-02

### Corrigé
- **Lacunes de traduction en arabe et en français comblées** : la console d'administration SSO est désormais entièrement traduite en arabe (certaines chaînes s'affichaient auparavant sous forme de clés brutes dans les panneaux d'onboarding et SCIM), et le contrôle d'ancrage/détachement de la fenêtre de chat a maintenant ses libellés en français.

## [2.9.0] - 2026-07-02

### Ajouté
- **Onboarding SSO guidé** : enregistrer un fournisseur d'identité passe désormais par les étapes brouillon -> test -> vérification -> activation au lieu d'être mis en ligne dès l'enregistrement. Vous pouvez lancer un test de connexion automatisé (découverte OIDC/JWKS, certificat et accessibilité des points de terminaison SAML), effectuer une véritable « connexion de test » OIDC qui prévisualise les revendications exactes renvoyées par l'IdP mappées sur nos champs, et vérifier la propriété du domaine e-mail via un enregistrement DNS TXT - ou la contourner en tant qu'administrateur. Les fournisseurs peuvent être activés, temporairement désactivés ou conservés en brouillon ; désactiver bloque les nouvelles connexions mais laisse fonctionner les sessions existantes.
- **Provisionnement SCIM** : les fournisseurs d'identité peuvent créer, mettre à jour et désactiver des utilisateurs automatiquement via SCIM 2.0. Générez un jeton par fournisseur depuis la console d'administration (affiché une seule fois) ; désactiver un utilisateur depuis l'IdP bloque sa connexion et met fin à ses sessions tout en conservant intacts ses ligues, ses pronostics et son historique, et le réactiver restaure l'accès.

## [2.8.1] - 2026-07-02

### Corrigé
- **Une installation toute neuve fonctionne avant tout import de matchs** : une base de données fraîchement migrée reçoit désormais une configuration de score par défaut au démarrage, si bien que les sélecteurs de champion et de meilleur buteur (et la finalisation des matchs) fonctionnent immédiatement, au lieu d'échouer avec « aucune configuration de score active » jusqu'à ce que le premier import de matchs en crée une.

## [2.8.0] - 2026-07-02

### Ajouté
- **Changer de ligue depuis le chat** : la fenêtre de chat indique désormais quelle ligue vous lisez et vous permet d'en changer directement, sans remonter jusqu'à la pastille de ligue. Sa liste signale toute ligue ayant des messages non lus.
- **Ligne « Nouveaux messages » dans le chat** : ouvrir un salon trace un séparateur à l'endroit de votre dernière lecture, pour voir d'un coup d'œil où vous en étiez. Il reste en place pendant que vous rattrapez votre retard et disparaît une fois tout lu.

### Corrigé
- **Le chat ne marque plus comme lu ce que vous ne pouvez pas encore lire** : ouvrir une ligue ou y basculer alors que cet appareil ne peut pas encore déchiffrer ses messages (vous n'avez pas saisi votre code de récupération, ou la clé ne vous est pas parvenue) n'efface plus son badge de non-lus. Elle reste non lue et ne s'efface qu'une fois les messages réellement lisibles.

## [2.7.0] - 2026-07-01

### Ajouté
- **Arabe, de droite à gauche** : Nostragoalus est désormais disponible en arabe, avec toute l'interface inversée pour se lire de droite à gauche - menus, mises en page et tableau à élimination directe compris. Choisissez-le dans le sélecteur de langue.

## [2.6.0] - 2026-06-30

### Ajouté
- **Fournisseurs d'identité SSO auto-hébergés** : un fournisseur SSO interne ou auto-hébergé dont le point de terminaison de jeton se trouve sur un réseau privé fonctionne désormais - définissez NUXT_SSO_TRUSTED_ORIGINS sur son origine et le flux de connexion lui fait confiance, là où la protection intégrée refuse autrement un fournisseur à adresse privée. Les fournisseurs publics comme Google ne changent rien.

### Corrigé
- **Fini les alertes de but en double** : une notification de but n'est désormais envoyée que lorsque le score en direct dépasse le plus haut score déjà annoncé, si bien qu'un but refusé par la VAR qui fait brièvement baisser le score avant qu'il ne remonte ne pousse plus deux fois le même but.
- **Les matchs suspendus comptent comme en direct** : un match interrompu en cours de jeu (suspendu ou interrompu) est désormais traité comme en direct sur la bannière d'accueil, la carte du monde et la page du match, comme sur la liste des matchs, au lieu de paraître pas encore commencé.
- **L'historique du chat ne saute plus de messages** : charger d'anciens messages pouvait en perdre ou en répéter un quand plusieurs étaient envoyés au même instant, juste à une limite de page. La pagination utilise désormais un départage stable pour que chaque message apparaisse exactement une fois. Le même correctif s'applique au fil des notifications.

### Sécurité
- **Les abonnements push ne peuvent plus être détournés** : le point de terminaison push d'un navigateur n'est plus réattribué à un autre compte lors d'un nouvel abonnement, de sorte que quelqu'un qui découvre le point de terminaison de votre appareil ne peut pas le détourner pour faire taire vos notifications ou les rediriger.
- **L'existence d'une ligue reste privée** : tenter de gérer une ligue privée dont vous ne faites pas partie renvoie désormais le même « introuvable » qu'une ligue qui n'existe pas, au lieu d'un « interdit » qui confirmait son existence.
- **Les aperçus de liens sont limités** : le récupérateur d'aperçus de liens du chat plafonne désormais sa fréquence par compte et au global, et refuse une réponse trop volumineuse avant de la lire, réduisant son usage comme vecteur d'amplification de requêtes ou de scraping.

## [2.5.0] - 2026-06-30

### Ajouté
- **Ne manquez plus un pronostic** : la page des matchs indique désormais combien de matchs à venir attendent encore un score avant le prochain verrouillage, avec un bouton « Aller au premier » qui défile droit vers le match non pronostiqué le plus proche.
- **Repérer les scores aberrants** : saisir un score extravagant (8 buts ou plus pour une équipe, ou 12 ou plus au total) vous demande désormais de confirmer avant l'enregistrement, pour qu'une faute de frappe comme 1-33 ne soit pas verrouillée par erreur. Vous pouvez toujours confirmer volontairement.
- **Mouvement des cotes et détail par bookmaker** : le petit affichage des cotes montre désormais comment chaque cote a évolué depuis son ouverture - un repère par issue selon qu'elle a raccourci, dérivé ou est restée inchangée, avec l'ampleur du mouvement - et vous pouvez le toucher pour déplier les cotes d'ouverture et le 1X2 par bookmaker (quand le fournisseur les communique). Cotes décimales partout, comme avant.
- **« Un de vos anciens pronostics visait juste »** : sur un match que vous avez pronostiqué, une fois qu'il a commencé, la page du match peut vous dire qu'un score choisi plus tôt puis changé aurait mieux marqué que celui que vous avez gardé - « votre ancien 1-0 aurait marqué, celui que vous avez abandonné. » Pendant le direct c'est provisoire et se met à jour avec le score, se figeant au coup de sifflet final. Si le pronostic antérieur gagnant était 0-0, il a droit à une réplique plus taquine. Ne montre jamais que vos propres anciens pronostics, à vous seul.
- **Voyez qui regarde aussi** : une page de match en direct affiche désormais « N spectateurs en ce moment » - un compte en temps réel du nombre de personnes sur ce match à l'instant, qui se met à jour quand elles arrivent et repartent.
- **Tableau à élimination en direct** : le tableau se met désormais à jour au fil des matchs - les scores et les séances de tirs au but évoluent sur place, un marqueur DIRECT apparaît sur les confrontations en cours, et les vainqueurs avancent au tour suivant sans rechargement.

### Corrigé
- **Tirs au but en direct** : le score de la séance de tirs au but sous un match s'incrémente désormais à mesure que les tirs sont tentés, sur la page du match comme sur la liste des matchs, au lieu de rester vide ou figé jusqu'au rechargement. Le score du temps réglementaire au-dessus reste inchangé.
- **Score des tirs au but dans le fil** : chaque tir au but converti dans le fil play-by-play affiche désormais le décompte courant de la séance (1-0, 1-1, 2-1...) au lieu de répéter le score réglementaire figé à chaque ligne.

## [2.4.0] - 2026-06-30

### Ajouté
- **Boîte de réception du chat inter-ligues** : la liste des « salons avec activité » du dock de chat rassemble désormais les salons non lus de toutes les ligues auxquelles vous appartenez, et non plus seulement celle que vous consultez, et elle survit à un rechargement de page (elle ne se réinitialise plus à vide quand vous actualisez). Choisir un salon y saute directement, en changeant de ligue si nécessaire.
- **Alertes de mention** : être @mentionné dans le chat d'une ligue vous envoie désormais une notification push web et une notification dans la cloche d'en-tête, quelle que soit la ligue ou le match concerné, avec un lien direct vers ce salon. Activez-les dans les Préférences, dans la liste des notifications push.
- **Horodatage complet au survol** : survoler l'heure d'envoi d'un message de chat révèle désormais sa date et son heure complètes.

## [2.3.0] - 2026-06-30

### Ajouté
- **Le journal des modifications parle votre langue** : les notes de version dans l'app (l'entrée « Quoi de neuf » et la page À propos) se lisent désormais dans la langue que vous avez choisie, retombant sur l'anglais pour tout ce qui n'est pas encore traduit, au lieu d'être toujours en anglais.
- **Les profils s'ouvrent sur l'action** : le profil d'un joueur défile désormais là où son historique rejoint le présent - les derniers pronos et ceux en direct - au lieu de commencer en haut d'un long historique de pronos.

## [2.2.1] - 2026-06-30

### Corrigé
- **Appariements du tableau à élimination directe** : le tableau relie désormais chaque match des huitièmes (et au-delà) aux bons matchs sources. Auparavant chaque appariement pouvait être erroné - il supposait que le fournisseur listait les matchs dans l'ordre des numéros de match, ce que le flux de la Coupe du monde 2026 ne fait pas - de sorte que l'arbre montrait des équipes se rencontrant aux mauvais endroits. Il suit maintenant les numéros de match officiels de la FIFA.
- **Meilleurs passeurs corrects** : le classement des passes décisives de l'onglet Stats correspond désormais aux chiffres officiels. Il était auparavant construit à partir de la liste des meilleurs buteurs (de sorte qu'un meneur de jeu avec beaucoup de passes mais peu de buts n'apparaissait jamais) et, pour une Coupe du monde en cours, se rabattait sur des passes approximatives calculées localement. Les passes décisives sont maintenant classées séparément et, pendant une Coupe du monde, tirées des statistiques officielles des joueurs en direct de la FIFA.
- **Les joueurs à égalité partagent un rang** : dans les classements Stats, les joueurs à égalité de buts (ou de passes) affichent désormais le même numéro de position, le joueur suivant sautant en avant (1, 2, 2, 2, 2, 6...), au lieu d'être numérotés arbitrairement.

## [2.2.0] - 2026-06-28

### Ajouté
- **Onglet statistiques des joueurs** : la vue des matchs a un nouvel onglet « Stats » à côté de Calendrier et Classement, montrant côte à côte les meilleurs buteurs et les meilleurs passeurs de la compétition. De la place pour évoluer vers des classements d'équipes (meilleure attaque/défense) plus tard.

### Modifié
- **Images de stockage objet épinglées** : les images rustfs et minio/mc fournies sont désormais épinglées à des empreintes précises, de sorte que reconstruire ou re-télécharger la stack ne peut plus remplacer silencieusement le backend de stockage ou le client de sauvegarde.

## [2.1.0] - 2026-06-28

### Ajouté
- **Installez l'app depuis l'app** : quand votre navigateur propose d'installer Nostragoalus, une bannière met désormais l'offre en avant avec un bouton Installer, au lieu de la laisser enfouie. La fermer mémorise votre choix pour qu'elle cesse de vous solliciter.

### Modifié
- **Mise à jour plus claire** : la bannière de nouvelle version affiche désormais une étape « téléchargement de la mise à jour » pendant que la prochaine version se télécharge, pour que l'invite de rechargement arrive comme l'aboutissement de quelque chose de visible plutôt qu'en surgissant de nulle part. Sur téléphone, elle s'affiche sur toute la largeur en bas plutôt qu'en bandeau à l'étroit en haut.

## [2.0.0] - 2026-06-28

### Ajouté
- **Vrai stockage d'images** : les avatars et les images du chat vivent désormais dans un backend de stockage configurable - un chemin de fichiers, ou n'importe quel service compatible S3 - au lieu d'être dans la base de données. La stack Docker fournit un service S3 (rustfs) et y pointe l'app par défaut. Une migration unique (la tâche `media:migrate-blobs` sur la page admin Tâches de fond) sort les images existantes de la base de données ; lancez-la jusqu'à ce que les deux compteurs atteignent zéro.

### Modifié
- **Les sauvegardes incluent désormais les images** : `mise run db-backup` exporte la base de données et copie le stockage d'images en même temps, appariés par horodatage, et `mise run db-restore` restaure les deux d'un coup (passez `--no-media` pour ignorer le côté images sur un déploiement en fichiers seuls).

## [1.42.1] - 2026-06-28

### Corrigé
- **Les aperçus de liens fonctionnent à nouveau** : un changement de la 1.42.0 faisait récupérer les aperçus au serveur d'une façon que beaucoup de sites (ceux derrière Cloudflare comme 9gag) rejettent, si bien que les aperçus revenaient vides en silence. Ils se chargent à nouveau, et la protection contre les hôtes privés/internes reste en place.

## [1.42.0] - 2026-06-28

### Ajouté
- **Statut en ligne sur les avatars** : un point indique si quelqu'un est présent - vert quand la personne est active, ambre quand elle est en ligne mais inactive, rien quand elle est hors ligne - partout où son avatar apparaît.
- **Fils** : ouvrez le fil d'un message pour répondre dans une conversation annexe ciblée qui reste hors du salon principal ; un lien « N réponses » apparaît quand un fil a de l'activité. C'est distinct d'une simple réponse, qui cite toujours le message en ligne dans le salon.
- **Mentions** : tapez `@` dans le champ de saisie pour choisir un membre de la ligue - son nom s'affiche pendant que vous écrivez et modifiez, renvoie vers son profil, et continue de fonctionner même s'il se renomme plus tard. Quand quelqu'un vous mentionne, la bulle de chat réduite affiche un badge distinct (toujours compté dans le total global de non-lus) et le menu des salons signale dans quel salon c'est.
- **Sélecteur d'emoji** : un bouton emoji à côté du bouton image ouvre un sélecteur recherchable et classé par catégories qui insère l'emoji dans votre message.
- **GIF** : collez un lien GIF pour l'afficher en ligne (animé, rien n'est stocké), ou joignez un GIF depuis votre appareil et il reste animé.
- **Images en ligne** : collez un lien d'image et elle s'affiche directement dans le message - repliable, rien n'est stocké.
- **Aperçus de liens** : le premier lien d'un message se déploie en une carte repliable avec le titre, la description et l'image de la page.
- **Rechercher dans le chat** : un bouton de recherche filtre les messages chargés par texte (noms mentionnés compris).
- **Modifier avec les flèches** : appuyez sur Haut dans un champ de message vide pour modifier votre dernier message ; Haut/Bas pendant la modification passent d'un de vos messages à l'autre.
- **Limite de longueur des messages** : les messages sont plafonnés à 2000 caractères, avec un compteur en direct qui avertit à l'approche et bloque l'envoi au-delà, en expliquant pourquoi.

### Modifié
- **Vos propres messages s'alignent désormais à droite** du chat, comme dans une messagerie classique, ceux des autres restant à gauche.
- **La vérification des clés passe dans une fenêtre** : le panneau du numéro de sécurité s'ouvre en modale depuis le menu du chat, pour ne plus encombrer l'étroite fenêtre de chat.
- **Le champ de message défile** au-delà de quelques lignes au lieu de grandir sans fin.
- **Les changements de nom affiché apparaissent dans le chat en direct**, sans rechargement.
- **Partager un prono dans le chat respecte l'onglet ouvert** : si vous êtes sur le chat du match, le prono y atterrit au lieu d'aller toujours dans le salon de la ligue.

### Corrigé
- **Les liens d'invitation ne font plus rejoindre automatiquement** : ouvrir une invitation vous demande de confirmer, avec la possibilité de refuser.
- **Les noms d'utilisateur non latins s'affichent dans l'image de partage** au lieu de montrer des carrés vides.
- **Plus de liens obtiennent un aperçu** : les sites qui refusaient notre ancienne requête (ex. 9gag) se déploient désormais.

### Sécurité
- **Les aperçus de liens sont récupérés en toute sécurité** : le récupérateur d'aperçus refuse les hôtes privés/internes et épingle chaque requête à l'adresse qu'il a validée, pour qu'un lien piégé ne puisse pas atteindre des services internes via le serveur (protection SSRF).

## [1.41.0] - 2026-06-26

### Ajouté
- **Filtrer la carte du monde par tendance de la foule** : la légende des tendances de la carte (Outsider / Équilibré / Favori, et Éliminé) est désormais cliquable - touchez un libellé pour masquer ce groupe de drapeaux, touchez à nouveau pour les ramener, comme les filtres du calendrier.

### Corrigé
- **Les équipes déjà éliminées à la confrontation directe sont désormais grisées sur la carte** : une équipe qui peut au mieux revenir à égalité de points avec celle au-dessus d'elle mais a déjà perdu la confrontation directe décisive était encore affichée comme en vie. Le contrôle d'élimination en cours de groupe départage désormais ces égalités par la confrontation directe pour les compétitions qui la classent en premier (Coupe du Monde 2026, Euro 2024), de sorte que ces équipes (ex. une équipe quatrième derrière une confrontation directe qu'elle a perdue) se grisent correctement. Il reste prudent là où seule la différence de buts pourrait décider, pour ne rien griser par erreur.

## [1.40.0] - 2026-06-26

### Ajouté
- **Plusieurs images par message, mises en attente avant l'envoi** : joignez, collez ou déposez plus d'une image et elles patientent dans un bac sous le champ de saisie - réorganisez vos idées, retirez celles que vous ne voulez plus, puis envoyez la légende et toutes les images en un seul message. Modifier un message peut désormais retirer ses images ou en ajouter de nouvelles, et cela compte comme une modification au même titre qu'un changement de texte.
- **Un meilleur visualiseur d'images** : touchez une image pour l'ouvrir en plein écran, puis parcourez toutes les images de ce message avec les flèches à l'écran ou les touches gauche/droite de votre clavier. La légende et les réactions s'affichent sous l'image. Copiez, téléchargez (un PNG correctement nommé, ex. `nostragoalus-chat-myleague-eng-v-fra-2026-06-26.png`) et, sur mobile, partagez vers n'importe quelle app.
- **Galerie média par salon** : un bouton média dans l'en-tête du chat ouvre toutes les images postées dans ce salon, à parcourir et faire défiler.
- **Partagez un prono directement dans le chat** : le menu de partage d'un pronostic gagne « Partager dans le chat », qui dépose la carte du prono dans le champ de saisie du chat de votre ligue pour la relire et l'envoyer.
- **Voyez qui écrit** : un indice fugace « X écrit… » apparaît pendant que d'autres rédigent.
- **Sachez quels salons ont de l'activité** : la bulle de chat repliée affiche un compteur de non-lus, le sélecteur Global/Match s'orne d'un point quand l'autre salon a de nouveaux messages, et un menu des salons liste chaque salon avec des non-lus et y saute.
- **Chargez les messages précédents** : l'historique du chat est paginé - un bouton « Charger les messages précédents » remonte d'anciens messages, pour remonter tout en arrière.
- **Détachez le chat** : faites sortir la fenêtre de chat en un panneau déplaçable et redimensionnable que vous placez où vous voulez ; il se souvient de l'endroit où vous l'avez laissé.
- **Copiez le texte d'un message**, et **les profils depuis le chat** : touchez un nom ou un avatar pour ouvrir le profil de ce membre.

### Modifié
- **Les messages du chat se logent désormais dans des bulles** avec l'avatar de l'auteur en ligne, vos propres messages teintés, et les sauts de ligne et les liens préservés (les liens s'ouvrent en sécurité dans un nouvel onglet).
- **Des commandes de chat plus nettes** : vérifier les clés, configurer le code de récupération et les actions admin (signalements, renouveler la clé, désactiver) sont passés dans un menu déroulant pour être délibérés, et non un faux-clic à côté du champ de saisie. Le bouton d'ajout de réaction est désormais dans la rangée avec répondre.

### Corrigé
- Les nouveaux membres ne s'affichent plus comme « Quelqu'un » jusqu'au rechargement - leur nom se remplit en direct dès qu'ils parlent.
- Le chat ne saute plus en haut quand vous changez d'onglet de navigateur et revenez ; votre position de défilement est conservée.
- Cliquer sur répondre ou modifier place désormais le curseur dans le champ de message pour taper aussitôt.
- Copier une image dans le presse-papiers fonctionne désormais (elle est convertie en PNG, que le presse-papiers accepte), et une image agrandie n'est plus recouverte par la carte du monde en dessous.

## [1.39.2] - 2026-06-26

### Modifié
- La célébration de but en plein écran ne surgit plus par-dessus un direct que vous regardez : tant qu'une diffusion en direct intégrée est à l'écran dans la vue du match (épinglée ou sur l'onglet Direct), un but met à jour le score discrètement au lieu d'afficher l'animation - qui couvrait le direct et gâchait le but avant que le flux différé n'y arrive.

### Corrigé
- **Les classements de joueurs affichent désormais les passes décisives** : l'onglet Joueurs du match et les listes de meilleurs buteurs relisent les passes décisives - elles étaient bloquées à zéro car les stats agrégées officielles de la FIFA ne sont pas publiées en cours de tournoi et le flux par match liste le gardien battu comme « passeur », pas le passeur réel. Les passes décisives sont désormais lues depuis les chronologies des matchs, et un joueur qui ne fait que des passes décisives (sans but personnel) apparaît désormais dans les classements et comme meilleur passeur de son équipe.

## [1.39.1] - 2026-06-26

### Corrigé
- **Les confrontations affichent désormais l'historique complet** : les rencontres de tous les temps sur l'onglet Confrontations d'un match (et la forme récente de chaque équipe) provenaient d'un flux FIFA qui ne portait que les Coupes du Monde, qualifications et matchs amicaux depuis 2021, si bien que d'anciens amicaux et des matchs de Championnat d'Europe manquaient en silence - par exemple les amicaux Norvège - France de 2010 et 2014, ou les rencontres France - Espagne à l'Euro en 1984, 1996, 2000 et 2012. Elles proviennent désormais des archives FIFA complètes remontant au début des années 1900, amicaux et finales continentales compris.

## [1.39.0] - 2026-06-26

### Ajouté
- **Équipes éliminées grisées sur la carte du monde** : les nations sorties du tournoi sont désormais grisées - perdants des éliminatoires directs, équipes non qualifiées de leur groupe, et équipes déjà mathématiquement éliminées en cours de groupe (elles ne peuvent atteindre une place qualificative quelle que soit la tournure des résultats restants). Une légende les marque.

### Corrigé
- **Les classements de groupe utilisent désormais les vrais départages de chaque compétition** : les tableaux de groupe (et le tableau final projeté qui les lit) classaient chaque compétition par différence de buts d'abord. Ils suivent désormais l'ordre officiel par tournoi - confrontation directe d'abord pour la Coupe du Monde 2026 et l'Euro 2024, différence de buts d'abord pour la Coupe du Monde 2022 - de sorte que les équipes à égalité de points sont séparées correctement, la confrontation directe étant calculée parmi les seules équipes à égalité.

## [1.38.1] - 2026-06-26

### Corrigé
- La carte du monde s'affiche à nouveau sur le site compilé : elle apparaissait vide - sans tuiles, sans pays - car la référence d'élément du composant carte ne se liait jamais en production. La carte charge désormais ses tuiles, ses drapeaux de pays et la teinte de tendance de la foule comme prévu.

### Modifié
- La teinte de tendance de la foule sur la carte du monde est désormais bien plus visible : le drapeau de chaque nation porte un anneau coloré plus épais et une douce lueur (bleu quand la foule la favorise, rouge pour l'outsider), au lieu d'un fin contour pâle.

## [1.38.0] - 2026-06-26

### Ajouté
- **Tendance des pronostics sur la carte du monde** : avec « Afficher les totaux de tous » activé, chaque nation sur la carte est désormais teintée selon l'issue que la foule attend de son match en cours - bleu quand le terrain donne cette équipe gagnante, rouge quand il donne l'adversaire, pâle quand c'est équilibré. Cela se lit depuis le match en direct (ou le suivant), se met à jour à mesure que les pronostics et les scores arrivent, et une légende explique l'échelle. Activez-le depuis les Préférences.

## [1.37.0] - 2026-06-26

### Ajouté
- **Flux de calendrier** : abonnez-vous à vos matchs et dates limites de pronostics depuis votre propre app de calendrier. Les Préférences ont une section « Flux de calendrier » avec un lien d'abonnement personnel (et un bouton webcal en un clic) que vous ajoutez à Google Agenda, Apple Calendar, Outlook ou Thunderbird ; il se tient ensuite à jour tout seul. Chaque match à venir que vous n'avez pas pronostiqué porte un rappel trois heures avant le coup d'envoi. Le flux montre les matchs et les scores finaux mais jamais votre score pronostiqué, pour que le lien reste sûr à confier à un service de calendrier.

## [1.36.0] - 2026-06-26

### Ajouté
- **Le chat de la ligue, au premier plan** : le chat accompagne désormais sous forme de fenêtre repliable dans le coin inférieur droit des pages de compétition et de match (replié par défaut), pour ne plus être relégué à la page de ligue où personne ne le trouvait. La fenêtre peut être agrandie pour une vue plus spacieuse. Sur un match, elle gagne un sélecteur Global/Match pour basculer entre le salon de la ligue et le fil de ce match. La page de ligue conserve son chat intégré complet.
- **Réactions aux messages** : réagissez à n'importe quel message du chat avec un emoji, le même jeu que les réactions de match. Les compteurs se mettent à jour en direct pour tout le monde, et toucher à nouveau votre propre réaction la retire.
- **Répondre aux messages** : répondez à n'importe quel message et l'original est cité au-dessus de votre réponse (et au-dessus du champ de saisie pendant que vous l'écrivez), pour suivre facilement un fil. La citation est cliquable - elle saute jusqu'à l'original et le met en surbrillance. La citation est déchiffrée sur votre appareil comme tout le reste.
- **Images dans le chat** : glissez-déposez, collez ou joignez une image (jusqu'à 5 Mo). Elle est réduite en webp et chiffrée de bout en bout sur votre appareil avant l'envoi, si bien que le site ne stocke jamais que des octets brouillés - il ne voit jamais l'image. Touchez une image pour l'agrandir, puis copiez-la, téléchargez-la ou partagez-la.
- **Modifiez et supprimez vos propres messages** : corrigez un message après l'envoi - il affiche un marqueur « modifié » avec l'heure, et le nouveau texte est re-chiffré sur votre appareil et se met à jour en direct pour tout le monde - ou supprimez-le, ce qui s'affiche comme « message supprimé » et garde intactes les éventuelles réponses. Vous pouvez aussi retirer un signalement que vous avez fait.
- **Signalez et modérez les messages du chat** : n'importe qui peut signaler un message qu'il n'a pas envoyé. Une fois qu'assez de membres distincts en signalent un (un quart de la ligue, au moins trois) il se masque automatiquement comme « en attente de révision » pour tout le monde sauf le propriétaire et les modérateurs. Les propriétaires et modérateurs disposent d'une liste de Signalements pour lire chaque message signalé et soit le garder, soit le supprimer, et peuvent supprimer n'importe quel message directement. Les messages supprimés s'affichent comme « message supprimé » et gardent intactes les réponses. Les signalements et suppressions se répercutent en direct pour tout le monde.

### Corrigé
- **Rejoindre un chat ne vous laisse plus bloqué** : un membre qui rejoignait une ligue avec le chat déjà activé restait sur « Préparation de votre clé... » indéfiniment, à moins qu'un membre déjà dans le chat ne le rouvre par hasard. Votre appareil demande désormais votre clé au groupe automatiquement et déverrouille dès qu'un membre qui la détient est en ligne, en affichant un message clair « en attente d'accès » jusque-là.
- **Réafficher** : masquer un membre était jusqu'ici définitif, sans retour possible. Le chat a désormais une liste « Masqués » où vous pouvez réafficher quiconque vous aviez masqué.
- **Chat activé/désactivé en direct** : activer le chat, le désactiver ou renouveler sa clé se met désormais à jour pour tout le monde instantanément - la fenêtre de chat apparaît ou disparaît pour les autres membres sans rechargement, au lieu de rester périmée jusqu'à ce qu'ils rechargent.
- **Noms des membres masqués dans le chat** : un membre masqué du classement public affiche désormais son nom dans le chat de la ligue à laquelle il appartient, au lieu d'apparaître comme « Quelqu'un ».
- **Défilement du chat** : réagir, masquer ou modérer ne tire plus la vue vers le dernier message. De nouveaux messages alors que vous avez défilé vers le haut font apparaître un bouton « nouveaux messages » au lieu de vous forcer vers le bas.

## [1.35.0] - 2026-06-23

### Ajouté
- **Vérification des clés du chat de ligue** : un panneau « Vérifier les clés » dans le chat affiche un court numéro de sécurité pour chaque membre (et le vôtre) que vous pouvez comparer en personne ou via un canal de confiance pour confirmer qu'aucune clé n'a été falsifiée. Votre appareil mémorise la clé de chaque membre la première fois qu'il la voit et vous avertit sur tout le site si elle change un jour, et un détenteur de clé ne transmettra pas la clé du groupe à un membre dont la clé a changé tant que vous ne l'avez pas accepté, avec une acceptation ou un marquage comme vérifié en un clic.
- **Renouvellement de la clé du chat de ligue** : un propriétaire ou modérateur de ligue peut renouveler la clé du chat depuis le panneau. Tout le monde actuellement dans la ligue reçoit une nouvelle clé, si bien que quiconque a été retiré perd l'accès aux nouveaux messages, tandis que les anciens messages restent lisibles pour les membres qui les avaient déjà. Cela récupère aussi un membre qui se serait retrouvé incapable de lire le chat.

## [1.34.0] - 2026-06-23

### Ajouté
- **Chat de ligue (chiffré de bout en bout)** : un chat privé pour votre ligue - un salon général sur la page de ligue plus un fil par match sur chaque match. Désactivé par défaut ; seul un propriétaire ou modérateur de ligue peut l'activer, derrière un avertissement qui détaille les compromis. Les messages sont chiffrés sur votre appareil, si bien que personne d'autre ne peut les lire - pas même le propriétaire du site, qui ne stocke que du texte brouillé et ne peut ni le modérer ni le récupérer. Votre clé s'enrôle silencieusement à la première utilisation (pas de mot de passe supplémentaire) ; enregistrez le code de récupération à usage unique pour lire votre historique sur un autre appareil ou après avoir vidé votre navigateur. Vous pouvez masquer un autre membre localement.

## [1.33.1] - 2026-06-23

### Corrigé
- Matchs interrompus : un match que l'arbitre arrête en plein jeu s'affiche désormais comme « Interrompu » au lieu de revenir à « Prévu » comme s'il n'avait jamais débuté. Les matchs de Coupe du Monde abandonnés, reportés et annulés se lisent désormais correctement aussi. Un match interrompu garde son classement par match et son fil du match, comme un match en direct, pour ne pas perdre les onglets pendant l'arrêt du jeu, et ses points provisoires continuent de compter au classement en direct.

## [1.33.0] - 2026-06-22

### Ajouté
- **Scores infalsifiables** : chaque changement de pronostic est désormais scellé dans un registre en ajout seul, chaîné par hachage (commit-reveal). Les pronos restent cachés jusqu'au coup d'envoi, puis leur score et leur sel sont révélés pour que chacun puisse rouvrir le sceau. La nouvelle page publique **Vérifier les scores** (lien en pied de page) télécharge tout le registre et recalcule la chaîne dans votre propre navigateur - falsifiez une entrée scellée et la chaîne cesse de reproduire la tête que vous avez relevée aujourd'hui. Les pronostiqueurs apparaissent sous forme de hachage opaque, jamais leur compte. Votre navigateur mémorise aussi le dernier état de chaîne qu'il a vérifié (gardé sur votre appareil, jamais envoyé), si bien qu'une modification ultérieure de tout ce que vous avez déjà vu est détectée automatiquement et un avertissement apparaît sur tout le site - pas besoin de garder le hachage vous-même.

## [1.32.1] - 2026-06-22

### Modifié
- Cloche de notifications : l'ouvrir efface désormais le compteur de non-lus pour vous, et l'action groupée est « Tout supprimer » (vide la liste) au lieu de « Tout marquer comme lu ». Le retrait par élément est inchangé.

### Corrigé
- Tableau final : les vainqueurs et deuxièmes de groupe ne sont plus placés du mauvais côté avant que les matchs ne soient joués. L'arbre suit désormais l'ordre officiel des matchs, si bien que le parcours projeté (et qui vous pourriez affronter) est juste dès le départ.
- Vue du calendrier : passer au Classement puis revenir au Calendrier vous ramène désormais au premier match à venir, comme au chargement.
- Notifications push : les clés VAPID requises sont désormais documentées dans `.env.example`. Sans elles, le bouton push reste masqué et rien n'est délivré, ce qui explique pourquoi les notifications n'arrivaient jamais.

## [1.32.0] - 2026-06-21

### Ajouté
- **Cartes de pronostic partageables** : un bouton de partage sur votre prono le transforme en une image que vous pouvez poster n'importe où, avec un lien qui se déploie en carte sur les applis sociales. Après le coup d'envoi, elle montre votre résultat - le score, votre prono, les points et à quel point c'était rare. Avant le coup d'envoi, vous pouvez partager un teaser scellé ou choisir de révéler votre propre score pronostiqué. La carte se lit dans votre propre langue.
- **Joker directement depuis la vue du match** : activez votre joker sur la rangée de prono d'un match sans quitter la page du match ; les tours à match unique (qui comptent double pour tout le monde) affichent la raison à la place.

## [1.31.3] - 2026-06-21

### Ajouté
- **Compositions sur un vrai terrain** : le onze est désormais placé à ses vraies positions sur un graphique de demi-terrain - exact pour les matchs UEFA, et affiné depuis Sofascore pour la Coupe du Monde (pour qu'une défense à trois se lise comme une défense à trois, les latéraux bien sur les côtés). Là où aucune position n'est disponible, il revient à la disposition par lignes de la formation.

### Modifié
- Les compositions sont désormais stockées une fois confirmées, si bien que le onze d'un match terminé se charge instantanément et survit à un redémarrage au lieu d'être re-récupéré depuis le flux.

### Corrigé
- Les cotes (et le bonus de résultat rare qui les utilise) circulent à nouveau - le flux de cotes s'était mis à rejeter les requêtes de l'app, laissant les matchs récents sans cote.

## [1.31.2] - 2026-06-21

### Corrigé
- Les flèches de progression du classement s'effacent désormais quand votre rang ne change pas après un tour, au lieu de laisser un indicateur haut/bas périmé d'un changement antérieur.
- Pendant un match en direct, la flèche de progression est mesurée par rapport au rang affiché incluant le direct (et non au dernier classement arrêté), pour que la flèche et le rang que vous voyez concordent.

## [1.31.1] - 2026-06-20

### Corrigé
- Le terrain des compositions suit désormais la formation déclarée de l'équipe (ex. une défense à trois reste une défense à trois) au lieu de grouper les joueurs par leur catégorie de position du flux, pour que la forme sur le terrain corresponde à la formation affichée à côté.

## [1.31.0] - 2026-06-20

### Ajouté
- **Compositions des matchs** : un onglet Compositions sur la page du match montre le onze de départ de chaque équipe sur un terrain en formation, plus le banc et le sélectionneur, avec la formation quand le flux la fournit. Les joueurs renvoient vers la page de leur équipe. L'onglet apparaît dès que les compositions officielles tombent, environ une heure avant le coup d'envoi.

## [1.30.3] - 2026-06-20

### Ajouté
- La chronologie du fil du match en direct marque désormais les **corners**, avec une icône de drapeau de corner et le nom du tireur. Couvre les flux Coupe du Monde (FIFA) et UEFA.

## [1.30.2] - 2026-06-20

### Corrigé
- Le tableau final projeté n'oppose jamais le troisième projeté d'un groupe au vainqueur ou au deuxième de ce même groupe - un remake de phase de groupes qui ne peut pas réellement arriver.

## [1.30.1] - 2026-06-20

### Corrigé
- Le tableau final projeté remplit désormais **chaque** emplacement de meilleur troisième. Un emplacement dont le seul troisième actuellement qualifié avait été pris par un autre emplacement pouvait rester vide (ex. l'emplacement « 3e D/E/I/J/L » quand seul le troisième du groupe D figurait parmi les huit meilleurs) ; la projection fait désormais correspondre les emplacements aux troisièmes pour que chaque emplacement remplissable obtienne une équipe.

## [1.30.0] - 2026-06-20

### Ajouté
- **Tableau final projeté** : une fois que toutes les équipes d'un groupe ont joué, le tableau remplit les emplacements d'éliminatoires de ce groupe avec les équipes actuellement en route pour se qualifier (depuis le classement de groupe en direct, meilleures troisièmes places comprises). Les équipes projetées sont en pointillés avec une puce « projeté », clairement distinctes des équipes déjà officiellement qualifiées, et se mettent à jour en direct à mesure que les scores changent.

## [1.29.4] - 2026-06-20

### Corrigé
- Les lecteurs de liens de diffusion intégrés ont désormais un bouton **plein écran** fonctionnel : l'iframe du lecteur reçoit le plein écran des deux façons (l'attribut historique `allowfullscreen` et le jeton de bac à sable `allow-fullscreen`), pour fonctionner sur tous les navigateurs et pour les fournisseurs en bac à sable comme YouTube et Twitch.

## [1.29.3] - 2026-06-20

### Corrigé
- Les lecteurs de liens de diffusion intégrés peuvent désormais passer en plein écran même quand leur feature-policy omet le jeton plein écran (l'iframe du lecteur porte toujours `allowfullscreen`).
- La page du match n'affiche plus deux onglets au nom identique en français (et en klingon) : l'onglet du classement de **groupe** des équipes est désormais distinct de l'onglet **classement** des joueurs.
- Votre prono sur la page du match se verrouille désormais dès le coup d'envoi pendant que vous le regardez : les champs de score restaient modifiables si le match débutait après le chargement de la page.

### Modifié
- Plusieurs liens de diffusion du même type s'affichent désormais côte à côte (avec un espace) au lieu de s'empiler un par ligne.

## [1.29.2] - 2026-06-19

### Modifié
- Peaufinage des illustrations d'erreur thématiques : la théière **418** verse désormais son ballon par le bec dans la tasse (le bec était orienté du mauvais côté et l'anse surdimensionnée), et l'arbitre **500** lève le carton rouge depuis l'épaule (et non la tête) avec un éclair d'impact et un serveur qui tressaille et transpire.

### Corrigé
- La compilation de production ne casse plus à l'édition de liens : les imports profonds `shared/*` depuis des pages de route imbriquées passent désormais par l'alias `#shared` pour que `pnpm build` réussisse (aucun changement de comportement visible).

## [1.29.1] - 2026-06-19

### Corrigé
- **Les remplacements à la pause** (mi-temps, et l'intervalle de la prolongation) dans la chronologie du match ne tombent plus en bas dans le désordre : ils se placent désormais à la bonne pause avec un marqueur « MT » au lieu d'une minute vide.

## [1.29.0] - 2026-06-19

### Ajouté
- **Réactions sur la liste des matchs** : chaque carte de match débuté affiche désormais son décompte de réactions (votre propre réaction mise en évidence), pour saisir l'ambiance de la journée d'un coup d'œil. Avec une ligue sélectionnée, la carte affiche les compteurs de votre ligue plus le total global, à l'image de la ligne de la foule. Touchez la carte pour réagir sur la page du match.

## [1.28.1] - 2026-06-19

### Modifié
- Le lien de diffusion en direct d'un match est désormais effacé automatiquement une fois le match terminé (les rediffusions et résumés restent), pour qu'un lien de flux mort ne traîne jamais.

## [1.28.0] - 2026-06-19

### Ajouté
- Pages d'erreur thématiques : une **418** montre une théière versant un ballon (« I'm a teapot »), et une **500** montre l'arbitre expulsant le serveur d'un carton rouge (la 404 perd toujours le ballon parmi les étoiles). Les deux respectent le mouvement réduit. De nouvelles routes `/418` et `/500` les déclenchent à la demande.

## [1.27.0] - 2026-06-19

### Ajouté
- Les portées de clé API sont désormais une liste catégorisée et extensible, avec une portée **leaderboard:read** en lecture seule, pour qu'une intégration machine puisse lire les classements sans accès plus large.

### Modifié
- Rangement des panneaux admin : la liste déroulante de fournisseur de cotes ne se réduit plus à une largeur étriquée, et le formulaire de création de clé API donne aux portées et à l'expiration leurs propres rangées au lieu de les entasser sur une seule ligne.

### Sécurité
- L'API de classement exige désormais une session connectée (ou une clé API à portée définie) : les classements global et par compétition ne sont plus lisibles par des appelants anonymes interrogeant l'endpoint directement.

## [1.26.0] - 2026-06-19

### Ajouté
- Les liens de diffusion admin gagnent un contrôle d'iframe par lien : collez le code d'intégration complet d'un fournisseur (l'URL et sa politique allow sont extraites pour vous), choisissez comment l'intégration est mise en bac à sable (auto, forcé ou désactivé), et définissez une politique allow personnalisée. Désactiver le bac à sable permet aux lecteurs qui refusent de s'exécuter en bac à sable (certains hôtes PPV) de s'intégrer tout court - cela porte un avertissement, puisqu'une page sans bac à sable peut naviguer ou afficher des pop-ups dans l'intégration.

### Modifié
- Les liens de diffusion du match vivent désormais dans les onglets du match plutôt que dans un bloc au-dessus : un onglet **Direct** avant et pendant le match, et des onglets **Rediffusion** et **Résumé** séparés une fois terminé (chacun seulement quand une source existe). Une épingle soulève le flux au-dessus des onglets pour qu'il continue de jouer pendant que vous parcourez le reste du match.
- La vue **Classement** de la page du calendrier défile désormais dans la même zone contenue que la liste des matchs, au lieu d'agrandir toute la page - les deux vues paraissent cohérentes quand vous basculez de l'une à l'autre.

### Corrigé
- Ouvrir un match **en direct** n'affiche plus une page d'erreur : la vue du match plantait pendant qu'un match était en cours et charge désormais son score en direct, sa chronologie et ses stats comme prévu.
- **Les liens de diffusion YouTube** se lisent désormais intégrés au lieu d'échouer avec « Video player configuration error » : le lecteur reçoit l'origine de la page dont il a besoin pour autoriser l'intégration.

## [1.25.0] - 2026-06-18

### Ajouté
- **Badge Quoi de neuf** : le menu du compte signale désormais quand le journal des modifications a des entrées que vous n'avez pas vues, et la page À propos met en avant ces nouvelles versions. Ouvrir « Quoi de neuf » efface le marqueur, et votre repère est mémorisé sur tous vos appareils.

## [1.24.0] - 2026-06-18

### Modifié
- L'onglet **Ligue** de la page du match est désormais **Classement** et s'affiche même sans ligue sélectionnée : il classe tous ceux qui ont pronostiqué ce match selon les points que rapporte leur prono (en direct puis final), en laissant de côté les profils privés, les comptes masqués du classement et quiconque n'a pas pronostiqué. Choisissez une ligue et il classe toujours uniquement les membres de cette ligue.

## [1.23.0] - 2026-06-18

### Ajouté
- **Réactions aux matchs** : réagissez à un match avec un emoji rapide - 🔥, ⚽, 😮, 🤣, 😢 ou 😡 - dès le coup d'envoi et aussi longtemps que vous voulez après le coup de sifflet final. Les compteurs se mettent à jour en direct pour tous ceux qui regardent le match, et quand vous avez une ligue sélectionnée vous voyez comment votre ligue a réagi à côté du total global. Une réaction chacun : touchez-en une autre pour changer, ou touchez à nouveau la même pour l'effacer.

## [1.22.0] - 2026-06-17

### Ajouté
- Bascule de fournisseur de cotes admin : choisissez quel fournisseur cote les matchs de chaque compétition (Sofascore, ou BetExplorer pour les calendriers), depuis le panneau admin.

## [1.21.0] - 2026-06-17

### Ajouté
- **Notifications push** : choisissez de les recevoir depuis les Préférences pour obtenir des alertes sur votre téléphone ou ordinateur, même l'app fermée - rappels de pronostics, une alerte de coup d'envoi et des alertes de buts en direct pour les matchs que vous avez pronostiqués, vos résultats de match et de tournoi, et l'activité des ligues. Chaque type a son propre bouton activé/désactivé, et les alertes de but/coup d'envoi n'atteignent que les personnes ayant pronostiqué ce match. Votre navigateur demande l'autorisation une fois quand vous l'activez sur un appareil.

## [1.20.1] - 2026-06-17

### Corrigé
- Le score d'un match en direct dans l'en-tête se met désormais à jour dès qu'un but apparaît dans la chronologie, au lieu d'être en retard - un match pouvait afficher 0-0 avec le buteur déjà listé en dessous. La célébration de but se déclenche désormais avec ce changement de score (et non un relevé plus tard) et reste affichée assez longtemps pour voir le but tomber au lieu de se couper en pleine animation.
- La carte de la compétition s'affiche à nouveau : elle pouvait apparaître vide en production, laissant un panneau vide là où la carte du monde devrait être.
- L'infobulle du bonus de rareté ne présente plus à tort un prono courant comme rare. Un bonus obtenu pour un résultat audacieux mais correct (que peu de joueurs ont appelé) est désormais décrit comme tel, au lieu d'être attribué à la part du score exact - ce qui explique pourquoi un prono partagé par la plupart pouvait afficher « seulement 60 % ont tenté ce score exact ».

## [1.20.0] - 2026-06-17

### Ajouté
- **Classements de groupe sur la page du calendrier** : un sélecteur Calendrier / Classement dans la rangée de filtres bascule la page vers tous les tableaux de groupe d'un coup (J, G, N, P, Diff, Pts), conscient du direct pour que les matchs en cours comptent à leur score actuel. Le sélecteur n'apparaît que pour les tournois avec phase de groupes, et la vue est partageable via un lien `?view=standings`.

## [1.19.0] - 2026-06-16

### Ajouté
- **Liens de diffusion des matchs** : une nouvelle section Regarder sur la page du match où les admins peuvent attacher des liens Direct, Rediffusion et Résumé. Les liens d'hôtes reconnus (YouTube, Twitch, Dailymotion, Vimeo) se lisent en ligne dans une intégration en bac à sable ; tout le reste s'ouvre dans un nouvel onglet, avec une surcharge admin pour forcer l'intégration ou forcer un lien pour n'importe quel hôte. Les liens en direct apparaissent autour du coup d'envoi, les rediffusions et résumés une fois le match terminé. Les lecteurs intégrés gardent toujours un repli « ouvrir dans un nouvel onglet » au cas où un hôte refuse d'être intégré.

## [1.18.0] - 2026-06-16

### Ajouté
- **Clients API (admin)** : une nouvelle section admin - plus une commande `mise run create-api-key <name>` en CLI - pour générer des clés API à portée définie, optionnellement expirantes, pour les intégrations machine, et les révoquer. Tout admin voit et peut révoquer chaque clé (y compris les clés de bot générées en CLI) ; la clé complète est affichée une fois à la création et stockée sous forme de hachage ensuite. Chaque clé porte une portée de permission et est liée à un propriétaire admin, pour ne lui accorder que l'accès dont une intégration a besoin.

### Corrigé
- Le panneau de notifications (et le menu du compte) se ferment désormais quand vous faites défiler la page, au lieu de s'éloigner de l'en-tête et de chevaucher les matchs en dessous.
- La carte de la compétition place désormais un drapeau pour chaque nation, pas seulement les habituées de longue date de la Coupe du Monde et de l'Euro : les nouveaux venus comme le Cap-Vert et Curaçao (et tout autre qualifié) étaient auparavant écartés en silence.

## [1.17.0] - 2026-06-15

### Ajouté
- **Centre de notifications** : une cloche dans l'en-tête rassemble ce qui compte pour vous - un rappel pour un match qui se verrouille bientôt et que vous n'avez pas pronostiqué, le résultat de chaque match que vous avez pronostiqué (le score et les points qu'il a rapportés), l'activité des ligues (adhésions, changements de rôle, ajout ou retrait), et comment vos pronos champion et Soulier d'or ont fini - avec un compteur de non-lus et des mises à jour en direct au fil des événements. Les rappels ne vont qu'aux joueurs déjà dans la compétition, s'effacent une fois le prono fait ou le match débuté, et comme le reste peuvent être marqués comme lus ou touchés pour sauter directement au match, à la ligue ou à la compétition. Chaque notification a un bouton de retrait, et les lues sont rangées automatiquement après une semaine (avec un plafond global par personne) pour que la liste ne s'accumule jamais.

## [1.16.0] - 2026-06-15

### Ajouté
- La liste Utilisateurs admin a une recherche temporisée (nom affiché approximatif, ou e-mail exact) et affiche désormais la date d'inscription de chaque compte.

### Modifié
- Sur la page du calendrier, la recherche vit désormais dans la rangée de filtres de statut (alignée à droite, ouverte par son icône ou Ctrl/Cmd+F) et est un multi-sélecteur de pays : choisissez une ou plusieurs équipes (saisie semi-automatique approximative, insensible aux accents) pour y filtrer les matchs, au lieu d'un champ de texte libre.

### Corrigé
- L'onglet Stats du match affiche désormais un message « Pas encore de stats » quand un match a débuté mais qu'aucune stat n'est arrivée, au lieu d'un panneau presque vide.

## [1.15.0] - 2026-06-15

### Ajouté
- La bannière d'accueil se cale désormais de façon fiable dans sa barre d'en-tête fine sur toutes les tailles d'écran et reste compacte pendant que vous lisez, au lieu de se redéployer quand vous remontez vers le haut. Un repère de défilement en dessous fait glisser la bannière vers le haut et saute directement aux matchs et à vos pronos ; il s'écarte pendant que l'invite du prochain match est affichée et respecte le mouvement réduit.
- Un teaser sur la page d'accueil déconnectée : le prochain match avec un compte à rebours, plus combien de joueurs ont rejoint et de pronostics ont été faits jusqu'ici. Pas de noms, et chaque partie reste cachée tant qu'il n'y a pas quelque chose qui vaut la peine d'être montré.

### Corrigé
- La FAQ du score documente désormais le bonus de rareté du résultat (le petit supplément pour avoir appelé un résultat rare mais correct) livré avec la mise à jour du score ajustable - elle ne listait auparavant que les paliers de rareté du score exact.

## [1.14.0] - 2026-06-15

### Ajouté
- La chronologie minute par minute du fil du match couvre désormais les matchs de compétition UEFA (l'Euro), pas seulement la Coupe du Monde - buts, cartons, remplacements, tirs, fautes, marqueurs de période et décisions VAR, dans leur propre onglet sur la page du match. Chaque ligne se lit dans votre propre langue comme le reste de la chronologie ; le texte des décisions VAR est affiché en anglais là où le flux le fournit.

## [1.13.1] - 2026-06-15

### Corrigé
- La page admin Règles de score ne s'affiche plus à l'étroit : les rangées de paliers et les champs de joker débordaient de leur largeur fixée et chevauchaient les libellés et le bouton de joker.

## [1.13.0] - 2026-06-15

### Ajouté
- **Page admin Règles de score** (`/admin/scoring`) : modifiez les points, bonus et paliers de rareté depuis l'app au lieu de la base de données. Il y a un jeu de règles par défaut qui s'applique partout, plus des surcharges optionnelles par compétition - ajustez un tournoi sans toucher aux autres. Enregistrer recalcule aussitôt chaque classement concerné, et la surcharge d'une compétition peut être supprimée pour revenir au défaut.
- **Bonus de rareté du résultat** : en plus de la rareté du score exact existante, un petit bonus récompense désormais l'appel d'un résultat rare mais correct (ex. miser sur l'outsider quand la majorité du terrain a choisi le favori). C'est une couche supplémentaire ajustable du bonus de la foule, activée par défaut pour les nouvelles installations et configurable par compétition.

### Corrigé
- Dans une ligue, survoler le score de la foule sous un match n'empile plus deux infobulles qui se chevauchent : les totaux de la ligue et de tous affichent désormais leurs libellés sous la ligne.

## [1.12.1] - 2026-06-14

### Ajouté
- Les admins peuvent relancer le remplissage du rang FIFA du champion depuis la page Tâches de fond. Il répare les pronos champion enregistrés sans rang FIFA (et qui ont donc payé le bonus forfaitaire au lieu du palier de rang) quand le flux de classement était injoignable pendant la fenêtre de choix, restaurant le rang et les bons points potentiels.

## [1.12.0] - 2026-06-14

### Ajouté
- **Onglet Ligue sur la page du match** : quand vous avez une ligue choisie, un match qui a débuté affiche un onglet « Ligue » classant vos camarades membres selon les points que rapporte leur prono sur ce match. Pendant que le match est en direct, les points évoluent avec le score (provisoires, même score qu'au temps réglementaire) ; une fois terminé, ils se figent au décompte final. Les pronos restent cachés jusqu'au coup d'envoi, et les membres qui n'ont pas pronostiqué sont résumés en bas.

## [1.11.1] - 2026-06-14

### Corrigé
- Pendant la fenêtre de seconde chance, les cartes Champion et Meilleur buteur affichent désormais la valeur réduite de moitié pour un prono prévisualisé, y compris un premier prono tardif (elle affichait auparavant la valeur pleine alors qu'un tel prono rapporte la moitié).

## [1.11.0] - 2026-06-14

### Ajouté
- **Seconde chance pour les pronos champion et Soulier d'or** : une fois la phase de groupes presque terminée (du dernier tour de groupes jusqu'au début des éliminatoires), vous avez une dernière chance de changer vos pronos vainqueur du tournoi et meilleur buteur - pour la moitié des points. Le changement est définitif (revenir en arrière ne restaure pas la valeur pleine), une confirmation le précise, et votre prono d'origine reste affiché à côté du nouveau. Un joueur qui n'a jamais choisi peut aussi faire un premier prono tardif pendant la fenêtre, pour la moitié.

### Corrigé
- La vitrine Meilleur buteur affiche désormais la photo officielle d'un joueur quand elle n'existe que sur le flux de l'effectif (certains joueurs, ex. Edin Dzeko, n'avaient pas d'image au chemin dérivé de l'id que nous utilisions et retombaient sur le drapeau de l'équipe).
- Sur mobile, la liste des matchs attend désormais que les cartes Champion et Meilleur buteur au-dessus finissent de charger avant d'apparaître, pour que le saut au chargement vers le prochain match atterrisse sur la bonne rangée au lieu de s'arrêter trop tôt une fois ces cartes agrandies.

## [1.10.0] - 2026-06-14

### Modifié
- Le panneau admin est désormais organisé autour d'un menu à gauche au lieu d'un long défilement : inscriptions, SSO, utilisateurs, ligues, feuille de route et tâches planifiées ont chacun leur propre page pleine largeur. La vue des tâches planifiées s'intègre aux côtés du reste (l'ancien lien `/admin/cron` fonctionne toujours), et la page utilise toute la largeur des écrans plus larges.

## [1.9.0] - 2026-06-14

### Modifié
- Sur la page du calendrier, cliquer n'importe où sur une carte de match ouvre le match, pas seulement son titre (les champs de score, le bouton joker et les liens d'équipe fonctionnent toujours comme avant).
- Le fil du match est désormais écrit dans votre propre langue (il reprenait auparavant le commentaire anglais du flux de données), et chaque ligne abandonne le nom de pays redondant puisque le drapeau de l'équipe indique déjà le camp.
- Les fautes dans le fil du match affichent désormais une icône de sifflet d'arbitre au lieu d'un panneau d'avertissement.

### Corrigé
- Les boutons joker sont désormais désactivés pour le reste d'un tour une fois le joker de ce tour verrouillé sur un match débuté (il ne peut pas être déplacé), avec une infobulle expliquant pourquoi - au lieu de laisser le clic échouer. Toute erreur restante s'affiche en notification plutôt qu'en bannière intégrée qui poussait la page vers le bas et cassait la zone de défilement de la liste des matchs.
- Les dates suivent désormais la langue sélectionnée partout (calendrier, vue du match, tableau, carte, pages d'équipe et de profil) au lieu de la locale du navigateur.
- Les étiquettes de statut de match (Prévu, En direct, Terminé, ...), les paliers de résultat des pronos (Score exact, Différence de buts, Bon résultat, Manqué), les libellés de groupe et les noms de tours du tableau (y compris Champion / Petite finale) sont désormais traduits dans toutes les langues.
- Le fil du match n'étire plus toute la page quand il a beaucoup d'événements : sur les écrans plus larges, la chronologie défile dans une zone délimitée (la page continue de défiler normalement sur mobile).
- Le fil du match n'affiche plus ses premières rangées avec la mauvaise disposition (de chargement) ou une hauteur non plafonnée après un rechargement de page.
- Changer d'onglet sur la vue du match ne fait plus remonter la page en haut.

## [1.8.1] - 2026-06-14

### Modifié
- Les pronos **Champion** et **Meilleur buteur** s'affichent désormais côte à côte dans une disposition plus serrée et compacte, avec des squelettes de chargement pour qu'ils apparaissent ensemble au lieu de surgir l'un après l'autre.
- Sur les écrans plus larges, la liste des matchs défile dans sa propre zone pour que l'en-tête, vos stats, les pronos et les filtres restent en place (elle revient au défilement de page normal sur les plus petits). Au chargement, elle saute au premier match en direct, ou au prochain à venir, et chaque tour (Journée 1, Huitièmes de finale, ...) peut être replié.

## [1.8.0] - 2026-06-14

### Ajouté
- **Vérification de l'e-mail à l'inscription** (activable par l'admin) : les admins peuvent exiger des nouveaux comptes qu'ils confirment leur e-mail avant de se connecter, depuis une nouvelle section Inscriptions sur la page admin. Le bouton nécessite un SMTP configuré ; l'activer marque tous les comptes existants comme vérifiés, donc seules les nouvelles inscriptions sont concernées. Les admins peuvent aussi forcer la vérification de n'importe quel compte (« le mail n'est jamais arrivé »), et les comptes jamais confirmés de plus de 7 jours sont nettoyés quotidiennement. Les connexions SSO ne sont pas affectées. Après l'inscription, les utilisateurs voient une confirmation à l'écran les invitant à vérifier leur boîte de réception ; une connexion bloquée affiche un avis clair avec un renvoi en un clic, et le lien n'est plus renvoyé automatiquement à chaque tentative. Cliquer sur le lien de vérification vous connecte directement et atterrit sur une page de confirmation dédiée (au lieu de faire apparaître une page déconnectée en route vers la connexion).
- **E-mails HTML personnalisés** : les mails de vérification, de réinitialisation de mot de passe, de suppression de compte et de code de connexion ont désormais une version HTML stylisée avec un bouton cliquable (et le lien brut en repli), aux côtés du texte brut existant.

### Modifié
- Les pages de connexion, d'inscription et de mot de passe utilisent désormais une disposition épurée sans la navigation principale des compétitions.

## [1.7.0] - 2026-06-14

### Ajouté
- **Page admin Tâches de fond** : chaque tâche planifiée et à la demande (relevé des scores en direct, actualisation des matchs et du tableau, verrouillage-et-notation, instantanés/récupération des cotes, import des matchs) avec son planning, sa prochaine et sa dernière exécution, son nombre d'exécutions et son résultat. Lancez-en n'importe laquelle sur-le-champ, et touchez un résultat pour voir sa dernière sortie ou erreur.

### Modifié
- L'import des matchs est passé sur la page Tâches de fond (c'était un bouton admin autonome), pour que toutes les tâches de données manuelles vivent au même endroit.

## [1.6.0] - 2026-06-13

### Ajouté
- **Liens d'invitation de ligue** : les propriétaires et modérateurs peuvent générer des liens d'adhésion partageables depuis la carte de la ligue, avec une expiration optionnelle (24 heures à 30 jours) et un plafond sur le nombre d'utilisations. Ouvrir un lien montre la ligue et fait rejoindre en un clic ; les visiteurs déconnectés passent par la connexion et reviennent automatiquement sur la ligue.

## [1.5.2] - 2026-06-13

### Ajouté
- Le fil du match montre désormais aussi les fautes, et marque chaque ligne d'événement avec le drapeau de l'équipe concernée.

### Modifié
- Quand l'invite prochain match/en direct de la page d'accueil est trop étroite pour tenir sur une ligne, les deux équipes s'empilent désormais verticalement (domicile, séparateur, extérieur) au lieu de se replier maladroitement, et les noms d'équipe longs se replient proprement dans la carte.
- Le compte à rebours du prochain match se place désormais à côté du libellé « Prochain match » au lieu d'être sur le côté, pour que la carte reste centrée.

### Corrigé
- La page du calendrier suit désormais le rythme quand un match passe en direct puis se termine sans rechargement : votre prono se verrouille au coup d'envoi et les points apparaissent après la fin du match (le score et le statut se mettaient déjà à jour en direct).
- Les penaltys accordés apparaissent désormais dans le fil du match (ils étaient écartés quand le flux ne leur donnait aucun texte de commentaire).
- Quelques infobulles (deuxième carton jaune, capitaine, joker) n'étaient qu'en anglais ; elles sont désormais traduites dans toutes les langues.

## [1.5.1] - 2026-06-13

### Corrigé
- Les invites prochain match et match en direct de la page d'accueil ne débordent plus de l'écran sur les fenêtres étroites : elles se replient et restent dans la fenêtre au lieu de se couper sur les bords.

## [1.5.0] - 2026-06-13

### Ajouté
- Nostragoalus est désormais une PWA installable (icônes d'app + manifeste web), pour l'ajouter à votre écran d'accueil et la lancer comme une app.
- Une bannière « nouvelle version disponible » apparaît après un déploiement et recharge vers la version fraîche à votre toucher, au lieu de vous laisser sur un bundle périmé. Elle ne recharge jamais en plein pronostic, et un déploiement ultérieur la fait réapparaître même si vous en aviez fermé une précédente.

## [1.4.0] - 2026-06-13

### Ajouté
- Une invite « prochain match » sur la page d'accueil : quand vous êtes connecté, elle met en avant votre prochain match avec un compte à rebours et un saut en un clic vers son prono, plus une pastille en direct (un compteur quand plusieurs matchs sont en cours) qui renvoie directement dans l'action. Faites défiler au-delà ou suivez-la pour la fermer.
- Des puces de filtre de statut sur la page du calendrier (terminé / en direct / à venir) avec un libellé « Terminé » clair ; la pastille en direct de l'accueil renvoie ici pré-filtré sur le direct et défilé jusqu'au match.

### Modifié
- Le trophée du Soulier d'or (meilleur buteur) affiche désormais une vraie icône de soulier doré au lieu du simple 👟, pour ne plus ressembler au symbole de passe décisive utilisé ailleurs.

## [1.3.1] - 2026-06-12

### Corrigé
- Fil du match : les buts contre son camp s'affichent désormais du côté qui en profite (l'équipe dont le score a augmenté), en accord avec la chronologie sous le score.

## [1.3.0] - 2026-06-12

### Ajouté
- **Fil du match** : un nouvel onglet sur la vue du match avec la chronologie minute par minute complète (buts, cartons, remplacements, tirs, penaltys, VAR), du plus récent au plus ancien. Il s'ouvre par défaut sur les matchs en direct ; les événements en coup d'œil sous le score restent tels quels.

### Modifié
- Égalités au classement : les joueurs à égalité de points (puis de scores exacts, de bons résultats, de différence de buts) partagent désormais le même rang, et la place suivante est sautée. La date d'inscription n'est plus un critère de départage. Une infobulle sur le classement explique l'ordre.

### Corrigé
- Classement en direct : les points des matchs en cours vous font désormais monter au classement, tandis que le total affiché reste votre score confirmé, les points en direct étant montrés comme un écart « +N » séparé.
- L'horloge en direct affiche désormais « MT » à la mi-temps (la FIFA garde un match marqué en direct pendant la pause, si bien qu'elle affichait auparavant un simple « EN DIRECT »).
- Les remplacements en direct ne font plus clignoter « ? » pour les joueurs concernés dans les secondes qui suivent un changement.
- Une vue de match en direct se met désormais à jour d'elle-même quand le match débute ou se termine, même si son onglet était en arrière-plan, au lieu de rester sur un « En direct » périmé jusqu'au rechargement.

## [1.2.0] - 2026-06-12

### Ajouté
- Chaque page définit désormais un vrai titre d'onglet de navigateur (ex. « Matchs · Nostragoalus », ou « Korea Republic – Czechia » sur un match), au lieu que chaque onglet affiche « Nostragoalus ».
- La vue du match en direct affiche l'horloge qui tourne sous le score (« 61' », ou « MT » à la pause) à côté de l'indicateur de direct.

### Corrigé
- Pendant un match en direct, la chronologie des buts, les stats et la possession se mettent désormais à jour depuis les données en direct - elles ne se remplissaient auparavant qu'une fois le match terminé.
- La barre de possession tient compte de la possession disputée (un segment « disputé »), pour que les deux camps totalisent 100 %.

## [1.1.2] - 2026-06-12

### Modifié
- La page À propos liste chaque dépendance séparément, chacune avec sa propre description en une ligne.

### Corrigé
- Les tâches CLI `create-admin`, `roadmap-seed` et `roadmap-add` fonctionnent désormais sur un hôte de production - elles se connectent directement à la base de données dockerisée au lieu de nécessiter une installation locale.

## [1.1.1] - 2026-06-12

### Ajouté
- `mise run roadmap-seed` : amorce la feuille de route publique avec un jeu de départ soigné (idempotent - ignore une feuille de route qui a déjà des éléments).

### Corrigé
- Ouvrir une modale ne décale plus la page sur le côté (la gouttière de la barre de défilement est réservée, donc la mise en page ne se redessine pas).
- Le journal des modifications sur la page À propos affiche désormais son markdown (gras, `code`, liens) au lieu de montrer les symboles bruts.
- Les infobulles du score de la foule sont stylisées de façon cohérente, qu'une ligue soit sélectionnée ou non.
- La page À propos et la FAQ créditent désormais Sofascore (la source des cotes) aux côtés de la FIFA, l'UEFA et OpenStreetMap.

## [1.1.0] - 2026-06-12

### Ajouté
- **Feuille de route** : une page publique `/roadmap` (liée en pied de page) montrant ce qui est **en cours**, **prévu** et **livré**. Les admins la gèrent depuis le panneau admin - ajouter, modifier, supprimer des éléments, les déplacer entre colonnes et réordonner dans une colonne - et il y a une commande `mise run roadmap-add` en CLI pour les entrées rapides.

## [1.0.2] - 2026-06-12

### Modifié
- Nostragoalus est désormais sous double licence **MIT OR WTFPL** - utilisez celle que vous préférez (le lien en pied de page et la page de licence dans l'app affichent les deux).
- Les captures de la vitrine d'accueil sont rafraîchies à l'interface actuelle et prises en **clair et sombre**, servies pour correspondre à votre thème ; tailles de cartes uniformes (pas d'espace avant la légende), une vue des ligues ajoutée, et la navigation admin / l'outillage de dev masqués dedans.
- La formule « comment les points sont calculés » de la FAQ est désormais traduite dans les quatre langues (était en anglais seulement).
- La liste de consensus du bot marque les matchs pas encore débutés (réservés aux admins) avec le même séparateur que la vue des pronos des joueurs, au lieu d'une bannière.
- `mise run db-backup` peut élaguer les anciens dumps : `--keep N` / `BACKUP_KEEP` (les N plus récents) et `--max-age-days D` / `BACKUP_MAX_AGE_DAYS` (par âge). Les deux sont illimités par défaut, donc rien n'est élagué sauf si vous l'activez.

### Corrigé
- La carte meilleur buteur affiche les points que vaut un prono gagnant même une fois verrouillée, pas seulement pendant le choix.
- Le formulaire de connexion se soumet avec Entrée depuis n'importe quel champ (c'est désormais un vrai `<form>`).

## [1.0.1] - 2026-06-11

### Modifié
- Les captures de la vitrine d'accueil sont rafraîchies à l'interface actuelle, et une capture du bot consensus est ajoutée au carrousel.

## [1.0.0] - 2026-06-11

### Modifié
- Page d'accueil rafraîchie pour le lancement de la 1.0 : la grille de fonctionnalités couvre désormais les ligues privées, le prono Soulier d'or et le bot consensus ; la section de score et la formule « comment les points sont calculés » correspondent aux règles actuelles (paliers de rareté du bon résultat, bonus champion par rang FIFA, bonus Soulier d'or) ; de nouvelles entrées de FAQ pour le Soulier d'or, les ligues et le classement en direct.

## [0.22.0] - 2026-06-11

### Ajouté
- Classement provisoire en direct : pendant que les matchs sont en cours, le classement intègre ce que chaque joueur *marquerait* au score actuel (score complet, bonus compris), classe à titre provisoire, affiche un écart « +N en direct » par rangée et un badge EN DIRECT clignotant. Il se met à jour via le WebSocket à mesure que les scores changent - sans relevé.
- Le tableau du classement de groupe sur une vue de match suit désormais le match en direct : le score en cours compte à titre provisoire et se met à jour sur place.
- Votre prono meilleur buteur s'affiche désormais sur votre profil (drapeau de l'équipe + 👟) à côté de votre champion, et la carte meilleur buteur affiche les points que vaut un prono gagnant.
- La liste des matchs se met à jour en direct - le statut et les scores des matchs se rafraîchissent sur place au fil des rencontres, via le WebSocket.
- Pendant qu'un match est en direct, ses stats et sa chronologie d'événements restent désormais à jour.
- Un admin consultant les pronos d'un joueur voit aussi ses pronos pas encore débutés, derrière un séparateur qui les marque comme réservés aux admins.

### Modifié
- Bonus de rareté de la foule retravaillé (façon MPP) : la rareté du score exact d'un prono est désormais mesurée parmi les joueurs qui ont eu le *résultat* correct, et non tout le terrain, et les paliers sont plus serrés - seule une nette minorité de cette foule au bon résultat gagne un bonus, avec une montée plus raide pour les pronos vraiment rares. Les matchs déjà notés sont renotés selon les nouvelles règles.

### Corrigé
- Un match marqué terminé sur la FIFA pouvait rester « en direct » dans l'app jusqu'à une heure (la FIFA retire les matchs terminés de son flux en direct) ; le coup de sifflet final tombe désormais au prochain relevé de 2 minutes.
- Vous apparaissez toujours sur un classement auquel vous appartenez, même si votre compte est masqué des classements publics - un compte masqué ne voyait plus un classement vide dans sa propre ligue.
- Les mises à jour de stats/événements en direct se font sur place au lieu de faire clignoter le spinner de chargement et de redessiner la chronologie.
- Le nom de la ligue du bot consensus ne déborde plus de l'en-tête de page sur mobile.
- Le logo et le titre de la bannière se calent désormais ensemble quand la barre s'amarre (le titre ne rétrécit plus bien avant la planète).

## [0.21.0] - 2026-06-11

### Ajouté
- Difficulté du prono champion : les points que vaut un prono champion dépendent désormais du classement FIFA mondial de l'équipe au moment du choix - les favoris paient le bonus forfaitaire, les outsiders jusqu'à 4x. La valeur (et le rang FIFA de l'équipe) est affichée sur chaque option et verrouillée quand vous choisissez ; le vainqueur est payé cette valeur verrouillée en finale. Revient au bonus forfaitaire si le classement FIFA est brièvement indisponible.

## [0.20.3] - 2026-06-11

### Corrigé
- Les liens d'ancre (ex. le saut de version en pied de page) n'atterrissent plus sous l'en-tête fixe - la navigation par ancre est décalée de la hauteur de l'en-tête.

## [0.20.2] - 2026-06-11

### Modifié
- Le numéro de version en pied de page renvoie désormais directement à la section de cette version dans le journal des modifications de la page À propos.

## [0.20.1] - 2026-06-11

### Modifié
- Le filtre du calendrier s'ouvre désormais à la demande - une icône de recherche à côté de « Calendrier » ou Ctrl/Cmd+F le révèle, le fait défiler en haut et suit le défilement ; l'icône affiche un état actif et le referme, Échap le ferme. Le champ est temporisé avec un bouton d'effacement.
- La vue Carte n'affiche plus la pastille de ligue (elle n'a aucune donnée à l'échelle d'une ligue).

## [0.20.0] - 2026-06-11

### Ajouté
- Le classement affiche désormais le prono meilleur buteur de chaque joueur (drapeau de l'équipe + 👟) à côté de son prono champion, avec le nom complet de l'équipe / le nom normalisé du joueur dans l'infobulle.
- Admin : une action « Appliquer l'auto-adhésion » remplit l'appartenance aux ligues SSO pour tous les utilisateurs existants dont un fournisseur lié capture le domaine e-mail (sans attendre que chacun se reconnecte), plus un compte total d'utilisateurs.
- La rangée fantôme du bot consensus apparaît dès que quelqu'un a pronostiqué (classé dernier à 0 point avant notation), pas seulement une fois qu'il a marqué.

### Modifié
- Les cotes des bookmakers sont désormais DÉSACTIVÉES par défaut (sur option) ; la préférence et une infobulle expliquent les cotes 1X2 et décimales (1 = victoire domicile, X = nul, 2 = victoire extérieur ; plus bas = plus probable).
- La page « Mes pronos » a disparu - ses encadrés de classement et les cartes de prono champion / meilleur buteur vivent désormais sur la page Matchs. Le rang et le nombre de joueurs respectent la ligue sélectionnée.
- Les flèches de progression du classement reflètent désormais uniquement les changements de score, pas le mouvement des effectifs (rejoindre, passer en privé ou être retiré ne décale plus tout le monde).
- Les photos des joueurs proviennent de l'UEFA pour les compétitions UEFA et de la FIFA pour la Coupe du Monde ; la liste de joueurs meilleur buteur affiche les attaquants en premier.

### Corrigé
- Avatars cassés : une image de fournisseur d'identité protégée par jeton (ex. Microsoft Graph) est récupérée une fois à la connexion et intégrée, ou remplacée par l'image de remplacement, au lieu d'afficher une image cassée.
- Les scores en direct et les totaux de la foule se reconnectent automatiquement après un redémarrage du serveur au lieu de se figer en silence ; la page du match a gagné la pastille de ligue.
- Alignement des drapeaux champion / meilleur buteur, l'étoile en double du bouton joker, la modale admin de gestion des membres (noms longs, un plantage), et le débordement de l'en-tête du classement avec un nom de ligue long.

## [0.19.1] - 2026-06-10

### Corrigé
- Les scores en direct et les totaux de la foule se reconnectent désormais automatiquement après un redémarrage/déploiement du serveur (WebSocket de reconnexion partagé avec backoff, réabonnement et nouvelle récupération à la reconnexion) au lieu de se figer en silence jusqu'à la prochaine navigation.
- Le classement revient au classement de la compétition (au lieu d'afficher un classement vide) quand une ligue sélectionnée a été supprimée ou que l'appartenance a été révoquée.

### Modifié
- Le consensus du bot est brièvement mis en cache par (compétition, ligue, méthode) pour éviter de recalculer le balayage complet des pronostics à chaque vue du classement ; les instantanés de rang de ligue sont écrits en un seul upsert groupé par classement.

## [0.19.0] - 2026-06-10

### Ajouté
- Meilleur buteur (Soulier d'or) : choisissez le joueur que vous pensez finir meilleur buteur du tournoi ; en finale, tous ceux qui ont choisi un joueur à égalité au sommet du décompte de buts (buts contre son camp exclus) obtiennent un bonus, intégré au total du classement à côté du prono champion. Sélecteur d'équipe/joueur et photos FIFA, verrouillé au premier coup d'envoi comme le prono champion.

## [0.18.0] - 2026-06-10

### Ajouté
- Bot consensus : un joueur synthétique « consensus » dont le prono à chaque match est le score le plus fréquent de la foule (MODE, retombant sur une moyenne arrondie / MEAN sous 5 pronostiqueurs), noté par le vrai moteur avec joker, champion et rang. Il s'affiche en rangée fantôme sur le classement (bascule, par compétition ou par ligue) et une page de détail /bot ; le consensus des matchs à venir est réservé aux admins. Affichage seulement - il ne change jamais le rang réel de personne, et il est tenu hors de son propre dénominateur de bonus de rareté.

## [0.17.0] - 2026-06-10

### Ajouté
- Ligues : groupes de joueurs à l'échelle d'une compétition. Créez la vôtre (privée avec un code d'adhésion partageable, ou publique pour que chacun puisse rejoindre et voir ses classements), rejoignez-en plusieurs ou aucune - vos pronos restent les vôtres dans tous les cas, les ligues ne font que filtrer les vues.
- Une pastille de ligue à côté du sélecteur de compétition mémorise votre dernière sélection par compétition et cadre le classement (troisième option de la bascule de portée) et les totaux de la foule (la ligue d'abord, le global derrière un globe - le bonus de rareté reste calculé à partir de tout le monde).
- Page `/leagues` : gérez vos ligues (renommer, copier/régénérer le code, bascule publique/privée, promouvoir des modérateurs, transférer la propriété, exclure, quitter, supprimer) et parcourez les ligues publiques ; `/leagues/:id` affiche le classement d'une ligue - pour les ligues publiques même sans l'avoir rejointe.
- Rôles de ligue : le propriétaire et les modérateurs gèrent les membres et le code d'adhésion ; quitter ou être exclu est mémorisé pour que l'auto-adhésion SSO ne réintègre jamais quelqu'un contre son gré.
- Invite unique à la première connexion sans ligue : saisir un code d'adhésion, créer une ligue, parcourir les publiques, ou ignorer pour toujours.
- Les admins gèrent chaque ligue (créer, sans propriétaire autorisé, membres, rôles, visibilité, supprimer) et les fournisseurs SSO peuvent auto-inscrire leurs utilisateurs capturés par domaine dans des ligues choisies à chaque connexion - une même ligue peut dépendre de plusieurs fournisseurs.
- Préférence de profil privé : sortez des classements généraux et par compétition ; seuls vos camarades de ligue (et les admins) peuvent ouvrir votre profil, qui répond 404 à tout autre. Les classements de ligue vous classent toujours pour vos co-membres et vos pronos continuent de compter dans les totaux anonymes de la foule.
- Les classements de ligue affichent des flèches de progression (instantanés de rang par ligue, rafraîchis avec les globaux) pour les membres et les admins ; les totaux de la foule de ligue se mettent à jour en direct via WebSocket, délivrés aux seuls membres de cette ligue.
- Le premier joueur rejoignant une ligue sans propriétaire en devient le propriétaire (par code, publique et auto-adhésions SSO confondues) ; les admins peuvent toujours confier la propriété à n'importe qui. Le départ du dernier membre garde la ligue en vie - vide et récupérable par son prochain arrivant - et les admins ont une action irréversible « Purger les ligues vides » pour les nettoyer.
- Les tentatives de code d'adhésion sont limitées en débit (10 par minute par compte).

## [0.16.0] - 2026-06-10

### Ajouté
- Cotes des bookmakers : cotes 1X2 décimales (flux Sofascore) sous chaque champ de score - cartes de match, page du match et pronos modifiables - avec une préférence pour s'en passer. Les instantanés sont en ajout seul (les relevés identiques sautent l'écriture) ; une tâche planifiée rafraîchit les matchs débutant sous deux semaines (toutes les 6h, toutes les 30min dans les 2h avant le coup d'envoi), et une récupération admin retrouve les cotes de clôture des tournois passés (CM 2022, Euro 2024).
- Le mode de bonus ODDS du moteur de score s'appuie désormais sur des données réelles : quand la config de score active sélectionne ODDS, les matchs terminés sont notés selon les cotes de clôture (avant coup d'envoi) du résultat réel - des cotes de clôture récupérées déclenchent une renotation des matchs déjà notés. Le mode CROWD par défaut est inchangé.

### Modifié
- Les déclenchements manuels de tâches admin contournent systématiquement le coupe-circuit cron (barrière de forçage partagée) ; les tâches de cotes de longue durée renvoient immédiatement ({started:true}) et rendent compte via les infobulles de tâche au lieu de garder la requête ouverte au-delà des délais du proxy.

## [0.15.2] - 2026-06-10

### Corrigé
- Enregistrer un pronostic est désormais un upsert atomique : les double-soumissions concurrentes (l'autosauvegarde en course avec une sauvegarde manuelle, une nouvelle tentative) ne plantent plus avec une erreur 500 sur la contrainte unique (utilisateur, match) - le perdant met à jour la rangée existante à la place.
- Une connexion SSO échouée revient sur la page de connexion avec un message (« échec de l'authentification unique… ») au lieu de larguer l'utilisateur à la racine du site avec des paramètres `?error=` bruts ; la description verbeuse du fournisseur d'identité (qui peut porter des identifiants de trace) ne va que dans la console du navigateur.

## [0.15.1] - 2026-06-10

### Corrigé
- Le conteneur de dev à rechargement à chaud garde node_modules ET sa sortie de compilation (.nuxt/.output) dans des volumes privés au conteneur : ses artefacts appartenant à root sur le montage lié cassaient les exécutions pnpm/nuxt côté hôte, et l'invite de purge sans TTY de pnpm pouvait tuer le démarrage du conteneur.
- Liste des utilisateurs admin : « Délier du SSO » n'apparaît que pour les utilisateurs réellement liés à un fournisseur (une petite icône de lien montre qui l'est, avec les identifiants de fournisseur dans son infobulle), et les admins ne peuvent plus se rétrograder eux-mêmes (cela cassait chaque requête admin de la page en pleine session).

### Ajouté
- `mise run db-backup` / `mise run db-restore` : pg_dump compressé du Postgres dockerisé vers `backups/` et la restauration correspondante (confirmée, destructive) - la pièce manquante pour un cron de sauvegarde nocturne.
- Pied de page façon Forgejo sur chaque page : version de l'app (renvoie vers À propos), temps de rendu serveur/client de la page, un sélecteur de langue thématisé, une bascule de mode sombre et le lien de la doc API (sorti du pied de page d'accueil). Les contrôles de langue/thème autonomes des pages de connexion/inscription ont disparu - le pied de page les couvre.

## [0.15.0] - 2026-06-09

### Ajouté
- Connexion par identifiant d'abord avec capture de domaine SSO : saisissez votre e-mail, Continuer redirige soit directement vers votre IdP, soit révèle le champ de mot de passe. `/login?password=1` saute la capture (échappatoire en cas de panne d'IdP pour les comptes à mot de passe).
- Les fournisseurs SSO peuvent capturer plusieurs domaines e-mail (séparés par des virgules, sous-domaines compris) ; les domaines déjà capturés par un autre fournisseur sont rejetés.
- Les fournisseurs SSO peuvent être modifiés en place depuis la page admin (le type et l'identifiant du fournisseur restent fixes ; les secrets vides conservent leur valeur enregistrée ; les endpoints OIDC se re-résolvent depuis la découverte à l'enregistrement).
- Le formulaire SSO admin affiche tout ce dont le côté IdP a besoin à mesure qu'il est rempli : URI de redirection OIDC, scopes et claims, URL ACS SAML, entity ID du SP et un lien vers le XML de métadonnées du SP généré.
- Les admins peuvent masquer n'importe quel utilisateur du classement (bascule en forme d'œil dans la liste des utilisateurs) ; les joueurs masqués continuent de jouer et comptent toujours dans les totaux de la foule. Les comptes `create-admin` démarrent masqués.
- Entrée ou espace dans un champ de score enregistre et passe de domicile → extérieur → match suivant, pour qu'une journée entière puisse être saisie sans la souris.

### Corrigé
- Une connexion SSO dont l'e-mail correspond à un compte à mot de passe existant s'y lie désormais (un compte fusionné) au lieu d'échouer avec account_not_linked.
- Les comptes gérés par SSO (sans mot de passe local) ne voient plus ni n'atteignent la modification d'e-mail, le mot de passe, la 2FA ou la gestion des passkeys - l'IdP les détient ; appliqué côté serveur aussi.
- Mobile : la formule de score de la FAQ ne force plus un défilement horizontal de toute la page (elle défile dans sa propre boîte), et l'espace de fond de page entre une question de FAQ ouverte et sa réponse a disparu.
- Mobile : la bannière de titre épinglée affichait quelques lettres géantes rognées (une bande 19:1 pour ordinateur recadrée en cover à la largeur du téléphone) - corrigé par la refonte de la bannière sous Modifié.
- Mobile : les rangées de remplacement ne débordent plus de la carte de chronologie du match ; l'onglet forme garde les scores sur une ligne et range la compétition derrière la date touchable (soulignée en pointillés).
- La navigation d'en-tête mobile signale son débordement horizontal par des dégradés sur les bords et fait défiler le lien actif dans la vue.

### Modifié
- Les requêtes API en cours sont interrompues en quittant une page ou en changeant de compétition (signaux vue-query, totaux de la foule, et les chargements paresseux lents de la page du match adossés à la FIFA).
- Les fournisseurs SSO ont un nom d'affichage optionnel montré aux joueurs ; les métadonnées SP d'un fournisseur SAML peuvent être téléchargées avant l'enregistrement du fournisseur (le côté IdP en a généralement besoin d'abord) ; les conflits de capture de domaine sont désormais vérifiés dans les deux sens de sous-domaine.
- Flux de mot de passe oublié : lien de réinitialisation depuis la page de connexion (mail via SMTP), avec better-auth créant le mot de passe local à la réinitialisation - c'est aussi le chemin de récupération pour les utilisateurs dont le fournisseur SSO a été supprimé. Les comptes gérés par SSO ne reçoivent jamais de mails de réinitialisation.
- S'inscrire avec un mot de passe sur un domaine capturé par SSO avertit d'abord (avec le nom d'affichage du fournisseur) et exige un « continuer quand même » explicite.
- Les propres endpoints HTTP de gestion des fournisseurs du plugin SSO (register/update/delete) sont bloqués ; la gestion des fournisseurs passe uniquement par l'API admin.
- « Géré par SSO » signifie désormais un fournisseur toujours enregistré : supprimer un fournisseur libère ses utilisateurs, qui retrouvent la gestion de leurs identifiants et peuvent définir un mot de passe via le flux de réinitialisation.
- Une connexion SSO réussie supprime le mot de passe local du compte (l'IdP devient l'autorité) ; le flux de réinitialisation est le retour en arrière si le fournisseur venait à disparaître. Les admins peuvent aussi délier n'importe quel utilisateur du SSO.
- La liste des utilisateurs admin a déplacé ses actions par utilisateur dans un menu kebab (promouvoir, masquer, retirer la 2FA, délier du SSO, bannir, supprimer) avec des indicateurs de statut en ligne.
- Les admins sont exemptés de l'effacement de mot de passe SSO : leur mot de passe est un accès de secours pour supprimer un fournisseur cassé (repli ultime : `mise run create-admin` depuis l'hôte).
- Avec un SMTP configuré, la suppression de compte est confirmée via un lien envoyé par mail (fonctionne pour les comptes SSO aussi - fini la suppression en un clic) ; sans SMTP, la confirmation par mot de passe / session récente reste. Le lien envoyé par mail remplace l'exigence TOTP, puisqu'il prouve la possession de la boîte mail.
- La bannière d'accueil est désormais un seul SVG en ligne pour tout le parcours de défilement, avec des réglages pilotés par le défilement au lieu d'échanges d'illustrations : la planète se réduit sur place pour rester entière dans la barre qui rétrécit, le sous-titre s'estompe, et le titre se décale vers le bas pour ne jamais être rogné. Tout échange entre les deux illustrations de bannière composées différemment se lisait comme un titre qui sautait sur le côté ; désormais rien ne s'échange.

## [0.14.0] - 2026-06-08

### Ajouté
- `mise run create-admin <email> [name]` provisionne un admin à la demande : demande le mot de passe (masqué, jamais dans l'historique du shell ni la liste des processus), inscrit via better-auth (vérifié HIBP + haché), puis définit le rôle en base ; idempotent. Aucun mot de passe admin par défaut n'existe - ceci ou NUXT_ADMIN_EMAILS amorce le premier admin.

### Corrigé
- Les passes décisives des matchs UEFA montraient le gardien battu au lieu du passeur (le secondaryActor d'un événement de but est le gardien) ; les vraies passes décisives sont des événements ASSIST séparés, désormais appariés aux buts par la minute. Les penaltys n'affichent correctement aucune passe décisive.
- Les buts contre son camp UEFA n'étaient jamais détectés (marqués GOAL avec subType 'OWN', pas type OWN_GOAL) - 0 enregistré sur tout l'Euro 2024 et chacun mal crédité à l'équipe du buteur ; désormais détectés, crédités au bénéficiaire, avec la passe décisive du joueur qui l'a provoqué.
- L'import/synchro admin invalide désormais le cache de requêtes du client, pour qu'une compétition précédemment chargée (ex. vide) ne continue plus d'afficher des données périmées jusqu'à une actualisation manuelle.

### Modifié
- Configuration morte abandonnée (NUXT_MATCH_PROVIDER, NUXT_FIFA_SEASON_ID, NUXT_WC_SEASON) : le fournisseur et la saison sont par compétition (base / API des saisons FIFA en direct), les variables d'environnement n'étaient jamais lues.

### Sécurité / ops
- Postgres ne publie plus de port hôte dans la base compose de prod (l'app l'atteint en réseau interne) ; l'accès hôte pour le dev local est passé dans l'overlay de dev, lié au loopback. L'app se lie à 127.0.0.1 (placez un reverse proxy devant).
- Contexte de build Docker allégé pour que modifier les fichiers compose, la doc, les scripts ou les tests ne casse plus le cache de build ; suppression d'un fichier de cookies curl commité par accident.

## [0.13.0] - 2026-06-08

### Corrigé
- Les totaux de la foule se rafraîchissent vraiment lors d'un changement de compétition désormais : les trois consommateurs partageaient une seule clé useFetch statique, si bien que Nuxt servait la charge utile en cache de la compétition précédente. Réécrit en simple ref + nouvelle récupération explicite au changement de (préférence, compétition) ; verrouillé par un test de composant.

## [0.12.0] - 2026-06-08

### Ajouté
- Harnais de test de composants (@nuxt/test-utils) : un projet Vitest en environnement `nuxt` monte les composants/composables avec les auto-imports + PrimeVue via `mountSuspended` (`pnpm test:components`, branché sur la barrière de release et `mise check`).

### Modifié
- Composants monstres scindés, logique extraite en unités testées. account.vue (558->421 lignes) : la machine à états d'enrôlement/désactivation/régénération de la 2FA est désormais `useTwoFactor` (8 tests) et la gestion des passkeys `usePasskeys` (5 tests) ; le redimensionnement d'image est passé dans `app/utils/image.ts`. L'assemblage de la chronologie et le décompte des confrontations de la vue du match sont passés dans un `app/utils/match-view.ts` pur (testé unitairement). La barrière de couverture reste sur la surface de logique node (98,3 %) ; les composants sont couverts par leur propre suite.

## [0.11.0] - 2026-06-08

### Ajouté
- Barrière `pnpm typecheck` (vue-tsc strict) branchée sur la barrière de release et `mise run check` - le filet de sûreté de types qui était configuré mais jamais lancé. Les types client (MyPrediction/MatchListItem/LeaderboardRow) dérivent désormais des types de retour des requêtes serveur (via un assistant `Serialized<>`), pour ne pas pouvoir s'écarter du schéma.
- Validation des requêtes à l'exécution : un wrapper `defineValidatedHandler` (garde d'auth + analyse du corps Zod + mappage d'erreurs) sur les écritures de pronostic/joker/champion, rendant les schémas OpenAPI porteurs (422 sur entrée invalide). Tests au niveau du handler et de la garde d'auth ajoutés.

### Corrigé
- Le tick de clôture est désormais une seule transaction atomique (verrouillage/déverrouillage, notation, attributions de champion, annulations) - un plantage en plein tick ne peut plus mettre à zéro les points de champion ni noter à moitié un tour.
- Plusieurs bugs latents que le nouveau typecheck a révélés : accès à session `.value` (la surbrillance « vous » / l'indicateur d'authentification étaient toujours faux), les pronostics ne sélectionnaient jamais les penaltys (les t.a.b. ne s'affichaient jamais sur les pronos), les champs de pronostic convertissaient `undefined` en NaN.

### Modifié
- Déduplication + structure : échelle de phases de fournisseur partagée (une table ordonnée - corrige la divergence fifa/uefa), enveloppe `getJson` partagée dans le fournisseur FIFA, prédicat de notation `predictionHits`, décodage h2h `rowFromPerspective`, assistants `AppStage` (`isSingleMatchStage`/`countsDouble`), jetons de couleur sémantiques (`--ng-star`/`--ng-danger`/`--ng-success`).
- Durcissement : la suppression 2FA échoue franchement sur un secret d'auth manquant au lieu de déchiffrer contre `''` ; l'adaptateur chiffré ne traite plus une enveloppe scellée corrompue comme du texte clair hérité ; la graine de config de score inclut championBonus.

## [0.10.0] - 2026-06-08

### Corrigé
- Les totaux de la foule se rafraîchissent quand vous changez de compétition (ils restaient bloqués sur « – » pour les matchs de la nouvelle compétition).
- Les cartes de pile technique abîmaient une entrée sur trois (monospace, texte minuscule) : la carte était un lien avec le badge de licence en lien imbriqué - du HTML invalide que Firefox scindait, laissant fuir le style du badge. La carte est désormais un div avec un lien de projet étiré et un lien de badge voisin.

### Modifié
- Les points de pronostic se réconcilient avec le multiplicateur joker/finale : une puce « +N rareté » (« seulement X % ont choisi ça ») plus un badge « ×2 » quand le joker ou la finale a doublé le score, pour que le détail corresponde au total.

### Ajouté
- Le score est désormais détaillé : les pronostics affichent les points de base et une puce « +N rareté » séparée avec une infobulle « seulement X % ont choisi ça » ; les points du prono champion apparaissent sur le classement et les pages de joueur ; la FAQ porte la formule complète en notation simple.

### Modifié
- Un joker ne peut pas être placé sur un match dont les équipes ne sont pas encore décidées (même règle que pour le pronostiquer), appliqué côté serveur et masqué dans l'interface.

### Ajouté
- Pronos champion visibles d'un coup d'œil : drapeau couronné à côté de chaque nom sur le classement et les pages de joueur ; les pages de joueur ont gagné un sélecteur de compétition et une portée Global.
- La vitrine d'accueil est un carrousel (circulaire, lecture auto) et la capture de la carte montre désormais réellement la carte.

### Modifié
- Les tours à match unique n'ont pas de joker : la finale compte automatiquement double pour tout le monde (un badge le dit), la petite finale est notée normalement ; placer un joker là est rejeté côté serveur.

### Corrigé
- Le squelette des stats ne se bat plus avec la barre de possession déjà chargée (la possession se place au-dessus du squelette, qui a perdu sa fausse barre).

### Ajouté
- Vitrine d'accueil : six vraies captures (calendrier avec totaux de la foule, profondeur des matchs, classement, tableau, carte, page d'équipe) sur une ligue amorcée de deux douzaines d'oracles de démonstration ; les tâches mise seed-demo et shots régénèrent tout avec Firefox sans interface.

## [0.9.0] - 2026-06-08

### Ajouté
- Les totaux de la foule se mettent à jour en direct via le WebSocket (quiconque enregistre un pronostic rafraîchit la vue de tout le monde, vos propres enregistrements compris) et réservent leur ligne pour que les cartes ne se redimensionnent jamais.
- La boule de cristal de l'en-tête est plus grande, inclut le piédestal, et chaque section luit en doré sous le curseur (cinq panneaux, le cœur, et l'anneau externe de la boule).
- Vraie page 404 : le tir passe au-dessus de la barre et devient une étoile (boucle propre), avec un champ d'étoiles réactif au curseur ; le champ d'étoiles d'accueil a reçu une lentille gravitationnelle et le prono champion un survol holographique.
- Préférence « Afficher les totaux de tous » : sous chaque champ de pronostic, le score cumulé des pronostics de tous les joueurs (1-1 + 2-1 + 4-0 s'affiche 7-2) avec le nombre de pronostics - sur le calendrier, la vue du match et Mes pronos.
- L'onglet Stats affiche des squelettes pendant le chargement du détail du match.

## [0.8.0] - 2026-06-08

### Ajouté
- Confrontations de tous les temps sur la vue du match, issues du calendrier international complet de la FIFA (Coupes du Monde, qualifications, championnats continentaux, amicaux - jusqu'à 1908 là où la FIFA l'a). Fonctionne avant le coup d'envoi, donc fait aussi office d'outil de pronostic. Décompte + ligne de buts + liste des rencontres, liée à nos pages de match là où nous avons le match.
- La forme montre les cinq derniers résultats de chaque équipe sur TOUT le football international (amicaux et qualifications compris), avec la compétition et la date.
- À venir liste les matchs de compétition de l'équipe après le match consulté - résultats affichés à la façon de la forme pour les matchs joués depuis.
- Célébration de but en direct : quand le score d'un match en direct augmente, une animation de but en pixel art à la première personne prend le dessus pendant trois secondes (illustration contribuée ; mouvement réduit respecté).
- Les dates de la page du match incluent l'année (les confrontations remontent des décennies).

### Modifié
- Confrontations, Forme et la liste interne des rencontres s'arrêtent toutes au coup d'envoi du match consulté - le futur ne dicte jamais le passé.
- L'onglet des confrontations est toujours visible ; les paires sans rencontre enregistrée reçoivent une note « première rencontre » au lieu d'un onglet silencieusement absent.
- Tout l'historique des commits réécrit à l'identité Arzaroth.

### Corrigé
- Les tableaux finaux alignaient les matchs alimentants sous les mauvais parents (la FIFA liste les matchs à élimination directe arbitrairement ; le Maroc et le Brésil étaient du mauvais côté). Une passe d'ordonnancement partagée descend désormais depuis la finale pour chaque fournisseur.
- Les cartes du tableau affichaient des scores de penalty (0) sur des matchs décidés dans le temps réglementaire ; les t.a.b. s'affichent en exposant uniquement pour les vraies séances de tirs au but.
- La finale est épinglée à la médiane des demi-finales ; les lignes de connexion se rejoignent au milieu de l'espace et mènent directement au match suivant ; dates centrées sur chaque carte.
- Les cartes du tableau de l'Euro affichaient « Invalid Date » (les matchs du tableau UEFA n'avaient pas d'heure de coup d'envoi).
- L'onglet joueurs du match liste uniquement les contributeurs au lieu d'effectifs complets de 26 hommes remplis de zéros.
- À propos : la marque propre de Motion remplace le logo de l'outil de design Framer ; favicons officiels pour Nuxt I18n, node-postgres, Nodemailer, maildev.

## [0.7.1] - 2026-06-08

### Ajouté
- Les statistiques par match de l'Euro proviennent désormais du flux officiel du centre de match de l'UEFA (possession, passes, centres, distance parcourue) avec l'agrégation du flux d'événements en repli.
- Tableau final de l'Euro, dérivé des résultats (matchs alimentants ordonnés sous leurs parents, champion couronné).
- Classements de joueurs complets pour l'Euro (paginés ; auparavant coupés à 200, masquant la plupart de chaque effectif sur les pages de match).
- Les matchs terminés mettent en cache leur détail et leurs stats pour la durée de vie du processus (ceux en direct se rafraîchissent toujours toutes les 5 minutes).

### Modifié
- Les noms de joueurs et de sélectionneurs s'affichent en casse de titre partout (le « Kylian MBAPPÉ » de la FIFA devient « Kylian Mbappé » ; les noms déjà bien casés passent tels quels).

### Corrigé
- Les cartons des sélectionneurs affichaient « ? » - les cartons sur le banc de touche (Nagelsmann, Hjulmand) portent désormais le nom du sélectionneur et un marqueur de tablette, sur les deux fournisseurs.
- Les deuxièmes jaunes sur les matchs de l'Euro étaient écartés (l'UEFA les encode en événements explicites YELLOW_CARD_SECOND / RED_YELLOW_CARD).
- Les matchs de l'Euro synchronisés avant l'arrivée du flux de stats n'avaient pas de possession - récupérée.

### Ajouté (UX)
- La vue du match mémorise son onglet ouvert dans l'URL (survit au rechargement, partageable) ; les stats sont l'onglet par défaut quand disponibles.
- Remplacements sur la chronologie du match (joueurs entrants/sortants, les deux fournisseurs) avec des bascules persistées pour masquer les remplacements ou les cartons.
- Documentation API auto-générée sur /docs/api : chaque route annotée (résumés, descriptions, corps de requête, codes de réponse), internes du framework filtrés, endpoints admin étiquetés internes, httpie comme client d'extrait par défaut ; les réponses GET portent de vrais schémas et exemples échantillonnés depuis l'API en direct.
- Barre de décompte des confrontations sur la vue du match (victoires / nuls / victoires, séances de tirs au but comptées comme victoires).
- Les pages d'info publiques (À propos, Licence) partagent une coque (champ d'étoiles + pied de page) ; le pied de page et À propos renvoient au dépôt source désormais public.
- Page /license affichant la WTFPL, liée depuis le pied de page ; le pied de page (avec son « Made with ♥️ from 🇫🇷 » sur sa propre ligne) est partagé avec la page À propos.
- À propos : VueUse, Nuxt I18n et node-postgres ajoutés à la pile.
- La recherche de matchs est insensible aux accents et correspond aux codes pays (« Tur » trouve Türkiye, « FRA » trouve France).
- À propos : logo mise adapté au thème, icône TanStack officielle, pages d'accueil de projet préférées aux liens GitHub.

## [0.7.0] - 2026-06-07

### Ajouté
- Parité fonctionnelle de l'Euro 2024 avec les compétitions FIFA : événements de match (buts avec passes décisives, cartons jaune / deuxième jaune / rouge), stats par match dérivées du flux d'événements de l'UEFA, effectifs officiels avec postes, stats d'équipe de la saison (exactes UEFA), et meilleurs buteurs / passeurs depuis l'API de classement de l'UEFA.
- Les effectifs annoncés de la Coupe du Monde 2026 s'affichent désormais avant le tournoi (l'id d'équipe résolu depuis le calendrier quand aucun match n'a été joué).
- Page À propos : logos officiels sur chaque carte de pile, Bun dans la pile.

### Modifié
- Compétitions ordonnées de la saison la plus récente d'abord partout.
- VueUse adopté là où il simplifie : rendu QR réactif pour l'enrôlement 2FA, presse-papiers, minuteurs (comptes à rebours, libellés de prochaine exécution), détection du mode sombre système.

### Corrigé
- Le sélecteur de compétition de la page d'équipe n'avait pas d'ordre défini.

## [0.6.0] - 2026-06-07

### Ajouté
- Matchs et résultats de l'UEFA Euro 2024 via l'API de match publique de l'UEFA (groupes, éliminatoires directs, séances de tirs au but).
- Authentification à deux facteurs : enrôlement d'authentificateur TOTP avec QR + clé de configuration, codes de secours à usage unique (étape de sauvegarde confirmée, régénération à la demande), appareils de confiance avec révocation, codes par e-mail via SMTP.
- Connexion et gestion par passkey (WebAuthn), l'enregistrement étant protégé derrière une confirmation par mot de passe récent + 2FA (mode sudo).
- Vérifications Have-I-Been-Pwned rejetant les mots de passe compromis à l'inscription et au changement de mot de passe.
- Admin : bannir/débannir des utilisateurs, retirer la 2FA d'un compte, historique dernière exécution/dernier échec par tâche dans les infobulles d'action, comptes à rebours de prochaine exécution en direct.
- Suppression de compte protégée par 2FA et par la protection du dernier admin.
- Capteur de mails maildev dans l'overlay compose de dev ; test de bout en bout OTP par e-mail (`pnpm e2e:smtp`).
- Licence WTFPL, badge de couverture, ce journal des modifications, raccourcis de tâches mise, images de conteneur épinglées.

### Corrigé
- `NUXT_CRON_ENABLED=true` était converti en booléen par la config d'exécution et désactivait silencieusement le relevé des scores en direct.

## [0.5.0] - 2026-06-07

### Ajouté
- Préférences par utilisateur (langue, thème y compris système) enregistrées sur le compte et restaurées à la connexion ; détection navigateur/système pour les invités.
- Traductions thaï et klingon aux côtés de l'anglais et du français.
- Identité de marque : marque en boule de cristal, favicon, bannière remasterisée à fond perdu avec une intro pilotée par le défilement qui s'amarre dans une barre fine épinglée, champ d'étoiles animé, avatars par défaut en œil d'oracle.
- Page d'accueil avec grille de fonctionnalités, explication du score et vitrine des compétitions.

### Corrigé
- Échec d'hydratation au premier chargement qui empêchait les effets côté client (champ d'étoiles, défilement de bannière) de s'exécuter jusqu'à une navigation côté client.

## [0.4.0] - 2026-06-06

### Ajouté
- Compétition dans l'URL (`/world-cup-2026/matches`, …) avec une pastille de sélection dans le titre de page ; les slugs inconnus renvoient 404.
- Administration SSO à l'exécution (OIDC, SAML, Google) avec des secrets chiffrés en enveloppe (KEK -> DEK -> AES-256-GCM).
- Gestion des utilisateurs admin (créer, promouvoir/rétrograder, supprimer) sur le plugin admin de better-auth.
- Pages d'équipe complètes : effectifs officiels avec postes et sélectionneur, stats de tournoi exactes FIFA, sélecteur de compétition.
- Vue du match : rangées de stats de renseignement football (tirs, passes, distance parcourue, pressions…), chronologie chronologique entrelacée avec cartons jaune/deuxième jaune/rouge, pronostic modifiable sur place, forme/à venir/confrontations/classement cliquables.
- Carte du monde : équipe dans l'URL, sélection survivant aux changements de compétition, clic pour centrer, classements de groupe cliquables.
- Bande de stats personnelles sur Mes pronos ; flèches de progression du classement à partir d'instantanés de rang ; comptes à rebours de coup d'envoi.

### Corrigé
- Codes de carton FIFA décodés correctement (2 = rouge direct, 3 = deuxième jaune).
- Artefacts de séances de tirs au but (« séances » 0-0) purgés à la source et protégés partout.

## [0.3.0] - 2026-06-06

### Ajouté
- Un joker ×2 par tour (déplaçable jusqu'au coup d'envoi), bonus de rareté de la foule, prono champion avec drapeaux des pays.
- Carte du monde interactive (Leaflet + OpenStreetMap) avec des panneaux par équipe.
- Tableau final en véritable arbre à deux côtés depuis le tableau de saison de la FIFA.
- Meilleurs buteurs FIFA sans clé, détails de match (buts, possession, affluence, cartons) et envois de scores en direct via WebSocket.

## [0.2.0] - 2026-06-05

### Ajouté
- Schéma multi-compétition : Coupe du Monde 2026 (par défaut), Coupe du Monde 2022, Euro 2024 ; classements par compétition et global.
- Tâches planifiées : actualisation horaire des matchs, relevé en direct toutes les 2 minutes conditionné par une fenêtre de direct, clôture toutes les 5 minutes (verrouillage + notation).
- i18n (EN/FR), mode sombre, coque redessinée.

## [0.1.0] - 2026-06-05

### Ajouté
- Échafaudage Nuxt 4 + PrimeVue + UnoCSS, Drizzle + Postgres, better-auth e-mail/mot de passe.
- Moteur de score à paliers de proximité (exact 3 / différence de buts 2 / résultat 1) avec renotation idempotente.
- Matchs, pronostics avec verrouillages au coup d'envoi côté serveur, classement, synchro admin ; suite Vitest avec une barrière de couverture de 95 % (puis 98 %).
