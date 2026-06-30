# Journal des modifications

Toutes les modifications notables apportées à Nostragoalus sont documentées ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ; les versions sont des instantanés datés plutôt que des versions publiées.

## [Unreleased]

### Ajouté
- **Ne manquez plus un pronostic** : la page des matchs indique désormais combien de matchs à venir attendent encore un score avant le prochain verrouillage, avec un bouton « Aller au premier » qui défile droit vers le match non pronostiqué le plus proche.
- **Repérer les scores aberrants** : saisir un score extravagant (8 buts ou plus pour une équipe, ou 12 ou plus au total) vous demande désormais de confirmer avant l'enregistrement, pour qu'une faute de frappe comme 1-33 ne soit pas verrouillée par erreur. Vous pouvez toujours confirmer volontairement.
- **Mouvement des cotes et détail par bookmaker** : le petit affichage des cotes montre désormais comment chaque cote a évolué depuis son ouverture - un repère par issue selon qu'elle a raccourci, dérivé ou est restée inchangée, avec l'ampleur du mouvement - et vous pouvez le toucher pour déplier les cotes d'ouverture et le 1X2 par bookmaker (quand le fournisseur les communique). Cotes décimales partout, comme avant.

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
