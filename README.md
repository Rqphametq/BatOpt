# BatOpt
Interactive techno-economic simulator for behind-the-meter BESS and solar PV sizing. Models Enedis 30-min load curves, peak shaving (TURPE), and solar arbitrage with open-source climate data. Features automated battery capacity optimization to maximize project net profit and 25-year financial projections (OPEX, repowering, degradation).

# ⚡ BatOpt — Simulateur Technico-Économique BESS

**BatOpt** est un outil web qui calcule, pour un bâtiment tertiaire ou industriel donné, si l'installation d'une batterie de stockage (BESS) couplée à du solaire photovoltaïque est rentable — et si oui, quelle taille de batterie choisir.

Il a été conçu pour un usage **avant-vente** : en quelques minutes et sans outil externe, on peut estimer le CAPEX, les gains annuels et le temps de retour sur investissement d'un projet, à partir du profil de consommation du bâtiment, de sa localisation, et des hypothèses tarifaires du client.

> Projet personnel développé pour progresser en "vibe coding" (développement assisté par IA) sur un cas d'usage technique réel, en lien avec mon domaine d'activité (énergies renouvelables / stockage).


## 🖥️ Aperçu

L'interface se compose de deux zones :

- **À gauche** : les paramètres du projet (bâtiment, localisation, dimensionnement PV/batterie, tarification, hypothèses avancées) sous forme de curseurs.
- **À droite** : les résultats en temps réel — 3 indicateurs clés (CAPEX, gains annuels, payback) et un graphique de la courbe de charge sur 24h (consommation brute, production solaire, consommation nette après optimisation).

Chaque modification d'un paramètre relance instantanément le calcul.


## 🎯 Fonctionnalités

### Dimensionnement interactif
- Choix du profil de consommation du bâtiment (Supermarché, Atelier/Usine, Bureaux)
- Localisation par recherche de ville (géocodage) → récupération de données climatiques réelles
- Réglage de la puissance PV, de la capacité et de la puissance de la batterie, de son coût
- Réglage fin de la tarification électrique (Heures Pleines / Heures Creuses, prime fixe liée à la puissance souscrite, tarif de revente du surplus solaire)
- Paramètres avancés : rendement aller-retour de la batterie (Round Trip Efficiency), durée du projet, OPEX annuel

### Moteur de calcul technico-économique
- Simulation de la courbe de charge heure par heure (pas de 30 min) sur une journée type par saison
- Arbitrage automatique de la batterie : charge sur excédent solaire, charge forcée en heures creuses, décharge pour écrêter les pointes en heures pleines
- Projection financière multi-année avec dégradation de la batterie, inflation tarifaire et remplacement des cellules

### Optimisation du dimensionnement
- Un bouton lance un balayage automatique de ~40 tailles de batterie possibles (50 à 2000 kWh) et retient celle qui maximise le **gain net cumulé sur toute la durée du projet** — pas seulement le payback le plus rapide, qui favoriserait artificiellement les petites batteries peu rentables sur la durée.
- Le résultat est présenté sous forme de graphique comparatif, avec le dimensionnement optimal mis en évidence.


## ⚙️ Comment fonctionne le moteur de calcul

C'est la partie la plus intéressante du projet. Le calcul se déroule en 5 étapes, répétées pour 3 journées types (hiver, mi-saison, été), puis pondérées sur l'année.

### 1. Courbe de consommation du bâtiment
Le profil sélectionné (ex. `ENT2` pour un atelier/usine) fournit une courbe de charge normalisée sur 48 pas de 30 minutes, **inspirée des profils de consommation types publiés par Enedis** pour chaque catégorie d'activité (il ne s'agit pas d'un appel à une API Enedis en direct, mais de courbes de référence intégrées à l'application). Cette courbe est mise à l'échelle avec la surface du bâtiment (ratio fixe de 0,05 kW/m²) pour obtenir la consommation réelle en kW sur chaque demi-heure.

### 2. Production solaire & charge sur excédent
Pour la ville choisie, l'irradiance horaire moyenne (Wh/m²) est calculée à partir de **5 années de données climatiques réelles** (voir section suivante). La production PV est déduite de la puissance installée et d'un ratio de performance de 0,85. Dès qu'il y a un surplus solaire (production > consommation), la batterie se charge en priorité avec cet excédent, dans la limite de sa puissance et de la place disponible.

### 3. Charge forcée en heures creuses
Si la batterie n'est pas pleine à l'issue de la nuit, elle se recharge sur le réseau pendant la plage Heures Creuses (00h–06h), pour arriver "pleine" au démarrage des heures pleines.

### 4. Écrêtement des pointes par recherche dichotomique
C'est le cœur de l'algorithme. Plutôt que de décharger la batterie de façon arbitraire, le programme cherche par **dichotomie** (50 itérations) le seuil de puissance le plus bas possible tel que l'énergie nécessaire pour écrêter tous les pics au-dessus de ce seuil, sur toute la plage Heures Pleines, reste inférieure à l'énergie disponible dans la batterie. Cela permet de maximiser la réduction de la puissance de pointe (donc la baisse de la prime de puissance souscrite) avec une capacité de batterie donnée.

### 5. Rendement et calcul financier
Les pertes de conversion (charge + décharge) sont modélisées via un rendement aller-retour (Round Trip Efficiency) réglable, réparti symétriquement sur les deux sens (racine carrée du RTE appliquée à chaque étape). Le gain financier journalier combine :
- l'écart entre l'ancienne facture (sans PV/batterie) et la nouvelle facture (après arbitrage), au tarif HP/HC ;
- les revenus de revente du surplus solaire non consommé et non stocké.

### Pondération annuelle et projection multi-année
Les 3 journées types sont pondérées par leur nombre de jours réels dans l'année (90 / 183 / 92) pour obtenir les gains annuels. Le CAPEX est ensuite comparé aux gains cumulés année après année, avec :
- une dégradation de la capacité batterie de 2 %/an,
- une inflation tarifaire de 3 %/an,
- un OPEX annuel (% du CAPEX),
- un remplacement partiel des cellules à l'année 15 (60 % du CAPEX initial), pour représenter le repowering à mi-vie.

Le payback (ROI) est le moment où les gains cumulés dépassent le CAPEX initial.


## 🌍 Données climatiques

La géolocalisation et la météo utilisent l'API publique **[Open-Meteo](https://open-meteo.com/)**, sans clé d'API :
- **Géocodage** : conversion du nom de ville saisi en coordonnées GPS.
- **Archive climatique** : récupération de l'irradiance horaire (`shortwave_radiation`) sur 5 ans (2019–2023), moyennée par saison et par heure de la journée, pour obtenir une courbe solaire représentative du site plutôt qu'une simple estimation théorique.

En cas d'indisponibilité de l'API (réseau bloqué, quota atteint), l'application bascule automatiquement sur des courbes d'irradiance synthétiques de secours, pour que la démonstration reste toujours fonctionnelle.


## 🧱 Stack technique

- **HTML / CSS / JavaScript vanilla** — aucun framework, aucune étape de build
- **[Chart.js](https://www.chartjs.org/)** — visualisation de la courbe de charge et du graphique d'optimisation
- **[html2pdf.js](https://github.com/eKoopmans/html2pdf.js)** (html2canvas + jsPDF) — export PDF (en cours de fiabilisation)
- **[Open-Meteo API](https://open-meteo.com/)** — géocodage et données climatiques historiques
- Profils de consommation Enedis embarqués en local (aucune dépendance externe pour cette partie)

Choix assumé : pas de framework front, pour rester sur un projet lisible de bout en bout et 100 % statique (déployable sur n'importe quel hébergement de fichiers, sans backend).

## 📁 Structure du projet

```
batopt/
├── index.html   # Structure de la page + gabarit d'export PDF
├── style.css    # Design system (variables CSS, composants)
└── script.js    # Moteur de calcul + logique d'interface
```

## ⚠️ Limites connues & pistes d'amélioration

En toute transparence, quelques limites assumées du modèle actuel :

- **Profils de consommation statiques** : 3 profils génériques intégrés en dur, non connectés à une source de données Enedis en direct (Data Hub Enedis).
- **Hypothèses fixes non paramétrables** : ratio de conversion surface → puissance (0,05 kW/m²), ratio de performance PV (0,85), plage Heures Creuses (00h–06h), C-rate de 0,5 utilisé par le module d'optimisation.
- **Pas de tests automatisés** sur le moteur de calcul.
- **Architecture mono-fichier** : logique de calcul et logique d'interface mélangées dans `script.js` ; une séparation en modules faciliterait les tests unitaires.

Pistes envisagées : comparaison de plusieurs scénarios côte à côte, partage d'une configuration via URL, séparation moteur de calcul / UI pour permettre des tests unitaires, option d'export pdf

## Raphaël Metayer  

Projet développé par Raphaël Metayer — [[LinkedIn](https://www.linkedin.com/in/rapha%C3%ABl-metayer-a4574724a/)] · [rqphametq@gmail.com](#)
